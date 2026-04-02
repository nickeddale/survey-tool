---
date: "2026-04-02"
ticket_id: "ISS-034"
ticket_title: "2.8: Survey Create/Edit Form"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-034"
ticket_title: "2.8: Survey Create/Edit Form"
categories: ["frontend", "forms", "react", "testing", "api-integration"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/types/survey.ts
  - frontend/src/services/surveyService.ts
  - frontend/src/pages/SurveyFormPage.tsx
  - frontend/src/App.tsx
  - frontend/src/mocks/handlers.ts
  - frontend/src/pages/__tests__/SurveyFormPage.test.tsx
---

# Lessons Learned: 2.8: Survey Create/Edit Form

## What Worked Well
- Dual create/edit mode detection via `useParams` in a single component kept routing logic clean and avoided duplication between two nearly identical pages.
- Following established patterns from `LoginPage`/`RegisterPage` for form validation and `SurveysPage` for API integration made the implementation consistent with the rest of the codebase.
- Pre-reading `survey.ts` before adding new types prevented naming conflicts with types already defined for the list/detail view.
- Using `MemoryRouter` with `initialEntries` for both `/surveys/new` and `/surveys/:id/edit` paths gave reliable route-aware test coverage without full app rendering.
- The `LocationDisplay` helper component pattern made success-redirect assertions straightforward without needing to spy on `useNavigate`.

## What Was Challenging
- Handling the non-draft read-only view required careful state management: the component must fetch the survey, check status, and conditionally render a completely different UI branch — all before the user sees the form.
- 404 handling in edit mode required distinguishing between a network/server error and a deliberate not-found response, so the error display path had to be specific rather than generic.
- Ensuring MSW handlers covered all test scenarios (success, 422 validation, 404, non-draft active survey) without handler bleed between tests required careful `server.use()` overrides per test.

## Key Technical Insights
1. **Survey status ENUM literals must exactly match backend**: `'draft' | 'active' | 'closed'` — any deviation causes silent type mismatches where TypeScript accepts the value but runtime comparisons against the API response fail.
2. **React 18 act() error propagation**: async form submission errors (e.g., 422 backend validation) must be caught *inside* `act()` — propagating the rejection out of `act()` leaves the React 18 scheduler with unflushed work that corrupts the next `renderHook` call (`result.current` becomes null).
3. **Never-resolving MSW handler is the correct pattern for loading-state tests**: `http.post('/api/v1/surveys', () => new Promise<never>(() => {}))` keeps `isLoading` true indefinitely, allowing a synchronous assertion on the disabled submit button after firing the submit event.
4. **Non-draft read-only view via status check**: returning a 200 with `{ ...survey, status: 'active' }` from the MSW handler is sufficient to trigger the read-only branch — no separate endpoint or error code needed.
5. **Route registration order matters**: `/surveys/new` must be registered *before* `/surveys/:id/edit` and any wildcard `/surveys/*` route, otherwise React Router matches `/surveys/new` as an `:id` segment.

## Reusable Patterns
- `LocationDisplay` helper: `const LocationDisplay = () => <div data-testid="location-display">{useLocation().pathname}</div>` — render alongside the form route in `MemoryRouter` to assert redirects without mocking `useNavigate`.
- Never-resolving handler for loading state: `http.post('/api/v1/surveys', () => new Promise<never>(() => {}))` — reusable for any form submission loading-state test.
- `vi.useRealTimers()` in `afterEach` — unconditional, even if the test never called `vi.useFakeTimers()`; prevents timer leakage that causes downstream test timeouts.
- Dual-mode form detection: `const { id } = useParams(); const isEditMode = !!id;` — simple, readable, and works correctly with React Router v6 optional params.
- MSW per-test override: `server.use(http.get('/api/v1/surveys/:id', () => HttpResponse.json({ detail: 'Not found' }, { status: 404 })))` inside individual tests for 404/non-draft scenarios without affecting other tests.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyFormPage.tsx` — reference for dual create/edit mode form pattern with read-only fallback and 404 handling.
- `frontend/src/pages/__tests__/SurveyFormPage.test.tsx` — reference for MSW-based form tests including loading state, redirect, backend error, and non-draft read-only scenarios.
- `frontend/src/pages/LoginPage.tsx` — reference for client-side validation pattern and backend error display.
- `frontend/src/pages/SurveysPage.tsx` — reference for surveyService integration and MSW handler usage.
- `frontend/src/mocks/handlers.ts` — all MSW handlers including GET/POST/PATCH survey endpoints with status variants.

## Gotchas and Pitfalls
- **Do not use `vi.useFakeTimers()` in form tests with MSW**: fake timers block the promise resolution that MSW depends on, causing `waitFor` to time out indefinitely.
- **Read `survey.ts` before adding new types**: `SurveyCreate`/`SurveyUpdate` type names may conflict with existing types defined for the list page; always inspect first.
- **Async errors must be caught inside `act()`**: the pattern `await expect(act(...)).rejects.toThrow(...)` is broken in React 18 — use `let caughtError; await act(async () => { try { ... } catch (e) { caughtError = e; } }); expect(caughtError)...` instead.
- **Status literals are case-sensitive ENUM values**: the backend uses lowercase `'draft'`, `'active'`, `'closed'` — uppercase or mixed-case variants will pass TypeScript but silently fail status comparisons at runtime.
- **Cancel button must navigate to `/surveys`, not `-1`**: using `navigate(-1)` in tests without a real history stack causes unpredictable navigation; hardcode the target route for reliability.
```
