---
date: "2026-04-03"
ticket_id: "ISS-086"
ticket_title: "6.4: Response Status Management and Disqualification"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-086"
ticket_title: "6.4: Response Status Management and Disqualification"
categories: ["status-management", "database-migrations", "api-endpoints", "authentication", "testing"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/app/models/response.py", "backend/app/schemas/response.py", "backend/app/services/response_service.py", "backend/app/api/responses.py", "backend/app/dependencies.py", "backend/tests/test_responses.py", "backend/alembic/versions/"]
---

# Lessons Learned: 6.4: Response Status Management and Disqualification

## What Worked Well
- Incremental status lifecycle design (incomplete -> complete, incomplete -> disqualified, complete -> disqualified) mapped cleanly to service-layer validation
- Ownership enforcement at the query layer via JOIN prevented existence leakage and TOCTOU issues
- Raising HTTP 422 directly for invalid transitions kept error semantics consistent with the rest of the API
- Import smoke-test pattern (`python -c "from app.models.response import Response"`) caught broken imports before alembic runs, avoiding cryptic migration errors

## What Was Challenging
- PostgreSQL ENUM value addition (`ALTER TYPE response_status ADD VALUE 'disqualified'`) is not detected or rendered by Alembic autogenerate — required manual DDL authoring
- Ensuring `create_type=False` when the `response_status` ENUM already existed from a prior migration to avoid `DuplicateObject` errors
- Scoping the status endpoint correctly to `responses:write` without leaking response existence to unauthenticated callers

## Key Technical Insights
1. Alembic autogenerate silently drops `server_default=sa.text('now()')` on timestamp columns and misrenders ENUM value additions and CHECK constraint changes — always manually author and inspect migration DDL before applying.
2. PostgreSQL ENUMs require `ALTER TYPE <name> ADD VALUE '<value>'` to extend; attempting to re-create an existing ENUM type causes a `DuplicateObject` error — use `create_type=False` in migration DDL when the type already exists.
3. Ownership-scoped lookups must use a single JOIN query (`SELECT r.* FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE r.id = :id AND s.user_id = :user_id`) rather than a fetch-then-check pattern to prevent existence leakage and race conditions.
4. The correct exception for invalid status transitions is HTTP 422, not a generic `ConflictError` — verify which exception class maps to 422 in the existing error middleware before choosing the type.
5. All async pytest fixtures must use `scope='function'`; session-scoped async SQLAlchemy engines cause event loop mismatch errors with asyncpg under pytest-asyncio.
6. The container default `DATABASE_URL` uses the psycopg2 scheme (`postgresql://`) which silently fails with the async engine — always override to `postgresql+asyncpg://` for test invocations.

## Reusable Patterns
- **Import smoke-test before alembic:** `python -c "from app.models.response import Response"` — surfaces broken imports as clean tracebacks rather than cryptic alembic errors.
- **ENUM extension migration:** `op.execute("ALTER TYPE response_status ADD VALUE 'disqualified'")` with `create_type=False` on the column definition.
- **Ownership-scoped query:** `SELECT r.* FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE r.id = :id AND s.user_id = :user_id` — single query, no leakage, correct 404 for both missing and unauthorized.
- **Status transition guard in service layer:** check current status before applying transition; raise HTTP 422 with a descriptive message for any invalid transition direction.
- **Exclude disqualified from stats:** add `WHERE status != 'disqualified'` (or ORM equivalent) as the default filter on all statistics queries; expose an explicit opt-in parameter if all statuses are ever needed.
- **Test override for async DB:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/<db>' pytest`

## Files to Review for Similar Tasks
- `backend/app/services/response_service.py` — reference for status transition validation and disqualification logic
- `backend/app/api/responses.py` — reference for PATCH status endpoint pattern with scope-based auth
- `backend/app/dependencies.py` — reference for `responses:write` scope enforcement
- `backend/alembic/versions/` — review the manually authored ENUM extension migration as a template for future ENUM changes
- `backend/tests/test_responses.py` — reference for testing valid/invalid transitions, auth, and stats exclusion

## Gotchas and Pitfalls
- **Never use autogenerate for this project's migrations** — it silently corrupts ENUM additions, CHECK constraints, and `server_default` timestamps.
- **Do not re-create an existing ENUM type** — check prior migrations for the type name; use `create_type=False` and `ALTER TYPE ... ADD VALUE` instead.
- **Add model imports to both `alembic/env.py` AND `app/models/__init__.py`** — missing either causes a silent migration gap with no error raised.
- **Do not use session-scoped async fixtures** — asyncpg + pytest-asyncio requires `scope='function'` on all async fixtures to avoid event loop mismatch.
- **Disqualified -> incomplete and disqualified -> complete are both invalid transitions** — enforce both reverse-transition guards, not just one direction.
- **Statistics endpoints must filter `status != 'disqualified'` by default** — failing to add this filter causes disqualified responses to silently inflate aggregate results.
```
