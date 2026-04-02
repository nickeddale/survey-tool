---
date: "2026-04-02"
ticket_id: "ISS-037"
ticket_title: "3.1: Survey Builder Page Layout and State Management"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-037"
ticket_title: "3.1: Survey Builder Page Layout and State Management"
categories: ["frontend", "react", "zustand", "testing", "survey-builder"]
outcome: "success"
complexity: "high"
files_modified:
  - "frontend/src/store/builderStore.ts"
  - "frontend/src/store/__tests__/builderStore.test.ts"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/mocks/handlers.ts"
  - "frontend/src/App.tsx"
  - "frontend/package.json"
---

# Lessons Learned: 3.1: Survey Builder Page Layout and State Management

## What Worked Well
- Zustand with immer middleware cleanly handles deeply nested survey state (groups → questions → options) without verbose spread chains
- Unit-testing builderStore in isolation by calling actions directly and asserting `useBuilderStore.getState()` kept store tests fast and free of rendering overhead
- Pre-populating auth state via `useAuthStore.setState({ user, isAuthenticated: true, isLoading: false })` + `localStorage.removeItem('devtracker_refresh_token')` reliably prevented AuthProvider double-init act() warnings
- Using `data-testid` attributes on all three panels (`question-palette`, `survey-canvas`, `property-editor`) made panel presence assertions simple and decoupled from styling changes
- MSW handler returning `new Promise<never>(() => {})` for the loading state test was a clean, side-effect-free way to keep the skeleton visible without fake timers

## What Was Challenging
- Implementing undo/redo with immer requires storing full state snapshots (or patches via immer's `produceWithPatches`) — naive deep copies of nested survey trees can be large; limit stack depth to avoid memory issues
- Ensuring immer was a direct dependency (not just transitive) required an explicit `package.json` addition; missing this causes type resolution failures and tree-shaking issues in Vite builds
- The three-panel layout must handle variable content heights gracefully — CSS grid with `min-height: 0` on panel children is required to prevent overflow from breaking the fixed-height canvas
- Non-draft read-only enforcement must be applied at every interaction point (add buttons, drag handles, input fields) — a single missed disable creates a confusing UX where some actions silently do nothing

## Key Technical Insights
1. **Zustand immer middleware import**: Use `import { immer } from 'zustand/middleware/immer'` (named export from the subpath), not a default import. Wrapping the store creator: `create<BuilderState>()(immer((set) => ({ ... })))`.
2. **Undo/redo with immer**: The simplest correct approach is to push a deep clone of the pre-action state onto `undoStack` before each mutating action. Call `structuredClone()` (available in modern Node/browser) rather than `JSON.parse(JSON.stringify(...))` for speed and correctness with undefined values.
3. **`reorderGroups` / `reorderQuestions` pattern**: Accept a `fromIndex`/`toIndex` pair and splice within immer's draft — avoids passing full reordered arrays and keeps action signatures minimal.
4. **`moveQuestion`**: Distinct from `reorderQuestions` — moves a question between groups. Requires removing from the source group's questions array and inserting into the target group's questions array in a single immer draft mutation to keep state consistent.
5. **MSW handler for full survey**: The existing `GET /api/v1/surveys/:id` handler may return a summary shape; add a separate fixture with nested `groups[].questions[].answer_options[]` for builder tests, or extend the existing handler to detect a query param (e.g., `?include=full`) matching whatever `surveyService.getSurveyFull` sends.
6. **`getSurveyFull` in surveyService**: If the backend returns the full nested structure from the same endpoint as the summary (just with more fields), `getSurveyFull` can simply be a typed wrapper around the same GET call with a return type of `SurveyFullResponse` rather than `Survey`.
7. **React Router route placement**: The `/surveys/:id/builder` route must be nested inside `ProtectedRoute` + `AppLayout` in App.tsx and placed before any catch-all routes to avoid being swallowed by a wildcard.

## Reusable Patterns
- **Auth pre-population in beforeEach** (prevents AuthProvider.initialize() act() warnings):
  ```ts
  beforeEach(() => {
    localStorage.removeItem('devtracker_refresh_token');
    useAuthStore.setState({ user: mockUser, isAuthenticated: true, isLoading: false });
  });
  ```
- **userEvent.setup() click wrapping** (prevents React 18 scheduler act() warnings):
  ```ts
  const user = userEvent.setup();
  await act(async () => { await user.click(element); });
  ```
- **Hanging MSW handler for loading state assertion**:
  ```ts
  server.use(http.get('/api/v1/surveys/:id', () => new Promise<never>(() => {})));
  expect(screen.getByTestId('survey-builder-skeleton')).toBeInTheDocument();
  ```
- **MemoryRouter future flags** (suppresses React Router v6 deprecation warnings):
  ```tsx
  <MemoryRouter initialEntries={['/surveys/1/builder']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
  ```
- **afterEach timer cleanup** (prevents fake timer leakage from other test files):
  ```ts
  afterEach(() => { vi.useRealTimers(); });
  ```
- **builderStore action test pattern**:
  ```ts
  useBuilderStore.getState().addGroup({ title: 'Section 1' });
  expect(useBuilderStore.getState().groups).toHaveLength(1);
  ```
- **Reset store between tests** to prevent state bleed:
  ```ts
  beforeEach(() => { useBuilderStore.setState(initialBuilderState); });
  ```

## Files to Review for Similar Tasks
- `frontend/src/store/builderStore.ts` — reference for Zustand + immer nested state with undo/redo
- `frontend/src/pages/SurveyBuilderPage.tsx` — reference for three-panel layout, read-only guard pattern, and survey-fetch-on-mount
- `frontend/src/store/__tests__/builderStore.test.ts` — reference for action-only store unit tests without rendering
- `frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx` — reference for MSW + RTL + auth pre-population integration test pattern
- `frontend/src/services/surveyService.ts` — reference for typed service method returning nested response shapes

## Gotchas and Pitfalls
- **immer must be a direct dependency**: Add `"immer": "^10.x"` to `frontend/package.json` explicitly. Relying on it as a transitive dep of zustand causes sporadic type errors and bundler issues.
- **URL.createObjectURL in JSDOM**: If the builder adds export functionality, do NOT use `vi.spyOn(URL, 'createObjectURL')` — JSDOM does not implement it and spyOn will throw. Instead: `URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')` and restore with `vi.restoreAllMocks()` in afterEach.
- **Do not use setTokens() to set up auth in tests**: Calling `setTokens(access, refresh)` writes to localStorage, causing `AuthProvider` to mount with `pendingInit=true` and fire `initialize()` asynchronously, producing act() warnings. Use `useAuthStore.setState(...)` + `localStorage.removeItem('devtracker_refresh_token')` instead.
- **Undo stack grows unbounded**: Cap `undoStack` at a reasonable limit (e.g., 50 entries) to avoid memory issues with large surveys during a long editing session.
- **CSS grid panel overflow**: Three-panel layouts require `overflow: hidden` or `min-height: 0` on flex/grid children; without it, long question lists will push panels out of the viewport rather than scrolling internally.
- **Read-only check must be synchronous in render**: Derive `isReadOnly = survey.status !== 'draft'` from store state and pass as a prop or context to all child panels — do not re-derive per-component to avoid stale closure bugs.
- **`moveQuestion` must be atomic**: Moving a question between groups requires removing from source and inserting into target within a single immer draft callback. Two separate `set()` calls risk an intermediate render where the question exists in neither group.
```
