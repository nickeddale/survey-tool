---
date: "2026-04-02"
ticket_id: "ISS-028"
ticket_title: "2.2: API Client and Auth Service Layer"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-028"
ticket_title: "2.2: API Client and Auth Service Layer"
categories: ["frontend", "authentication", "typescript", "axios", "testing"]
outcome: "success"
complexity: "high"
files_modified:
  - frontend/src/types/index.ts
  - frontend/src/types/auth.ts
  - frontend/src/types/survey.ts
  - frontend/src/types/api.ts
  - frontend/src/services/tokenService.ts
  - frontend/src/services/apiClient.ts
  - frontend/src/services/authService.ts
  - frontend/src/store/authStore.ts
  - frontend/src/utils/jwt.ts
  - frontend/src/mocks/handlers.ts
  - frontend/src/mocks/browser.ts
  - frontend/src/test/setup.ts
  - frontend/src/App.tsx
---

# Lessons Learned: 2.2: API Client and Auth Service Layer

## What Worked Well
- Storing the access token as a module-level variable in tokenService.ts (never persisted) cleanly satisfies the security requirement without complex browser APIs
- The isRefreshing flag + promise-queue pattern prevents duplicate refresh calls when multiple requests fail with 401 simultaneously — this is the correct pattern and should be reused verbatim
- Reading backend schemas (backend/app/schemas/user.py, backend/app/api/auth.py) before writing TypeScript types prevented field-name drift and confirmed that password_hash is absent from UserResponse at the schema level
- MSW handlers that exactly mirror the backend's {detail: {code, message}} error shape caught realistic integration issues that simplified mock shapes would have hidden
- Zustand's simple API made the authStore clean — delegating side effects to authService and only tracking UI state (user, isAuthenticated, isLoading) kept concerns separated

## What Was Challenging
- The backend 401 response shape is not uniform: middleware-level 401s return plain string detail, while custom error handlers return structured {code, message} objects — the Axios interceptor must check both shapes without throwing
- Token rotation on refresh means a failed refresh permanently invalidates the refresh token — the interceptor must not retry the refresh itself, only redirect to login, or the user will be silently logged out with no recovery path
- The authStore initialization guard (clearing tokens and setting isAuthenticated=false on refresh failure) is easy to omit and causes infinite retry loops if the refresh token is expired on mount
- VITE_API_URL default of /api/v1 must match the backend router prefix exactly — this required verifying against backend/app/main.py rather than assuming

## Key Technical Insights
1. Backend 401s have two shapes: `{detail: string}` (from middleware/FastAPI defaults) and `{detail: {code: string, message: string}}` (from custom error handlers). Always guard with `typeof error.response?.data?.detail === 'object'` before accessing `.code` or `.message`.
2. Token rotation means refresh is destructive — once the refresh endpoint is called, the old refresh token is revoked regardless of whether the response succeeds. Never retry the refresh; on any failure, clear all tokens and redirect to login immediately.
3. The isRefreshing + queue pattern: set `isRefreshing = true` before the first refresh call, push `{resolve, reject}` callbacks for all subsequent 401s, then drain the queue with the new token on success or reject all on failure. This is the only safe pattern for concurrent 401 handling.
4. JWT decoding for proactive refresh requires only base64url decoding of the payload segment — no signature verification. Pad the base64 string to a multiple of 4 before decoding to avoid atob errors on tokens with non-padded encoding.
5. The backend's structured error format is `{detail: {code: string, message: string}}` — not `{code, message}` at the top level and not `{detail: string}`. MSW handlers must return this exact shape or tests will not catch real integration bugs.
6. `password_hash` being absent from the Pydantic UserResponse schema does not guarantee it is absent from API responses if the ORM model is serialized directly elsewhere — add an explicit test assertion that getCurrentUser() response does not contain `password_hash`.

## Reusable Patterns
- **tokenService pattern**: module-level `let accessToken: string | null = null` for in-memory access token; `localStorage.setItem('refresh_token', ...)` for refresh token; `clearTokens()` zeros both. Never write access token to any persistent storage.
- **Axios 401 interceptor with queue**: `isRefreshing` boolean flag + `failedQueue: Array<{resolve, reject}>` — on 401, if already refreshing push to queue, else set flag and call refresh. On refresh success drain queue with new token; on failure reject all and redirect to login.
- **authStore init guard**: wrap `getCurrentUser()` in try/catch on mount; on any error call `clearTokens()` and set `isAuthenticated = false` — never re-enqueue a refresh attempt from within the init path.
- **Typed ApiError**: `class ApiError extends Error` with `code: string`, `statusCode: number`, constructed by checking `response.data?.detail?.code` — falls back to generic message if detail is a string.
- **MSW handler shape**: always return `{detail: {code: 'ERROR_CODE', message: 'Human message'}}` for error responses in handlers — do not simplify to `{message: '...'}` or tests will diverge from real backend behavior.

## Files to Review for Similar Tasks
- `frontend/src/services/apiClient.ts` — reference for the isRefreshing queue pattern and dual-shape 401 handling
- `frontend/src/services/tokenService.ts` — reference for secure in-memory access token storage
- `frontend/src/store/authStore.ts` — reference for the init guard against infinite refresh loops
- `frontend/src/mocks/handlers.ts` — reference for MSW handlers that match the exact backend error shape
- `backend/app/schemas/user.py` — source of truth for UserResponse field names (especially absence of password_hash)
- `backend/app/utils/errors.py` — source of truth for the structured error envelope shape
- `backend/app/main.py` — confirms the /api/v1 router prefix for VITE_API_URL default

## Gotchas and Pitfalls
- Do not assume `exc.detail` in backend 401 responses is always a dict — FastAPI and middleware can produce plain string detail values. The Axios interceptor must handle both without throwing a TypeError.
- Do not retry the refresh call on failure — token rotation means the attempt consumed the token. Only one refresh attempt per session; on failure, clear everything and send the user to login.
- Do not use `scope="session"` for async test fixtures involving database engines — use `scope="function"` to avoid event loop mismatch (applies to backend tests but worth noting for any async fixture work).
- The base64url padding fix for JWT decoding: `base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')` before calling `atob()` — omitting this causes silent decode failures on many real tokens.
- MSW must be started in the Vitest setup file (`src/test/setup.ts`) with `server.listen({ onUnhandledRequest: 'error' })` to catch handlers that are missing or have the wrong URL path — silent passthrough hides test coverage gaps.
- localStorage is accessible to JavaScript — document the XSS risk of storing the refresh token there and ensure Content-Security-Policy headers are configured at the server level. If the backend ever sets the refresh token as an httpOnly cookie, migrate to that approach.
```
