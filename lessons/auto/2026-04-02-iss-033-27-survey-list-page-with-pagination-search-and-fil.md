---
date: "2026-04-02"
ticket_id: "ISS-033"
ticket_title: "2.7: Survey List Page with Pagination, Search, and Filters"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-033"
ticket_title: "2.7: Survey List Page with Pagination, Search, and Filters"
categories: ["frontend", "react", "pagination", "search", "testing", "msw"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/pages/SurveysPage.tsx
  - frontend/src/services/surveyService.ts
  - frontend/src/mocks/handlers.ts
  - frontend/src/pages/__tests__/SurveysPage.test.tsx
---

# Lessons Learned: 2.7: Survey List Page with Pagination, Search, and Filters

## What Worked Well
- Initializing filter state directly from `useSearchParams` on mount prevented a two-render sync loop when loading bookmarked or shared URLs
- Debounce via `useEffect` + `useRef` (storing timeout ID in ref, clearing in cleanup) reliably prevented stale API calls after component unmount
- Following `DashboardPage.tsx` patterns for loading/error states and status badge styling ensured visual consistency with minimal decision-making overhead
- MSW handler that returns `new Promise<never>(() => {})` for the loading state test was a clean, reliable way to keep `isLoading` true for the full duration of the test

## What Was Challenging
- Keeping URL query params and React state in sync without triggering extra re-renders — the key was writing both together rather than sequentially
- Ensuring the MSW mock handler correctly parsed all four query params (`page`, `per_page`, `status`, `search`) and defaulted gracefully when any were absent (avoiding `NaN` in slice logic)
- `window.confirm` in JSDOM silently returns `undefined`, not `false`, making delete tests appear to pass without actually triggering the delete flow — required `vi.spyOn` in every test exercising the delete path

## Key Technical Insights
1. `useSearchParams` must be used both to READ initial state (so bookmarked URLs populate filters on mount) and to WRITE state changes back — treating it as write-only leaves initial URL params unused
2. React 18's scheduler leaves unflushed work if a rejection propagates out of `act()` — always catch errors INSIDE the `act()` callback and assert on `caughtError` after
3. MSW handler correctness should be verified independently before relying on it in page-level tests; a broken mock produces misleading failures that look like component bugs
4. `vi.useFakeTimers()` combined with MSW and `waitFor` is unreliable — fake timers block the promise resolution MSW depends on; prefer tracking fetched URLs to verify debounce coalesced keystrokes at real speed
5. Delete confirmation with `window.confirm` requires `vi.spyOn(window, 'confirm').mockReturnValue(true)` in every test that exercises the delete flow — JSDOM does not implement `window.confirm`

## Reusable Patterns
- **Debounce with cleanup:** `const timerRef = useRef<ReturnType<typeof setTimeout>>(); useEffect(() => { timerRef.current = setTimeout(..., 300); return () => clearTimeout(timerRef.current); }, [searchInput])`
- **URL param sync on mount:** `const [params] = useSearchParams(); const [page, setPage] = useState(() => Number(params.get('page') ?? 1))`
- **MSW paginated handler:** parse `url.searchParams`, filter mock array by status/search, slice for page/per_page, return `{ surveys, total, page, per_page, total_pages }`
- **Loading state test:** override MSW handler with `http.get('/api/v1/surveys', () => new Promise<never>(() => {}))` inside the test to hold loading indefinitely
- **act() error containment:** `let err: unknown; await act(async () => { try { await action() } catch (e) { err = e } }); expect(err).toMatchObject(...)`
- **window.confirm mock:** `vi.spyOn(window, 'confirm').mockReturnValue(true)` before any test that triggers a delete flow in JSDOM

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveysPage.tsx` — canonical example of paginated list page with search, filter, URL sync, debounce, and per-row actions
- `frontend/src/mocks/handlers.ts` — MSW handler pattern for paginated endpoints with query param filtering
- `frontend/src/pages/DashboardPage.tsx` — reference for loading/error state patterns and status badge styling
- `frontend/src/pages/__tests__/SurveysPage.test.tsx` — full test coverage pattern for list pages including loading, empty, filter, debounce, pagination, and delete

## Gotchas and Pitfalls
- `useSearchParams` setter alone does not trigger a re-render of dependent state — update React state and URL params together in the same handler
- Missing default values in the MSW handler for `page`, `per_page`, `status`, and `search` will produce `NaN` slice indices and silent test failures
- `vi.useRealTimers()` must be called in `afterEach` — fake timers that leak between tests cause all subsequent async tests to time out
- `question_count` may or may not be present on `SurveyResponse` — verify the actual type before assuming it is absent and rendering a hardcoded `0`
- `window.confirm` returning `undefined` (not `false`) in JSDOM means an un-mocked delete confirmation will silently skip the service call, making the test appear to pass incorrectly
```
