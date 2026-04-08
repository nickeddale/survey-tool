---
date: "2026-04-08"
ticket_id: "ISS-171"
ticket_title: "ISS-158 regression: PublicRoute unmounts LoginPage during loading, losing error state"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-171"
ticket_title: "ISS-158 regression: PublicRoute unmounts LoginPage during loading, losing error state"
categories: ["auth", "react", "state-management", "routing", "regression"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/store/authStore.ts
  - frontend/src/contexts/AuthContext.tsx
  - frontend/src/components/PublicRoute.tsx
  - frontend/src/components/ProtectedRoute.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/components/__tests__/PublicRoute.test.tsx
  - frontend/src/pages/__tests__/LoginPage.test.tsx
---

# Lessons Learned: ISS-158 regression: PublicRoute unmounts LoginPage during loading, losing error state

## What Worked Well
- Splitting `isLoading` into two semantically distinct flags (`isInitializing` and `isLoading`) cleanly separated two concerns that were incorrectly conflated: cold-start token verification vs. in-flight user-triggered actions
- Initializing `isInitializing: true` at store definition time (not inside an action) acted as a reliable one-way latch — the app never briefly exposes protected content before `initialize()` runs
- Running `npm run build` immediately after renaming store flags caught all unupdated consumers at TypeScript compile time, faster than discovering them one-by-one through failing tests
- Module-level `vi.mock('@/store/authStore', ...)` in Vitest produced deterministic, state-isolated tests that did not depend on the real store's initialization lifecycle

## What Was Challenging
- The root cause was subtle: `isLoading` was semantically overloaded to mean both "app is initializing" and "an auth action is in flight," but these have very different implications for route guards
- Renaming a widely-consumed store flag requires identifying every consumer across the entire codebase — it is easy to miss files not listed in the implementation plan
- Fake timers left running between tests silently caused MSW-dependent tests to time out rather than fail with a clear error, making diagnosis non-obvious

## Key Technical Insights
1. Route guards (PublicRoute, ProtectedRoute) should only block rendering during the initial auth initialization — not during user-triggered actions like login or logout that originate from within the child page
2. A one-way latch pattern for initialization flags (`isInitializing` starts `true`, set `false` exactly once at the end of `initialize()`, never reset) prevents all race conditions between cold-start rendering and route guard evaluation
3. When a Zustand store flag is renamed, TypeScript compilation (`npm run build`) is a faster and more complete audit than running tests, because TypeScript catches every consumer simultaneously at compile time
4. Conflating "app is loading" with "user action is loading" in a single boolean is a recurring source of UI race conditions — always model these as separate flags when they have different visibility and lifecycle requirements

## Reusable Patterns
- **One-way initialization latch**: set `isInitializing: true` in the store definition (not an action); set it `false` exactly once at the end of `initialize()`; never set it back to `true`
- **Flag rename workflow**: run `grep -r 'isLoading\|authStore\|useAuth' frontend/src --include='*.ts' --include='*.tsx' -l`, reconcile against affected files list, then run `npm run build` before touching tests
- **Module-level Vitest mocks for Zustand**: `vi.mock('@/store/authStore', () => ({ useAuthStore: () => ({ isInitializing: false, isLoading: true, ... }) }))` — more deterministic than manipulating real store state between tests
- **Fake timer hygiene**: always call `vi.useRealTimers()` in `afterEach` if any test in the file uses fake timers, to prevent silent MSW timeout failures in downstream tests
- **Reset all mocked flags in beforeEach**: when mocking a store, reset every relevant flag explicitly — a partial mock that omits one flag can leave residual state that bleeds into subsequent tests

## Files to Review for Similar Tasks
- `frontend/src/store/authStore.ts` — source of truth for auth flags; review before any auth-related routing change
- `frontend/src/components/PublicRoute.tsx` — gates unauthenticated routes; must only block on `isInitializing`
- `frontend/src/components/ProtectedRoute.tsx` — gates authenticated routes; same constraint as PublicRoute
- `frontend/src/contexts/AuthContext.tsx` — bridges store to React context; verify which flags are exposed and under what names
- `frontend/src/components/__tests__/PublicRoute.test.tsx` — reference for module-level store mocking pattern
- `frontend/src/pages/__tests__/LoginPage.test.tsx` — reference for testing failed login error persistence

## Gotchas and Pitfalls
- **Do not use a single `isLoading` flag for both initialization and user actions** — route guards consuming it will unmount child pages during login/logout, destroying local component state (including error messages)
- **Partial store mocks that omit flags cause silent failures** — if `isInitializing` is omitted from a mock, it resolves as `undefined` (falsy), which may accidentally pass route guard checks and mask the test's intent
- **Fake timers + MSW = silent timeouts** — if `vi.useFakeTimers()` is called without a matching `vi.useRealTimers()` in cleanup, MSW fetch interception will silently hang in later tests rather than producing a clear assertion failure
- **TypeScript `ForwardRef` + `from __future__ import annotations` analog in React**: unresolved module-level mocks can produce similar "wrong type resolved at runtime" bugs — always verify mock shape matches the real store interface
- **`isInitializing` must never be re-set to `true`** after `initialize()` completes — doing so would re-trigger the route guard spinner during logout or token refresh, re-introducing the same race condition
```
