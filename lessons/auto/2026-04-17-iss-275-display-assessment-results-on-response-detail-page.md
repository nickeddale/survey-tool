---
date: "2026-04-17"
ticket_id: "ISS-275"
ticket_title: "Display assessment results on response detail page"
categories: ["testing", "api", "ui", "bug-fix", "feature"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-17"
ticket_id: "ISS-275"
ticket_title: "Display assessment results on response detail page"
categories: ["frontend", "react", "api-integration", "testing"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/types/survey.ts"
  - "frontend/src/services/assessmentService.ts"
  - "frontend/src/pages/ResponseDetailPage.tsx"
  - "frontend/src/components/responses/AssessmentResults.tsx"
  - "frontend/src/components/responses/__tests__/AssessmentResults.test.tsx"
  - "frontend/src/mocks/handlers.ts"
---

# Lessons Learned: Display assessment results on response detail page

## What Worked Well
- The backend endpoint already existed and had a clear contract, making the frontend integration straightforward with no backend changes required.
- Treating a 404 from the assessment endpoint as "no assessments defined" (rather than an error) was a clean pattern that avoids polluting the UI with spurious error messages for surveys without assessment rules.
- Separating the assessment fetch into its own `useEffect` (independent of the response fetch) kept concerns isolated and allowed both to load in parallel.
- Named exports for both `AssessmentResults` and `AssessmentResultsSkeleton` from the same file kept the import ergonomic and co-located the loading state variant with the component it mirrors.
- Reusing the existing `AssessmentResponse` type for `matching_assessments` within `AssessmentScoreResponse` avoided duplicating the band shape and kept the type graph consistent.

## What Was Challenging
- The MSW mock handler for the scoring endpoint needed to simulate the 404 path (no assessments defined for the survey) in addition to the success path, which required the handler to inspect `mockAssessments` by `survey_id` — a subtlety that's easy to forget when scaffolding a new handler.
- The `AssessmentScoreResponse.score` field can be `0`, which is falsy in JavaScript. The conditional rendering in `ResponseDetailPage` guards on `assessmentResult` being non-null rather than on `score > 0`, and the test explicitly covers the zero-score case to prevent future regressions from a naive truthiness check.

## Key Technical Insights
1. **404 as a feature, not an error**: When a backend endpoint returns 404 to signal "feature not configured" (rather than "resource missing"), the frontend should silently suppress the section rather than showing an error. This pattern is used here for surveys without assessment rules and is worth applying consistently across optional feature endpoints.
2. **Parallel independent effects**: Fetching assessment data in a second `useEffect` rather than chaining it after the response load means both requests fire simultaneously, reducing perceived latency with no extra complexity.
3. **`Number()` cast for display**: The component wraps score and range values in `Number()` before rendering. This guards against the backend potentially returning scores as strings (e.g. from numeric precision serialization) and is a cheap defensive measure for any numeric display.
4. **Scope label suppression for `total`**: The `total` scope is the common/default case and showing "Scope: total" would be noise. Suppressing the label only for `total` while showing it for `group`, `question`, and `subquestion` keeps the UI clean without hiding useful context.

## Reusable Patterns
- **Optional feature section pattern**: Fetch the feature endpoint independently; on 404 set state to `null` and render nothing; on other errors show an inline error alert; on success render the section. This is reusable for any survey feature that may or may not be configured (quotas summary, participant count, etc.).
- **Skeleton sibling export**: Exporting `ComponentSkeleton` alongside `Component` from the same file makes it easy for page-level consumers to show a loading placeholder with a single import.
- **Helper factory functions in tests**: `makeAssessmentBand(overrides)` and `makeResult(overrides)` factory helpers keep test cases terse and make the tested variation explicit while defaulting everything else to valid values.
- **`data-testid` on band-level elements**: Using `data-testid={`assessment-band-${band.id}`}` on each rendered band makes it easy to assert the presence of specific bands in integration tests without coupling to text content.

## Files to Review for Similar Tasks
- `frontend/src/pages/ResponseDetailPage.tsx` — reference for the parallel-fetch + optional-section pattern.
- `frontend/src/components/responses/AssessmentResults.tsx` — reference for the display component + skeleton sibling pattern.
- `frontend/src/mocks/handlers.ts` lines 1320–1340 — reference for adding a scoring/computed endpoint mock that returns 404 when the parent resource has no configuration.
- `frontend/src/components/responses/__tests__/AssessmentResults.test.tsx` — reference for test structure with factory helpers covering edge cases (empty list, zero score, non-total scope).

## Gotchas and Pitfalls
- **Falsy zero score**: `if (assessmentResult.score)` would suppress display when score is `0`. Always guard on `assessmentResult !== null` rather than on the score value.
- **MSW handler ordering**: The specific route `GET /surveys/:surveyId/responses/:responseId/assessment` must be registered before the more general `GET /surveys/:surveyId/responses/:responseId` handler (if one exists) because MSW matches handlers in order. Placing the assessment handler after the general response handler could cause it to be shadowed.
- **`AssessmentResponse` missing fields in mock data**: The `mockAssessments` array in `handlers.ts` was missing `question_id` and `subquestion_id` fields that are present in the `AssessmentResponse` type. The mock handler returns these objects as `matching_assessments`, so any test that checks those fields on returned bands would fail silently. Ensure mock data fully satisfies the TypeScript interface.
- **Cancellation tokens in `useEffect`**: Both fetch effects use a `cancelled` flag to prevent setting state on unmounted components. This pattern must be preserved when modifying either effect; removing the flag causes React warnings and potential state corruption on fast navigation.
```
