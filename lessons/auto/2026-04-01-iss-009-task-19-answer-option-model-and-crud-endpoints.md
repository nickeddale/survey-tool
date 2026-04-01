---
date: "2026-04-01"
ticket_id: "ISS-009"
ticket_title: "Task 1.9: Answer Option Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-009"
ticket_title: "Task 1.9: Answer Option Model and CRUD Endpoints"
categories: ["sqlalchemy", "fastapi", "postgresql", "crud", "nested-resources", "alembic"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/answer_option.py
  - backend/app/models/question.py
  - backend/app/models/__init__.py
  - backend/app/schemas/answer_option.py
  - backend/app/services/answer_option_service.py
  - backend/app/api/answer_options.py
  - backend/app/main.py
  - backend/alembic/versions/0008_create_answer_options_table.py
  - backend/tests/test_answer_options.py
---

# Lessons Learned: Task 1.9: Answer Option Model and CRUD Endpoints

## What Worked Well
- Following the established Question model pattern (model → schema → service → router → migration → tests) provided a clear, repeatable implementation path.
- Ownership verification via a single JOIN chain (answer_options → questions → question_groups → surveys WHERE surveys.user_id = :user_id) cleanly handled both 404-not-found and 403-unauthorized cases without leaking resource existence.
- Using Python-side `default=uuid.uuid4` for UUID primary keys avoided pgcrypto extension dependency issues.
- Manually authoring the Alembic migration preserved `server_default=sa.text('now()')` on the `created_at` column, which autogenerate silently drops.

## What Was Challenging
- Ensuring auto-code generation (A1, A2...) and auto-sort_order assignment both execute inside the same transaction as the INSERT to prevent duplicate values under concurrent requests.
- The reorder endpoint required careful pre-validation that all submitted option IDs belong to the authenticated user's question before issuing any UPDATE, to prevent cross-question sort_order corruption.
- The UniqueConstraint on (question_id, code) must be caught as `sqlalchemy.exc.IntegrityError` and mapped to HTTP 409 — application-level pre-check queries alone are insufficient due to race conditions.

## Key Technical Insights
1. **Declare `lazy='raise'` on all ORM relationships.** Async SQLAlchemy does not support implicit lazy loading. Any route that accesses a relationship without explicit `selectinload`/`joinedload` will raise `MissingGreenlet` at runtime. Declaring `lazy='raise'` surfaces this at the ORM layer immediately during development rather than silently at runtime.
2. **Never use `alembic revision --autogenerate`.** It silently drops `server_default=sa.text('now()')` on DateTime columns. Always manually author migration scripts using `sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)` explicitly.
3. **Import the model in both `alembic/env.py` AND `app/models/__init__.py` before any alembic command.** Missing either import causes a silent migration gap — the table simply won't be created, with no error raised.
4. **Auto-generated codes and sort_order must be computed inside the same INSERT transaction.** Querying MAX(sort_order) and COUNT(options) outside the transaction creates a TOCTOU race condition that produces duplicate values under concurrent creates.
5. **IntegrityError is the authoritative uniqueness check.** The (question_id, code) unique constraint violation must be caught as `sqlalchemy.exc.IntegrityError` and returned as HTTP 409. Pre-check queries are advisory only.

## Reusable Patterns
- **UUID PK:** `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — Python-side default, never `server_default`.
- **Ownership-scoped nested lookup:** Single JOIN query — `answer_options → questions → question_groups → surveys WHERE surveys.user_id = :user_id` — returns 404 for both missing and unauthorized without leaking existence.
- **Auto sort_order:** `SELECT COALESCE(MAX(sort_order), 0) + 1` inside the same transaction as INSERT.
- **Auto code generation (A1, A2...):** `COUNT(existing options) + 1` inside the same transaction as INSERT to derive the next suffix.
- **Reorder pre-validation:** Fetch all option IDs for the question, assert all submitted IDs are a subset before issuing any UPDATE.
- **IntegrityError → HTTP 409:** Wrap INSERT/UPDATE in try/except `sqlalchemy.exc.IntegrityError`.
- **Import smoke-test before every alembic command:** `python -c "from app.models.answer_option import AnswerOption"`.
- **Function-scoped async fixtures:** `@pytest_asyncio.fixture(scope='function')` for all engine/session/client fixtures — session scope causes event loop mismatch with asyncpg.
- **Test invocation:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_answer_options.py -v`.

## Files to Review for Similar Tasks
- `backend/app/models/answer_option.py` — canonical nested resource model with UUID PK and lazy='raise' relationship pattern.
- `backend/app/services/answer_option_service.py` — canonical service layer with ownership verification JOIN chain, auto-code generation, auto-sort_order, and IntegrityError → 409 handling.
- `backend/app/api/answer_options.py` — canonical nested router with survey_id + question_id path params and reorder endpoint.
- `backend/alembic/versions/0008_create_answer_options_table.py` — canonical manually-authored migration with UniqueConstraint, FK CASCADE, and explicit server_default on created_at.
- `backend/tests/test_answer_options.py` — canonical test suite covering CRUD, auto-code, sort_order ordering, reorder, uniqueness 409, ownership 404, and assessment_value default.
- `backend/app/models/question.py` — reference for adding `answer_options` relationship with `lazy='raise'` and `cascade='all, delete-orphan'`.

## Gotchas and Pitfalls
- **Silent migration gap:** Forgetting to import AnswerOption in either `alembic/env.py` or `app/models/__init__.py` causes the table to be silently skipped during migration — no error, just a missing table at runtime.
- **psycopg2 scheme in container:** The container default `DATABASE_URL` uses `postgresql://` (psycopg2), not `postgresql+asyncpg://`. Always override for test runs or the async engine will fail silently.
- **autogenerate drops server_default:** `alembic revision --autogenerate` silently omits `server_default` on DateTime columns. The created_at column will have no default at the DB level, causing insert failures on rows that don't supply the value explicitly.
- **MissingGreenlet without lazy='raise':** Without `lazy='raise'`, accidental implicit lazy loads in async context produce a confusing `MissingGreenlet` traceback rather than a clear ORM error.
- **Reorder without pre-validation:** Submitting option IDs from another user's question to the reorder endpoint will corrupt sort_order values for that question if ownership is not verified before issuing UPDATEs.
- **Code uniqueness race condition:** Two concurrent POSTs can both pass an application-level pre-check for code uniqueness and then both insert, causing a DB-level constraint error on the second. Always catch `IntegrityError` and return 409 regardless of pre-check results.
```
