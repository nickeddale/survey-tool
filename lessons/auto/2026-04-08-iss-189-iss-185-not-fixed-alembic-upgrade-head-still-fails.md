---
date: "2026-04-08"
ticket_id: "ISS-189"
ticket_title: "ISS-185 not fixed: alembic upgrade head still fails with quota_action enum conflict"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-189"
ticket_title: "ISS-185 not fixed: alembic upgrade head still fails with quota_action enum conflict"
categories: ["alembic", "postgresql", "migrations", "enums", "asyncpg"]
outcome: "success"
complexity: "low"
files_modified: ["backend/alembic/versions/0012_create_quotas_table.py"]
---

# Lessons Learned: ISS-185 not fixed: alembic upgrade head still fails with quota_action enum conflict

## What Worked Well
- The root cause was identified quickly by recognizing the recurring pattern: `sa.Enum(create_type=False)` does not reliably suppress `CREATE TYPE` emission inside `op.create_table`, while `sqlalchemy.dialects.postgresql.ENUM(create_type=False)` does
- The fix was minimal and surgical — a single import swap in one migration file
- Prior MEMORY.md notes on asyncpg DDL idempotency directly guided the solution without requiring fresh investigation

## What Was Challenging
- The issue was a repeat of ISS-185, meaning the original fix was incomplete — `create_type=False` on the generic `sa.Enum` class gave a false sense of correctness
- The failure mode is silent during normal development (migration runs fine on a fresh DB the first time) but surfaces only on retry or when the ENUM already exists from a prior migration — making it easy to miss in code review

## Key Technical Insights
1. `sa.Enum(..., create_type=False)` inside `op.create_table` does NOT reliably suppress `CREATE TYPE` emission — SQLAlchemy's generic Enum type may still attempt to create the type depending on the operation context
2. `sqlalchemy.dialects.postgresql.ENUM(..., create_type=False)` is the correct and reliable way to reference a pre-existing PostgreSQL ENUM in a migration — it will never emit a `CREATE TYPE` statement
3. asyncpg rejects `CREATE TYPE IF NOT EXISTS` with a `PostgresSyntaxError` — idempotent ENUM creation must use the `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'foo') THEN CREATE TYPE ... END IF; END $$` pattern via `conn.exec_driver_sql()`
4. ENUM types in PostgreSQL are non-transactional — if a migration fails mid-flight after creating an ENUM, the type persists even after the transaction rolls back, causing `type already exists` errors on retry
5. Migration files that reference an ENUM created in a prior migration should always use the dialect-specific class, not the generic `sa.Enum`, to make the dependency on a pre-existing type explicit and reliable

## Reusable Patterns
- **Pre-existing ENUM in migration**: `from sqlalchemy.dialects.postgresql import ENUM` then `ENUM('val1', 'val2', name='my_enum', create_type=False)` — never use `sa.Enum('val1', 'val2', name='my_enum', create_type=False)` for types created in a prior migration
- **Idempotent ENUM creation in migration 0001**: Use `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'foo') THEN CREATE TYPE foo AS ENUM (...); END IF; END $$` via `conn.exec_driver_sql()`, not `conn.execute(text(...))`
- **Pre-flight import smoke-test**: Before running alembic, run `python -c "from app.models.<model> import <Model>"` inside Docker to surface import errors with clean tracebacks
- **Scoped Docker startup for migration testing**: Always use `docker compose up -d postgres` (not `docker compose up`) to avoid frontend/nginx failures blocking migration tests

## Files to Review for Similar Tasks
- `backend/alembic/versions/0012_create_quotas_table.py` — canonical example of correct `postgresql.ENUM(create_type=False)` usage in `op.create_table`
- `backend/alembic/versions/0001_initial_extensions_and_enums.py` — canonical example of idempotent ENUM creation with `DO $$ IF NOT EXISTS` via `exec_driver_sql()`
- `backend/app/models/quota.py` — model-level ENUM definition; confirms correct dialect-specific ENUM pattern at the ORM layer

## Gotchas and Pitfalls
- `sa.Enum(create_type=False)` looks correct but is unreliable in `op.create_table` — this is a subtle SQLAlchemy behavior difference between the generic and dialect-specific Enum classes; always use the dialect-specific one when the type already exists
- Alembic autogenerate may silently revert a `postgresql.ENUM` back to `sa.Enum` on regeneration — always manually inspect migration files after any autogenerate step involving PostgreSQL ENUMs
- Alembic autogenerate also silently drops `server_default` and `onupdate` directives — manually verify these are preserved after any autogenerate step on tables with timestamp columns
- Running `docker compose up` without scoping to a service will fail if `frontend/nginx.conf` is missing — always scope to `postgres` during migration testing
- Missing model imports in `alembic/env.py` or `app/models/__init__.py` can cause silent migration failures where tables are not created — verify both files import any newly added model
```
