---
date: "2026-04-01"
ticket_id: "ISS-012"
ticket_title: "Task 1.12: API Error Handling, Pagination, and Middleware"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-012"
ticket_title: "Task 1.12: API Error Handling, Pagination, and Middleware"
categories: ["error-handling", "pagination", "middleware", "fastapi", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/utils/__init__.py
  - backend/app/utils/errors.py
  - backend/app/utils/pagination.py
  - backend/app/main.py
  - backend/app/api/surveys.py
  - backend/app/api/questions.py
  - backend/app/api/question_groups.py
  - backend/app/api/answer_options.py
  - backend/app/api/auth.py
  - backend/app/dependencies.py
  - backend/tests/test_error_handling.py
  - backend/tests/test_pagination.py
---

# Lessons Learned: Task 1.12: API Error Handling, Pagination, and Middleware

## What Worked Well
- Using `FastAPI.add_exception_handler(ExceptionClass, handler_fn)` per custom error class kept handler registration clean and extensible without isinstance branching.
- Enforcing `per_page` cap via `Query(ge=1, le=100)` on `PaginationParams` delegated validation to FastAPI, eliminating manual cap logic in application code.
- Custom error classes with a shared `to_response()` method kept global handler logic minimal — each handler called `exc.to_response()` and returned the JSON directly.
- Import smoke-test (`python -c 'from app.utils.errors import NotFoundError'`) before running pytest caught broken imports early and saved time debugging pytest collection errors.
- Logging middleware at INFO level with `method`, `path`, `status_code`, and `elapsed` provided useful observability without risking credential leakage from request body logging.

## What Was Challenging
- FastAPI's default 422 RequestValidationError handler conflicts with the spec's VALIDATION_ERROR (400) requirement — required registering a custom `RequestValidationError` handler returning 400, plus a separate path for 422 HTTPExceptions returning UNPROCESSABLE.
- Existing routers used raw `HTTPException` with plain string `detail` values; the global HTTPException handler had to reformat these into `{detail: {code, message}}` by mapping status codes to error codes rather than assuming a structured detail payload.
- Middleware registration order matters in Starlette: CORS must be registered before logging middleware because middleware is applied in reverse registration order — getting this wrong causes CORS headers to be missing on error responses.
- Refactoring `get_current_user` in `dependencies.py` to raise a custom `UnauthorizedError` while preserving the `WWW-Authenticate: Bearer` header required passing the header through the custom exception class and re-emitting it in the exception handler response.

## Key Technical Insights
1. FastAPI's `RequestValidationError` (422 by default) and an `HTTPException(status_code=422)` are distinct exception types. Register separate handlers: `RequestValidationError` → 400 VALIDATION_ERROR, HTTPException with status 422 → 422 UNPROCESSABLE.
2. The global HTTPException handler must map status codes to error codes explicitly (401→UNAUTHORIZED, 403→FORBIDDEN, 404→NOT_FOUND, 409→CONFLICT, 422→UNPROCESSABLE, 429→RATE_LIMITED) rather than relying on a code field in the detail payload — legacy routers will not have that field.
3. The catch-all `Exception` handler must log the full traceback server-side but return only `{detail: {code: "INTERNAL_ERROR", message: "An internal error occurred"}}` — no exception message, no stack trace in the response body.
4. Starlette middleware is applied in reverse registration order: the last `add_middleware` call wraps the outermost layer. Register CORS last (so it is outermost), logging first (so it is innermost relative to CORS).
5. `PaginationParams` as a `Depends` dataclass with `page: int = Query(default=1, ge=1)` and `per_page: int = Query(default=20, ge=1, le=100)` is the correct pattern — FastAPI enforces the cap and returns a 422 automatically, which the global handler then reformats to 400 VALIDATION_ERROR.
6. The existing `surveys.py` COUNT query pattern must be preserved during pagination refactor — do not replace the separate `COUNT(*)` query with `len(results)`, as that only counts the current page.

## Reusable Patterns
- **Custom error class skeleton**: inherit from `Exception`, accept `message: str` in `__init__`, set `code` as a class variable, expose `to_response() -> dict` returning `{"detail": {"code": self.code, "message": self.message}}`.
- **Global handler registration**: `app.add_exception_handler(NotFoundError, not_found_handler)` for each custom class; one handler for `HTTPException` that maps `exc.status_code` to an error code; one handler for `RequestValidationError` returning 400; one catch-all for `Exception` returning 500.
- **PaginationParams dependency**: `class PaginationParams: page: int = Query(default=1, ge=1); per_page: int = Query(default=20, ge=1, le=100)` — inject via `Depends(PaginationParams)`.
- **paginate() helper**: `paginate(items: list, total: int, params: PaginationParams) -> dict` returning `{"items": items, "total": total, "page": params.page, "per_page": params.per_page}`.
- **Request logging middleware**: subclass `BaseHTTPMiddleware`, record `time.perf_counter()` before and after `await self.app(scope, receive, send)`, log at INFO: `logger.info("%s %s %d %.3fs", method, path, status_code, elapsed)`.
- **DATABASE_URL override for tests**: always invoke pytest as `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest`.
- **Async fixture scope**: all async SQLAlchemy fixtures must use `scope="function"` — session-scoped async engines cause event loop mismatch errors with asyncpg.

## Files to Review for Similar Tasks
- `backend/app/utils/errors.py` — canonical custom exception class definitions and `to_response()` pattern.
- `backend/app/utils/pagination.py` — `PaginationParams` dependency and `paginate()` helper.
- `backend/app/main.py` — global exception handler registration order and middleware registration order.
- `backend/app/api/surveys.py` — reference implementation of PaginationParams + separate COUNT query pattern in a list endpoint.
- `backend/app/dependencies.py` — example of custom error class usage with additional response headers (WWW-Authenticate).
- `backend/tests/test_error_handling.py` — tests for error format, 500 response body asserting absence of stack trace, and raw HTTPException reformatting.
- `backend/tests/test_pagination.py` — tests for per_page cap, default values, and paginate() output shape.

## Gotchas and Pitfalls
- **422 vs 400 collision**: FastAPI raises `RequestValidationError` for invalid query/body params and returns 422 by default. The spec wants 400 VALIDATION_ERROR for these. Always register a custom `RequestValidationError` handler or the spec contract is silently violated.
- **Middleware order is reversed**: in Starlette/FastAPI, the last `add_middleware` call is the outermost wrapper. CORS must be outermost so it runs on error responses too — register it last, not first.
- **Raw HTTPException detail is a string**: legacy routers set `detail="Not found"` as a plain string. The global HTTPException handler must not assume `detail` is a dict with a `code` field — always construct the error code from `exc.status_code`.
- **WWW-Authenticate header must survive refactor**: RFC 6750 requires `WWW-Authenticate: Bearer` on 401 responses. When replacing `HTTPException(401, headers={"WWW-Authenticate": "Bearer"})` with a custom `UnauthorizedError`, the exception handler must re-emit this header in the `JSONResponse`.
- **COUNT query must remain separate**: replacing a separate `SELECT COUNT(*)` with `len(page_results)` returns the page size, not the total — pagination metadata breaks silently.
- **No stack traces in 500 responses**: the catch-all handler must log `traceback.format_exc()` server-side but return only a generic message. Add an explicit test asserting the response body does not contain the exception message string.
- **passlib + bcrypt incompatibility**: bcrypt >= 4.x breaks passlib's CryptContext at import time. Do not touch auth.py's password hashing logic during the router refactor — use bcrypt directly if hashing is needed.
- **Import smoke-test before pytest**: run `python -c 'from app.utils.errors import NotFoundError; from app.utils.pagination import PaginationParams'` before any test run to surface broken imports as a clear error rather than a confusing pytest collection failure.
```
