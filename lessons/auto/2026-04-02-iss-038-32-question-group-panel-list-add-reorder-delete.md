---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["react", "testing", "zustand", "msw", "survey-builder"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
  - "frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/store/builderStore.ts"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/types/survey.ts"
---

# Lessons Learned: 3.2: Question Group Panel (List, Add, Reorder, Delete)

## What Worked Well
- Shadcn/ui Collapsible provided expand/collapse behavior with minimal boilerplate, fitting cleanly into the group panel structure.
- Zustand builderStore actions (addGroup/removeGroup/updateGroup/reorderGroups) gave the component a clean, predictable state interface with no prop drilling.
- surveyService abstraction kept API calls out of the component and made MSW mocking straightforward.
- Inline title editing pattern (click → input focused → Enter/blur → PATCH) was self-contained and required no external state management beyond local component state.
- Pre-populating auth state via `useAuthStore.setState()` instead of relying on AuthProvider initialization eliminated act() warning noise across all tests.

## What Was Challenging
- Ensuring act() compliance with userEvent.setup() required wrapping every `user.click/type` call — easy to miss one and introduce subtle test contamination that only manifests in later tests.
- Delete confirmation dialog cascade warning text is an acceptance criterion, not just UX copy — asserting on it explicitly required discipline to treat dialog content as a testable contract.
- MSW error handler shape divergence (simplified `{message}` vs real backend `{detail: {code, message}}`) is a silent failure mode: tests pass but the component would mishandle real API errors.
- Sort order correctness required confirming groups are sorted in the store selector rather than inside GroupPanel render — sorting inside the component re-sorts on every render and interferes with optimistic drag-reorder state.

## Key Technical Insights
1. **Sort in the selector, not the component.** Sorting groups by sort_order inside the Zustand store selector (or before passing as props) rather than inside GroupPanel's render function prevents re-sort conflicts with optimistic drag-reorder state updates.
2. **Delete dialog text is a tested contract.** The cascade warning in the confirmation dialog is an explicit acceptance criterion — assert on it in tests so copy changes are caught as regressions, not silent UX degradation.
3. **MSW error envelopes must match the real backend shape.** The backend returns `{detail: {code: string, message: string}}`. Using `{message: '...'}` in test handlers produces false-positive tests that diverge from real API behavior.
4. **AuthProvider initialization must be suppressed in unit tests.** When setTokens() is called in beforeEach, AuthProvider mounts with pendingInit=true and fires initialize() asynchronously, producing act() warnings. Fix: remove the refresh token from localStorage and pre-populate auth store state directly after setTokens().
5. **Every userEvent interaction needs an act() wrapper.** userEvent.setup() dispatches events outside React's act() boundary. Bare `await user.click()` leaves the React 18 scheduler with unflushed work that contaminates subsequent tests. Wrap universally: `await act(async () => { await user.click(...) })`.
6. **vi.useRealTimers() in afterEach is non-negotiable.** Leaked fake timers silently block MSW promise resolution, causing all downstream tests to time out with no clear error pointing to the leak source.

## Reusable Patterns
- **Auth pre-population in beforeEach:**
  ```ts
  setTokens(accessToken, refreshToken);
  localStorage.removeItem('devtracker_refresh_token');
  useAuthStore.setState({ user: mockUser, isAuthenticated: true, isLoading: false });
  ```
- **act() wrapper for every userEvent call:**
  ```ts
  await act(async () => { await user.click(element) });
  await act(async () => { await user.type(input, 'text') });
  ```
- **Timer cleanup in afterEach:**
  ```ts
  afterEach(() => { vi.useRealTimers(); });
  ```
- **MSW error handler with correct backend envelope:**
  ```ts
  http.delete('/api/v1/surveys/:id/groups/:gid', () =>
    HttpResponse.json({ detail: { code: 'NOT_FOUND', message: 'Group not found' } }, { status: 404 })
  )
  ```
- **MemoryRouter future flags to suppress warnings:**
  ```tsx
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
  ```
- **Inline edit pattern:** local `isEditing` + `editValue` state; on blur or Enter, call PATCH API then update store; on Escape, reset without saving.
- **Delete confirmation with cascade warning:** assert `screen.getByText(/questions.*deleted|deleted.*questions/i)` or the exact warning string to lock in the acceptance criterion.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/GroupPanel.tsx` — collapsible panel with inline edit, delete dialog, empty-state placeholder, drag handle
- `frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx` — MSW + userEvent + act() patterns for interactive component tests
- `frontend/src/pages/SurveyBuilderPage.tsx` — Add Group integration: POST API call + builderStore.addGroup()
- `frontend/src/store/builderStore.ts` — addGroup/removeGroup/updateGroup/reorderGroups actions; sort_order selector pattern
- `frontend/src/services/surveyService.ts` — createGroup/updateGroup/deleteGroup/reorderGroups API methods

## Gotchas and Pitfalls
- **Bare userEvent calls contaminate subsequent tests.** A single `await user.click()` without act() wrapping can cause `result.current` to be null in the next renderHook call. Wrap every call, every time.
- **Refresh token in localStorage triggers AuthProvider init.** Even in unit tests, if a refresh token is present in localStorage when AuthProvider mounts, it fires initialize() and causes act() warnings throughout the test. Always clear it after setTokens().
- **Fake timer leaks are silent.** A test that calls vi.useFakeTimers() without a corresponding vi.useRealTimers() in afterEach will cause all subsequent MSW-dependent tests to hang with timeout errors that appear unrelated to the leak.
- **Sorting inside the component breaks drag-reorder.** GroupPanel must receive pre-sorted groups; sorting internally means optimistic drag state (reorder before API confirm) is immediately overwritten by the re-render sort.
- **Dialog cascade text must be asserted, not assumed.** If the warning string is refactored without updating the test, the dialog continues to open but the acceptance criterion silently breaks. Test the text explicitly.
- **Simplified MSW error shapes produce false positives.** `{message: 'error'}` passes component error-handling tests but the real component code path (which reads `error.detail.message`) is never exercised. Always mirror the exact backend error envelope.
```
