---
date: "2026-04-01"
ticket_id: "ISS-026"
ticket_title: "1.13: Backend Test Infrastructure and Initial Test Suite"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-026"
ticket_title: "1.13: Backend Test Infrastructure and Initial Test Suite"
categories: ["testing", "pytest", "fastapi", "asyncio", "postgresql"]
outcome: "success"
complexity: "high"
files_modified: ["backend/tests/conftest.py", "backend/tests/test_auth.py", "backend/tests/test_surveys.py", "backend/tests/test_questions.py", "backend/tests/test_question_groups.py", "backend/tests/test_answer_options.py", "backend/tests/test_api_keys.py", "backend/tests/test_survey_transitions.py", "backend/tests/test_export.py", "backend/pyproject.toml"]
---

# Lessons Learned: 1.13: Backend Test Infrastructure and Initial Test Suite

## What Worked Well
- Function-scoped pytest-asyncio fixtures provided complete isolation between tests without event loop conflicts
- httpx.AsyncClient with app.dependency_overrides[get_db] cleanly decoupled tests from the real DI chain
- Using bcrypt directly (hashpw/checkpw/gensalt) in test fixtures avoided the passlib/bcrypt incompatibility entirely
- Explicit DATABASE_URL override on every pytest invocation prevented silent failures from the psycopg2-scheme default
- Factory fixtures for nested survey structures (groups/questions/options) reduced boilerplate across test files significantly
- Separating test files by domain (auth, surveys, questions, API keys, transitions, export) kept each file focused and maintainable

## What Was Challenging
- The container environment's default DATABASE_URL uses the psycopg2 scheme, which silently fails with asyncpg — this was a persistent source of confusion and required explicit override on every invocation
- Session-scoped or module-scoped async engine fixtures cause intermittent event loop mismatch errors with asyncpg; function scope is the only safe option for this stack even though it is slower
- Verifying that sensitive fields (password_hash, full API key) are truly absent from response JSON required explicit assertions — relying on Pydantic field omission alone is insufficient because schema changes can silently re-expose them
- Cross-resource ownership enforcement on bulk reorder operations was easy to miss; required dedicated tests submitting another user's resource IDs

## Key Technical Insights
1. `scope='function'` is mandatory for all async SQLAlchemy engine/session fixtures under pytest-asyncio + asyncpg. Session or module scope causes event loop mismatch errors that are intermittent and hard to diagnose.
2. The DATABASE_URL environment variable in this container uses `postgresql://` (psycopg2 scheme). The async engine requires `postgresql+asyncpg://`. Always override explicitly: `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker" pytest ...`
3. Pydantic field omission does not guarantee field exclusion from serialized JSON. Always assert `assert "password_hash" not in response.json()` and `assert "key" not in item` (for API key list) explicitly in tests.
4. passlib CryptContext is broken with bcrypt >= 4.x (missing `bcrypt.__about__`). Use `bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()` directly in all test fixtures and helpers.
5. Pagination `total` must reflect the full dataset count, not `len(items)` on the current page. Test this explicitly: create N records, fetch page 1, assert `response["total"] == N`.
6. Ownership isolation must be tested for every resource type: create as user_a, access as user_b, assert 404. This is especially easy to miss for bulk/reorder endpoints.
7. `httpx.AsyncClient(app=app, base_url="http://test")` with `app.dependency_overrides[get_db] = override_get_db` is the correct pattern for FastAPI async test clients. Do not inject sessions through the real DI chain.

## Reusable Patterns
- **Function-scoped engine fixture:** always `@pytest_asyncio.fixture(scope="function")` for create/drop table isolation per test
- **DATABASE_URL override:** `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker" pytest -q`
- **bcrypt in fixtures:** `bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()` — never `CryptContext`
- **Authenticated client helper:** `async def authenticated_client(client, user)` that sets `Authorization: Bearer <token>` header, not cookies or query params
- **Sensitive field absence assertion:** `assert "password_hash" not in response.json()` after register/me endpoints
- **API key list assertion:** assert full key string absent from GET /auth/keys items
- **Pagination total assertion:** `assert data["total"] == expected_count` where expected_count is the full dataset, not current page length
- **Ownership isolation test:** create resource as user_a, request as user_b, assert HTTP 404
- **Reorder cross-ownership test:** submit resource IDs belonging to a different user, assert 403 or 404

## Files to Review for Similar Tasks
- `backend/tests/conftest.py` — canonical example of function-scoped engine, dependency override pattern, authenticated_client helper, and factory fixtures
- `backend/tests/test_auth.py` — explicit sensitive field absence assertions, API key lifecycle pattern
- `backend/tests/test_surveys.py` — pagination total assertion pattern, status transition coverage
- `backend/tests/test_questions.py` — reorder ownership isolation test pattern
- `backend/pyproject.toml` — asyncio_mode = "auto" configuration and dev dependency declarations

## Gotchas and Pitfalls
- **Silent asyncpg failure:** If DATABASE_URL uses `postgresql://` instead of `postgresql+asyncpg://`, the async engine fails silently or with a confusing error. Always override on the CLI.
- **Event loop mismatch:** Any async SQLAlchemy fixture with `scope='session'` or `scope='module'` will cause intermittent `Task attached to a different loop` errors with asyncpg. Function scope is the only safe choice.
- **passlib runtime crash:** `from passlib.context import CryptContext` with bcrypt >= 4.x raises `AttributeError: module 'bcrypt' has no attribute '__about__'`. Never use passlib in this environment.
- **Pydantic field omission false safety:** A field excluded from a response schema today can be re-included by a schema refactor. Explicit `not in response.json()` assertions are the only reliable guard.
- **Reorder bulk endpoint ownership gap:** Bulk reorder endpoints that accept lists of IDs must validate ownership of every ID, not just the parent resource. Easy to implement the parent check and forget the child IDs.
- **Pagination count bug:** A common implementation bug replaces `COUNT(*)` with `len(results)` after a paginated fetch. Test with more records than `per_page` and assert `total` equals the full count to catch this.
- **Test pollution without drop/create:** If the engine fixture is not function-scoped with full table drop/create, data from previous tests leaks into subsequent tests, causing non-deterministic failures.
```
