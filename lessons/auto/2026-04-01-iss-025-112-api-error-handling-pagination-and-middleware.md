---
date: "2026-04-01"
ticket_id: "ISS-025"
ticket_title: "1.12: API Error Handling, Pagination, and Middleware"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-025"
ticket_title: "1.12: API Error Handling, Pagination, and Middleware"
categories: ["error-handling", "pagination", "middleware", "testing"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/app/utils/errors.py", "backend/app/utils/pagination.py", "backend/app/main.py", "backend/app/dependencies.py", "backend/tests/test_error_handling.py", "backend/tests/test_pagination.py"]
---

# Lessons Learned: 1.12: API Error Handling, Pagination, and Middleware

## What Worked Well
- Core components (errors.py, pagination.py, middleware, exception handlers) were already fully implemented, allowing the task to focus on verification and gap-filling rather than greenfield development
- The `@app.exception_handler(CustomException)` pattern cleanly separated error type registration from business logic
- CORSMiddleware configuration from `CORS_ORIGINS` config kept CORS behavior environment-driven without hardcoding
- Import smoke-tests before running pytest caught broken module references early and avoided cryptic test failures

## What Was Challenging
- Distinguishing between a `len(results)` pagination total (wrong — returns at most `per_page`) and a proper separate COUNT query (correct — returns true total across all pages); easy to miss without an explicit test
- CORS misconfiguration fails silently: a missing or empty `CORS_ORIGINS` config value produces no `Access-Control-Allow-Origin` headers rather than raising an error, making it hard to detect without targeted header assertions in tests
- The generic 500 handler required explicit gating on `DEBUG`/`ENVIRONMENT` config to suppress stack traces in production while still surfacing them in development

## Key Technical Insights
1. Pagination `total` must come from a separate `SELECT COUNT(*)` query, never from `len(page_results)` — the latter is bounded by `per_page` and will never reflect the true dataset size.
2. The `per_page` cap (max 100) must be enforced inside the `pagination_params` dependency using `min(per_page, 100)`, not as a validator on the model, so FastAPI applies it before the value reaches any handler.
3. The generic `Exception` handler should return `{"detail": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}}` with HTTP 500 and must not include tracebacks unless `settings.DEBUG` is true.
4. CORS headers are only present in responses when the request includes a matching `Origin` header — tests must send `Origin` explicitly or the assertion will always pass vacuously.
5. All async SQLAlchemy fixtures in pytest must use `scope="function"`; session-scoped async engines cause event loop mismatch errors with asyncpg that have no workaround.

## Reusable Patterns
- **Pagination dependency:** `def pagination_params(page: int = 1, per_page: int = 20) -> PaginationParams` with `per_page = min(per_page, 100)` enforced inside the function body.
- **Pagination response shape:** `{"items": [...], "total": <count_query_result>, "page": <n>, "per_page": <n>}`
- **Standardized error shape:** `{"detail": {"code": "NOT_FOUND", "message": "..."}}`
- **Error code registry:** VALIDATION_ERROR (400), UNAUTHORIZED (401), FORBIDDEN (403), NOT_FOUND (404), CONFLICT (409), UNPROCESSABLE (422), RATE_LIMITED (429), INTERNAL_ERROR (500)
- **Import smoke-test before pytest:** `python -c 'from app.utils.errors import NotFoundError, ConflictError, ValidationError, UnprocessableError; from app.utils.pagination import PaginationParams'`
- **DATABASE_URL override for all test runs:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest`

## Files to Review for Similar Tasks
- `backend/app/utils/errors.py` — custom exception classes and status/code mappings
- `backend/app/utils/pagination.py` — `PaginationParams` dataclass and `paginate()` helper
- `backend/app/main.py` — exception handler registration, CORS middleware, request logging middleware
- `backend/app/dependencies.py` — `pagination_params` FastAPI dependency
- `backend/tests/test_error_handling.py` — reference for testing all 8 error codes
- `backend/tests/test_pagination.py` — reference for per_page cap, default params, and COUNT query correctness

## Gotchas and Pitfalls
- **Silent CORS failure:** missing `CORS_ORIGINS` config does not raise — it silently produces no CORS headers. Always assert `Access-Control-Allow-Origin` in at least one test with a matching `Origin` header.
- **Pagination total trap:** using `len(items)` for `total` returns a number ≤ `per_page`, not the true dataset size. Always use a COUNT query.
- **Stack traces in production:** the generic 500 handler must explicitly check `settings.DEBUG` before including exception details; the default FastAPI unhandled exception response does include stack info.
- **psycopg2 scheme in DATABASE_URL:** the environment default `postgresql://` scheme is incompatible with the async engine; always override to `postgresql+asyncpg://` for test runs.
- **Session-scoped async fixtures:** asyncpg and pytest-asyncio's event loop lifecycle are incompatible with session-scoped SQLAlchemy engines — always use `scope="function"`.
- **Broken imports produce misleading errors:** a syntax or import error in any modified utility file will surface as a confusing collection failure rather than a clear traceback — run the import smoke-test first.
```
