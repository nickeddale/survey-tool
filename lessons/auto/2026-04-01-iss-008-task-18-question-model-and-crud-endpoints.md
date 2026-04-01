---
date: "2026-04-01"
ticket_id: "ISS-008"
ticket_title: "Task 1.8: Question Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-008"
ticket_title: "Task 1.8: Question Model and CRUD Endpoints"
categories: ["sqlalchemy", "fastapi", "postgresql", "pydantic", "alembic", "testing"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/alembic/versions/0007_create_questions_table.py
  - backend/app/models/question.py
  - backend/app/models/__init__.py
  - backend/app/schemas/question.py
  - backend/app/services/question_service.py
  - backend/app/api/questions.py
  - backend/app/main.py
  - backend/tests/test_questions.py
---

# Lessons Learned: Task 1.8: Question Model and CRUD Endpoints

## What Worked Well
- Following established patterns from prior tasks (ISS-006, ISS-007) reduced ambiguity on UUID PKs, JSONB columns, and async fixture scoping.
- Manually authoring the Alembic migration (rather than using autogenerate) ensured `server_default=sa.text('now()')` and `postgresql.JSONB()` were rendered correctly.
- Using `lazy='raise'` on all ORM relationships with explicit `selectinload` at query time prevented silent N+1 queries and MissingGreenlet errors.
- Enforcing ownership via JOIN at the query layer (`questions -> question_groups -> surveys WHERE surveys.user_id = :user_id`) correctly returned 404 for both missing and unauthorized resources without leaking existence.
- `QuestionResponse.model_rebuild()` after class definition resolved the self-referential Pydantic v2 forward reference for `subquestions: list['QuestionResponse']` without runtime errors.
- Pre-validating all IDs in the reorder endpoint before issuing any UPDATEs prevented cross-survey sort_order manipulation.

## What Was Challenging
- Self-referential model complexity: the `parent_id` FK, cascade relationships, subquestion code generation, and nested Pydantic schema all required careful coordination.
- Auto-code generation (Q1, Q2... and Q1_SQ001...) needed to be scoped to the survey level (not group level), requiring a JOIN across `question_groups` to find the max existing code.
- Sort_order computation had to occur inside the same transaction as the INSERT to avoid race conditions — easy to overlook when the service function spans multiple awaits.
- Code uniqueness could not be enforced with a simple DB unique index on `(group_id, code)` because uniqueness is survey-scoped, not group-scoped. Required an application-level pre-check plus IntegrityError catch → HTTP 409.
- `question_type` validation: using `String(50)` with a CHECK constraint rather than a PostgreSQL native ENUM avoided `DuplicateObject` errors if the enum name collided across migration runs.

## Key Technical Insights
1. **Never use alembic autogenerate** for tables with `server_default` DateTime or JSONB columns — it silently drops `server_default` and may render JSONB as TEXT. Always manually author migrations.
2. **Self-referential Pydantic v2 schemas** require `model_rebuild()` after the class definition to resolve forward references. Without it, Pydantic fails at runtime when serializing nested subquestions.
3. **Survey-scoped code uniqueness** cannot be expressed as a single-column DB unique constraint when the FK chain is `question -> group -> survey`. Enforce with an application-level query + `IntegrityError` catch returning HTTP 409.
4. **Auto sort_order** must be computed with `SELECT COALESCE(MAX(sort_order), 0) + 1 FROM questions WHERE group_id = :group_id` inside the same transaction as the INSERT. A separate pre-check query is not safe under concurrent requests.
5. **Reorder endpoint security**: pre-validate all submitted question IDs belong to the authenticated user's survey before issuing any UPDATE. A single malicious ID in the batch can manipulate sort_order on another user's questions if validation is done post-update.
6. **Import registration order matters**: the Question model must be imported in both `alembic/env.py` and `app/models/__init__.py` before running any alembic command, or the table is silently omitted from the migration with no error.
7. **UUID PK**: always use Python-side `default=uuid.uuid4`, never `server_default=gen_random_uuid()` — pgcrypto extension may not be present in all environments.

## Reusable Patterns
- **Migration timestamp**: `sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)`
- **Migration JSONB**: `sa.Column('settings', postgresql.JSONB(), nullable=True)` — import `from alembic.op import get_bind; from sqlalchemy.dialects import postgresql`
- **Ownership-scoped query**: `SELECT q.* FROM questions q JOIN question_groups g ON g.id = q.group_id JOIN surveys s ON s.id = g.survey_id WHERE s.user_id = :user_id AND q.id = :question_id`
- **Self-referential schema**:
  ```python
  class QuestionResponse(BaseModel):
      subquestions: list['QuestionResponse'] = []
  QuestionResponse.model_rebuild()
  ```
- **Auto-increment code (survey-scoped)**:
  ```python
  SELECT MAX(CAST(SUBSTRING(code FROM 2) AS INTEGER))
  FROM questions q JOIN question_groups g ON g.id = q.group_id
  WHERE g.survey_id = :survey_id AND code ~ '^Q[0-9]+$'
  ```
- **Subquestion code**: `f"{parent_code}_SQ{str(n).zfill(3)}"` where n = count of existing subquestions + 1
- **Import smoke-test before alembic**: `python -c "from app.models.question import Question"`
- **App smoke-test after router registration**: `python -c "from app.main import app"`
- **Test invocation**: `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_questions.py -v`
- **Function-scoped async engine fixture**:
  ```python
  @pytest_asyncio.fixture(scope='function')
  async def engine():
      e = create_async_engine(DATABASE_URL)
      async with e.begin() as conn:
          await conn.run_sync(Base.metadata.create_all)
      yield e
      async with e.begin() as conn:
          await conn.run_sync(Base.metadata.drop_all)
      await e.dispose()
  ```

## Files to Review for Similar Tasks
- `backend/app/models/question_group.py` — canonical example of UUID PK, JSONB, `lazy='raise'`, cascade relationships
- `backend/app/services/question_group_service.py` — ownership-scoped query pattern, pure async functions
- `backend/app/schemas/question.py` — self-referential Pydantic v2 schema with `model_rebuild()`
- `backend/app/api/questions.py` — reorder endpoint pre-validation pattern
- `backend/alembic/versions/0007_create_questions_table.py` — manually authored migration with JSONB and `sa.text('now()')`
- `backend/tests/test_questions.py` — function-scoped async fixtures, auth helpers, code uniqueness and ownership assertions

## Gotchas and Pitfalls
- **Silent migration gaps**: missing model import in `alembic/env.py` causes the table to be omitted with no error or warning. Always run the import smoke-test before `alembic upgrade head`.
- **Pydantic forward ref failure**: forgetting `QuestionResponse.model_rebuild()` causes a cryptic `PydanticUserError` at first serialization, not at import time.
- **ENUM collision**: using a PostgreSQL native ENUM for `question_type` will raise `DuplicateObject` if the migration is re-run or applied against a DB that already has the type. Use `String(50)` + CHECK constraint instead.
- **Database URL scheme**: the container environment sets `DATABASE_URL` to the psycopg2 scheme (`postgresql://`). This silently fails with asyncpg. Always override to `postgresql+asyncpg://` for test runs.
- **Cascade delete**: `ondelete='CASCADE'` on the FK in the migration is necessary but not sufficient — also set `cascade='all, delete-orphan'` on the ORM relationship, or ORM-level deletes will not cascade to subquestions.
- **Session-scoped async fixtures**: will produce event loop mismatch errors with asyncpg under pytest-asyncio. All engine/session/client fixtures must be `scope='function'`.
- **Sort_order race condition**: computing `max + 1` outside the INSERT transaction allows two concurrent POSTs to receive the same sort_order. Use `SELECT ... FOR UPDATE` or compute inside a single transaction.
- **bcrypt/passlib**: never use `passlib.CryptContext` — bcrypt >= 4.x removes `bcrypt.__about__` which passlib 1.7.x requires. Use `bcrypt.hashpw`/`bcrypt.checkpw` directly.
```
