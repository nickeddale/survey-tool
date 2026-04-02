---
date: "2026-04-02"
ticket_id: "ISS-032"
ticket_title: "2.6: Dashboard Page"
categories: ["testing", "api", "ui", "bug-fix", "feature", "performance", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-032"
ticket_title: "2.6: Dashboard Page"
categories: ["frontend", "react", "testing", "dashboard", "msw"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/pages/DashboardPage.tsx"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/mocks/handlers.ts"
  - "frontend/src/pages/__tests__/DashboardPage.test.tsx"
---

# Lessons Learned: 2.6: Dashboard Page

## What Worked Well
- Reading existing service files (authService.ts, apiClient.ts) before writing surveyService.ts ensured consistent patterns — no guesswork on interceptor setup, base URL, or error handling shape.
- Pre-reading handlers.ts and LoginPage.test.tsx before writing tests confirmed mock data shape and server.use() override patterns, preventing schema mismatches in test assertions.
- Using Tailwind + shadcn/ui design tokens for status badges kept the implementation consistent with the existing design system without introducing new dependencies.
- The MSW handler added to handlers.ts with mock surveys covering all four statuses (draft, active, closed, archived) served all test scenarios via per-test server.use() overrides without duplication.

## What Was Challenging
- Deriving dashboard stats (counts per status) from a paginated survey list requires either a separate stats endpoint or fetching all surveys. Without a dedicated stats endpoint, the implementation fetches the full list and computes counts client-side — acceptable at small scale but a known limitation.
- Ensuring the loading skeleton test remained stable required an indefinitely-pending MSW handler (`new Promise<never>(() => {})`); any finite delay risked a race condition where the component resolved before the assertion ran.
- The empty state test required a server.use() override returning `{ items: [], total: 0 }` rather than relying on the default handler — easy to miss if assuming the default handler covers all cases.

## Key Technical Insights
1. For loading skeleton assertions, use `server.use(http.get(url, () => new HttpResponse(new Promise<never>(() => {}))))` — this keeps the component in loading state for the entire assertion without any timing dependency.
2. Error state tests must catch inside `act()` rather than propagating the rejection outward. Pattern: `await act(async () => { try { await triggerAction() } catch (err) { caught = err } })` — propagating out leaves React 18's scheduler with unflushed work that corrupts subsequent renderHook calls.
3. Navigation assertions (Create New Survey → /surveys/new) must use MemoryRouter + a `<LocationDisplay />` component reading `useLocation().pathname` — not `window.location` or navigate() spies, which don't reflect router state correctly in JSDOM.
4. Status badge color mapping (draft=gray, active=green, closed=yellow, archived=red) is a UI contract that tests should assert on class names or accessible roles, not just text — prevents silent regressions when Tailwind classes change.
5. Computing stats client-side from a fetched list is simpler but means the stat cards reflect only what was fetched. If the API paginates, stats will be incorrect unless the full collection is requested (e.g., `limit=1000` or a dedicated stats endpoint). Document this limitation clearly.

## Reusable Patterns
- **surveyService.ts**: Follows the same apiClient wrapper pattern as authService.ts — instantiate once, export instance, use `client.get<ResponseType>(path, { params })`. Copy this pattern for any new resource service.
- **Loading skeleton test**: `server.use(http.get('/api/v1/surveys', () => new HttpResponse(new Promise<never>(() => {}))))` before render; assert skeleton elements are present; no cleanup needed as server resets after each test.
- **Empty state test**: `server.use(http.get('/api/v1/surveys', () => HttpResponse.json({ items: [], total: 0 })))` as a per-test override.
- **Error state test**: `server.use(http.get('/api/v1/surveys', () => new HttpResponse(null, { status: 500 })))` + catch-inside-act pattern.
- **Navigation test**: Wrap component in `<MemoryRouter initialEntries={['/dashboard']}><Routes><Route path='/dashboard' element={<DashboardPage />} /><Route path='/surveys/new' element={<LocationDisplay />} /></Routes></MemoryRouter>`, click button, assert LocationDisplay renders `/surveys/new`.

## Files to Review for Similar Tasks
- `frontend/src/services/authService.ts` — canonical service pattern using apiClient
- `frontend/src/api/apiClient.ts` — axios instance setup, interceptors, base URL
- `frontend/src/mocks/handlers.ts` — MSW handler registration; add new resource handlers here
- `frontend/src/pages/__tests__/DashboardPage.test.tsx` — reference for all four MSW override patterns (loading, empty, error, navigation)
- `frontend/src/components/auth/ProtectedRoute.test.tsx` — MemoryRouter + LocationDisplay pattern origin

## Gotchas and Pitfalls
- Do NOT use `await expect(act(...)).rejects` for error-state tests — this propagates the rejection outside act() and corrupts React 18's scheduler, causing the next renderHook to return null.
- Do NOT assert on the loading skeleton using a short `setTimeout` or fast mock delay — fast mocks may resolve before the assertion fires. Always use an indefinitely-pending promise.
- Do NOT use `window.location.pathname` to assert navigation in JSDOM — it will not reflect React Router state. Always use MemoryRouter + LocationDisplay.
- Do NOT forget to add mock surveys for all four statuses in handlers.ts — tests that override the handler for empty/error scenarios still depend on the default handler for the happy-path stat card assertions.
- If the API response shape changes (e.g., `items` renamed to `surveys`), both surveyService.ts and handlers.ts mock data must be updated together — they are implicitly coupled.
```
