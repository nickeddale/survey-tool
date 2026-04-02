---
date: "2026-04-02"
ticket_id: "ISS-055"
ticket_title: "Bug: act() warnings still present in AuthProvider and SurveyFormPage tests"
categories: ["testing", "database", "ui", "bug-fix", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-055"
ticket_title: "Bug: act() warnings still present in AuthProvider and SurveyFormPage tests"
categories: ["testing", "react", "async", "debugging"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/pages/__tests__/SurveyFormPage.test.tsx"
  - "frontend/src/pages/__tests__/LoginPage.test.tsx"
  - "frontend/src/pages/__tests__/RegisterPage.test.tsx"
  - "frontend/src/pages/__tests__/DashboardPage.test.tsx"
  - "frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx"
---

# Lessons Learned: Bug: act() warnings still present in AuthProvider and SurveyFormPage tests

## What Worked Well
- The standard fix pattern (removing the refresh token from localStorage in `beforeEach` to prevent `AuthProvider.initialize()`) was effective and reusable across all affected test files.
- Using `useAuthStore.setState(...)` to directly seed auth state bypassed the async initialization path entirely, eliminating the root cause rather than papering over it.
- Adding `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` to `MemoryRouter` suppressed React Router-related state update warnings consistently.
- Wrapping all `userEvent` interactions in `act(async () => { ... })` resolved the remaining warnings cleanly.

## What Was Challenging
- The warnings were deceptive: all 577 tests passed despite them, making the root cause non-obvious. The issue was async state updates happening outside of act() scope, not test failures.
- The `AuthProvider` warning source was indirect — it was triggered by the presence of a refresh token in `localStorage` at render time, not by any explicit test action.
- One test needed the refresh token available *after* render (for the 401 interceptor retry flow), requiring a special-case ordering: call `setTokens` after `renderLoginPage()` to avoid `AuthProvider` seeing it during synchronous `useState` initialization.

## Key Technical Insights
1. When `AuthProvider` mounts and `getRefreshToken()` finds a token in `localStorage`, it triggers an async `initialize()` call that sets state outside act(). The fix is to remove the token from localStorage before rendering, then seed auth state directly via the store.
2. `userEvent` already wraps interactions in act() internally — double-wrapping with an explicit `act()` around `userEvent` calls does NOT cause warnings itself, but can surface underlying async state issues. Always wrap `userEvent` calls in `act()` explicitly for safety and consistency.
3. Reading `result.current` from `renderHook` *after* a `waitFor` block (rather than inside it) can cause act() warnings because the state update completes inside `waitFor`'s internal act() scope, but follow-on reads/assertions happen outside it. Move assertions inside `waitFor` callbacks.
4. `findBy*` queries are preferred over `getBy*` after any async state change — they internally use `waitFor` and are act()-safe.

## Reusable Patterns
- **Standard `beforeEach` for authenticated page tests:**
  ```js
  setTokens(mockTokens.access_token, mockTokens.refresh_token)
  localStorage.removeItem('devtracker_refresh_token')
  useAuthStore.setState({ user: mockUser, isAuthenticated: true, isLoading: false })
  ```
- **MemoryRouter with React Router v7 flags:**
  ```jsx
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
  ```
- **Wrapping all userEvent calls:**
  ```js
  await act(async () => {
    await user.click(screen.getByRole('button', { name: /submit/i }))
  })
  ```
- **Special case for 401 retry logic tests** — call `setTokens` after render so AuthProvider doesn't see the token during mount but it's available when the API call fires.

## Files to Review for Similar Tasks
- `frontend/src/pages/__tests__/SurveysPage.test.tsx` — canonical reference for the standard fix pattern
- `frontend/src/pages/__tests__/LoginPage.test.tsx` — example of the special-case post-render `setTokens` pattern
- `frontend/src/contexts/AuthContext.tsx` — the `initialize()` async flow that is the root cause of AuthProvider warnings
- `frontend/src/pages/__tests__/DashboardPage.test.tsx` — example of applying the pattern to a data-fetching page

## Gotchas and Pitfalls
- Do not call `setTokens` before `renderXxx()` in tests that rely on the 401 interceptor retry flow — it will cause AuthProvider to initialize asynchronously and re-introduce act() warnings.
- Removing `devtracker_refresh_token` from localStorage must happen in `beforeEach`, not `afterEach` — if a previous test sets it and the cleanup is deferred, the next test's render will still trigger `initialize()`.
- The `future` flags on `MemoryRouter` are required for React Router v6/v7 compatibility; omitting them causes a separate class of act() warnings from router state transitions on navigation.
- These warnings do not cause test failures, which makes them easy to ignore and accumulate. Treat them as real bugs — they indicate non-deterministic async behavior that can cause intermittent flakiness under different timing conditions.
```
