---
date: "2026-04-03"
ticket_id: "ISS-092"
ticket_title: "6.10: Frontend — Public Survey Response Form"
categories: ["testing", "api", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-092"
ticket_title: "6.10: Frontend — Public Survey Response Form"
categories: ["frontend", "react", "forms", "public-routes", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/App.tsx"
  - "frontend/src/pages/SurveyResponsePage.tsx"
  - "frontend/src/components/responses/SurveyForm.tsx"
  - "frontend/src/services/responseService.ts"
  - "frontend/src/mocks/handlers.ts"
  - "frontend/src/pages/__tests__/SurveyResponsePage.test.tsx"
  - "frontend/src/components/responses/__tests__/SurveyForm.test.tsx"
---

# Lessons Learned: 6.10: Frontend — Public Survey Response Form

## What Worked Well
- Decomposing `SurveyResponsePage` into isolated sub-components (`ResponseSkeleton`, `UnavailableScreen`, `WelcomeScreen`, `ThankYouScreen`) kept each rendering concern small and independently testable via `data-testid` attributes.
- Placing the `/s/:survey_id` route **before** `ProtectedRoute` in `App.tsx` at the top of `<Routes>` was clean and unambiguous — the public page never touches the auth context.
- Using a single `screen` enum (`'welcome' | 'form' | 'end'`) to drive top-level page transitions eliminated boolean flag sprawl and made the render branch logic easy to follow.
- Reusing the existing `useValidation` hook and `BuilderQuestion`-typed question-input components meant zero new validation logic and zero new UI primitives were needed.
- Wrapping `localStorage` access in try/catch helpers (`getStoredResponseId`, `storeResponseId`, `clearStoredResponseId`) kept the rest of the component free of error-handling noise for the resume-via-localStorage feature.
- Treating save-progress failures as non-fatal (silently swallowing the error and continuing navigation) matched the intended UX and avoided blocking the respondent.
- The `answersToInput` helper converting `AnswerMap → AnswerInput[]` centralised the API shape transformation in one place rather than inlining it at every call site.

## What Was Challenging
- The `GET /api/v1/surveys/:id` MSW handler needed to special-case the public active survey (`mockActiveSurveyFull`) to allow unauthenticated access while keeping all other survey reads auth-gated. This is a handler ordering and branching concern that was not needed before this ticket.
- Distinguishing `saveProgress` (no `status` field) from `completeResponse` (`status: 'complete'`) in the single PATCH endpoint required the MSW mock to inspect the body — a subtlety that test authors must know to write accurate mocks.
- Casting `QuestionResponse` to `BuilderQuestion` in the page component was necessary because `validateAll` and the question-input components accept `BuilderQuestion`, but the survey API returns `QuestionResponse`. The types overlap structurally but are not declared as compatible.
- Progress bar semantics: `current` is passed as `currentPage + 1` (1-based) while `total` is group count. The `ProgressBar` component calculates `pct = (current / total) * 100`, which means the first page shows 50% on a two-page survey (not 0%). This is a deliberate "pages completed including current" framing that differs from a "pages completed before current" framing; future contributors should be aware of the choice.

## Key Technical Insights
1. **Public route placement**: In React Router v6, a `<Route>` outside any `<ProtectedRoute>` wrapper must be listed before the protected route group in source order to guarantee it is always reachable without auth redirects. The `/s/:survey_id` route was placed at the very top of `<Routes>`.
2. **MSW handler specificity**: When a handler must return different responses for the same URL pattern based on auth state vs. specific ID, the cleanest pattern is to branch on `params.id` first (public-specific IDs), then check the Authorization header, rather than trying to infer intent from the header alone.
3. **`saveProgress` is non-fatal**: The PATCH-for-progress call on every Next click should never block navigation. Network errors on progress saves are swallowed; only `createResponse` (Start) and `completeResponse` (Submit) propagate errors to the UI.
4. **`one_page_per_group` defaults to `true`**: The setting is read as `survey.settings?.one_page_per_group !== false`, meaning any survey without an explicit `false` value is treated as paged. This must be consistent between `SurveyResponsePage` and `SurveyForm` — both use the identical expression.
5. **`data-testid` discipline**: Every interactive and structural element in new components was given a unique `data-testid`. This investment paid off immediately in the test suite, which required no `getByRole` guesswork and no brittle text matching beyond intended copy checks.

## Reusable Patterns
- **`screen` enum for multi-step flow**: A string union (`'welcome' | 'form' | 'end'`) controlling which screen renders is simpler and more legible than multiple boolean flags (`isStarted`, `isSubmitted`, etc.) for linear wizard-like flows.
- **localStorage resume pattern**: `getStoredResponseId` / `storeResponseId` / `clearStoredResponseId` helper trio with try/catch is copy-pasteable for any feature that needs to persist a resumable ID across page loads without crashing in private browsing mode.
- **Separate `ResponseService` class**: Grouping `createResponse`, `saveProgress`, and `completeResponse` into a typed service class (rather than inline `apiClient` calls in the page) makes it easy to mock the whole service in unit tests and to change the API shape in one place.
- **`QuestionInput` switch component**: The exhaustive switch over `question_type` in `SurveyForm` is the canonical pattern for dispatching to the correct M4 input component. Any future question type addition requires only adding a new `case` here.
- **Non-blocking progress saves**: For multi-step forms with auto-save, wrapping the save call in a try/catch that logs but does not surface errors keeps the user flow uninterrupted while preserving observability.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyResponsePage.tsx` — reference for public (no-auth) multi-step page with localStorage resume.
- `frontend/src/components/responses/SurveyForm.tsx` — reference for paged vs. single-page form rendering, progress bar, and navigation button visibility logic.
- `frontend/src/services/responseService.ts` — reference for typed service wrapping public (no-auth) POST/PATCH endpoints.
- `frontend/src/mocks/handlers.ts` — the `GET /api/v1/surveys/:id` handler shows how to special-case a public survey ID within an otherwise auth-gated endpoint; the POST/PATCH response handlers show the public endpoint mocking pattern.
- `frontend/src/pages/__tests__/SurveyResponsePage.test.tsx` — comprehensive integration test file covering loading, unavailable, welcome→form→thank-you flow, localStorage resume, per-page validation, single-page mode, and error handling.

## Gotchas and Pitfalls
- **Handler ordering in MSW**: Adding the public POST/PATCH response handlers at the **bottom** of the `handlers` array was intentional — they match `surveys/:surveyId/responses` which is more specific than the broad `surveys/:id` PATCH already present, so they must not accidentally swallow authenticated survey PATCH calls. Always verify that new response-endpoint handlers do not conflict with the existing `PATCH /surveys/:id` handler.
- **`BuilderQuestion` vs `QuestionResponse` cast**: The `as BuilderQuestion[]` cast in `SurveyResponsePage` is required wherever `validateAll` or question-input components are called. If the two types diverge in the future this cast will silently break validation.
- **`localStorage.clear()` in `beforeEach`**: Test files that exercise the localStorage resume feature must call `localStorage.clear()` in `beforeEach`; otherwise test order can cause false positives where a stored ID from a previous test prevents `createResponse` from being called.
- **Progress bar is "current page" not "completed pages"**: Page 1 of 2 renders 50%, not 0%. If the design intent changes to show 0% on the first page, `ProgressBar` should receive `currentPage` (0-based) rather than `currentPage + 1`.
- **`scrollTo` guard in `handleNext`/`handlePrev`**: `window.scrollTo` is called only after checking `typeof window.scrollTo === 'function'` to prevent test environment crashes where `scrollTo` is not implemented. Do not remove this guard.
```
