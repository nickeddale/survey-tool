---
date: "2026-04-06"
ticket_id: "ISS-111"
ticket_title: "Add rate limiting with slowapi"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-06"
ticket_id: "ISS-111"
ticket_title: "Add rate limiting with slowapi"
categories: ["rate-limiting", "middleware", "fastapi", "testing", "auth"]
outcome: "success"
complexity: "low"
files_modified:
  - backend/pyproject.toml
  - backend/app/limiter.py
  - backend/app/main.py
  - backend/app/api/auth.py
  - backend/app/api/responses.py
  - backend/tests/conftest.py
  - backend/tests/test_rate_limiting.py
---

# Lessons Learned: Add rate limiting with slowapi

## What Worked Well
- Extracting the limiter into a dedicated `app/limiter.py` module (a single `Limiter(key_func=get_remote_address)` instance) made it trivially importable by any router without circular imports.
- Setting `app.state.limiter = limiter` immediately after `app = FastAPI(...)` — before any `add_middleware` calls — ensured `SlowAPIMiddleware` could find it reliably at request time.
- Registering a dedicated `@app.exception_handler(RateLimitExceeded)` handler that returns the project's standard `{"detail": {"code": "RATE_LIMITED", "message": ...}}` format with HTTP 429 required no changes to existing error infrastructure; it sits alongside existing `AppError` handlers cleanly.
- The `Request` parameter pattern for slowapi-decorated endpoints (`request: Request` as first positional param, before `Depends()` params) was consistent across all three auth endpoints and the public response submission endpoint — no injection conflicts arose.
- Adding an `autouse=True` fixture `reset_rate_limiter` in `conftest.py` that calls `limiter.reset()` before and after each test completely eliminated test pollution from shared in-memory limiter state.

## What Was Challenging
- The pre-planned warning about test state pollution was accurate and required explicit handling: without `limiter.reset()` between tests, any test that exhausted a rate limit would cause subsequent "within-limit" tests against the same endpoint to receive 429.
- The response submission endpoint (`POST /{survey_id}/responses`) already had a `request: Request` import in `responses.py` (used by `_extract_ip` and `_extract_metadata`), but the `request` parameter had been placed after `payload` in the function signature. Adding the `@limiter.limit` decorator required confirming the parameter order was compatible — it was, because slowapi resolves `request` by type annotation regardless of position.
- The `PATCH /{survey_id}/responses/{response_id}` endpoint was not rate-limited per the implementation plan's "optionally" qualifier; only `POST` was decorated. This was a deliberate scoping decision, not an oversight.

## Key Technical Insights
1. **Limiter must be on `app.state` before middleware registration.** `app.state.limiter = limiter` must appear before `app.add_middleware(SlowAPIMiddleware)`. SlowAPIMiddleware reads `app.state.limiter` at request dispatch time, but establishing it before middleware registration avoids any race during startup.
2. **slowapi's `RateLimitExceeded` is distinct from the project's `RateLimitedError`.** Both must have handlers registered. `RateLimitExceeded` is raised by slowapi's middleware; `RateLimitedError` is the project's custom exception. They share a handler shape but are not the same exception class.
3. **`limiter.reset()` is the authoritative way to clear in-memory state between tests.** The in-memory storage backend (default) accumulates counts globally across all test functions in a session. An `autouse` fixture with `limiter.reset()` both before (`yield`) and after is the minimal, reliable pattern.
4. **slowapi uses `request.client.host` via `get_remote_address`.** In `AsyncClient` / `ASGITransport` tests, all requests originate from `testclient` (or `127.0.0.1`), so rate limit counts accumulate correctly across sequential calls within a single test — this is exactly the behavior needed to verify limit enforcement.
5. **`@limiter.limit` decorator must come directly below `@router.post/get/patch`.** The route decorator must be the outermost decorator; slowapi's decorator must be immediately beneath it. Inverting the order causes the limit to not be applied.
6. **`Request` parameter positioning:** FastAPI resolves `Request` by type annotation, not position. However, the conventional and safest placement is as the first positional parameter before any body schema parameter and before `Depends()` parameters, matching the pattern enforced across all three auth endpoints.

## Reusable Patterns
- **Isolated limiter module:** `app/limiter.py` containing only `limiter = Limiter(key_func=get_remote_address)` — import this in routers and `main.py` to avoid circular dependencies.
- **app.state attachment pattern:**
  ```python
  app = FastAPI(...)
  app.state.limiter = limiter
  # ... other middleware ...
  app.add_middleware(SlowAPIMiddleware)
  ```
- **Dual exception handler pattern for 429:**
  ```python
  @app.exception_handler(RateLimitedError)        # project's own
  async def rate_limited_error_handler(...): ...
  @app.exception_handler(RateLimitExceeded)        # slowapi's
  async def slowapi_rate_limit_handler(...): ...
  ```
- **Test isolation fixture:**
  ```python
  @pytest.fixture(autouse=True)
  def reset_rate_limiter():
      limiter.reset()
      yield
      limiter.reset()
  ```
- **Endpoint decoration order:**
  ```python
  @router.post("/path")
  @limiter.limit("10/minute")
  async def handler(request: Request, payload: Schema, session: AsyncSession = Depends(get_db)):
      ...
  ```

## Files to Review for Similar Tasks
- `backend/app/limiter.py` — canonical limiter instance; import from here, never re-instantiate.
- `backend/app/main.py` — shows correct middleware registration order (CORS → RequestLogging → SlowAPI) and the two 429 exception handlers.
- `backend/app/api/auth.py` — reference implementation of `@limiter.limit` on auth endpoints with correct `Request` parameter placement.
- `backend/app/api/responses.py` — reference for applying rate limiting to a public endpoint that already used `Request` for IP extraction.
- `backend/tests/conftest.py` — `reset_rate_limiter` autouse fixture pattern.
- `backend/tests/test_rate_limiting.py` — complete test suite pattern: within-limit, exceeds-limit, and error-format assertions for each endpoint.

## Gotchas and Pitfalls
- **Test pollution is real and silent.** Without `limiter.reset()`, a "within-limit succeeds" test that runs after a "exceeds limit" test will fail with 429 for no apparent reason. The autouse fixture is mandatory, not optional.
- **Do not put `app.state.limiter` inside a lifespan context manager.** If the app uses `@asynccontextmanager` lifespan, the limiter must be set on `app.state` synchronously at module level, not inside the async lifespan block, because `SlowAPIMiddleware` may initialize before the lifespan runs.
- **`RateLimitExceeded` is not a subclass of `HTTPException`.** It will not be caught by a generic `StarletteHTTPException` handler. A specific `@app.exception_handler(RateLimitExceeded)` registration is required.
- **slowapi's in-memory storage does not reset between test functions automatically.** Pytest's function-scoped fixtures for DB sessions do not affect the limiter's global storage — it must be reset explicitly.
- **`@limiter.limit` requires `Request` to be in the function signature.** If a decorated endpoint lacks a `Request` parameter, slowapi will raise a runtime error when the endpoint is called, not at decoration time — this can be missed in tests that don't hit the rate limit.
- **Applying rate limits to `PATCH` (update) endpoints for public survey responses is optional but worth considering.** The current implementation only limits `POST /{survey_id}/responses`; a determined actor could update a response repeatedly without hitting the rate limit.
```
