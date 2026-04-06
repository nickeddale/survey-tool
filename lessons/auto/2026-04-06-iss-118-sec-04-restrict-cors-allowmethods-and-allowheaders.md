---
date: "2026-04-06"
ticket_id: "ISS-118"
ticket_title: "SEC-04: Restrict CORS allow_methods and allow_headers"
categories: ["testing", "api", "ui", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-118"
ticket_title: "SEC-04: Restrict CORS allow_methods and allow_headers"
categories: ["security", "cors", "middleware", "configuration"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/main.py", "backend/tests/test_error_handling.py"]
---

# Lessons Learned: SEC-04: Restrict CORS allow_methods and allow_headers

## What Worked Well
- The change was surgical — a two-line edit in a single well-defined location (CORSMiddleware configuration)
- The explicit lists are self-documenting and clearly communicate the intended API surface
- Starlette's CORSMiddleware handles the header normalization automatically once explicit lists are provided
- The security improvement was straightforward with low regression risk because legitimate API consumers should already be using only the listed methods and headers

## What Was Challenging
- Determining the correct minimal set of headers to allow required cross-referencing actual API usage (e.g., `X-API-Key` for API key auth, `Authorization` for JWT bearer tokens) rather than just accepting defaults
- Tests for CORS preflight behavior are often absent in backend test suites since CORS is typically handled at the middleware layer before route handlers execute; adding meaningful coverage required understanding how Starlette's test client handles OPTIONS requests

## Key Technical Insights
1. Starlette's `CORSMiddleware` with `allow_headers=['*']` will echo back any requested header in `Access-Control-Allow-Headers`; replacing with an explicit list causes it to return only those headers regardless of what the client requests in `Access-Control-Request-Headers`
2. The `OPTIONS` method must be included in `allow_methods` explicitly when using a restricted list, otherwise preflight requests themselves will be rejected — this is a common oversight
3. For preflight assertions, check `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` response headers on an OPTIONS request with `Origin`, `Access-Control-Request-Method`, and `Access-Control-Request-Headers` in the request
4. `allow_credentials=True` combined with `allow_origins=['*']` is a CORS misconfiguration that browsers reject; explicit origin lists are the correct pairing with credentials — worth auditing together when touching CORS config

## Reusable Patterns
- CORS preflight test pattern: send `OPTIONS /any-route` with headers `Origin: http://example.com`, `Access-Control-Request-Method: POST`, `Access-Control-Request-Headers: Authorization,Content-Type` and assert 200 response with the expected `Access-Control-Allow-*` headers
- When restricting wildcards, derive the explicit list from actual usage in the codebase (grep for `X-API-Key`, `Authorization`, etc. in route handlers and middleware) rather than guessing
- Group CORS-related security fixes together: wildcard origins, wildcard methods, wildcard headers, and `allow_credentials` correctness are all related and should be audited as a unit

## Files to Review for Similar Tasks
- `backend/app/main.py` — CORSMiddleware configuration lives here; any future CORS changes go here
- `backend/tests/test_error_handling.py` — location where CORS/preflight tests were added; reference for test structure
- Starlette docs / source for `CORSMiddleware` — understand exactly which headers are set under which conditions before writing assertions

## Gotchas and Pitfalls
- Forgetting `OPTIONS` in `allow_methods` when switching from `['*']` to an explicit list will silently break all preflight requests, causing CORS failures in browsers for any cross-origin POST/PUT/DELETE even though the actual method is in the list
- The `Access-Control-Allow-Headers` value returned by Starlette may be lowercased or reordered; test assertions should be case-insensitive and order-independent (use set comparison or `lower()`)
- Starlette's test client (`TestClient`) does not enforce CORS the way a browser does; an OPTIONS request will return the headers but won't block a follow-up request — tests verify header values, not enforcement
- If `allow_origins` is still `['*']`, adding `allow_credentials=True` will cause Starlette to raise a `ValueError` at startup — check this interaction when modifying CORS config
```
