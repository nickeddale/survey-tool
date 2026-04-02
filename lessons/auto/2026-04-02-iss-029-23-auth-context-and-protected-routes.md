---
date: "2026-04-02"
ticket_id: "ISS-029"
ticket_title: "2.3: Auth Context and Protected Routes"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-029"
ticket_title: "2.3: Auth Context and Protected Routes"
categories: ["react", "auth", "routing", "testing", "vitest", "msw", "react-router-v6"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/App.tsx
  - frontend/src/contexts/AuthContext.tsx
  - frontend/src/contexts/__tests__/AuthContext.test.tsx
  - frontend/src/components/ProtectedRoute.tsx
  - frontend/src/components/PublicRoute.tsx
  - frontend/src/components/LoadingSpinner.tsx
  - frontend/src/components/__tests__/ProtectedRoute.test.tsx
  - frontend/src/components/__tests__/PublicRoute.test.tsx
  - frontend/src/pages/DashboardPage.tsx
  - frontend/src/pages/RegisterPage.tsx
  - frontend/src/pages/SurveysPage.tsx
  - frontend/src/pages/LoginPage.tsx
---

# Lessons Learned: 2.3: Auth Context and Protected Routes

## What Worked Well
- The `pendingInit` pattern (synchronous `useState(() => !!getRefreshToken())`) fully eliminated the flash-of-unauthenticated-view problem. Because the initial value is derived synchronously from localStorage, `isLoading` is `true` on the very first render — before any `useEffect` fires — so `ProtectedRoute` never sees a false `isAuthenticated` that would trigger an incorrect redirect.
- Splitting loading state into two sources (`storeIsLoading || pendingInit`) was cleaner than mutating the Zustand store directly from AuthProvider. The store owns its own loading state; AuthProvider adds only the narrow window between "first render" and "initialize() called".
- Using an `initStarted` ref to guard `initialize()` prevented double-invocation under React 18 StrictMode (which deliberately mounts effects twice in development).
- AuthContext as a thin wrapper over Zustand worked well: the store holds all state and logic, the context is a pure pass-through, and components that prefer hooks over context can still call `useAuthStore` directly.
- The `<LocationDisplay />` helper component (`useLocation().pathname` → `data-testid="location"`) gave deterministic redirect assertions without relying on URL bar state or brittle screen queries. This pattern was uniformly applied across both `ProtectedRoute.test.tsx` and `PublicRoute.test.tsx`.
- Hanging the MSW refresh handler with `new Promise<never>(() => {})` was a clean way to hold `isLoading` in `true` indefinitely for spinner tests, with no timeouts or artificial delays needed.
- The pre-built MSW handlers in `src/mocks/handlers.ts` covered all endpoints needed for auth init (refresh + me), login, logout, and register with no additions required for these tests — the base URL prefix `/api/v1` was already correct.

## What Was Challenging
- The flash-of-unauthenticated-view is a non-obvious React timing hazard: `useEffect` runs after paint, so any synchronous render before it fires will observe the Zustand initial state (`isAuthenticated: false`). The fix is non-idiomatic (synchronous state initializer reading from localStorage) and requires deliberate explanation in comments.
- React 18 StrictMode double-invoke of effects required the `initStarted` ref guard. Without it, `initialize()` fires twice, causing duplicate token refreshes and potential race conditions in tests.
- Error propagation contract between the store and the form: `login` must `throw` on failure (not just `set({ isLoading: false })`). This contract is implicit and the form's `catch` block silently no-ops if the store swallows errors. In this project the store already re-threw, but this must be verified before wiring form handlers — not assumed.
- The `register` error test used `await expect(act(...)).rejects.toMatchObject(...)` (propagating the rejection out of `act`) rather than the internal-catch pattern. This worked because the register action does not trigger JSDOM navigation, so there is no "Not implemented: navigation" side-effect that would contaminate the scheduler. Applying the wrong pattern here (internal-catch when propagation is safe) adds unnecessary noise; applying the wrong pattern in the login error test (propagating when navigation fires) would contaminate subsequent tests. The distinction is subtle and easy to mix up.

## Key Technical Insights
1. **Synchronous init guard prevents auth flash**: `useState(() => !!getRefreshToken())` as `pendingInit` makes the loading state visible on the first render synchronously. This is the correct fix for ProtectedRoute/PublicRoute redirect races — not `useLayoutEffect`, not setting Zustand state before the store is created.
2. **`isLoading = storeIsLoading || pendingInit` combines two independent loading signals**: The store's `isLoading` covers the async operation; `pendingInit` covers the gap between mount and `useEffect`. Both must be true for any of the loading states to show a spinner.
3. **React 18 StrictMode effect double-invoke**: Guards against this with a ref (`initStarted.current`), not with a state variable or dependency array tricks. A ref assignment is synchronous and survives the re-mount.
4. **`act()` error propagation rule**: Catch errors INSIDE `act()` when the action may trigger JSDOM navigation (e.g., login failure → apiClient intercepts 401 → `window.location.href = '/login'`). Propagating the rejection outside `act()` leaves React's scheduler with unflushed work, making the next `renderHook` call return `null` for `result.current`. This rule applies only where navigation side-effects exist — for pure store mutations (register, logout), propagating outside `act()` is safe.
5. **Route guard test scaffold**: `MemoryRouter` with `initialEntries` + `AuthProvider` wrapping `Routes` + a `<LocationDisplay />` leaf component at the redirect target is the minimal complete setup for testing `ProtectedRoute` and `PublicRoute`. Adding MemoryRouter to `renderHook` tests for `AuthContext` itself is unnecessary and adds confusion — context hooks do not depend on routing.
6. **MSW handler path must exactly match fetch URL**: The `BASE = '/api/v1'` prefix in `handlers.ts` must match the prefix used by the API client. A mismatch causes requests to pass through MSW unmocked and fail with a network error rather than an assertion error — a silent failure mode that is hard to debug.
7. **Zustand store shape verification before writing AuthProvider**: `AuthContextValue` interface is a strict re-export of the store's public surface. Any mismatch (missing action, wrong return type) causes a TypeScript error when passing store values to the context. Verifying the store shape in step 1 (exploration) avoids refactoring `AuthProvider` after tests are written.

## Reusable Patterns

- **AuthProvider with pendingInit**:
  ```tsx
  const [pendingInit, setPendingInit] = useState(() => !!getRefreshToken())
  const initStarted = useRef(false)
  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true
    initialize().finally(() => setPendingInit(false))
  }, [initialize])
  const isLoading = storeIsLoading || pendingInit
  ```

- **LocationDisplay redirect assertion helper** (route guard tests):
  ```tsx
  function LocationDisplay() {
    return <div data-testid="location">{useLocation().pathname}</div>
  }
  // In test: expect(screen.getByTestId('location').textContent).toBe('/login')
  ```

- **Hanging MSW handler for spinner tests**:
  ```ts
  server.use(http.post('/api/v1/auth/refresh', () => new Promise<never>(() => {})))
  ```

- **Error catch inside `act()` for navigation-side-effect actions**:
  ```ts
  let caughtError: unknown
  await act(async () => {
    try { await result.current.login(badCreds) } catch (err) { caughtError = err }
  })
  expect(caughtError).toMatchObject({ status: 401 })
  ```

- **useAuth outside-provider guard test**:
  ```ts
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider')
  consoleSpy.mockRestore()
  ```
  The `console.error` spy is required to suppress React's own error boundary output for the expected throw.

- **Render a route guard test**:
  ```tsx
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AuthProvider>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<div>Content</div>} />
          </Route>
          <Route path="/login" element={<LocationDisplay />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
  ```

## Files to Review for Similar Tasks
- `frontend/src/contexts/AuthContext.tsx` — canonical AuthProvider with pendingInit + initStarted ref pattern
- `frontend/src/components/__tests__/ProtectedRoute.test.tsx` — LocationDisplay pattern, hanging MSW handler for spinner test, redirect assertion
- `frontend/src/components/__tests__/PublicRoute.test.tsx` — same patterns for inverse (authenticated → redirect) case
- `frontend/src/contexts/__tests__/AuthContext.test.tsx` — renderHook in AuthProvider only (no MemoryRouter), act() error propagation patterns, outside-provider guard test
- `frontend/src/store/authStore.ts` — store shape and re-throw contract that AuthProvider depends on
- `frontend/src/mocks/handlers.ts` — MSW handler paths and mock data exports shared across all auth tests

## Gotchas and Pitfalls
- **Flash of unauthenticated view**: Zustand starts with `isLoading: false`. Without `pendingInit`, the first render sees `isAuthenticated: false` and `ProtectedRoute` redirects to `/login` before `initialize()` even starts. Always use the synchronous `useState(() => !!getRefreshToken())` guard.
- **React 18 StrictMode double-init**: Without the `initStarted` ref, `initialize()` fires twice under StrictMode, causing duplicate refresh token requests. This may not surface in production (StrictMode is dev-only) but breaks tests and wastes requests.
- **`act()` contamination from JSDOM navigation**: If a login failure triggers `window.location` navigation (apiClient 401 handler), propagating the rejection outside `act()` leaves unflushed scheduler work that makes `result.current` null in the next test. Always catch inside `act()` for actions that may navigate.
- **Store re-throw contract**: AuthContext forwards store actions directly. If `login` swallows errors (only calls `set()`), the form's `catch` block never fires and error messages never display. Verify the store throws before wiring the form handler.
- **MSW URL prefix mismatch**: If the API client uses `/api/v1/...` but MSW handlers use `/auth/...`, requests pass through unmocked. The failure looks like a network error, not an assertion failure — this is easy to misdiagnose as a test setup problem. Always verify BASE prefix in handlers against the API client's baseURL.
- **MemoryRouter in `renderHook` for AuthContext tests**: AuthContext does not depend on routing. Adding MemoryRouter to `renderHook` wrapper is unnecessary and can mask provider-ordering bugs. Reserve MemoryRouter for route guard component tests only.
- **`console.error` suppression for outside-provider throw test**: React emits its own `console.error` when a render throws. Without suppressing it, the test output is noisy and CI may flag unexpected console output as a failure, depending on test configuration.
- **`register` error test can propagate outside `act()`** (unlike `login`): register does not trigger navigation, so the rejection propagating outside `act()` is safe. Using the internal-catch pattern for register is not wrong but adds noise. Know which actions navigate and which do not.
```
