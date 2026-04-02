---
date: "2026-04-02"
ticket_id: "ISS-052"
ticket_title: "Bug: jsdom navigation warnings in apiClient tests"
categories: ["testing", "api", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-052"
ticket_title: "Bug: jsdom navigation warnings in apiClient tests"
categories: ["testing", "jsdom", "axios", "dependency-injection"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/services/apiClient.ts"
  - "frontend/src/services/__tests__/apiClient.test.ts"
---
```

# Lessons Learned: Bug: jsdom navigation warnings in apiClient tests

## What Worked Well
- The dependency-injection approach (exported `setRedirectFn` setter) was clean and minimal — no test-specific branching inside production code paths.
- Placing the redirect abstraction at the module level (a `let` variable) kept the change local to `apiClient.ts` with no impact on callers.
- Using `beforeEach` / `afterEach` to install and restore the mock redirect kept each test hermetically isolated.
- The `typeof window !== 'undefined'` guard in the default redirect function is correct defensive practice for SSR or non-browser environments.

## What Was Challenging
- The `afterEach` restoration had to duplicate the default redirect implementation rather than exporting a named constant for it — a minor awkwardness worth noting if the default ever changes.
- The test for redirect behavior (`'redirects to /login when refresh fails on 401'`) needed explicit `localStorage.setItem` to seed the bad refresh token in addition to `setTokens`, because `tokenService` writes to localStorage and the test needed the interceptor to actually attempt a refresh call rather than short-circuit on a missing token.

## Key Technical Insights
1. **jsdom does not implement navigation** — any assignment to `window.location.href` produces an "Error: Not implemented: navigation (except hash changes)" warning. This is not a failure but silently undermines test assertions because the navigation never happens.
2. **Dependency injection via a module-level setter** is the idiomatic way to make singleton-style side effects (redirect, analytics, logging) testable without introducing React context or prop-drilling into a non-component service module.
3. **Asserting `mockRedirect` was called rather than inspecting `window.location`** is strictly more correct — it verifies the actual code path executed, not a side effect that jsdom would have swallowed silently anyway.
4. **Both redirect call sites** (request interceptor proactive-refresh failure at line 121, and response interceptor 401 failure at line 188) share the same `redirectToLogin` reference, so a single abstraction covers both paths.

## Reusable Patterns
- **Service redirect abstraction**: `let redirectFn: () => void = defaultImpl; export function setRedirectFn(fn: () => void) { redirectFn = fn }` — apply this pattern to any browser-side service that calls `window.location`, `window.open`, or similar non-testable globals.
- **Mock install/restore in beforeEach/afterEach**: install `vi.fn()` in `beforeEach` via the setter; restore the real implementation in `afterEach`. Never rely on `vi.restoreAllMocks()` for manually injected functions — restore explicitly.
- **Shared `vi.fn()` at describe scope** with `.mockClear()` in `beforeEach` avoids re-creating the mock and keeps call history from leaking between tests.

## Files to Review for Similar Tasks
- `frontend/src/services/apiClient.ts` — the redirect abstraction lives at lines 29–38; both call sites are at lines 121 and 188.
- `frontend/src/services/__tests__/apiClient.test.ts` — full example of mock lifecycle management (lines 11–27).
- Any other service module that references `window.location`, `window.open`, or `document.cookie` directly is a candidate for the same treatment.

## Gotchas and Pitfalls
- **Do not use `vi.spyOn(window, 'location', 'get')`** to intercept href assignment — jsdom marks `location` as non-configurable in some versions, causing the spy to throw.
- **Do not use `Object.defineProperty(window, 'location', ...)`** as a workaround — it is brittle across jsdom versions and can break other tests that depend on real `location` behaviour.
- **Restoring the default in `afterEach` is mandatory** — failing to restore leaves the mock in place for any subsequently imported module instances that share the singleton, which can cause unrelated tests to use the wrong redirect function.
- The `_retried` flag on `originalRequest` prevents infinite retry loops but means the 401-after-refresh path (refresh also returns 401) must be tested with a handler that always returns 401, not a stateful counter — otherwise the second 401 (from the refresh endpoint) will not trigger the redirect because `_retried` is already set on the *original* request, not the refresh request.
