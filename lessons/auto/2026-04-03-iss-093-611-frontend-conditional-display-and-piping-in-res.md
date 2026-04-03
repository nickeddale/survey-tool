---
date: "2026-04-03"
ticket_id: "ISS-093"
ticket_title: "6.11: Frontend — Conditional Display and Piping in Response Form"
categories: ["react-hooks", "survey-logic", "conditional-rendering", "api-integration", "debouncing"]
outcome: "success"
complexity: "high"
files_modified: []
---

# Lessons Learned: 6.11: Frontend — Conditional Display and Piping in Response Form

## What Worked Well
- Extracting flow resolution into a dedicated `useFlowResolution` hook kept `SurveyResponsePage` focused on page-level concerns and made both units independently testable
- Gating the `useFlowResolution` API calls to only fire when `screen === 'form'` avoided unnecessary network requests during welcome and thank-you screens
- Separating `buildVisibleSurvey()` and `applyPipedText()` as pure helper functions made piped-text logic easy to unit test and reason about in isolation
- Converting the answer map to Sets of visible/hidden IDs on the consumer side (rather than filtering in the hook) kept the hook's return shape simple and reusable
- Using ref-based previous-answer tracking in the hook prevented the debounce timer from creating infinite re-render cycles
- Retaining hidden question answers in the `AnswerMap` state (filtering only at display time) made answer restoration when questions re-appear trivially correct

## What Was Challenging
- Coordinating debounce cleanup correctly: the hook must clear the timer ref on unmount to prevent state updates on unmounted components
- The `resolveFlow` service method sits naturally in `responseService` (same public-API, no-auth pattern) rather than a separate `logicService`, which was the right call but required confirming the pattern before committing
- Designing the `nextQuestionId` return value required understanding both paged and single-page navigation modes before deciding how the page consumed it
- Silently swallowing API errors in the hook (preserving previous state) was a deliberate UX decision but required care to ensure the form remained usable during transient failures

## Key Technical Insights
1. Debounce in React hooks should use `useRef` for the timer ID, not `useState`, to avoid triggering re-renders when the timer is set or cleared
2. Filtering display ≠ clearing state: answers for hidden questions must stay in the answer map so they are restored if the question becomes visible again; remove them only on final submission if desired
3. `{variable}` placeholder substitution via `applyPipedText()` must operate on the *built/filtered* survey copy, not the original, so that piped values from the API replace placeholders after all visibility filtering is applied
4. The resolve-flow endpoint is on the public API path (no auth header), matching the rest of `responseService` — mixing it into an authenticated service would have broken the public-form use case
5. Skip logic (`next_question_id`) is a display-time concern: it tells the page which group to navigate to next, but it does not alter the answer state or the question list

## Reusable Patterns
- **Debounced API hook with ref timer**: `useRef<ReturnType<typeof setTimeout> | null>(null)` + `clearTimeout` in cleanup; call on dependency change rather than inside `useEffect` with a dependency array to avoid stale closures
- **Pure survey transformation helpers**: `buildVisibleSurvey(survey, hiddenQuestions, hiddenGroups, pipedTexts)` pattern — takes immutable inputs, returns a new survey object; safe to memoize with `useMemo`
- **Answer map preservation on hide**: keep a flat `Record<string, AnswerValue>` as source of truth; derive the *displayed* answer set at render time by intersecting with visible question IDs
- **Screen-gated hook activation**: pass `enabled: boolean` (or check a screen state) inside the hook to skip API calls when the relevant UI is not shown, preventing spurious requests during setup/teardown phases

## Files to Review for Similar Tasks
- `frontend/src/hooks/useFlowResolution.ts` — canonical example of a debounced, error-resilient API polling hook with ref-based timer management
- `frontend/src/pages/SurveyResponsePage.tsx` — `buildVisibleSurvey()` and `applyPipedText()` helpers show the correct separation between visibility filtering and text substitution
- `frontend/src/services/responseService.ts` — public-API (no-auth) service pattern; reference before adding any new public survey endpoints
- `frontend/src/hooks/__tests__/useFlowResolution.test.ts` — shows how to test debounce behavior with `jest.useFakeTimers()` and `act()` + `advanceTimersByTime()`

## Gotchas and Pitfalls
- Do not clear the answer map when a question is hidden — this silently breaks answer retention and is hard to notice until a user toggles a conditional question back into view
- Do not call `resolveFlow` on every render or inside a `useEffect` with answers as a dependency without debouncing — this will hammer the API on every keystroke in a text field
- The `{variable}` replacement must handle the case where the key is absent from `pipedTexts` gracefully (leave the placeholder as-is or substitute an empty string) to avoid broken UI on partial API responses
- `next_question_id` from the API refers to a *question* ID, but paged navigation moves by *group* — the page must map the question ID back to its parent group index to advance to the correct page
- Tests for `SurveyResponsePage` must mock both the survey-fetch endpoint and the resolve-flow endpoint; forgetting the resolve-flow mock causes tests to hang or produce misleading assertion failures