---
date: "2026-04-11"
ticket_id: "ISS-221"
ticket_title: "Missing HTTP security headers on frontend and backend"
categories: ["testing", "api", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-221"
ticket_title: "Missing HTTP security headers on frontend and backend"
categories: ["security", "middleware", "nginx", "fastapi", "http-headers"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/nginx.conf", "backend/app/main.py", "backend/tests/test_security_headers.py"]
---

# Lessons Learned: Missing HTTP security headers on frontend and backend

## What Worked Well
- Following the existing `RequestLoggingMiddleware` pattern made implementing `SecurityHeadersMiddleware` straightforward — the BaseHTTPMiddleware pattern is clean and well-understood in this codebase
- Adding `always` to nginx `add_header` directives ensures headers are set even on error responses, which is the correct behavior for security headers
- Writing tests that assert both presence of security headers AND absence of the `server` header provided good coverage without over-engineering

## What Was Challenging
- Uvicorn injects the `Server: uvicorn` header at the transport layer, not the ASGI layer, so middleware alone may not reliably suppress it — the `--no-server-header` flag or `server_header=False` in programmatic config is the reliable suppression mechanism
- `Strict-Transport-Security` with `includeSubDomains` is inappropriate for HTTP/development environments and can cause HSTS preload issues in browsers; this header should only be active in production HTTPS deployments
- Content-Security-Policy `unsafe-inline` for `style-src` weakens the policy — it was accepted as a starting point but should be tightened with nonce-based or hashed inline styles in a future pass

## Key Technical Insights
1. In FastAPI/Starlette, middleware is applied in reverse registration order (last registered = outermost). Registering `SecurityHeadersMiddleware` last via `app.add_middleware()` makes it the outermost wrapper, ensuring security headers appear on ALL responses including CORS preflight rejections.
2. In `BaseHTTPMiddleware`, the correct pattern is `response = await call_next(request)` followed by mutating `response.headers` before returning — never attempt to set security headers on the `Request` object.
3. Uvicorn's `Server` header is injected below the ASGI layer. To suppress it, use `server_header=False` in `uvicorn.run()` or the `--no-server-header` CLI flag — relying solely on middleware to delete it is unreliable.
4. nginx `add_header` directives must include the `always` flag to apply to all response codes (including 4xx/5xx). Without it, headers are only sent on 2xx and 3xx responses.

## Reusable Patterns
- **SecurityHeadersMiddleware template**: subclass `BaseHTTPMiddleware`, call `await call_next(request)`, then set each security header on `response.headers`, delete `response.headers["server"]` (with a try/except KeyError), and return the response.
- **Nginx security header block**: place all `add_header` directives in the `server {}` block with the `always` flag so they apply globally to all locations.
- **Import smoke-test**: after modifying `main.py`, run `python -c "from app.main import app"` inside the Docker container before running the full test suite to catch import/syntax errors as clean tracebacks.
- **Test structure**: assert security headers on responses from multiple endpoint types (public, auth-required, error-returning) to confirm middleware applies universally, not just to happy-path routes.

## Files to Review for Similar Tasks
- `backend/app/main.py` — middleware registration order and `SecurityHeadersMiddleware` implementation
- `frontend/nginx.conf` — `add_header` directives placement and `always` flag usage
- `backend/tests/test_security_headers.py` — test pattern for asserting header presence/absence across endpoint types

## Gotchas and Pitfalls
- **`from __future__ import annotations` in `main.py`**: adding `request: Request` to any endpoint or middleware in a file with this import causes Pydantic `ForwardRef` resolution failures — locally-defined Pydantic models become unresolvable and body params are misidentified as query params. Remove this import entirely; Python 3.11+ handles `str | None` and `list[str]` natively.
- **Uvicorn `Server` header**: middleware deletion of this header is not guaranteed because uvicorn injects it after the ASGI app completes. Use `server_header=False` in config, not just header deletion in middleware.
- **HSTS in non-HTTPS environments**: `Strict-Transport-Security` should be conditional on environment. Applying it in development/HTTP will cause browser HSTS caching that persists and blocks HTTP access — gate this header on a production environment flag.
- **CSP `unsafe-inline`**: the ticket's suggested `style-src 'self' 'unsafe-inline'` is a deliberate starting-point compromise. Document it explicitly and track it for future tightening — do not treat it as final hardening.
- **Middleware ordering matters**: registering `SecurityHeadersMiddleware` before `CORSMiddleware` (i.e., inner rather than outer) means CORS preflight responses that are rejected before reaching the app will not receive security headers. Register it last so it wraps everything.
```
