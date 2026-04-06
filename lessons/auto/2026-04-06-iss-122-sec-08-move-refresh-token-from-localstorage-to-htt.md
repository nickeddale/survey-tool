---
date: "2026-04-06"
ticket_id: "ISS-122"
ticket_title: "SEC-08: Move refresh token from localStorage to httpOnly cookie"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-122"
ticket_title: "SEC-08: Move refresh token from localStorage to httpOnly cookie"
categories: ["security", "authentication", "cookies", "frontend", "backend"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/api/auth.py
  - backend/app/schemas/user.py
  - backend/app/config.py
  - backend/app/main.py
  - frontend/src/services/tokenService.ts
  - frontend/src/services/authService.ts
  - frontend/src/services/apiClient.ts
  - frontend/src/store/authStore.ts
  - frontend/src/contexts/AuthContext.tsx
  - frontend/src/types/auth.ts
  - frontend/src/services/__tests__/tokenService.test.ts
  - backend/tests/test_auth.py
---

# Lessons Learned: SEC-08: Move refresh token from localStorage to httpOnly cookie

## What Worked Well
- Using a single `REFRESH_TOKEN_COOKIE_NAME` constant in `config.py` and importing it everywhere eliminated name-mismatch bugs between set and read paths
- Defining `COOKIE_SECURE` and `COOKIE_SAMESITE` as typed pydantic-settings v2 fields made environment-specific overrides clean and explicit
- The optimistic refresh probe pattern in `authStore.initialize()` — attempt refresh, treat any failure as unauthenticated — removed the need for any JS-accessible token state on page load
- Atomic token rotation (revoke old + insert new in a single DB transaction before `set_cookie()`) prevented token reuse windows during refresh

## What Was Challenging
- CORS configuration required both `allow_credentials=True` and an explicit origin list — the wildcard `*` silently blocks credentialed requests with no browser error message, making it hard to diagnose
- `response.delete_cookie()` silently fails to clear the cookie if any attribute (`path`, `domain`, `secure`, `samesite`) differs from the original `set_cookie()` call — no error is thrown on either side
- `response.set_cookie(secure=True)` silently drops the cookie in local HTTP dev environments — this causes auth to appear completely broken during local development with no obvious cause
- Removing `refresh_token` from `TokenResponse` is a silent Pydantic schema change — tests that never explicitly asserted the field was present continued passing while the actual behavior changed

## Key Technical Insights
1. Cookie attribute symmetry is mandatory: `response.set_cookie()` and `response.delete_cookie()` must use identical `path`, `domain`, `secure`, and `samesite` values or the browser treats them as different cookies. The old cookie silently persists.
2. CORS credentialed requests require an explicit origin allowlist. `allow_origins=["*"]` is rejected by browsers for requests with `withCredentials: true` per the CORS spec — the failure is silent on the backend.
3. `COOKIE_SECURE` must be `False` in local dev (HTTP). Gate on `settings.cookie_secure` defaulting to `True`, with a `.env.dev` override to `False`. Never hardcode `secure=True`.
4. The `/auth/refresh` endpoint must return a clean 401 (not 500) when the cookie is absent. The optimistic probe on every page load means unauthenticated users will always hit this endpoint — unhandled exceptions produce error noise and confuse monitoring.
5. Pydantic field removal does not guarantee the field is excluded from serialization in all serialization paths. Explicit test assertions are required.
6. The frontend should never guard on localStorage for refresh token presence after this migration — the cookie is httpOnly and invisible to JS by design.

## Reusable Patterns
- **Cookie constant pattern**: Define `REFRESH_TOKEN_COOKIE_NAME: str = "refresh_token"`, `COOKIE_SECURE: bool = True`, `COOKIE_SAMESITE: str = "strict"` in `Settings` via pydantic-settings v2 `SettingsConfigDict`. Import from `app.config` everywhere.
- **Symmetric cookie attributes**: Extract a shared helper or inline identical kwargs dict for both `set_cookie()` and `delete_cookie()` calls to prevent attribute drift.
- **Optimistic refresh init**: In `authStore.initialize()`, call `authService.refreshToken()` and catch all errors to set unauthenticated state — no localStorage reads needed.
- **Atomic token rotation**: Within `/auth/refresh`, revoke old token record and insert new one in a single DB transaction before issuing `set_cookie()` on the response.
- **Explicit cookie attribute assertions**: Test that `Set-Cookie` header contains `HttpOnly`, `SameSite=Strict`, and (where applicable) `Secure` — presence of the cookie name alone is insufficient.
- **Explicit schema exclusion assertions**: Test that the JSON response body does NOT contain `refresh_token` after login — field removal from Pydantic schema must be verified with a negative assertion.

## Files to Review for Similar Tasks
- `backend/app/api/auth.py` — login/refresh/logout cookie set/clear patterns
- `backend/app/config.py` — `COOKIE_SECURE`, `COOKIE_SAMESITE`, `REFRESH_TOKEN_COOKIE_NAME` config fields
- `backend/app/main.py` — CORS `allow_credentials=True` + explicit origin list
- `frontend/src/store/authStore.ts` — optimistic refresh probe on initialize()
- `frontend/src/services/apiClient.ts` — `withCredentials: true` on axios instance
- `backend/tests/test_auth.py` — cookie attribute assertions and negative body assertions

## Gotchas and Pitfalls
- **Silent CORS failure**: `allow_origins=["*"]` with `allow_credentials=True` is rejected by browsers for credentialed requests. The backend returns 200 but the browser blocks the response. Always use an explicit origin list.
- **Silent cookie drop on HTTP**: `secure=True` causes the browser to silently discard the cookie over HTTP. Local dev will appear completely broken. Always gate on `settings.cookie_secure`.
- **Silent delete_cookie failure**: Attribute mismatch between `set_cookie()` and `delete_cookie()` leaves the old cookie in place with no error. Logout appears to succeed but the refresh token persists.
- **Pydantic silent field omission**: Removing a field from a schema does not fail existing tests that never asserted the field — only tests with explicit presence assertions will catch the change.
- **401 vs 500 on missing cookie**: An absent cookie in `/auth/refresh` must produce a clean 401. If the code does `token = request.cookies.get(COOKIE_NAME)` and then passes `None` into token validation without a guard, it will raise an unhandled exception and return 500 — this fires on every unauthenticated page load.
- **Cookie name case/underscore mismatch**: If the constant used in `set_cookie()` differs from the one used in `request.cookies.get()` (even by a single character), the cookie is silently missing on every read. Define the name once and import everywhere.
```
