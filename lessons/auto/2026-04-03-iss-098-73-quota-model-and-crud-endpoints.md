---
date: "2026-04-03"
ticket_id: "ISS-098"
ticket_title: "7.3: Quota Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-098"
ticket_title: "7.3: Quota Model and CRUD Endpoints"
categories: ["database", "api", "migrations", "sqlalchemy", "pydantic"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/quota.py
  - backend/app/models/__init__.py
  - backend/app/schemas/quota.py
  - backend/app/api/quotas.py
  - backend/app/main.py
  - backend/alembic/versions/0012_create_quotas_table.py
---

# Lessons Learned: 7.3: Quota Model and CRUD Endpoints

## What Worked Well
- The established project patterns (SQLAlchemy 2.0 async `Mapped` types, Pydantic `ConfigDict(from_attributes=True)`, FastAPI router helpers) made the implementation straightforward and consistent with the rest of the codebase.
- Reusing the existing `quota_action` ENUM from migration 0001 with `create_type=False` avoided duplicate type creation errors.
- Manually authoring the Alembic migration rather than relying on autogenerate ensured timestamp columns retained their `server_default` and `onupdate` directives.
- The flat error collection pattern for condition validation (collect all invalid `question_id` errors before raising) produced clear, complete error messages rather than forcing clients to fix issues one at a time.

## What Was Challenging
- Confirming the exact ENUM name and values from migration 0001 required explicit review before writing any code — a mismatch is a silent runtime failure, not a migration-time error.
- Ensuring the new model was registered in both `app/models/__init__.py` and `alembic/env.py` — missing either causes silent autogenerate failures or migration import errors.
- JSONB condition validation required a custom `field_validator` to enforce both structural correctness and question existence at the API layer.

## Key Technical Insights
1. **`quota_action` ENUM with `create_type=False`:** The ENUM was created in migration 0001. Any new table using it must pass `create_type=False` in both the SQLAlchemy column definition and the Alembic migration `sa.Enum(...)` call. A name mismatch causes a runtime error not surfaced at migration apply time.
2. **UUID primary key:** Use Python-side `default=uuid.uuid4`, never `server_default=gen_random_uuid()`. The `pgcrypto` extension is not guaranteed to be enabled in this environment.
3. **Alembic autogenerate drops timestamp directives:** Autogenerate silently omits `server_default=sa.text('now()')` and `onupdate` on timestamp columns. Always manually author migrations for any table with `created_at`/`updated_at`.
4. **Dual model registration:** New models must be imported in both `app/models/__init__.py` (for application use) and `alembic/env.py` (for migration detection). Either omission causes silent failures in different contexts.
5. **JSONB condition validation:** Pydantic validates the structure of each `QuotaCondition` object, but question existence (FK validity against the survey's questions) must be checked at the API layer asynchronously, not at the schema layer.
6. **Import smoke-test gate:** Running `python -c 'from app.models.quota import Quota'` before any Alembic command surfaces broken imports as clean Python tracebacks rather than cryptic Alembic errors.

## Reusable Patterns
- **Import smoke-test before Alembic:** `python -c 'from app.models.quota import Quota'` — run before every `alembic upgrade head`.
- **Circular import check after `__init__.py` edit:** `python -c 'from app.models import Quota'` — confirms no circular import was introduced.
- **Flat error collection loop for multi-condition validation:** Iterate all conditions, collect all errors into a list, raise a single `422` with the full list at the end. Never short-circuit on first failure.
- **ENUM reuse pattern:** `sa.Enum('terminate', 'hide_question', name='quota_action', create_type=False)` in both the model column and the migration.
- **Pagination helper shape:** `QuotaListResponse` with `items`, `total`, `page`, `per_page`, `pages` — consistent with other list endpoints in the project.
- **DATABASE_URL override for tests:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest` — required every time to avoid psycopg2/asyncpg scheme mismatch.
- **Async fixture scope:** All async pytest fixtures must use `scope='function'` — never `session` or `module` with asyncpg under pytest-asyncio.

## Files to Review for Similar Tasks
- `backend/alembic/versions/0001_*.py` — authoritative source for existing ENUM names and values.
- `backend/app/models/participant.py` or `backend/app/models/response.py` — reference implementations for SQLAlchemy 2.0 async `Mapped` model patterns.
- `backend/app/api/responses.py` — reference for helper function patterns (`_parse_*`, `_get_*_or_404`) and flat error collection for validation.
- `backend/app/schemas/response.py` — reference for Pydantic schema structure with `field_validator`.
- `backend/alembic/env.py` — must be updated with each new model import.
- `backend/app/models/__init__.py` — must be updated with each new model import.

## Gotchas and Pitfalls
- **Do not start `docker-compose` without specifying the service:** `docker-compose up -d postgres` only. Starting all services will fail due to missing `frontend/nginx.conf` and may block postgres.
- **`quota_action` ENUM name mismatch is a silent runtime error:** Verify the exact string `'quota_action'` against migration 0001 before writing any code. The migration will apply successfully but queries will fail at runtime.
- **Alembic autogenerate is not safe for this codebase:** It silently drops `server_default` and `onupdate` on timestamp columns. Manually author every migration and inspect the generated SQL before applying.
- **Volume mount masks build artifacts:** The `./backend:/app` mount can hide `.egg-info` from the container. If Alembic cannot resolve `app.*` imports inside the container, verify that `.egg-info` exists on the host filesystem.
- **Pydantic field omission vs. exclusion:** A field absent from `QuotaResponse` is not guaranteed to be absent from the serialized response. Add explicit assertions for any field that must not appear in API responses.
- **`passlib` CryptContext is broken with bcrypt >= 4.x:** Do not introduce it anywhere in new code.
- **Condition `question_id` validation must be exhaustive:** Collect all invalid IDs across all conditions before returning an error. Clients should receive a complete error list, not be forced into a fix-and-retry loop.
```
