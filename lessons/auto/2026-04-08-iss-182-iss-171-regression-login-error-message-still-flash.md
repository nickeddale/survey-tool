---
date: "2026-04-08"
ticket_id: "ISS-182"
ticket_title: "ISS-171 regression: login error message still flashes and disappears after ~5s"
categories: ["testing", "api", "ui", "bug-fix", "feature", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-08"
ticket_id: "ISS-182"
ticket_title: "ISS-171 regression: login error message still flashes and disappears after ~5s"
categories: ["auth", "interceptors", "frontend", "axios", "regression"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/services/apiClient.ts"
  - "frontend/src/services/__tests__/apiClient.test.ts"
  - "frontend/src/pages/__tests__/LoginPage.test.tsx"
---

# Lessons Learned: ISS-171 regression: login error message still flashes and disappears after ~5s

## What Worked Well
- The root cause was identified precisely: `redirectToLogin()` (a `window.location.href` assignment) performs a full-page navigation that unmounts the React app, clearing all in-memory error state — even when the user is already on `/login`.
- Two complementary guards were implemented that together close all redirect vectors: a pathname check inside `redirectToLogin()` itself, and an expanded `isPublicRoute()` check that includes `/login` and `/register` alongside the existing `/s/` public survey pattern.
- Abstracting `redirectToLogin` into a module-level `let` variable with a `setRedirectFn` export made the function easily testable without any DOM mocking of `window.location.href`.
- The `NO_REDIRECT_ROUTE_PATTERNS` array design cleanly unifies both the auth pages and public survey routes under a single suppression mechanism.
- New unit tests were added for both the `apiClient` interceptors (verifying `mockRedirect` is not called when on `/login` or `/register`) and the `LoginPage` (verifying the error message persists and no navigation occurs after a failed login).

## What Was Challenging
- The bug involved an indirect interaction between two separate features: the 401 refresh flow in `apiClient.ts` and the `isInitializing`/`isLoading` state split from the previous ISS-171 fix. Neither alone was sufficient to understand the symptom.
- The `AUTH_PASSTHROUGH_PATHS` guard (for `/auth/login` and `/auth/register` endpoints) already existed to prevent the refresh/redirect flow from triggering on direct login failures — but it only checked the *request URL*, not the *current browser path*. The regression occurred because a *background* proactive refresh or queued 401 retry on a different endpoint could still call `redirectToLogin()` while the user sat on `/login`.
- Mocking `window.location.pathname` in Vitest/jsdom requires `Object.defineProperty` with `writable: true, configurable: true` — a non-obvious pattern that must be restored in `afterEach` to avoid test pollution.

## Key Technical Insights
1. `window.location.href = '/login'` is a full-page navigation even when the current URL is already `/login`. It unmounts the React tree entirely, which clears all component state including error messages held in `useState`.
2. There are two distinct concepts that both sound like "we're on the login page": (a) the *request endpoint* being `/auth/login` (handled by `AUTH_PASSTHROUGH_PATHS`) and (b) the *browser pathname* being `/login` (the missing guard added in this fix). Both must be checked independently.
3. A proactive token refresh in the request interceptor (triggered when the access token is expiring soon) can fire on any outgoing request — including background polling or auth-check requests made while the user is on the login page. This means `redirectToLogin()` can be reached from the request interceptor path (line 126), not only the 401 response interceptor path (line 280).
4. The `setRedirectFn` escape hatch pattern — exporting a function to override a module-level closure — is a clean, zero-dependency way to make side-effectful redirect logic testable without needing `vi.spyOn(window.location, 'href')` hacks.
5. When `window.location` pathname tests need isolation, always restore the original value in `afterEach`; otherwise subsequent tests see a stale pathname and produce false negatives or false positives.

## Reusable Patterns
- **Guard `redirectToLogin()` at the call site:** Add an early-return check (`if (window.location.pathname.startsWith('/login')) return`) inside the redirect function itself, so any future call site benefits automatically without needing per-caller guards.
- **Route-based suppression list (`NO_REDIRECT_ROUTE_PATTERNS`):** Maintaining a single array of route prefixes where redirect-on-auth-failure should be suppressed is more maintainable than duplicating `if (!isPublicRoute())` guards at every call site.
- **`setRedirectFn` / injectable side-effect pattern:** For any module-level side effect (navigation, analytics, logging) that needs to be tested, export a setter that swaps the implementation. This avoids complex DOM mocking.
- **Test helper: `Object.defineProperty(window, 'location', { value: { ...window.location, pathname: '/login' }, writable: true, configurable: true })`** — the reliable way to stub `window.location.pathname` in jsdom without triggering navigation.

## Files to Review for Similar Tasks
- `frontend/src/services/apiClient.ts` — the `redirectToLogin` closure, `isPublicRoute()`, and both interceptors (request ~line 126, response ~line 280) are the primary gatekeepers for all auth redirect behavior.
- `frontend/src/services/__tests__/apiClient.test.ts` — the `login/register pages — no redirect on 401` describe block shows the full pattern for testing path-conditional redirect suppression.
- `frontend/src/pages/__tests__/LoginPage.test.tsx` — the `error message persistence` describe block demonstrates how to assert that a React error message survives an async form submission and no router navigation occurs.

## Gotchas and Pitfalls
- **`AUTH_PASSTHROUGH_PATHS` does not protect against background refreshes.** It only bypasses the refresh flow for direct 401s from the listed *endpoints*. A concurrent background request (e.g., `/auth/me` polling) can still trigger a refresh that then calls `redirectToLogin()` even while the user types on `/login`.
- **Do not rely on `isAuthPassthrough` alone as a login-page guard.** The function checks request URLs, not browser paths. A failure in `performRefresh` (called from either interceptor) always reaches `redirectToLogin()` regardless of `isAuthPassthrough`.
- **`window.location.pathname` stubbing leaks between tests** if not cleaned up in `afterEach`. This causes other tests in the same file (or suite) to behave as if the browser is on a non-default path, producing intermittent test failures.
- **Full-page navigation is silent.** In development and tests, `window.location.href = '/login'` does not throw — it simply resets state. The only symptom is the error message disappearing, which is easily attributed to a React re-render bug rather than a navigation event.
- **The `isInitializing`/`isLoading` split (ISS-171) is necessary but not sufficient.** It prevents `PublicRoute` from redirecting during the auth initialization phase, but it cannot prevent the `apiClient`-level `window.location.href` redirect that happens outside the React lifecycle entirely.
```
