---
date: "2026-04-01"
ticket_id: "ISS-007"
ticket_title: "Task 1.7: Question Group Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-007"
ticket_title: "Task 1.7: Question Group Model and CRUD Endpoints"
categories: ["sqlalchemy", "fastapi", "postgresql", "alembic", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/question_group.py
  - backend/app/models/__init__.py
  - backend/app/models/survey.py
  - backend/app/schemas/question_group.py
  - backend/app/schemas/survey.py
  - backend/app/services/question_group_service.py
  - backend/app/api/question_groups.py
  - backend/app/main.py
  - backend/alembic/versions/0006_create_question_groups_table.py
  - backend/tests/test_question_groups.py
---

# Lessons Learned: Task 1.7: Question Group Model and CRUD Endpoints

## What Worked Well
- Following the established Survey model pattern made the QuestionGroup model straightforward to implement consistently
- Using Python-side `default=uuid.uuid4` for UUID primary keys avoided pgcrypto extension dependency issues
- Enforcing ownership at the query layer (JOIN to surveys table) produced clean 404 responses without leaking existence information
- Running an import smoke-test before every alembic command caught broken imports with clear tracebacks early
- Manually authoring the Alembic migration script prevented autogenerate from silently dropping `server_default=sa.text('now()')` on timestamp columns

## What Was Challenging
- Async SQLAlchemy's prohibition on lazy loading requires explicit `selectinload` or `joinedload` everywhere a relationship is traversed — easy to miss until runtime raises `MissingGreenlet`
- The reorder endpoint required careful validation that all submitted group IDs belong to the authenticated user's survey before issuing any UPDATE, adding non-trivial ownership logic to a bulk operation
- The auto sort_order assignment (`COALESCE(MAX(sort_order), 0) + 1`) must execute inside the same transaction as the INSERT to avoid race conditions with concurrent creates

## Key Technical Insights
1. **Never use alembic autogenerate for this project's migrations.** It silently drops `server_default=sa.text('now()')` on DateTime columns and may misrender other types. Always manually author migration scripts and verify DDL before applying.
2. **UUID primary keys must use Python-side defaults.** `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` is reliable; `server_default=gen_random_uuid()` depends on the pgcrypto extension which may not be enabled.
3. **Async SQLAlchemy does not support implicit lazy loading.** Any relationship accessed outside an explicit eager-load call will raise `MissingGreenlet` at runtime. Declare `lazy='raise'` on relationships as a safety net and always use `selectinload`/`joinedload` at query time.
4. **Ownership enforcement must happen at the query layer.** A single `SELECT qg.* FROM question_groups qg JOIN surveys s ON s.id = qg.survey_id WHERE qg.id = :id AND s.user_id = :user_id` is safer than fetch-then-check and returns the correct 404 without leaking resource existence.
5. **Reorder endpoints need pre-validation.** Validate all group IDs in the request body belong to the given `survey_id` and authenticated user before issuing any UPDATE statements to prevent cross-survey sort_order manipulation.
6. **Always import new models in both `alembic/env.py` and `app/models/__init__.py`.** Missing either causes a silent migration gap — the table simply won't be created, with no error.
7. **All async pytest fixtures must use `scope='function'`.** Session-scoped async SQLAlchemy engines cause event loop mismatch errors with asyncpg under pytest-asyncio; there is no workaround.
8. **Always override DATABASE_URL for test runs.** The environment default uses the psycopg2 scheme (`postgresql://`) which silently fails with the async engine. Override to `postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker` for every test invocation.

## Reusable Patterns
- **UUID PK:** `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)`
- **Timestamp in migration DDL:** `sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)`
- **Ownership-scoped lookup:** `SELECT qg.* FROM question_groups qg JOIN surveys s ON s.id = qg.survey_id WHERE qg.id = :id AND s.user_id = :user_id`
- **Auto sort_order:** `SELECT COALESCE(MAX(sort_order), 0) + 1 FROM question_groups WHERE survey_id = :survey_id` — run inside the same transaction as INSERT
- **Cascade delete:** `ondelete='CASCADE'` on FK in migration DDL + `cascade='all, delete-orphan'` on ORM relationship
- **Function-scoped async fixtures:** `@pytest_asyncio.fixture(scope='function')` for all engine/session/client fixtures
- **Import smoke-test:** `python -c "from app.models.question_group import QuestionGroup"` before every alembic command
- **Test invocation:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_question_groups.py -v`

## Files to Review for Similar Tasks
- `backend/app/models/survey.py` — canonical async SQLAlchemy model pattern with UUID PK and timestamp
- `backend/app/services/survey_service.py` — ownership-enforced query pattern and service layer structure
- `backend/app/api/surveys.py` — FastAPI router pattern with auth dependency injection
- `backend/alembic/versions/0006_create_question_groups_table.py` — manually authored migration with correct DateTime server_default
- `backend/tests/test_question_groups.py` — function-scoped async fixture pattern and ownership isolation test cases

## Gotchas and Pitfalls
- **Silent migration gaps:** If `QuestionGroup` is not imported in both `alembic/env.py` and `app/models/__init__.py`, alembic will not create the table and will not raise an error.
- **autogenerate drops server_default:** Never run `alembic revision --autogenerate` for this project — it will silently remove `server_default=sa.text('now()')` from timestamp columns on the next revision.
- **MissingGreenlet on relationship access:** Any async route that accesses a SQLAlchemy relationship without explicit eager loading will raise `MissingGreenlet` at runtime, not at import time. Declare `lazy='raise'` on all relationships to catch this at the ORM layer.
- **psycopg2 scheme silently fails:** The default `DATABASE_URL` environment variable uses `postgresql://` (psycopg2 scheme). The async engine requires `postgresql+asyncpg://`. Tests will fail with a confusing driver error if this is not overridden.
- **Reorder cross-survey attack:** Without pre-validating that all group IDs belong to the authenticated user's survey, a malicious user can submit IDs from other surveys and corrupt their sort_order values.
- **Race condition on auto sort_order:** Computing `MAX(sort_order) + 1` outside the INSERT transaction can produce duplicate sort_order values under concurrent requests. Always compute and insert within the same transaction.
- **session-scoped async fixtures:** pytest-asyncio event loop teardown conflicts with session-scoped async SQLAlchemy engines. Use `scope='function'` unconditionally — the performance cost is acceptable for this test suite size.
```
