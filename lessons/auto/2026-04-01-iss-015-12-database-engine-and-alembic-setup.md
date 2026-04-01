---
date: "2026-04-01"
ticket_id: "ISS-015"
ticket_title: "1.2: Database Engine and Alembic Setup"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-015"
ticket_title: "1.2: Database Engine and Alembic Setup"
categories: ["database", "alembic", "sqlalchemy", "postgresql", "async"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/database.py
  - backend/alembic/env.py
  - backend/alembic.ini
  - backend/alembic/versions/0001_initial_extensions_and_enums.py
---

# Lessons Learned: 1.2: Database Engine and Alembic Setup

## What Worked Well
- Writing the 0001 migration manually rather than relying on autogenerate gave full control over extension and ENUM creation order and idempotency guards
- Using `async_sessionmaker` with `expire_on_commit=False` and `pool_pre_ping=True` proved stable across all downstream tests
- Scoping `docker-compose up -d postgres` to the postgres service only avoided frontend stub failures from missing `nginx.conf` during migration development
- Running an import smoke-test before any alembic command surfaced broken imports with clean tracebacks rather than cryptic alembic errors

## What Was Challenging
- The environment default `DATABASE_URL` uses the psycopg2 scheme (`postgresql://`) which silently fails with the async engine — this required overriding to `postgresql+asyncpg://` for every local alembic and pytest invocation
- ENUM types are not transactional in PostgreSQL, so a mid-flight migration failure leaves orphaned types that cause errors on retry without `IF NOT EXISTS` guards
- Alembic autogenerate silently drops `server_default` and `onupdate` directives on timestamp columns, requiring manual inspection of every generated script
- The `./backend:/app` volume mount masks `.egg-info` build artifacts, causing broken `app.*` imports inside the container when the editable install is absent on the host

## Key Technical Insights
1. Always override `DATABASE_URL` to `postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker` for every local alembic and pytest invocation — the psycopg2-scheme default causes async dialect errors that are not obvious from the error message.
2. ENUM types in PostgreSQL survive transaction rollbacks — guard all ENUM creation with `CREATE TYPE ... IF NOT EXISTS` or wrap in a try/except in the migration's upgrade function to make retries safe.
3. The async `env.py` pattern requires `run_migrations_online` to call `asyncio.run(run_async_migrations())` where `run_async_migrations` uses `AsyncEngine.begin()` and passes the sync connection to `context.run_migrations()`; the offline path stays synchronous.
4. Autogenerate only detects model changes if every model is imported before `target_metadata` is referenced — missing imports produce silent gaps with no error raised, not an exception.
5. Alembic autogenerate does not preserve `server_default=sa.text('now()')` or `onupdate` on timestamp columns — always manually verify these directives are present after generating a script.
6. Async SQLAlchemy engine fixtures in pytest must use `scope="function"` — session-scoped engines cause event loop mismatch errors with asyncpg.

## Reusable Patterns
- **Async engine creation:** `create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)`
- **Session factory:** `async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)`
- **get_db generator:** async generator yielding session inside `try/finally` with `session.close()` in the finally block
- **Async env.py:** `run_migrations_online` calls `asyncio.run(run_async_migrations())`; inner function uses `AsyncEngine.begin()` to obtain a sync-compatible connection passed to `context.run_migrations()`
- **Import smoke-test:** `python -c "from app.database import engine, async_session, Base, get_db"` before every alembic command
- **Safe ENUM migration:** use `op.execute("CREATE TYPE survey_status AS ENUM (...)")` wrapped in try/except `DuplicateObject` or use raw SQL `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$`
- **Model registration:** import all models in both `alembic/env.py` and `app/models/__init__.py` before any alembic command

## Files to Review for Similar Tasks
- `backend/app/database.py` — canonical async engine, session factory, Base, and get_db implementation
- `backend/alembic/env.py` — async migration pattern with `asyncio.run` and `AsyncEngine.begin()`
- `backend/alembic/versions/0001_initial_extensions_and_enums.py` — reference for manually writing extension and ENUM migrations with idempotency guards
- `backend/alembic.ini` — script_location, sqlalchemy.url placeholder, and file_template configuration

## Gotchas and Pitfalls
- **Silent psycopg2 scheme failure:** `postgresql://` with an async engine does not raise an obvious error immediately — always validate the URL scheme at engine creation.
- **ENUM orphans on retry:** a failed migration that already created an ENUM will error on re-run without `IF NOT EXISTS` — never omit idempotency guards on ENUM DDL.
- **Autogenerate drops timestamp directives:** `server_default` and `onupdate` on `TIMESTAMP` columns are silently omitted in autogenerated scripts — treat autogenerate output as a draft, not a final migration.
- **Volume mount masks editable install:** if `app.*` imports break inside the container after a clean rebuild, the `.egg-info` directory may be missing on the host; verify with `pip show <package>` or reinstall inside the container.
- **Full docker-compose stack fails without nginx.conf:** always use `docker-compose up -d postgres` during migration development — the frontend stub requires `nginx.conf` which may not exist in early milestones.
- **asyncpg pinned to <0.30:** do not upgrade asyncpg without re-testing the full async engine connection path — the pin exists to avoid a known compatibility issue.
- **Session-scoped engine fixtures crash with asyncpg:** use `scope="function"` for all async SQLAlchemy engine fixtures in pytest to avoid event loop mismatch errors.
```
