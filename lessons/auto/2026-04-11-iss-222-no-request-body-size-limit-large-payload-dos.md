---
date: "2026-04-11"
ticket_id: "ISS-222"
ticket_title: "No request body size limit — large payload DoS"
categories: ["security", "middleware", "dos-prevention", "pydantic", "asgi"]
outcome: "success"
complexity: "medium"
files_modified: []
---

# Lessons Learned: No request body size limit — large payload DoS

## What Worked Well
- Raw ASGI middleware (implementing `__call__` with `scope/receive/send`) was the correct pattern — it intercepts `http.request` messages incrementally, enforcing the limit without ever buffering the full body
- Two-layer enforcement worked cleanly: fast-path rejection via `Content-Length` header check (O(1), no I/O), then stream-based accumulation as defense-in-depth for cases where the header is absent or spoofed
- Co-locating `MAX_BODY_SIZE = 1_048_576` as a module-level constant in `main.py` (alongside the middleware class) kept the concern self-contained without polluting `config.py`
- Pydantic `Field(max_length=N)` additions to schema files were safe, low-risk, and required no Alembic migration since they are API-layer-only constraints
- The existing `_make_error_response` / `{"detail": {"code": ..., "message": ...}}` error shape was already established; the raw ASGI middleware hand-rolled the same shape via `json.dumps` to remain consistent without depending on FastAPI's response infrastructure
- Test coverage was thorough: exact-limit accepted, one-byte-over rejected, Content-Length fast-path, streaming body without Content-Length, non-survey endpoints, GET requests unaffected, JSON content-type on 413, Pydantic field validation returning 400

## What Was Challenging
- The middleware must handle the case where the app never touches `send` (raises before responding): a guard flag (`response_started`) was needed to emit the 413 after `await self.app(...)` returns if the limit was exceeded but no response was sent
- The `checked_send` wrapper must discard the app's `http.response.body` message after substituting the 413, otherwise the original body bytes are forwarded to the client after the 413 headers
- Middleware registration order in Starlette is inverted (last `add_middleware` call is outermost wrapper). `RequestBodySizeLimitMiddleware` is registered last to be innermost (closest to route handlers), while `SecurityHeadersMiddleware` is outermost to apply headers to all responses including 413s
- The `Content-Length` fast-path test required sending a fabricated header value larger than the actual body — httpx normally sets `Content-Length` automatically, so the test had to pass it explicitly

## Key Technical Insights
1. **`BaseHTTPMiddleware` is unsuitable for body size enforcement**: Starlette's `BaseHTTPMiddleware` buffers the entire request body before calling `dispatch`, meaning a 10 MB payload is fully read into memory before any check can run. This provides zero DoS protection. Raw ASGI middleware is mandatory.
2. **`Content-Length` is advisory, not authoritative**: Clients can omit it (chunked transfer encoding) or set it to a falsely small value. The streaming accumulation check is the true enforcement; the header check is only a fast-path optimization.
3. **The 413 response must be hand-rolled in raw ASGI context**: FastAPI's `JSONResponse` and exception handlers are not reachable from a raw ASGI middleware — the `send` callable must be invoked directly with properly structured `http.response.start` and `http.response.body` ASGI messages, with explicit `content-type: application/json` and `content-length` headers.
4. **Pydantic `max_length` does not create DB constraints**: Field-level `max_length` validation lives entirely at the API boundary. Existing database columns may still accept longer values if written to directly (e.g., via migration scripts, admin tools, or direct SQL). Noted in ticket scope.
5. **`from __future__ import annotations` in router files is a latent hazard**: Adding `request: Request` to any endpoint in a file with this import causes locally-defined Pydantic models to become unresolvable `ForwardRef`s. Schema files themselves are not affected since they are not routers, but any future change adding middleware dependencies to router files must check for this import first.

## Reusable Patterns
- **Raw ASGI body size middleware skeleton**: `__init__(self, app)` + `async def __call__(scope, receive, send)` — check `scope["type"] == "http"`, extract `headers` dict from `scope["headers"]`, fast-path on `Content-Length`, wrap `receive` to accumulate chunks, wrap `send` to intercept `http.response.start` and substitute 413 if limit was exceeded
- **Hand-rolled JSON error in ASGI**: `json.dumps({"detail": {"code": "...", "message": "..."}}).encode("utf-8")` + two `send()` calls (start + body) with explicit byte-encoded headers
- **413 test pattern**: `client.post(url, content=body_bytes, headers={..., "Content-Type": "application/json"})` — use `content=` not `json=` to send raw bytes without httpx serialization overhead
- **Exact-limit boundary test**: build a raw JSON body with `_make_raw_json_body(MAX_BODY_SIZE)` using `b'{"title": "' + b"A" * padding + b'"}'`, assert status != 413; then repeat with `MAX_BODY_SIZE + 1`, assert status == 413

## Files to Review for Similar Tasks
- `backend/app/main.py` — middleware stack, registration order, `_make_error_response` error shape, `MAX_BODY_SIZE` constant
- `backend/tests/test_request_body_size_limit.py` — complete test patterns for middleware boundary testing and Pydantic max_length validation
- `backend/tests/test_security_headers.py` — reference pattern for middleware-level tests using shared `client` fixture
- `backend/tests/test_rate_limiting.py` — reference for rate limiter reset in conftest and middleware interaction tests
- `backend/app/schemas/survey.py` — canonical example of `Field(max_length=N)` usage on `SurveyCreate`/`SurveyUpdate`

## Gotchas and Pitfalls
- **Do not use `BaseHTTPMiddleware` for body size enforcement** — it buffers the full body before your `dispatch` method runs, defeating the purpose entirely
- **Register size-limit middleware last** (`app.add_middleware(RequestBodySizeLimitMiddleware)` after all other `add_middleware` calls) so it wraps the route handlers directly; Starlette reverses registration order
- **Security headers middleware must be outermost** to apply headers to 413 and all other error responses; register it before `RequestBodySizeLimitMiddleware`
- **The `checked_send` wrapper must drop the app's `http.response.body`** after emitting the 413 — failing to do this sends garbage body bytes to the client after the 413 response headers
- **Guard against the no-response case**: if the app raises an exception before touching `send` (e.g., authentication error handled before body is read), `response_started` stays False and the 413 must be emitted after `await self.app(...)` returns
- **`content-length` header in the 413 response must be a byte string**, not an integer — `str(len(body)).encode()` not `len(body)`
- **Pydantic `max_length` on optional fields requires `Field(default=None, max_length=N)`** — omitting `default=None` makes the field implicitly required