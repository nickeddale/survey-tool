---
date: "2026-04-02"
ticket_id: "ISS-042"
ticket_title: "3.6: Question Editor Panel (Properties Editor)"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-042"
ticket_title: "3.6: Question Editor Panel (Properties Editor)"
categories: ["react", "forms", "testing", "debounce", "zustand"]
outcome: "success"
complexity: "high"
files_modified:
  - "frontend/src/components/survey-builder/QuestionEditor.tsx"
  - "frontend/src/components/survey-builder/__tests__/QuestionEditor.test.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/mocks/handlers.ts"
---

# Lessons Learned: 3.6: Question Editor Panel (Properties Editor)

## What Worked Well
- Extracting the QuestionEditor into a dedicated component (rather than keeping it inline in SurveyBuilderPage) kept the panel logic self-contained and testable in isolation.
- Reading directly from the builder store inside QuestionEditor (rather than prop-drilling all state) simplified the parent integration — SurveyBuilderPage only needed to pass `surveyId` and `readOnly`.
- The `useRef` debounce timer pattern (clear + set on each change, clean up on unmount) was straightforward and avoided stale closure issues.
- Pre-populating Zustand auth state via `useAuthStore.setState(...)` and removing the refresh token in `beforeEach` reliably prevented `AuthProvider.initialize()` from running and producing spurious `act()` warnings.

## What Was Challenging
- Debounce testing was the trickiest part: `vi.useFakeTimers()` + MSW deadlocks because fake timers block the Promise resolution that MSW depends on. The solution was to use real timers, type at natural speed, capture PATCH requests in an array via MSW, and assert `array.length === 1` after the debounce window naturally elapsed inside `waitFor`.
- Ensuring the incompatible question type change warning was rendered in the React component tree (not `window.confirm`) so RTL queries could find and interact with it.
- `act()` warnings from `userEvent.setup()` required wrapping every `await user.click/type(...)` call in `await act(async () => { await user.click(...) })` — easy to forget and produces subtle test pollution.

## Key Technical Insights
1. **Never combine `vi.useFakeTimers()` with MSW** — fake timers intercept the microtask/macrotask queue that MSW uses to resolve fetch mocks. Use real timers and verify debounce by asserting the captured request count equals 1.
2. **`useRef` debounce must clean up on unmount** — without a `useEffect` cleanup returning `clearTimeout(timerRef.current)`, state updates fire on unmounted components when the debounce fires after a fast unmount in tests.
3. **MSW PATCH handler response shape must mirror the real backend** — return `{ ...question, ...patchBody }` for 200 and `{ detail: { code: string, message: string } }` for 422. Simplified `{ message: string }` shapes cause test/production divergence.
4. **Do not double-start MSW** — `src/test/setup.ts` already calls `server.listen()`. Test files should only call `server.resetHandlers()` in `beforeEach`/`afterEach`, never `server.listen()` again.
5. **Inline warning dialogs, not `window.confirm`** — native dialogs are not accessible to RTL queries. Always render confirmation dialogs inside the React tree.
6. **Verify store state via `useBuilderStore.getState()`** after interactions, not just DOM assertions — this confirms the store update fired independently of whether the UI re-rendered correctly.

## Reusable Patterns
- **Auth setup in `beforeEach`**: `localStorage.removeItem('devtracker_refresh_token')` + `useAuthStore.setState({ user: mockUser, isAuthenticated: true, isLoading: false })` prevents `AuthProvider.initialize()` act() warnings without disrupting API auth headers.
- **Debounce verification without fake timers**: capture MSW requests in a `const captured: Request[] = []` array via a handler that pushes to it, type multiple characters at real speed with `userEvent`, then `await waitFor(() => expect(captured.length).toBe(1))`.
- **Read-only mode testing**: call `useBuilderStore.setState({ survey: { ...survey, status: 'published' } })` before render, then assert all inputs have the `disabled` attribute.
- **`act()` wrapper for userEvent**: `await act(async () => { await user.click(element) })` — apply to every `user.click/type/selectOptions` call in RTL tests using `userEvent.setup()`.
- **React Router future flag suppression**: add `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` to every `MemoryRouter` in test files.
- **Always `vi.useRealTimers()` in `afterEach`** to prevent fake timer leakage from contaminating subsequent tests.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/QuestionEditor.tsx` — reference for controlled form + debounced PATCH + store integration pattern.
- `frontend/src/components/survey-builder/__tests__/QuestionEditor.test.tsx` — reference for debounce testing with real timers + MSW request capture, act() wrapping, and read-only mode assertions.
- `frontend/src/mocks/handlers.ts` — reference for PATCH handler shape matching backend error envelope.
- `frontend/src/test/setup.ts` — confirms MSW lifecycle is managed globally; do not add `server.listen()` in individual test files.

## Gotchas and Pitfalls
- **Fake timers + MSW = deadlock**: `waitFor` will never resolve if `vi.useFakeTimers()` is active while MSW handlers are in use. Always use real timers for debounce tests.
- **Refresh token in localStorage during test setup**: if `devtracker_refresh_token` exists, `AuthProvider` mounts with `pendingInit=true` and runs `initialize()` asynchronously, producing act() warnings that pollute the next test. Always clear it in `beforeEach`.
- **Double MSW start**: calling `server.listen()` in a test file when `setup.ts` already does it causes "already started" errors or duplicate handler registration. Only call `server.resetHandlers()` per-test.
- **Component tree dialogs only**: `window.confirm` dialogs cannot be queried or dismissed by RTL — always implement confirmation/warning dialogs as React components rendered in the tree.
- **Debounce cleanup on unmount**: forgetting `clearTimeout` in `useEffect` cleanup causes "Can't perform a React state update on an unmounted component" warnings in tests where the component unmounts before the debounce fires.
- **`userEvent.setup()` without `act()` wrapper**: bare `await user.click(...)` calls produce act() warnings in React 18 because pointer events fire state updates outside React's act boundary. Every userEvent interaction must be wrapped in `await act(async () => { ... })`.
```
