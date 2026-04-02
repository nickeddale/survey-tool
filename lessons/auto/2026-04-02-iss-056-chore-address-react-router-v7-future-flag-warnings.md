---
date: "2026-04-02"
ticket_id: "ISS-056"
ticket_title: "Chore: Address React Router v7 future flag warnings"
categories: ["testing", "api", "ui", "bug-fix", "feature", "performance", "config"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-056"
ticket_title: "Chore: Address React Router v7 future flag warnings"
categories: ["react-router", "testing", "deprecation", "chore"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/App.tsx"
  - "frontend/src/components/__tests__/AppLayout.test.tsx"
  - "frontend/src/components/__tests__/ProtectedRoute.test.tsx"
  - "frontend/src/components/__tests__/PublicRoute.test.tsx"
---

# Lessons Learned: Chore: Address React Router v7 future flag warnings

## What Worked Well
- ISS-055 (act() warning fixes) had already applied `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` to all `MemoryRouter` instances in test files, making this ticket's test-side work a non-issue
- The production fix was a single-line change to `BrowserRouter` in `App.tsx` — low risk and surgically targeted
- The two tickets (ISS-055 and ISS-056) were sequenced well: fixing act() warnings first naturally required adding the future flags to test routers, leaving only the production router for ISS-056

## What Was Challenging
- Coordinating across two tickets that touched overlapping concerns (future flags in tests vs. production); without the ISS-055 context, this ticket could have required touching many more files
- Verifying completeness required scanning all test files for `MemoryRouter` usage to confirm none were missed — easy with grep but easy to forget as a step

## Key Technical Insights
1. React Router v6 future flags (`v7_startTransition`, `v7_relativeSplatPath`) must be applied to every router instance independently — both `BrowserRouter` in production and every `MemoryRouter` in tests — because each router instance is isolated and does not inherit flags from a parent or global config.
2. `v7_startTransition` wraps state updates in `React.startTransition`, which affects when React flushes updates; this is why missing it in tests also manifests as `act()` warnings — the two warning classes are related.
3. `v7_relativeSplatPath` changes how relative paths are resolved inside splat (`*`) routes; adding it proactively prevents subtle routing behavior changes at v7 upgrade time.
4. The `future` prop shape is stable and identical between `BrowserRouter` and `MemoryRouter`, so the same object literal can be copy-pasted without adaptation.

## Reusable Patterns
- When adding future flags to a router, search for all router instances with: `grep -r "BrowserRouter\|MemoryRouter\|HashRouter" src/` before assuming the change is complete
- Pairing deprecation-warning tickets with related cleanup tickets (e.g., act() fixes) reduces total diff size by sharing flag additions across both
- For React Router upgrades, check the official migration guide's future flags table — each flag is independently opt-in and can be adopted incrementally to spread upgrade risk

## Files to Review for Similar Tasks
- `frontend/src/App.tsx` — production router; the single source of truth for `BrowserRouter` config
- `frontend/src/components/__tests__/AppLayout.test.tsx` — representative pattern for component tests that wrap in `MemoryRouter`
- `frontend/src/components/__tests__/ProtectedRoute.test.tsx` — pattern for route-guard component tests
- `frontend/src/components/__tests__/PublicRoute.test.tsx` — pattern for public route guard tests
- Any `src/pages/__tests__/*.test.tsx` — page-level tests that render full route trees (updated in ISS-055)

## Gotchas and Pitfalls
- Forgetting to add flags to `MemoryRouter` in tests while only updating `BrowserRouter` in production will leave deprecation warnings in CI test output — the warnings are per-instance, not global
- `v7_startTransition` interacts with React's concurrent rendering; tests that rely on synchronous state flushing may behave differently after enabling it — always run the full test suite after adding the flag
- If a future React Router release removes these flags (treating them as default in v7+), the `future` prop may produce TypeScript errors; remove the flags at that point rather than suppressing the type error
- Do not add the `future` prop to `<Routes>` — it belongs only on the router component (`BrowserRouter`, `MemoryRouter`, etc.)
```
