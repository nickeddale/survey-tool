---
date: "2026-04-06"
ticket_id: "ISS-132"
ticket_title: "REL-03: Configure database pool_recycle and isolation level"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-132"
ticket_title: "REL-03: Configure database pool_recycle and isolation level"
categories: ["database", "sqlalchemy", "configuration", "reliability"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/database.py"]
---

# Lessons Learned: REL-03: Configure database pool_recycle and isolation level

## What Worked Well
- The change was minimal and surgical — adding two keyword arguments to an existing `create_async_engine` call with no structural refactoring required
- Running an import smoke-test (`python -c "from app.database import engine, async_session, Base, get_db"`) before and after modification caught any import-level regressions immediately
- Using the existing `settings.database_url` pattern (from `app.config`) meant no new environment coupling was introduced

## What Was Challenging
- No significant challenges; the ticket was straightforward with well-scoped acceptance criteria

## Key Technical Insights
1. `pool_recycle=300` instructs SQLAlchemy to discard and replace connections older than 300 seconds, preventing stale connection errors from database-side timeouts (e.g., PostgreSQL `idle_in_transaction_session_timeout` or firewall TCP resets)
2. `isolation_level='READ COMMITTED'` on an async SQLAlchemy engine sets the default transaction isolation at the connection level; asyncpg supports this via the engine `execution_options` or directly on `create_async_engine` — passing it directly is the correct approach for global defaults
3. These parameters affect runtime connection behavior only; they do not alter schema, migrations, or test fixture semantics, so existing tests continue to pass unchanged
4. asyncpg requires the `postgresql+asyncpg://` scheme in `DATABASE_URL` — a psycopg2-scheme URL will silently fail or raise driver errors when the async engine is initialized

## Reusable Patterns
- Minimal engine configuration change pattern:
  ```python
  engine = create_async_engine(
      settings.database_url,
      pool_recycle=300,
      isolation_level="READ COMMITTED",
  )
  ```
- Always run import smoke-test after any `database.py` modification:
  `python -c "from app.database import engine, async_session, Base, get_db"`
- Read `database_url` from `settings` (imported from `app.config`), never from `os.environ` directly in `database.py`
- All async pytest fixtures must use `scope="function"` to avoid asyncpg event loop mismatch under pytest-asyncio

## Files to Review for Similar Tasks
- `backend/app/database.py` — engine creation and session factory
- `backend/app/config.py` — `settings` singleton and `database_url` property
- `backend/tests/conftest.py` — async test engine/session fixtures; verify `scope="function"` on all async fixtures

## Gotchas and Pitfalls
- asyncpg is pinned to `<0.30` — do not upgrade without re-testing the full async engine connection path
- The container default `DATABASE_URL` may use the psycopg2 scheme (`postgresql://`) which is incompatible with the async engine — always override to `postgresql+asyncpg://` for local test runs
- Session-scoped async SQLAlchemy fixtures cause event loop mismatch errors with asyncpg — all conftest.py async fixtures must use `scope="function"`
- `isolation_level` on `create_async_engine` sets the default for all connections; if any specific route or service requires a different isolation level, it must be set explicitly at the session or connection level and will override the engine default
- `pool_recycle` does not preemptively close long-running transactions — it only recycles idle connections when they are returned to the pool, so it is not a substitute for proper transaction management
```
