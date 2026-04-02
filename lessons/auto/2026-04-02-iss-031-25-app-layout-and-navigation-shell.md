---
date: "2026-04-02"
ticket_id: "ISS-031"
ticket_title: "2.5: App Layout and Navigation Shell"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-031"
ticket_title: "2.5: App Layout and Navigation Shell"
categories: ["frontend", "react", "layout", "navigation", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/AppLayout.tsx"
  - "frontend/src/App.tsx"
  - "frontend/src/pages/DashboardPage.tsx"
  - "frontend/src/pages/SurveysPage.tsx"
  - "frontend/src/components/__tests__/AppLayout.test.tsx"
---

# Lessons Learned: 2.5: App Layout and Navigation Shell

## What Worked Well
- Using React Router's nested route pattern with `Outlet` cleanly separated layout chrome from page content — no prop drilling required.
- Tailwind CSS made the responsive hamburger/sidebar pattern straightforward to implement without custom media query logic.
- lucide-react icons integrated without friction for nav and sidebar elements.
- The existing `AuthProvider` pendingInit pattern handled loading state correctly without modification — the layout shell composed with it cleanly.
- Simplifying `DashboardPage` and `SurveysPage` to remove inline headers reduced duplication and made the pages easier to reason about.

## What Was Challenging
- Ensuring AppLayout tests did not double-start MSW — required confirming that `src/test/setup.ts` already handles `server.listen()` lifecycle before adding any MSW hooks in the new test file.
- Keeping the `pendingInit` flash-of-unauthenticated-content fix intact while integrating a new layout wrapper — the risk of accidentally refactoring `AuthProvider` during layout work was real.
- Correctly scoping `MemoryRouter` usage in tests: route/sidebar active-link tests needed it, but pure context/hook tests did not — mixing both everywhere caused unnecessary complexity.

## Key Technical Insights
1. **Logout must revoke server-side**: `authService.logout()` must be called (not just local state reset) because token rotation means a server-valid refresh token left in circulation is a security gap even after local state is cleared.
2. **MSW error shapes must match the real backend envelope**: `{detail: {code: string, message: string}}` — simplified shapes like `{message: string}` cause tests to pass against mocks but silently fail against the real backend.
3. **act() error containment in React 18**: Errors that escape `act()` leave React 18's scheduler with unflushed work, contaminating subsequent `renderHook` calls (result.current becomes null). Always catch inside `act()`.
4. **MSW loading state tests**: Use `new Promise<never>(() => {})` as the MSW handler return value to hold `isLoading` true indefinitely — do not use `setTimeout` or arbitrary delays.
5. **Nested routes and AppLayout placement**: `AppLayout` must be the direct parent of protected page routes in the router config so `Outlet` renders page content inside the shell; placing it inside `ProtectedRoute` keeps auth gating and layout concerns cleanly layered.

## Reusable Patterns
- `<LocationDisplay />` helper component (`useLocation().pathname` rendered to DOM) for asserting active route highlighting in `MemoryRouter` tests.
- `MemoryRouter` with `initialEntries` for sidebar active-link and route guard tests; `AuthProvider` alone (no router) for pure context/hook tests.
- MSW handler returning `new Promise<never>(() => {})` to hold async init indefinitely for spinner/loading-state assertions.
- Catch pattern inside `act()`: `await act(async () => { try { await action() } catch (err) { caught = err } })` then assert on `caught`.
- Nested React Router layout: `<Route element={<ProtectedRoute />}><Route element={<AppLayout />}><Route path="/dashboard" element={<DashboardPage />} /></Route></Route>`.

## Files to Review for Similar Tasks
- `frontend/src/components/AppLayout.tsx` — reference implementation for authenticated layout shell with responsive sidebar.
- `frontend/src/App.tsx` — nested route structure showing how `ProtectedRoute` and `AppLayout` are composed.
- `frontend/src/components/__tests__/AppLayout.test.tsx` — test patterns for layout/nav components with MSW, AuthProvider, and MemoryRouter.
- `frontend/src/test/setup.ts` — MSW lifecycle setup; always check here before adding `server.listen()` in new test files.
- `frontend/src/context/AuthContext.tsx` — `pendingInit` pattern for flash prevention; do not refactor during layout work.

## Gotchas and Pitfalls
- **Do not double-start MSW**: Check `src/test/setup.ts` first — if it already calls `server.listen()`, do not add lifecycle hooks in the component test file.
- **Do not refactor `AuthProvider` or `authStore` init as a side effect of layout work** — the `pendingInit` flash fix is fragile and must remain intact.
- **Do not simplify MSW error shapes** — always match `{detail: {code: string, message: string}}` to catch real integration mismatches.
- **Logout is not just a local state reset** — always call `authService.logout()` to revoke the refresh token server-side before redirecting.
- **Active route highlighting requires reading `authStore`/`AuthProvider` field names before writing tests** — field-name drift (`user` vs `currentUser`, `isAuthenticated` vs `loggedIn`) causes silent test failures.
```
