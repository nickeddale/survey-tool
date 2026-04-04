---
date: "2026-04-04"
ticket_id: "ISS-109"
ticket_title: "7.14: End-to-End Integration Test Suite"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-04"
ticket_id: "ISS-109"
ticket_title: "7.14: End-to-End Integration Test Suite"
categories: ["testing", "e2e", "integration", "webhooks", "quotas", "assessments"]
outcome: "success"
complexity: "high"
files_modified: ["backend/tests/test_e2e.py", "backend/tests/test_quotas.py", "backend/tests/test_assessments.py", "backend/tests/test_webhooks.py", "backend/pyproject.toml"]
---

# Lessons Learned: 7.14: End-to-End Integration Test Suite

## What Worked Well
- Reusing function-scoped async engine/client fixtures from conftest.py kept each test isolated and prevented cross-test state contamination
- Running an import smoke-test (`python -c 'import tests.test_e2e; ...'`) before pytest surfaced broken imports as clean tracebacks rather than confusing collection failures
- Verifying `pytest-httpserver` presence in `pyproject.toml` before writing `test_webhooks.py` avoided a late-stage missing-dependency discovery
- Sequential full-journey test in `test_e2e.py` covering all 18 question types in one scenario provided maximum coverage with minimal fixture overhead
- Patching `dispatch_webhook_event` at the call-site module level (e.g., `app.services.response_service.dispatch_webhook_event`) instead of the inner delivery function correctly intercepted before `asyncio.create_task` was scheduled

## What Was Challenging
- Coordinating four separate test files that each depended on overlapping application subsystems (auth, surveys, responses, quotas, assessments, webhooks) required careful reading of existing patterns before writing any new code
- Concurrent quota race-condition tests required each coroutine in `asyncio.gather` to hold its own independent `AsyncClient` and database session — sharing a single session caused `MissingGreenlet` errors under SQLAlchemy asyncpg
- Webhook E2E tests needed a local mock HTTP server (`pytest-httpserver`) to capture and assert POST bodies and HMAC signatures without external network calls
- Ensuring `DATABASE_URL` was overridden to `postgresql+asyncpg://` scheme on every pytest invocation — the container default (`postgresql://`) fails silently with asyncpg

## Key Technical Insights
1. **Function scope is mandatory for all async SQLAlchemy fixtures** — session-scoped async fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio and have no workaround.
2. **Never use `passlib.CryptContext` in test helpers** — `bcrypt >= 4.x` removes `bcrypt.__about__` which `passlib 1.7.x` requires, causing a `RuntimeError`/`AttributeError` on first password operation. Use `bcrypt.hashpw`/`bcrypt.checkpw` directly.
3. **`boolean` question type answers must be string `"true"`/`"false"`**, not Python `True`/`False` — the API validates the string form.
4. **`multiple_choice` answers stored as lists cause `unhashable type: 'list'`** in `relevance.py:278` via `frozenset(answers.items())` — avoid submitting list values in tests that trigger completion with relevance evaluation.
5. **`WWW-Authenticate: Bearer` headers can be stripped by global error handlers** — explicitly assert this header is present on 401 responses in auth path tests, as a middleware refactor may silently drop custom headers.
6. **Refresh tokens must be rejected as Bearer tokens** — assert that submitting a refresh token to `Authorization: Bearer` returns 401, guarding against `payload['type'] == 'access'` enforcement regressions.
7. **Statistics endpoint fields are `total_responses` and `complete_responses`**, not `total`/`complete` — mismatched field names cause silent assertion failures if not verified against the actual response shape.
8. **Participant token enforcement is conditional** — surveys only require participant tokens if at least one `Participant` row exists; invalid tokens return 403, not 404.

## Reusable Patterns
- **Function-scoped async engine fixture:**
  ```python
  @pytest_asyncio.fixture(scope='function')
  async def engine():
      e = create_async_engine(DATABASE_URL)
      async with e.begin() as conn:
          await conn.run_sync(Base.metadata.create_all)
      yield e
      async with e.begin() as conn:
          await conn.run_sync(Base.metadata.drop_all)
      await e.dispose()
  ```
- **DATABASE_URL override for pytest invocation:**
  ```
  DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_e2e.py ...
  ```
- **Password hashing in test helpers:**
  ```python
  bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()
  ```
- **Concurrent quota stress test pattern:**
  ```python
  await asyncio.gather(*[submit_response(client_i) for i in range(N)])
  # Each client_i has its own db session via app.dependency_overrides
  ```
- **Dependency override per coroutine for concurrent tests:**
  ```python
  app.dependency_overrides[get_db] = make_override()
  # Clear after each task completes
  ```
- **Import smoke-test before full pytest run:**
  ```
  python -c 'import tests.test_e2e; import tests.test_quotas; import tests.test_assessments; import tests.test_webhooks'
  ```
- **Explicit security assertion on user responses:**
  ```python
  assert 'password_hash' not in response.json()
  ```

## Files to Review for Similar Tasks
- `backend/tests/conftest.py` — canonical fixture patterns; verify all async fixtures are function-scoped before inheriting
- `backend/tests/test_e2e.py` — full journey test structure and 18-question-type coverage pattern
- `backend/tests/test_quotas.py` — concurrent `asyncio.gather` pattern for race-condition testing
- `backend/tests/test_webhooks_e2e.py` — `pytest-httpserver` mock server setup and HMAC signature assertion
- `backend/app/services/relevance.py:278` — `frozenset(answers.items())` bug site for multiple_choice answers
- `backend/app/services/response_service.py` — correct call-site for mocking `dispatch_webhook_event`
- `backend/pyproject.toml` — dependency list to verify before writing tests that require `pytest-httpserver`

## Gotchas and Pitfalls
- **Do not share async sessions across `asyncio.gather` coroutines** — each concurrent task must own its session; shared sessions cause `MissingGreenlet` errors.
- **Do not use `passlib.CryptContext` with `bcrypt >= 4.x`** — it will raise `AttributeError` at runtime on first use.
- **Do not assume `postgresql://` works with asyncpg** — always override `DATABASE_URL` to `postgresql+asyncpg://` in test commands.
- **Do not mock `_deliver_webhook` directly** — it runs inside `asyncio.create_task` on the module-level session bound to the first event loop; mock `dispatch_webhook_event` at the call-site module instead.
- **Do not rely on Pydantic schema exclusion alone for sensitive fields** — add an explicit `assert 'password_hash' not in response.json()` to catch regressions if schema changes.
- **Verify `pytest-httpserver` is in `pyproject.toml` before writing webhook tests** — discovering a missing dependency during the test run wastes a full iteration.
- **`multiple_choice` answers as Python lists will crash relevance evaluation** — the cache key computation uses `frozenset(answers.items())` which cannot hash list values.
```
