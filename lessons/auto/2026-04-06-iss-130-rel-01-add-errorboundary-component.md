---
date: "2026-04-06"
ticket_id: "ISS-130"
ticket_title: "REL-01: Add ErrorBoundary component"
categories: ["testing", "api", "ui", "bug-fix", "feature"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-06"
ticket_id: "ISS-130"
ticket_title: "REL-01: Add ErrorBoundary component"
categories: ["reliability", "react", "frontend", "error-handling", "accessibility"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/common/ErrorBoundary.tsx"
  - "frontend/src/components/common/__tests__/ErrorBoundary.test.tsx"
  - "frontend/src/App.tsx"
---

# Lessons Learned: REL-01: Add ErrorBoundary component

## What Worked Well
- The class component pattern was straightforward: `getDerivedStateFromError` sets state, `componentDidCatch` logs, and `handleRetry` resets — no ambiguity in responsibility
- Using a module-level `shouldThrow` flag in tests made retry testing clean: flip the flag before clicking retry so the remounted child succeeds without needing a complex stateful helper
- Adding a `fallback` prop for custom fallback content kept the component composable without over-engineering — one optional prop covers the customisation use case entirely
- `data-testid` attributes on every meaningful element made assertions precise and decoupled from styling or text changes
- Wrapping at the outermost level of `App()` (outside `BrowserRouter`) ensures router, auth context, and all page components are protected by a single boundary

## What Was Challenging
- React intentionally re-throws errors in development mode even after a boundary catches them, causing `console.error` noise during tests — requires `vi.spyOn(console, 'error').mockImplementation(() => undefined)` in `beforeEach` to keep test output clean
- Placement of the boundary in `App.tsx` required a judgment call: wrapping outside `BrowserRouter` means router errors are caught, but it also means the fallback UI has no router context (no `<Link>` or navigation in the fallback is safe)

## Key Technical Insights
1. React error boundaries must be class components as of React 18 — there is no hooks-based equivalent; `getDerivedStateFromError` and `componentDidCatch` are class lifecycle methods with no functional analog
2. `getDerivedStateFromError` is the correct place to update state for rendering the fallback; `componentDidCatch` is for side effects (logging) only — mixing the two responsibilities causes subtle issues
3. Retry works by resetting `hasError` and `error` state, which causes React to remount the children subtree — the children are not merely re-rendered but fully unmounted and remounted, so any child state is lost
4. `role="alert"` combined with `aria-live="assertive"` ensures screen readers announce the error fallback immediately when it appears, satisfying accessibility requirements without additional effort
5. The `shouldThrow` module-level variable pattern in tests is simpler than a stateful wrapper component for testing retry behaviour, but it requires careful reset in `beforeEach` to avoid test pollution

## Reusable Patterns
- `shouldThrow` module flag pattern for testing retry: set `true` in `beforeEach`, flip to `false` before clicking retry, assert children render — avoids complex stateful test helpers
- `vi.spyOn(console, 'error').mockImplementation(() => undefined)` in `beforeEach` + `vi.restoreAllMocks()` in `afterEach` — standard suppression for expected React error boundary output in Vitest
- Optional `fallback?: ReactNode` prop pattern: check `this.props.fallback` first in render, fall through to default UI — simple and avoids render-prop complexity for most use cases
- `data-testid` on every distinct UI region (`error-boundary-fallback`, `error-boundary-heading`, `error-boundary-message`, `error-boundary-retry`) enables precise, stable assertions

## Files to Review for Similar Tasks
- `frontend/src/components/common/ErrorBoundary.tsx` — canonical class component boundary pattern for this codebase
- `frontend/src/components/common/__tests__/ErrorBoundary.test.tsx` — reference for testing error boundaries including retry, custom fallback, and accessibility attribute assertions
- `frontend/src/App.tsx` — shows correct placement: outermost wrapper inside the function component return, outside `BrowserRouter`

## Gotchas and Pitfalls
- Do not place `ErrorBoundary` inside `BrowserRouter` if the fallback UI needs navigation links — the fallback renders outside router context and `<Link>` will throw
- React re-throws caught errors in development; always suppress `console.error` in tests or every boundary test produces noisy stack traces that obscure real failures
- `shouldThrow` module-level state must be reset in `beforeEach` — forgetting this causes retry tests to pass on first run but fail when test order changes
- A boundary does not catch errors in event handlers or async code (e.g., `setTimeout`, promises) — only errors thrown during React's render and lifecycle phases are caught
- Do not use `componentDidCatch` to update state; it runs after the render cycle and using `setState` there causes a second render; always use `getDerivedStateFromError` for state updates
```
