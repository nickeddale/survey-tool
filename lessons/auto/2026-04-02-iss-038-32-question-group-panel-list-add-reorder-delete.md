---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["testing", "api", "ui", "refactoring", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["react", "testing", "survey-builder", "ui-components", "msw"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/ui/collapsible.tsx"
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/mocks/handlers.ts"
  - "frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx"
  - "frontend/package.json"
  - "frontend/package-lock.json"
---

# Lessons Learned: 3.2: Question Group Panel (List, Add, Reorder, Delete)

## What Worked Well
- shadcn/ui Collapsible pattern (wrapping @radix-ui/react-collapsible) integrated cleanly with the existing component library style
- Inline title editing with click-to-edit, Enter/blur to save was straightforward using controlled input state and onBlur handlers
- MSW handlers for all CRUD endpoints (POST create, PATCH update, DELETE delete, PATCH reorder) kept test isolation clean
- builderStore group actions composed well with surveyService API calls, keeping side effects predictable
- Ordering groups by sort_order at render time (rather than in the store) avoided complex re-sorting logic

## What Was Challenging
- Coordinating the debounced PATCH for inline title saves without fake timers required a pattern shift: tracking captured MSW requests via a `capturedRequests` array instead of asserting on timing
- Avoiding act() warnings required wrapping every `userEvent.setup()` interaction inside `await act(async () => { ... })` — forgetting even one causes contamination in subsequent tests
- The confirmation dialog for delete (with cascade warning) needed careful testing to ensure the dialog renders, the warning text appears, and cancelling does not call the API
- Ensuring empty group placeholder renders correctly required a conditional branch that was easy to miss in the component tree

## Key Technical Insights
1. **Do not use `vi.useFakeTimers()` with MSW** — fake timers block MSW's internal promise resolution, causing `waitFor` to time out indefinitely. Test debounce behavior by capturing requests, not by controlling time.
2. **userEvent.setup() requires act() wrapping** — every `await user.click()` / `await user.type()` must be wrapped in `await act(async () => { ... })` to flush React 18 scheduler work before the next assertion.
3. **AuthProvider in test wrappers triggers async initialize()** — if any test uses AuthProvider, prevent the async init cycle by removing the refresh token from localStorage after `setTokens()` and pre-populating auth store state via `useAuthStore.setState(...)`.
4. **shadcn Collapsible needs an explicit `open` + `onOpenChange` prop** to be controlled; uncontrolled usage makes expand/collapse state hard to assert in tests.
5. **Cascade delete warning must be explicit in dialog text** — acceptance criteria specifically requires mentioning question cascade; test for the exact warning string to prevent regression.

## Reusable Patterns
- **Debounce test pattern**: Create a `capturedRequests: Request[]` array in `beforeEach`; add an MSW handler that pushes `req` to the array before responding. After `userEvent` interactions, use `waitFor(() => expect(capturedRequests).toHaveLength(1))` to assert the coalesced save fired exactly once.
- **Inline edit component pattern**: `isEditing` boolean state toggled on click; controlled `<input>` with `onKeyDown` (Enter → save + blur) and `onBlur` (save); escape key restores original value.
- **Confirmation dialog test pattern**: click delete → assert dialog open → assert cascade warning text present → click confirm → assert DELETE handler called; separately test cancel → assert handler NOT called.
- **`vi.useRealTimers()` in afterEach**: unconditionally call this in every test file's `afterEach` to prevent fake timer leakage across tests.
- **MemoryRouter future flags**: always add `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` to suppress React Router v6→v7 migration warnings in tests.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/GroupPanel.tsx` — reference for inline edit + collapsible panel + confirmation dialog pattern
- `frontend/src/components/ui/collapsible.tsx` — shadcn wrapper for @radix-ui/react-collapsible
- `frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx` — reference for MSW request capture pattern and act()-safe userEvent usage
- `frontend/src/mocks/handlers.ts` — reference for adding CRUD handlers with typed response bodies
- `frontend/src/services/surveyService.ts` — reference for group API methods (createGroup, updateGroup, deleteGroup, reorderGroups)

## Gotchas and Pitfalls
- **Never use bare `await user.click()` outside act()** — leaves unflushed scheduler work that makes the next test's `renderHook` return `null` for `result.current`.
- **Never use `vi.stubGlobal('URL', {...})`** — replaces the URL constructor and breaks `new URL(...)` inside MSW handlers.
- **Fake timers + MSW = silent timeout** — `waitFor` will spin forever because MSW relies on microtask/promise resolution that fake timers suppress.
- **AuthProvider pendingInit race** — if a refresh token exists in localStorage when AuthProvider mounts in a test, `pendingInit` becomes `true` and triggers an async `initialize()` that fires state updates outside act(). Always clear the refresh token and pre-populate store state in `beforeEach`.
- **sort_order gaps after delete** — deleting a group leaves gaps in sort_order; the reorder endpoint should normalize values, but the frontend must not assume contiguous ordering when rendering.
- **Empty state placeholder** — must be rendered inside the Collapsible content area, not outside it, or it will be visible even when the group is collapsed.
```
