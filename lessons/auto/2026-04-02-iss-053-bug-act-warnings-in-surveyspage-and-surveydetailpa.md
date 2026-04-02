---
date: "2026-04-02"
ticket_id: "ISS-053"
ticket_title: "Bug: act() warnings in SurveysPage and SurveyDetailPage tests"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-053"
ticket_title: "Bug: act() warnings in SurveysPage and SurveyDetailPage tests"
categories: ["testing", "react", "act-warnings", "async", "frontend"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/pages/__tests__/SurveysPage.test.tsx"
  - "frontend/src/pages/__tests__/SurveyDetailPage.test.tsx"
---

# Lessons Learned: Bug: act() warnings in SurveysPage and SurveyDetailPage tests

## What Worked Well
- MEMORY.md had pre-documented the core fix patterns before work began, eliminating research overhead and providing direct solutions for each warning category
- Targeting affected files individually (`npx vitest run src/pages/__tests__/SurveysPage.test.tsx`) before running the full suite allowed faster iteration
- The catch-inside-act pattern cleanly resolved async error propagation issues without contaminating subsequent test state
- Replacing bare `user.click()` calls with `await act(async () => { await user.click(...) })` proved to be a reliable, mechanical fix for the majority of warnings

## What Was Challenging
- The warning text (`An update to MemoryRouter inside a test was not wrapped in act(...)`) points to MemoryRouter but the root cause is in the async handlers that trigger navigation — the indirection makes the source non-obvious
- Distinguishing which clicks were the true trigger of the MemoryRouter update versus downstream effects required reading the component source alongside the tests
- Export tests involving DOM mutations (createObjectURL, appendChild, click, removeChild) required coordinating multiple mock strategies without breaking unrelated infrastructure (MSW uses `new URL(...)`)

## Key Technical Insights
1. React 18's scheduler leaves unflushed work when an act() rejection propagates outward — any subsequent `renderHook` call in the same file will return `result.current === null`. Always catch errors inside act(), never outside.
2. `userEvent.setup()` dispatches events outside React's act() boundary; every `await user.click/type/selectOptions` must be wrapped in `await act(async () => { ... })` to prevent warnings.
3. `vi.useFakeTimers()` blocks MSW promise resolution — debounce tests must use real timers and assert on observed fetch URLs rather than timing.
4. Fake timers that leak from one test to the next cause ALL subsequent tests to time out, not just the immediately following one. Every `vi.useFakeTimers()` call needs a matching `vi.useRealTimers()` in `afterEach`.
5. `URL.createObjectURL` does not exist on JSDOM's URL object — `vi.spyOn` throws; `vi.stubGlobal('URL', {...})` breaks `new URL(...)` in MSW handlers. The only safe approach is direct assignment: `URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')`.
6. Navigation assertions (checking route changes) must use `findBy*` or `waitFor` after the triggering click to allow MemoryRouter state to settle before assertion.

## Reusable Patterns
- **Catch-inside-act for throwing async actions:**
  ```ts
  let caughtError: unknown;
  await act(async () => {
    try { await action(); } catch (err) { caughtError = err; }
  });
  expect(caughtError).toMatchObject({ message: '...' });
  ```
- **Wrapping userEvent interactions:**
  ```ts
  await act(async () => { await user.click(button); });
  ```
- **Safe URL.createObjectURL mock:**
  ```ts
  beforeEach(() => { URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url'); });
  afterEach(() => { vi.restoreAllMocks(); });
  ```
- **Fake timer cleanup guard:**
  ```ts
  afterEach(() => { vi.useRealTimers(); });
  ```
- **Navigation assertion after click:**
  ```ts
  await user.click(navButton); // or inside act()
  expect(await screen.findByText('Expected Page Content')).toBeInTheDocument();
  ```
- **Debounce search test without fake timers:** type with real userEvent, collect all requests captured by MSW, assert that only the final URL was fetched (or the last one matches the full query).

## Files to Review for Similar Tasks
- `frontend/src/pages/__tests__/SurveysPage.test.tsx` — reference for pagination, delete-confirmation, debounce-search, and navigation click patterns
- `frontend/src/pages/__tests__/SurveyDetailPage.test.tsx` — reference for modal confirm, activate/deactivate/close/delete/export, and file-download DOM mutation patterns
- `home/claude/.claude/projects/-workspace/memory/MEMORY.md` — canonical source for all established fix patterns on this project

## Gotchas and Pitfalls
- **Do not propagate act() rejections outward.** Even one instance of `await expect(act(...)).rejects` in a file can silently corrupt subsequent tests by leaving the React scheduler in a dirty state.
- **Do not use `vi.stubGlobal('URL', {...})`.** It replaces the URL constructor globally and breaks MSW's internal `new URL(request.url)` calls, causing all MSW handlers in the same suite to fail.
- **Do not use `vi.spyOn(URL, 'createObjectURL')`.** JSDOM does not define this property, so spyOn throws. Assign directly instead.
- **A leaking `vi.useFakeTimers()` call is a test-suite time bomb.** The failure manifests as timeouts in completely unrelated tests, making the root cause hard to trace. Always pair with `vi.useRealTimers()` in `afterEach`.
- **`getBy*` after an async action will fail or warn.** Use `findBy*` (which polls via waitFor) for any assertion that follows an async state update or navigation event.
- **MemoryRouter future flag warnings are separate from act() warnings.** Add `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` to MemoryRouter in test wrappers to suppress React Router v6→v7 migration warnings and keep output clean.
- **React 18 StrictMode double-invokes effects.** If component effects fire on mount and are not idempotent, double-invocation in tests can produce extra act() warnings; verify cleanup functions are implemented for any effect that triggers state updates.
```
