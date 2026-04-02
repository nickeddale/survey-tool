---
date: "2026-04-02"
ticket_id: "ISS-036"
ticket_title: "2.10: Frontend Test Infrastructure and Initial Tests"
categories: ["testing", "frontend", "vitest", "msw", "react-testing-library"]
outcome: "success"
complexity: "high"
files_modified: []
---

# Lessons Learned: 2.10: Frontend Test Infrastructure and Initial Tests

## What Worked Well
- MSW (Mock Service Worker) v2 with `msw/node` via `setupServer` provided reliable, realistic API interception without needing to mock axios or individual service modules directly.
- Centralizing all mock data (`mockSurveys`, `mockUser`, `mockTokens`, `mockNewTokens`) and all handlers in a single `src/mocks/handlers.ts` file made it easy to share fixtures between test files without duplication.
- Using `server.use(...)` for per-test handler overrides on top of the global handlers gave fine-grained control over error states, slow responses, and edge cases without affecting other tests.
- The `onUnhandledRequest: 'error'` option in MSW's `server.listen()` caught missing handler coverage immediately, preventing false-positive passing tests that silently skip network calls.
- `vitest run` / `test:run` script in `package.json` provided a zero-configuration CI-friendly single-command execution with correct exit codes.
- Separating `test:run` (non-watch, CI), `test` (watch, dev), `test:ui`, and `test:coverage` scripts in `package.json` cleanly served all use cases.

## What Was Challenging
- React 18's concurrent scheduler interacts subtly with `act()`: errors thrown inside async `act()` blocks must be caught inside the callback rather than propagating out, or the scheduler leaves unflushed work that contaminates subsequent `renderHook` calls (result.current becomes null).
- The Zustand auth store starting with `isLoading: false` caused ProtectedRoute to redirect before `useEffect` fired — the `pendingInit` pattern (synchronous `useState(() => !!getRefreshToken())`) was required to prevent a flash of unauthenticated view in tests and in production.
- `vi.useFakeTimers()` combined with MSW is fundamentally incompatible: fake timers block Promise resolution that MSW depends on. Debounce testing required a real-timer strategy (track fetched URLs, assert coalescing after natural `userEvent` typing speed).
- Fake timers that leaked between tests (missing `vi.useRealTimers()` in `afterEach`) caused all subsequent tests to time out silently — a frustrating failure mode with no clear error message.
- The `register()` error path in AuthContext tests exposed a nuance: `await expect(act(...)).rejects` works for register (which throws synchronously out of act) but not for login (which triggers navigation side effects); each async throw had to be assessed individually.
- `scope="session"` on async SQLAlchemy engine fixtures caused event loop mismatch with asyncpg — all async fixtures must use `scope="function"`.

## Key Technical Insights
1. **React 18 + act() error catching pattern**: Always catch errors inside `act()` when the throw may trigger navigation or other React scheduler work. Use `let caughtError; await act(async () => { try { ... } catch (e) { caughtError = e } })` rather than `await expect(act(...)).rejects`.
2. **Zustand store reset between tests**: Always call `useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false })` in `beforeEach`. Without this, auth state leaks between tests and causes ordering-dependent failures.
3. **`pendingInit` synchronous gate**: AuthProvider must synchronously compute `pendingInit = !!getRefreshToken()` in `useState` initializer so the very first render shows `isLoading=true` when a token exists — not after the first `useEffect` runs.
4. **`initStarted` ref prevents double-init in StrictMode**: React 18 StrictMode double-invokes effects; a `useRef(false)` guard on the init effect prevents double token refresh calls.
5. **Debounce test without fake timers**: Use `userEvent` at real speed and track all fetched URLs in a closure. Assert that the number of search-param fetches is `<= 2` (initial + 1 debounced), and that the last fetch carries the full typed string. This is more robust than timer manipulation.
6. **MSW handler precedence**: `server.use()` prepends handlers — later calls take precedence over earlier ones. The global handlers serve as fallbacks; per-test overrides shadow them for that test only, then `server.resetHandlers()` in `afterEach` restores the baseline.
7. **`aria-label` selectors for icon-only buttons**: Action buttons (View, Edit, Delete) should carry `aria-label="Action Survey Title"` attributes. This both satisfies accessibility requirements and provides stable, readable test selectors that survive UI changes.
8. **Pagination test stability**: When testing next-page navigation, a debounce timer can still be inflight when the button is clicked. Adding `await act(async () => { await new Promise(r => setTimeout(r, 400)) })` before clicking the next-page button prevents the debounced fetch from racing with the pagination fetch.

