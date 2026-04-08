---
date: "2026-04-08"
ticket_id: "ISS-188"
ticket_title: "Webhooks table missing user_id column — manual migration workaround incomplete"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-188"
ticket_title: "Webhooks table missing user_id column — manual migration workaround incomplete"
categories: ["database", "alembic", "migrations", "postgresql", "webhooks"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/alembic/versions/0018_add_user_id_to_webhooks.py"
---

# Lessons Learned: Webhooks table missing user_id column — manual migration workaround incomplete

## What Worked Well
- No model or service layer changes were required — the ORM and business logic already correctly referenced `user_id`, confirming the bug was purely a schema gap
- Isolating the fix to a single additive migration (rather than modifying 0014) kept the migration chain clean and safe to apply to existing environments
- Using the PL/pgSQL `DO $$ BEGIN IF NOT EXISTS ... END $$` pattern for idempotent column addition handled environments where the column may or may not already exist without errors
- Reading migration 0014 first to understand the full intended schema before writing the new migration prevented guesswork about FK targets and index conventions

## What Was Challenging
- Tracing the root cause required understanding the history: ISS-185 caused migration 0014 to be bypassed via manual SQL, and that manual SQL was incomplete — the fix required knowing what the original migration intended, not just what the model currently defines
- Ensuring idempotency for the column addition required a non-standard approach (`exec_driver_sql` with raw PL/pgSQL) rather than the simpler `op.add_column`, adding friction compared to a standard migration
- Verifying that `down_revision` correctly pointed to the actual previous migration required checking which migrations existed in the chain rather than assuming a sequential number

## Key Technical Insights
1. **Manual SQL workarounds that bypass Alembic create hidden schema drift.** When a migration is skipped and replaced with manual SQL, any column added to the migration after the manual workaround was written will silently be absent from production. Always audit manual workarounds against the full intended migration output.
2. **asyncpg does not support `CREATE TYPE IF NOT EXISTS` or equivalent conditional DDL via standard SQLAlchemy `op.*` calls.** For idempotent DDL (adding columns, creating types) use `conn.exec_driver_sql()` with a PL/pgSQL `DO $$ BEGIN IF NOT EXISTS (...) THEN ...; END IF; END $$` block obtained via `op.get_bind()`.
3. **Alembic autogenerate silently drops `server_default` and `onupdate` on timestamp columns.** Always manually inspect and patch generated migration output — never apply autogenerate output directly.
4. **New SQLAlchemy models must be imported in both `alembic/env.py` and `app/models/__init__.py`** before running any alembic command. Missing either causes silent migration gaps where Alembic cannot detect the model's table.
5. **Always use `postgresql+asyncpg://` scheme when specifying `DATABASE_URL` for async test runs.** The default environment may use `postgresql://` (psycopg2 scheme), which silently fails or produces confusing errors with the async engine.

## Reusable Patterns
- **Idempotent column addition:**
  ```python
  def upgrade():
      conn = op.get_bind()
      conn.exec_driver_sql("""
          DO $$ BEGIN
              IF NOT EXISTS (
                  SELECT 1 FROM information_schema.columns
                  WHERE table_name='webhooks' AND column_name='user_id'
              ) THEN
                  ALTER TABLE webhooks
                      ADD COLUMN user_id UUID NOT NULL
                      REFERENCES users(id) ON DELETE CASCADE;
              END IF;
          END $$
      """)
      op.create_index('ix_webhooks_user_id', 'webhooks', ['user_id'])
  ```
- **Import smoke-test before any alembic command:**
  ```bash
  python -c "from app.models.webhook import Webhook"
  ```
- **Docker test run with explicit asyncpg scheme:**
  ```bash
  docker run --rm --network host \
    -e DATABASE_URL="postgresql+asyncpg://survey:survey@localhost:5432/survey_test" \
    -e JWT_SECRET=testsecret \
    -v $(pwd)/backend:/app \
    survey_tool-backend:latest \
    python -m pytest tests/ -q
  ```
- **All async pytest fixtures must use `scope="function"`** — never `scope="session"` with asyncpg to avoid event loop mismatch errors.

## Files to Review for Similar Tasks
- `backend/alembic/versions/0014_create_webhooks_table.py` — original intended schema; reference for column definitions, FK targets, and index naming conventions when writing additive migrations
- `backend/alembic/versions/0018_add_user_id_to_webhooks.py` — example of idempotent column addition via `exec_driver_sql` with PL/pgSQL
- `backend/alembic/env.py` — must import all models before alembic can detect schema; check this when adding new models
- `backend/tests/conftest.py` — canonical async fixture pattern; copy function-scoped engine/session fixtures exactly for new test files
- `backend/app/models/webhook.py` — ground truth for what columns the ORM expects; always compare against actual DB schema when debugging 500 errors from the service layer

## Gotchas and Pitfalls
- **Manual SQL workarounds that create tables are high-risk debt.** They bypass migration tracking and are prone to drift when the migration file is later updated. Always document exactly which SQL was run manually and diff it against the migration file immediately.
- **Do not use `op.add_column` when the column may already exist in some environments** — it will raise `DuplicateColumn` with no graceful recovery. Use the PL/pgSQL idempotency pattern instead.
- **`op.get_bind()` returns a sync connection in async Alembic context** — use `exec_driver_sql()` not `execute(text(...))` for raw DDL.
- **The `./backend:/app` Docker volume mount masks `.egg-info` artifacts.** If new test modules fail to import inside the container, the editable install may be absent on the host. Rebuild with `docker compose build backend` or run `pip install -e .` on the host first.
- **A 500 on a POST endpoint with `column X does not exist`** almost always means schema drift, not a code bug. Before touching service or model code, run `\d tablename` in psql to compare actual columns against the ORM model definition.
- **`down_revision` must point to the actual previous migration ID** — verify by listing files in `alembic/versions/` rather than assuming sequential numbering, especially if migrations have been added out of order or squashed.
```
