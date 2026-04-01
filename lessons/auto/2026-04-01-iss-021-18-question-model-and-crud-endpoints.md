---
date: "2026-04-01"
ticket_id: "ISS-021"
ticket_title: "1.8: Question Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-021"
ticket_title: "1.8: Question Model and CRUD Endpoints"
categories: ["models", "crud", "migrations", "self-referential", "pydantic", "async-sqlalchemy"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/models/question.py
  - backend/app/schemas/question.py
  - backend/app/services/question_service.py
  - backend/app/api/questions.py
  - backend/app/api/__init__.py
  - backend/alembic/versions/0007_create_questions_table.py
  - backend/tests/test_questions.py
---

# Lessons Learned: 1.8: Question Model and CRUD Endpoints

## What Worked Well
- Following established patterns from question_group and answer_option implementations provided a reliable blueprint for model, schema, service, and API layers.
- Pre-authoring the Alembic migration manually (rather than autogenerating) prevented silent corruption of JSONB columns and server_default timestamps.
- Scoping code uniqueness checks to the entire survey (not just the group) was identified early from prior lessons and implemented correctly from the start.
- Using `lazy='raise'` on all relationships caught potential MissingGreenlet errors at design time rather than runtime.
- Import smoke-testing (`python -c "from app.models.question import Question"`) before running any Alembic command surfaced broken imports as clean tracebacks.

## What Was Challenging
- Self-referential FK (`parent_id → questions.id` with CASCADE) required careful DDL ordering — the FK must reference the same table being created, which is easy to get wrong in hand-authored migrations.
- Pydantic v2 self-referential schema (`subquestions: List[QuestionResponse]`) requires `model_rebuild()` called at module level after the class definition; forgetting this causes a silent forward reference resolution failure at runtime.
- Ensuring the reorder endpoint pre-validated all submitted IDs against the authenticated user's survey before issuing any UPDATEs required deliberate discipline — skipping this would allow cross-survey sort_order corruption.
- Auto-generating subquestion codes in the format `{parent_code}_SQ{n}` required a separate code-generation path from top-level questions (`Q{n+1}`), with the count scoped to the parent question rather than the survey.

## Key Technical Insights
1. **Never use `alembic revision --autogenerate`** for tables with JSONB columns or timezone-aware timestamps — autogenerate silently renders JSONB as TEXT and may drop `server_default=sa.text('now()')` on DateTime columns.
2. **Self-referential FK with CASCADE** must be authored carefully: define the table first, then `ADD CONSTRAINT` for the self-referential FK, or declare inline and verify the generated DDL explicitly.
3. **Pydantic v2 self-referential models** require `QuestionResponse.model_rebuild()` at module level after the class definition to resolve the `List[QuestionResponse]` forward reference. Without this, the schema compiles but fails at serialization time.
4. **`lazy='raise'` is mandatory** on all async SQLAlchemy relationships. Implicit lazy loading raises `MissingGreenlet` at runtime (not import time), making it hard to debug. Always pair with explicit `selectinload`/`joinedload` at query time.
5. **Code uniqueness must be survey-scoped**: auto-generating `Q{n+1}` codes by counting only questions in the target group produces duplicates across groups. Always query all questions across all groups belonging to the survey.
6. **Sort order under concurrency**: `SELECT COALESCE(MAX(sort_order), 0) + 1` must run inside the same transaction as the INSERT to avoid duplicate sort_order values under concurrent creates.
7. **Ownership-scoped lookups via JOIN** (questions → question_groups → surveys WHERE user_id = :user_id) must be used instead of fetch-then-check to ensure consistent 404 responses for both missing and unauthorized resources.
8. **Import Question in both `alembic/env.py` and `app/models/__init__.py`** before running any Alembic command. Missing either causes a silent migration gap with no error raised.
9. **UUID PKs must use Python-side `default=uuid.uuid4`** — do not use `server_default=gen_random_uuid()` as the pgcrypto extension may not be enabled in all environments.
10. **All async pytest fixtures must use `scope="function"`** — session-scoped async SQLAlchemy engines cause event loop mismatch errors with asyncpg under pytest-asyncio.

## Reusable Patterns
- **UUID PK**: `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — Python-side, no pgcrypto dependency.
- **Timestamp in migration DDL**: `sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)`.
- **JSONB in migration DDL**: `sa.Column('validation', postgresql.JSONB(), nullable=True)` — always explicit, never rely on autogenerate.
- **Relationship declaration**: `lazy='raise'` on all relationships; always use `selectinload`/`joinedload` at query time.
- **Ownership JOIN pattern**: `SELECT q.* FROM questions q JOIN question_groups qg ON qg.id = q.group_id JOIN surveys s ON s.id = qg.survey_id WHERE q.id = :id AND s.user_id = :user_id`.
- **Auto sort_order**: `SELECT COALESCE(MAX(sort_order), 0) + 1 FROM questions WHERE group_id = :group_id` — inside same transaction as INSERT.
- **Top-level question code**: `Q{n+1}` where n = count of all questions across all groups in the survey.
- **Subquestion code**: `{parent_code}_SQ{n}` where n is scoped to the parent question's existing subquestions.
- **Reorder pre-validation**: verify all submitted IDs belong to authenticated user's survey before issuing any UPDATE statements.
- **Import smoke-test**: `python -c "from app.models.question import Question"` before any Alembic command.
- **Self-referential Pydantic**: call `QuestionResponse.model_rebuild()` at module level after class definition.
- **Test invocation**: `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_questions.py -v`.

## Files to Review for Similar Tasks
- `backend/app/models/question_group.py` — established pattern for group FK, lazy='raise', relationships.
- `backend/app/models/answer_option.py` — established pattern for child-model FK CASCADE and sort_order.
- `backend/app/schemas/question_group.py` — reference for schema structure (Create/Update/Response/ListResponse).
- `backend/app/services/question_group_service.py` — reference for ownership-scoped JOIN queries and sort_order helpers.
- `backend/app/api/question_groups.py` — reference for router prefix pattern and endpoint signatures.
- `backend/alembic/versions/0006_create_question_groups_table.py` — reference for manually authored migration with JSONB and server_default.
- `backend/tests/test_question_groups.py` — reference for helper functions (register_and_login, auth_headers, create_survey, create_group) and ownership enforcement test patterns.

## Gotchas and Pitfalls
- **Never run `alembic revision --autogenerate`** on tables with JSONB or timezone timestamps — always author migrations manually.
- **Self-referential FK DDL**: verify the generated SQL explicitly; a misplaced FK reference causes a cryptic DB error, not a Python error.
- **Forgetting `model_rebuild()`** on self-referential Pydantic models compiles cleanly but fails silently at serialization — always call it at module level.
- **`lazy='raise'` failures surface at runtime**, not import time — test every endpoint that returns nested relationships to confirm selectinload is in place.
- **Passlib CryptContext is broken with bcrypt >= 4.x** — use `bcrypt` directly (`hashpw`/`checkpw`/`gensalt`) everywhere.
- **DATABASE_URL environment default uses psycopg2 scheme** (`postgresql://`) — always override to `postgresql+asyncpg://` for every test run; forgetting causes a confusing driver error.
- **Scope code uniqueness to the survey**, not the group — a common mistake that produces non-unique codes when questions span multiple groups.
- **Reorder endpoint cross-survey risk**: without pre-validation of all submitted IDs, a malicious user can corrupt sort_order values in surveys they don't own.
- **Session-scoped async fixtures** cause event loop mismatch errors under pytest-asyncio — use `scope="function"` on all async engine/session fixtures without exception.
```