## Reusable Patterns
- **`renderWithProviders` helper**: Wrap any component under test in `<MemoryRouter initialEntries={[url]}><AuthProvider>...</AuthProvider></MemoryRouter>` with explicit `<Routes>` including a `<LocationDisplay />` catch-all for navigation assertions.
- **`LocationDisplay` component**: `function LocationDisplay() { return <div data-testid="location">{useLocation().pathname}</div> }` — mount alongside the component under test to assert navigation side effects without mocking `useNavigate`.
- **`clearTokens()` + `localStorage.clear()` + `resetAuthStore()` in `beforeEach`**: The canonical three-step reset for any test touching auth state.
- **Infinite-pending MSW handler for loading state tests**: `http.get('/api/v1/surveys', () => new Promise<never>(() => {}))` keeps the component in loading state indefinitely so spinner/skeleton assertions can be made synchronously.
- **`mockTokens` JWT structure**: Pre-built JWT with `exp: 9999999999` (year 2286) avoids token expiry issues in tests. The `sub` matches `mockUser.id` so `/auth/me` lookups resolve correctly.
- **`vi.restoreAllMocks()` + `vi.useRealTimers()` in `afterEach`**: Always pair these; `restoreAllMocks` cleans up `vi.spyOn` stubs (e.g., `window.confirm`), and `useRealTimers` prevents timer leakage.

## Files to Review for Similar Tasks
- `frontend/src/test/setup.ts` — MSW server bootstrap, global before/after hooks
- `frontend/src/mocks/handlers.ts` — all mock data exports and request handlers; update when API contracts change
- `frontend/src/contexts/__tests__/AuthContext.test.tsx` — reference implementation for act() error catching and store reset patterns
- `frontend/src/pages/__tests__/SurveysPage.test.tsx` — reference implementation for debounce testing, pagination stability, and navigation assertions
- `frontend/src/components/__tests__/ProtectedRoute.test.tsx` — reference for route guard testing with MemoryRouter + LocationDisplay

## Gotchas and Pitfalls
- **Never scope async SQLAlchemy engine fixtures to `session`** — use `scope="function"` to avoid asyncpg event loop mismatch errors.
- **Never allow `act()` rejections to propagate when the action triggers navigation** — the JSDOM "Not implemented: navigation to..." error leaves React's scheduler in a dirty state.
- **`vi.useFakeTimers()` + MSW = broken tests** — fake timers prevent MSW from resolving fetch Promises. Use real timers and URL tracking to verify debounce behavior.
- **Missing `vi.useRealTimers()` in `afterEach` is a silent test-suite killer** — tests after the leaking test will hang indefinitely with no clear failure message pointing to the leak.
- **`onUnhandledRequest: 'error'` will fail tests for any network call without a handler** — this is desirable but means every new API call added to source code needs a corresponding handler added to `handlers.ts` before the test suite will pass again.
- **Zustand store state is global and persists between tests** — never rely on module-level default state; always reset explicitly in `beforeEach`.
- **`passlib[bcrypt]` 1.7.x is incompatible with `bcrypt` >= 4.x** — use `bcrypt` directly (`hashpw`/`checkpw`/`gensalt`) rather than `passlib.CryptContext` in backend code.