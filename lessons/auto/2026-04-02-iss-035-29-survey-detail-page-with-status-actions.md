---
date: "2026-04-02"
ticket_id: "ISS-035"
ticket_title: "2.9: Survey Detail Page with Status Actions"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-035"
ticket_title: "2.9: Survey Detail Page with Status Actions"
categories: ["frontend", "react", "testing", "vitest", "msw"]
outcome: "success"
complexity: "high"
files_modified:
  - "frontend/src/types/survey.ts"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/pages/SurveyDetailPage.tsx"
  - "frontend/src/pages/__tests__/SurveyDetailPage.test.tsx"
  - "frontend/src/App.tsx"
  - "frontend/src/pages/SurveysPage.tsx"
  - "frontend/src/mocks/handlers.ts"
---

# Lessons Learned: 2.9: Survey Detail Page with Status Actions

## What Worked Well
- Reading existing pages (SurveysPage, SurveyFormPage, DashboardPage) before writing any new code confirmed conventions around routing, auth guards, service calls, and component structure — no guessing required.
- Extending `surveyService.ts` with typed methods (activateSurvey, closeSurvey, archiveSurvey, cloneSurvey, exportSurvey) kept the component clean and side-effect free; the page just calls service functions and handles results.
- Confirmation modal pattern (single reusable modal state with `pendingAction` discriminator) handled Activate/Close/Archive/Delete without duplicating modal JSX.
- MSW `server.use()` overrides per test made it straightforward to simulate draft vs. active vs. closed vs. 422 states without a shared state machine.
- `URL.createObjectURL` mock via direct assignment (`URL.createObjectURL = vi.fn()`) worked cleanly for the Export download test; the `vi.spyOn` alternative throws in JSDOM.

## What Was Challenging
- Wiring `useParams()` correctly in tests required wrapping SurveyDetailPage in `MemoryRouter` with `initialEntries={['/surveys/test-id']}` plus a `Routes`/`Route path='/surveys/:id'` wrapper — a bare `MemoryRouter` is not enough.
- The 422 "activation blocked" error test required catching the thrown error inside `act()` rather than letting the rejection propagate out; propagating out leaves React 18's scheduler with unflushed work that makes subsequent `renderHook` calls return `null` for `result.current`.
- Loading skeleton test needed an MSW handler returning `new Promise<never>(() => {})` to keep the fetch pending indefinitely; any resolved response caused the loading state to clear before assertions ran.
- Export test cleanup: `URL.createObjectURL` and the created `<a>` element click must both be mocked, and `vi.restoreAllMocks()` in `afterEach` is required to avoid mock bleed between tests.

## Key Technical Insights
1. **`act()` error containment in React 18**: Async actions that throw (e.g. activate with no questions → 422) must have their errors caught *inside* `act()`. Pattern: `await act(async () => { try { await action() } catch (err) { caught = err } })`. Propagating rejection out of `act()` leaves scheduler state dirty and corrupts the next test.
2. **MSW hanging promise for loading tests**: `server.use(http.get('/surveys/:id', () => new Promise<never>(() => {})))` is the canonical way to freeze the component in its loading/skeleton state for assertions.
3. **`useParams()` in Vitest**: Pages that call `useParams()` must be rendered inside `<Routes><Route path="/surveys/:id" element={<Page />} /></Routes>` within a `MemoryRouter` with matching `initialEntries` — not just a bare router.
4. **`URL.createObjectURL` in JSDOM**: Assign directly (`URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')`). `vi.spyOn` throws because the method does not exist on JSDOM's URL. Restore with `vi.restoreAllMocks()` in `afterEach`.
5. **Status-conditional UI**: Driving action button visibility purely from `survey.status` (a string enum) with a simple `status === 'draft'` guard kept conditional rendering flat and easy to unit test — no derived state needed.
6. **Clone-then-navigate pattern**: After `cloneSurvey()` resolves with the new survey's id, call `navigate(\`/surveys/${newId}\`)`. Test this by providing a `LocationDisplay` helper and asserting the pathname after the action confirms.

## Reusable Patterns
- **Confirmation modal with `pendingAction` discriminator**: store `{ type: 'activate' | 'close' | 'archive' | 'delete' } | null` in state; a single modal renders based on this value; confirm handler dispatches the matching service call.
- **`LocationDisplay` helper for navigation assertions**: `const LocationDisplay = () => { const loc = useLocation(); return <div data-testid="location">{loc.pathname}</div>; }` — render alongside the page under test and assert `screen.getByTestId('location').textContent`.
- **Per-test MSW override pattern**: `beforeEach` sets the happy-path handler; individual tests call `server.use(http.post(...))` to override only the endpoint under test. This avoids cross-test state pollution.
- **Export download helper**: create a hidden `<a>` with `href = URL.createObjectURL(blob)` + `download` attribute, programmatically click, then revoke — encapsulate in `surveyService.exportSurvey()` so the page component stays side-effect free.
- **`vi.useRealTimers()` in `afterEach`**: mandatory in every Vitest test file that uses `userEvent` or MSW to prevent timer leakage that causes downstream timeouts.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyDetailPage.tsx` — reference for status-conditional action buttons, confirmation modal pattern, read-only tree view, and clone/export flows.
- `frontend/src/pages/__tests__/SurveyDetailPage.test.tsx` — canonical examples of: hanging-promise loading test, 422 error caught inside `act()`, `URL.createObjectURL` mock, `LocationDisplay` navigation assertion, and per-test MSW overrides.
- `frontend/src/services/surveyService.ts` — reference for typed async service methods including file-download (export) helpers.
- `frontend/src/mocks/handlers.ts` — reference for full-response mock data shape including nested question groups/questions/options.

## Gotchas and Pitfalls
- **Never propagate async action rejections out of `act()`** in React 18 tests — it corrupts the scheduler and breaks subsequent `renderHook` calls in the same file.
- **`vi.spyOn(URL, 'createObjectURL')` throws in JSDOM** — use direct assignment instead.
- **`vi.stubGlobal('URL', {...})` breaks MSW** — it replaces the URL constructor that MSW's `new URL(...)` relies on; never use it.
- **Bare `MemoryRouter` is insufficient for `useParams()`** — always include a matching `Routes`/`Route path` wrapper.
- **Fake timers + MSW + `waitFor` is broken** — fake timers block MSW promise resolution. Do not use `vi.useFakeTimers()` in tests that rely on MSW. Always restore with `vi.useRealTimers()` in `afterEach`.
- **Forgetting `vi.useRealTimers()` in `afterEach`** causes all subsequent tests in the suite to time out — a symptom that is very hard to trace back to the root cause.
- **Loading state clears before assertion** if the MSW handler returns any resolved response — use `new Promise<never>(() => {})` to keep it pending.
```
