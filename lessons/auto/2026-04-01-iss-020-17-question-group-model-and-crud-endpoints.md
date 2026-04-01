---
date: "2026-04-01"
ticket_id: "ISS-020"
ticket_title: "1.7: Question Group Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-020"
ticket_title: "1.7: Question Group Model and CRUD Endpoints"
categories: ["database", "api", "security", "testing", "migrations"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/models/question_group.py"
  - "backend/app/schemas/question_group.py"
  - "backend/app/services/question_group_service.py"
  - "backend/app/api/question_groups.py"
  - "backend/app/main.py"
  - "backend/app/models/survey.py"
  - "backend/alembic/versions/0006_create_question_groups_table.py"
  - "backend/tests/test_question_groups.py"
---

# Lessons Learned: 1.7: Question Group Model and CRUD Endpoints

## What Worked Well
- Following established patterns from the Survey (1.6) implementation provided a clear template for the QuestionGroup model, schemas, service, and router structure.
- Declaring `lazy='raise'` on all ORM relationships caught missing `selectinload` calls at runtime immediately rather than allowing silent lazy-loading to slip through.
- Manually authoring the Alembic migration (rather than using `--autogenerate`) preserved `server_default=sa.text('now()')` on the `created_at` column and avoided silent DDL drift.
- Running an import smoke-test (`python -c "from app.models.question_group import QuestionGroup"`) before every `alembic` command caught broken imports with clean tracebacks rather than cryptic Alembic errors.
- Using `scope="function"` on all async pytest fixtures eliminated event loop mismatch errors with asyncpg under pytest-asyncio.

## What Was Challenging
- Ensuring the QuestionGroup import was added to **both** `alembic/env.py` and `app/models/__init__.py` — missing either causes a silent migration gap with no error raised.
- Preventing race conditions in sort_order auto-assignment: computing `COALESCE(MAX(sort_order), 0) + 1` must happen inside the same transaction as the INSERT, not in a preceding separate query.
- Implementing the reorder endpoint securely: without pre-validating that all submitted group IDs belong to the authenticated user's survey, a malicious actor can corrupt sort_order values across surveys.
- Ownership enforcement must use a JOIN query rather than fetch-then-check, to avoid leaking resource existence via differential 403/404 responses.

## Key Technical Insights
1. **Atomic sort_order assignment**: Use `SELECT COALESCE(MAX(sort_order), 0) + 1 FROM question_groups WHERE survey_id = :survey_id` inside the same transaction as the INSERT. Computing it separately opens a race window producing duplicate sort_order values under concurrent requests.
2. **Reorder pre-validation is a security requirement**: Verify ALL submitted group IDs belong to the authenticated user's survey before issuing any UPDATE. Without this, cross-survey sort_order manipulation is trivially possible.
3. **Ownership-scoped lookups via JOIN**: Use `SELECT qg.* FROM question_groups qg JOIN surveys s ON s.id = qg.survey_id WHERE qg.id = :id AND s.user_id = :user_id`. This returns a correct 404 for unauthorized access without leaking whether the resource exists.
4. **Never use `alembic revision --autogenerate`**: It silently drops `server_default=sa.text('now()')` from DateTime columns on every revision for this project. Always manually author migrations and verify DDL before applying.
5. **lazy='raise' as a safety net**: Declaring it on all ORM relationships forces `MissingGreenlet` errors at the ORM layer at runtime for any relationship access missing an explicit `selectinload`/`joinedload`, making omissions immediately visible.
6. **UUID PKs must use Python-side default**: `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — not `server_default=gen_random_uuid()`. The `pgcrypto` extension may not be enabled in all environments.
7. **Cascade delete requires both layers**: `ondelete='CASCADE'` on the FK in migration DDL AND `cascade='all, delete-orphan'` on the ORM back-populated relationship from Survey to QuestionGroup. Either alone is insufficient.

## Reusable Patterns
- **UUID PK**: `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)`
- **Timestamp in migration DDL**: `sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)`
- **Composite index**: `sa.Index('idx_question_groups_survey_id_sort', 'survey_id', 'sort_order')`
- **Ownership-scoped lookup**: JOIN to parent table on `user_id` rather than fetch-then-check
- **Atomic sort_order**: `COALESCE(MAX(sort_order), 0) + 1` computed and inserted in a single transaction
- **Cascade delete**: `ondelete='CASCADE'` in DDL + `cascade='all, delete-orphan'` on ORM relationship
- **Import smoke-test**: `python -c "from app.models.question_group import QuestionGroup"` before every `alembic` command
- **Test invocation**: `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_question_groups.py -v`
- **Function-scoped async fixtures**: `@pytest_asyncio.fixture(scope='function')` for all engine/session/client fixtures

## Files to Review for Similar Tasks
- `backend/app/models/question_group.py` — reference ORM model with UUID PK, FK CASCADE, lazy='raise', relationships
- `backend/app/services/question_group_service.py` — atomic sort_order assignment, JOIN-based ownership scoping, reorder pre-validation
- `backend/app/api/question_groups.py` — nested router pattern under surveys, selectinload usage for detail endpoint
- `backend/alembic/versions/0006_create_question_groups_table.py` — manually authored migration with server_default, ondelete='CASCADE', composite index
- `backend/tests/test_question_groups.py` — function-scoped fixtures, ownership scoping tests, reorder tests, cascade delete tests

## Gotchas and Pitfalls
- **Silent migration gap**: Adding QuestionGroup import to only one of `alembic/env.py` or `app/models/__init__.py` causes the table to simply not be created — with no error raised.
- **`alembic revision --autogenerate` silently drops `server_default`**: This affects `created_at` and potentially other columns. Always manually author migrations for this project.
- **Container default `DATABASE_URL` uses psycopg2 scheme**: The environment sets `postgresql://...` which silently fails with the async engine. Always override to `postgresql+asyncpg://` for test runs.
- **MissingGreenlet is a runtime error, not import-time**: Missing `selectinload` on a relationship accessed in an async route will not be caught until the endpoint is actually called.
- **Reorder endpoint is a cross-survey vulnerability by default**: Without group ID pre-validation, any authenticated user can submit IDs from other users' surveys and corrupt their sort_order.
- **Race condition in sort_order**: Fetching `MAX(sort_order)` in one query and inserting in another allows concurrent requests to assign the same sort_order value. Must be atomic.
- **`server_default=gen_random_uuid()` requires pgcrypto**: Use Python-side `default=uuid.uuid4` to avoid environment-dependent failures.
```
