---
date: "2026-04-10"
ticket_id: "ISS-215"
ticket_title: "Idle-in-transaction connection leak — 18 connections stuck"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-10"
ticket_id: "ISS-215"
ticket_title: "Idle-in-transaction connection leak — 18 connections stuck"
categories: ["database", "connection-pooling", "fastapi", "sqlalchemy", "performance"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/app/database.py", "backend/app/dependencies.py", "docker-compose.yml", "backend/tests/test_connection_lifecycle.py"]
---

# Lessons Learned: Idle-in-transaction connection leak — 18 connections stuck

## What Worked Well
- The implementation plan correctly identified all root causes upfront: missing `finally` in `get_db`, double-session issue in `require_scope`, and lack of PostgreSQL-level timeout enforcement
- Using the SQLAlchemy `checkout` pool event (rather than `connect`) to set `idle_in_transaction_session_timeout` ensured the timeout applied to every logical connection returned from the pool, not just newly created physical connections
- Adding `finally: await session.close()` to `get_db` was a minimal, high-confidence fix that addressed the primary leak path without architectural risk
- Mirroring the PostgreSQL timeout settings in `docker-compose.yml` via `-c` flags ensured the dev/test environment matched production behavior early

## What Was Challenging
- The original implementation plan included an Alembic migration to SET `idle_in_transaction_session_timeout` — this was a subtle footgun because `SET` is session-scoped and only affects the migration connection, doing nothing for future application connections. The correct approach (engine event listener) had to be identified and substituted
- `asyncio.CancelledError` is a `BaseException` in Python 3.12, not an `Exception`, so the existing `except Exception` block in `get_db` silently skipped cleanup on request cancellation. This made `finally` not just an improvement but a correctness requirement
- Deciding whether to refactor `require_scope` required auditing every call site first — some endpoints use `require_scope` without `get_current_user`, so a naive session-threading refactor would have broken those paths
- SQLAlchemy's pool introspection API (`engine.sync_engine.pool.checkedout()`) is implementation-specific and not stable across versions, making pool-state assertions in tests brittle

## Key Technical Insights
1. `except Exception` does NOT catch `asyncio.CancelledError` in Python 3.12+ — it is a `BaseException`. The `finally` clause is the only reliable cleanup path for cancelled requests; treat it as mandatory, not optional.
2. SQLAlchemy pool events `connect` vs `checkout` are semantically distinct: `connect` fires only on new physical connections; `checkout` fires on every logical connection handed to application code. For per-session PostgreSQL `SET` commands, `checkout` is always correct.
3. A `SET` command in an Alembic migration only affects the connection used during the migration run. It has no persistent effect and will silently appear to succeed while doing nothing for future application connections.
4. `require_scope` calling `Depends(get_db)` independently from `get_current_user` means endpoints using both open two pool connections per request. Under the `pool_size=20` limit, this effectively halves the concurrency capacity.
5. The `idle_in_transaction_session_timeout` PostgreSQL parameter (in milliseconds) causes the server to automatically terminate connections that hold an open transaction without issuing any statements — this is the correct server-side backstop, not a replacement for proper session lifecycle management.

## Reusable Patterns
- **`get_db` async generator pattern:** Always use `try/except/finally` with `finally: await session.close()`. The `finally` block is the only path guaranteed to run on exception, cancellation, and success.
- **Pool checkout event for session-level settings:**
  ```python
  @event.listens_for(engine.sync_engine, "checkout")
  def on_checkout(dbapi_conn, conn_record, conn_proxy):
      cursor = dbapi_conn.cursor()
      cursor.execute("SET idle_in_transaction_session_timeout = '30000'")
      cursor.close()
  ```
- **PostgreSQL timeout via docker-compose:**
  ```yaml
  command: postgres -c idle_in_transaction_session_timeout=30000 -c statement_timeout=60000
  ```
- **Dependency double-session audit:** Before refactoring shared dependencies, grep all routers for every combination of `Depends(require_scope)` and `Depends(get_current_user)` to confirm pairing assumptions hold at every call site.

## Files to Review for Similar Tasks
- `backend/app/database.py` — engine creation, pool settings, event listeners, `get_db` generator
- `backend/app/dependencies.py` — `get_current_user`, `require_scope`, session lifecycle in dependency chain
- `backend/tests/test_connection_lifecycle.py` — reference for pool introspection and session-close verification patterns
- `backend/tests/conftest.py` — test engine setup; ensure `pool_size` on the test engine does not exhaust `max_connections` under parallel test runs

## Gotchas and Pitfalls
- **Do not use an Alembic migration to SET session-level PostgreSQL parameters** — the SET only applies to the migration connection and has no lasting effect. Use a SQLAlchemy engine event listener instead.
- **`pool.checkedout()` is SQLAlchemy-version-specific** — verify the attribute path (`engine.sync_engine.pool.checkedout()`) against the installed version before writing test assertions. Prefer `pg_stat_activity`-based integration tests for robustness.
- **`except Exception` silently skips `CancelledError`** — any cleanup that must run on request cancellation must live in a `finally` block, not an `except` block.
- **`pool_size=20` on both application and test engines can exhaust PostgreSQL `max_connections`** — if tests run concurrently (e.g., via `pytest-xdist`), use a lower `pool_size` (e.g., 5) on the test engine or raise `max_connections` in the test postgres container.
- **`require_scope` with its own `Depends(get_db)` consumes a second pool slot per request** — under high concurrency this effectively doubles pool pressure. The fix is to thread the session from `get_current_user` through, but only after confirming all call sites pair the two dependencies.
```
