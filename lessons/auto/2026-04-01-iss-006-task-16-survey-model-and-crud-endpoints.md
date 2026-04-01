---
date: "2026-04-01"
ticket_id: "ISS-006"
ticket_title: "Task 1.6: Survey Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-006"
ticket_title: "Task 1.6: Survey Model and CRUD Endpoints"
categories: ["fastapi", "sqlalchemy", "postgresql", "alembic", "testing", "crud", "pagination"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/models/survey.py
  - backend/app/models/__init__.py
  - backend/app/schemas/survey.py
  - backend/app/services/survey_service.py
  - backend/app/api/surveys.py
  - backend/app/main.py
  - backend/alembic/versions/0005_create_surveys_table.py
  - backend/tests/test_surveys.py
  - backend/alembic/env.py
---

# Lessons Learned: Task 1.6: Survey Model and CRUD Endpoints

## What Worked Well
- Following established patterns from prior tasks (API keys, user model) made the service/router/schema layering straightforward.
- Manually authoring the Alembic migration instead of using autogenerate avoided known pitfalls with `server_default` timestamps and JSONB column type inference.
- Reusing the existing `survey_status` ENUM with `create_type=False` prevented duplicate-type errors on migration apply.
- Enforcing user ownership via combined `WHERE id = :id AND user_id = :user_id` in a single query avoided information leakage on 404 responses.
- Function-scoped async fixtures prevented event loop mismatch errors with asyncpg under pytest-asyncio.
- Running an import smoke-test (`python -c "from app.models.survey import Survey"`) before any alembic command caught missing import issues early.

## What Was Challenging
- The `?include=full` placeholder required forward-thinking schema design (empty lists for groups/questions/options) without the related models existing yet — keeping the extension point explicit required a `SurveyFullResponse` schema extending `SurveyResponse`.
- The `survey_status` ENUM already existed from migration 0001, so the migration had to explicitly opt out of re-creation — easy to miss without prior context.
- Ensuring the `settings` JSONB column was correctly typed in the migration DDL required explicit `sa.dialects.postgresql.JSONB` — autogenerate would have silently rendered it as TEXT.
- The container's default `DATABASE_URL` uses the psycopg2 scheme, which silently fails with the async engine; every test run required the explicit `postgresql+asyncpg://` override.

## Key Technical Insights
1. **Never trust autogenerate for tables with server_default timestamps or JSONB columns.** Autogenerate silently drops `server_default=sa.text('now()')` on timestamp columns and may render JSONB as TEXT. Always manually author migrations and inspect DDL before applying.
2. **Reuse existing PostgreSQL ENUMs with `create_type=False`.** When an ENUM was created in an earlier migration, use `postgresql.ENUM('val1', 'val2', name='enum_name', create_type=False)` in subsequent migrations to avoid `DuplicateObject` errors.
3. **User ownership must be enforced at the query layer, not application layer.** Use `WHERE id = :id AND user_id = :user_id` to return 404 for both missing and unauthorized resources, leaking no existence information.
4. **UUID primary keys: use Python-side `default=uuid.uuid4`, not `server_default=gen_random_uuid()`.** The pgcrypto extension may not be enabled in all environments; Python-side generation is portable and reliable.
5. **Paginated `total` count must use a separate `COUNT(*)` query**, not `len(results)` on a limited result set — the latter will return at most `per_page`, not the true total.
6. **Add model imports to both `alembic/env.py` and `app/models/__init__.py`** before any alembic command. Missing either location causes a silent migration gap with no error raised — the table simply does not appear in the migration.
7. **session-scoped async SQLAlchemy fixtures are incompatible with asyncpg under pytest-asyncio.** All engine/session fixtures must use `scope="function"`.

## Reusable Patterns
- **Import smoke-test before alembic:** `python -c "from app.models.survey import Survey"` — catches missing imports before a silent migration gap.
- **Test invocation with correct DATABASE_URL:** `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker" pytest backend/tests/test_surveys.py -v`
- **UUID PK column:** `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)`
- **Timestamp columns in ORM model:** `server_default=func.now()` for `created_at`; `server_default=func.now(), onupdate=func.now()` for `updated_at`
- **Reusing existing ENUM in migration:** `postgresql.ENUM('draft', 'active', 'closed', name='survey_status', create_type=False)`
- **JSONB settings column in migration:** `sa.Column('settings', postgresql.JSONB(), nullable=True)`
- **Ownership-enforced fetch:** `SELECT ... FROM surveys WHERE id = :id AND user_id = :user_id`
- **Paginated list service pattern:** separate `SELECT COUNT(*) WHERE ...` then `SELECT ... LIMIT :limit OFFSET :offset` — never count from the fetched page
- **`?include=full` placeholder schema:** extend base response schema with optional list fields (all default empty) to make the extension point explicit without requiring related models
- **Function-scoped async fixtures:** `@pytest_asyncio.fixture(scope="function")` for engine, session, and client fixtures

## Files to Review for Similar Tasks
- `backend/app/models/survey.py` — canonical async SQLAlchemy 2.0 model with UUID PK, JSONB, ENUM, and timestamp columns
- `backend/app/services/survey_service.py` — ownership-enforced CRUD, paginated list with separate COUNT query, status/search filtering
- `backend/app/api/surveys.py` — full CRUD router with 201/204 status codes, query param pagination/filtering, include placeholder
- `backend/alembic/versions/0005_create_surveys_table.py` — manually authored migration with existing ENUM reuse, explicit JSONB, and server_default timestamps
- `backend/tests/test_surveys.py` — function-scoped fixtures, user isolation tests, pagination and filter coverage

## Gotchas and Pitfalls
- **Missing model import in `alembic/env.py` causes silent migration gap** — no error is raised; the table simply does not get created. Always add the import and run the smoke-test first.
- **Alembic autogenerate silently drops `server_default` and `onupdate`** on timestamp columns. Manually author all migrations involving these columns.
- **Alembic autogenerate may render JSONB as TEXT** — always use `sa.dialects.postgresql.JSONB` explicitly in migration DDL.
- **`survey_status` ENUM already exists from migration 0001** — attempting to re-create it will raise `DuplicateObject`. Use `create_type=False`.
- **Container default `DATABASE_URL` uses psycopg2 scheme** (`postgresql://`) which silently fails with the async engine. Always override to `postgresql+asyncpg://` for tests.
- **Volume mount `./backend:/app` may mask `.egg-info`** — if alembic cannot resolve `app.*` imports, check that the editable install `.egg-info` exists on the host side.
- **Do not use passlib CryptContext anywhere** — bcrypt >= 4.x breaks it at runtime with `AttributeError: module 'bcrypt' has no attribute '__about__'`. Use `bcrypt.hashpw/checkpw/gensalt` directly.
- **`len(results)` on a paginated query returns at most `per_page`**, not the true total. Always use a separate `COUNT(*)` query for pagination metadata.
- **Fetch-then-check ownership leaks existence information** — always filter by both `id` and `user_id` in the same query so unauthorized and missing resources both return 404.
```
