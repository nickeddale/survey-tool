---
date: "2026-04-07"
ticket_id: "ISS-158"
ticket_title: "No error message shown on failed login — 401 interceptor swallows error"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-07"
ticket_id: "ISS-158"
ticket_title: "No error message shown on failed login — 401 interceptor swallows error"
categories: ["frontend", "auth", "axios-interceptors", "error-handling", "ux"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/services/apiClient.ts"
  - "frontend/src/services/__tests__/apiClient.test.ts"
---

# Lessons Learned: No error message shown on failed login — 401 interceptor swallows error

## What Worked Well
- The fix was surgical and minimal: adding an `isAuthPassthrough` guard at the top of the 401 branch left all existing refresh logic untouched.
- Extracting the passthrough paths into a named constant (`AUTH_PASSTHROUGH_PATHS`) made the intent self-documenting without over-engineering.
- The existing `setRedirectFn` escape hatch in `apiClient.ts` made testing the "redirect NOT called" assertion straightforward — no extra mocking infrastructure needed.
- MSW handler overrides per test (via `server.use(...)`) kept tests isolated without touching shared mock state.
- The three-case test suite (login 401 passthrough, register 401 passthrough, protected endpoint still refreshes) gave good confidence that the change was additive-only, not regressive.

## What Was Challenging
- The bug was invisible at the component level: `LoginPage` already had error handling code in place, so the issue was entirely that the error never reached it. Tracing the silent failure required reading the interceptor layer rather than the UI layer.
- The Axios `error.config.url` field holds the path relative to `baseURL` (e.g., `/auth/login`), not a full URL. Using `String.prototype.includes` rather than strict equality was necessary to handle any prefix variations, but care is needed not to make the match too broad.

## Key Technical Insights
1. **Axios response interceptors intercept all status codes, including intentional ones.** A global 401 handler designed for expired-session recovery will also fire on credential errors if not guarded. Any interceptor that performs side effects (redirect, token clear) must whitelist or blacklist specific endpoint patterns.
2. **Auth endpoints are semantically different from protected endpoints.** On `/auth/login`, a 401 is expected user feedback ("wrong password"); on `/api/v1/surveys`, a 401 means the session expired. The interceptor must distinguish between these two cases.
3. **The passthrough early-return still normalizes the error** into an `ApiError` instance (consistent shape: `status`, `code`, `message`). This means callers don't need special-case handling — they receive the same error class regardless of whether refresh was attempted.
4. **`error.config.url` vs `error.config.baseURL`**: In Axios, `config.url` is the path passed to the method call (e.g., `/auth/login`), not the fully-qualified URL. Matching against it with `includes` is safe for this use case but would need adjustment if the API ever has paths that contain `/auth/login` as a substring unintentionally.

## Reusable Patterns
- **Interceptor endpoint whitelist/blacklist pattern**: Define a `const PASSTHROUGH_PATHS = [...]` array and an `isPassthrough(url)` predicate at module scope. Check it as the first condition in any status-specific interceptor branch. This keeps the list easy to extend without touching the branching logic.
- **`setRedirectFn` escape hatch**: Exporting a setter for side-effectful functions (redirect, analytics, logging) makes unit testing interceptors feasible without `jsdom` navigation mocks. Apply this pattern to any module that calls `window.location` or similar.
- **Three-case interceptor test structure**: When modifying an interceptor, always cover (1) the new exempted case, (2) the original non-exempted case still works, and (3) a regression case showing the existing behavior is preserved.

## Files to Review for Similar Tasks
- `frontend/src/services/apiClient.ts` — single source of truth for all Axios interceptor logic; any new auth endpoint or status code behavior change starts here.
- `frontend/src/services/__tests__/apiClient.test.ts` — all interceptor behavior is tested here; add new cases in the appropriate `describe` block.
- `frontend/src/pages/LoginPage.tsx` — the component-side error display; confirm `ApiError` is caught and rendered before assuming the interceptor is the only problem.
- `frontend/src/types/api.ts` — `ApiError` class definition; understand the shape that callers receive from rejected interceptor promises.

## Gotchas and Pitfalls
- **Do not skip the refresh and also skip error normalization.** The early return in the passthrough branch must still construct and reject an `ApiError`; returning the raw `AxiosError` would break callers that expect a consistent error shape.
- **`_retried` flag is still relevant.** The passthrough check happens before the `_retried` guard is set. If a login endpoint ever returned a 401 twice for some reason, the passthrough would still propagate both — this is correct behaviour but worth noting.
- **Adding new auth endpoints requires updating `AUTH_PASSTHROUGH_PATHS`.** There is no automatic discovery; if `/auth/mfa-verify` or similar is added and should not trigger refresh, it must be manually added to the list.
- **`error.config` can be undefined** if the request never left the client (e.g., network error before send). The `isAuthPassthrough(originalRequest.url)` call is safe because `isAuthPassthrough` guards against a falsy `url`, but `originalRequest` itself should be checked if the interceptor is ever extended to handle non-response errors.
```
