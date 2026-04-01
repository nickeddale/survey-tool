---
date: "2026-04-01"
ticket_id: "ISS-013"
ticket_title: "Task 1.13: Backend Test Infrastructure and Initial Test Suite"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-013"
ticket_title: "Task 1.13: Backend Test Infrastructure and Initial Test Suite"
categories: ["testing", "fastapi", "sqlalchemy", "asyncpg", "pytest", "postgresql"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/tests/conftest.py
  - backend/tests/test_auth.py
  - backend/tests/test_surveys.py
  - backend/tests/test_questions.py
  - backend/tests/test_answer_options.py
  - backend/tests/test_api_keys.py
  - backend/tests/test_export.py
  - backend/tests/test_survey_transitions.py
  - backend/pyproject.toml
---

# Lessons Learned: Task 1.13: Backend Test Infrastructure and Initial Test Suite

## What Worked Well
- Function-scoped async SQLAlchemy engine fixtures provided reliable database isolation with zero test pollution across ~4000 lines of test coverage
- Building factory fixtures through API endpoints (not direct DB inserts) exercised the full service-layer logic including sort_order assignment and ownership enforcement
- Overriding `DATABASE_URL` at conftest.py module level (via `os.environ`) ensured the correct asyncpg scheme was used without requiring a manual prefix on every pytest invocation
- Using `bcrypt.hashpw/checkpw/gensalt` directly in fixtures avoided the passlib/bcrypt incompatibility entirely
- Separating test files by domain (auth, surveys, questions, answer_options, api_keys, export, transitions) kept each module focused and maintainable

## What Was Challenging
- The container's `DATABASE_URL` environment variable defaults to the psycopg2 scheme (`postgresql://`) which silently fails with the async engine — the error is not always immediately obvious from the traceback
- Distinguishing Pydantic field omission from field exclusion required explicit test assertions; relying on schema definition alone is insufficient for security-sensitive fields
- Async SQLAlchemy lazy relationship loading raises `MissingGreenlet` in factory fixtures that traverse nested survey → group → question → option structures; every relationship access must use explicit eager loading
- Session-scoped async fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio and have no workaround — the only fix is function scope
- The passlib/bcrypt incompatibility produces an `AttributeError: module 'bcrypt' has no attribute '__about__'` at runtime with bcrypt >= 4.x, which can be introduced accidentally in fixtures even when application code is already fixed

## Key Technical Insights
1. **`scope="function"` is mandatory for all async SQLAlchemy fixtures** — engine, session, and client fixtures must all be function-scoped. Session scope causes event loop mismatch errors with asyncpg under pytest-asyncio with no viable workaround.
2. **DATABASE_URL scheme must be overridden in conftest.py** — set `os.environ["DATABASE_URL"] = "postgresql+asyncpg://..."` at module level in conftest.py so the correct scheme is always active without manual env prefix per invocation.
3. **Never use passlib CryptContext with bcrypt >= 4.x** — use `bcrypt.hashpw`, `bcrypt.checkpw`, and `bcrypt.gensalt` directly in all fixtures and application code.
4. **Pydantic field omission ≠ field exclusion** — a field absent from a response schema is not guaranteed to be absent from the serialized JSON. Always write explicit assertions: `assert "password_hash" not in response.json()`.
5. **Show-once contracts require explicit test assertions** — the full API key string being absent from GET list responses must be asserted in tests, not assumed from schema field definitions.
6. **Factory fixtures must use API endpoints, not direct DB inserts** — going through the API ensures service-layer logic (sort_order, ownership, foreign key ordering) is exercised and constraints are satisfied correctly.
7. **All relationship traversals in async context require explicit eager loading** — use `selectinload` or `joinedload` in any query or factory that accesses related models; never rely on lazy loading.
8. **Reorder endpoints require a cross-user ownership violation test** — submitting IDs from another user's survey must return 403 or 404; this case is easy to omit and must be explicitly covered.

## Reusable Patterns
- **conftest.py DATABASE_URL override**: Place `import os; os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker")` at the top of conftest.py before any app imports.
- **Function-scoped async engine fixture**:
  ```python
  @pytest.fixture(scope="function")
  async def engine():
      engine = create_async_engine(os.environ["DATABASE_URL"])
      async with engine.begin() as conn:
          await conn.run_sync(Base.metadata.create_all)
      yield engine
      async with engine.begin() as conn:
          await conn.run_sync(Base.metadata.drop_all)
      await engine.dispose()
  ```
- **authenticated_client fixture**: Register a real user via `POST /auth/register`, then `POST /auth/login`, and attach the Bearer token to the `AsyncClient` headers — exercises the full auth stack.
- **API-based factory fixtures**: Create survey → groups → questions → options through sequential API calls using `authenticated_client`, capturing IDs from each response for use in subsequent calls.
- **Sensitive field absence assertion**: `assert "password_hash" not in resp.json()` and `assert "key" not in key_list_item` as explicit test assertions, not structural assumptions.
- **Pagination total assertion**: Assert `response.json()["total"]` against the known number of created records, not against `len(response.json()["items"])`, to catch off-by-one bugs in COUNT queries.
- **Cross-user reorder test**: Create a second authenticated client, create a survey under it, then attempt reorder with IDs from that survey using the first client — assert 403 or 404.

## Files to Review for Similar Tasks
- `backend/tests/conftest.py` — canonical example of function-scoped async fixtures, DATABASE_URL override, authenticated_client, and API-based factory fixtures
- `backend/tests/test_auth.py` — reference for auth lifecycle coverage including sensitive field absence assertions and API key show-once verification
- `backend/tests/test_surveys.py` — reference for pagination total assertions and status transition coverage
- `backend/tests/test_questions.py` — reference for nested CRUD coverage and cross-user ownership violation tests on reorder endpoints
- `backend/pyproject.toml` — reference for `asyncio_mode = "auto"` and `testpaths` configuration

## Gotchas and Pitfalls
- **Silent asyncpg scheme failure**: `postgresql://` (psycopg2) passed to `create_async_engine` may not raise an obvious error immediately — watch for connection errors that don't mention scheme mismatch.
- **passlib import at any level breaks tests**: Even a single `from passlib.context import CryptContext` import in a fixture file will cause `AttributeError` at runtime with bcrypt >= 4.x — grep the entire test directory before assuming it's clean.
- **MissingGreenlet in factory teardown**: The error can appear in fixture teardown, not just setup, if cleanup code traverses relationships — apply eager loading in both directions.
- **Pydantic v2 `model_config` with `exclude`**: Field-level `exclude=True` in Pydantic v2 schemas does not prevent the field from appearing if it is set on the model instance and the serializer is called with `include` overrides — always verify with an actual HTTP response assertion.
- **pytest-asyncio `asyncio_mode = "auto"` required**: Without this setting, async test functions are silently skipped or collected as non-async, producing zero failures and zero actual test runs — always verify test count is non-zero.
- **Session-scoped fixtures and asyncpg**: There is no workaround for the event loop mismatch — any attempt to share an async engine or session across function boundaries via session scope will fail. Do not attempt to optimize with session scope.
- **Cross-database isolation requires drop_all in teardown**: If `drop_all` is omitted from the engine fixture teardown, table state leaks between tests even when using separate connections, because the tables themselves persist across function calls.
```
