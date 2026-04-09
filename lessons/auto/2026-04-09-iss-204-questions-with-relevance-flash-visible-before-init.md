---
date: "2026-04-09"
ticket_id: "ISS-204"
ticket_title: "Questions with relevance flash visible before initial flow resolution completes"
categories: ["frontend", "hooks", "ux", "survey-flow"]
outcome: "success"
complexity: "low"
files_modified: []
---

# Lessons Learned: Questions with relevance flash visible before initial flow resolution completes

## What Worked Well
- Extracting `computeInitialHiddenQuestions` as a pure exported function made it trivially unit-testable in isolation, independent of the hook's async debounce lifecycle.
- Passing `questions` as an optional third parameter to `useFlowResolution` was a non-breaking change — existing callers with no questions array get the previous behavior (empty initial hidden set).
- Using `useMemo` in `SurveyResponsePage` to derive `surveyQuestions` from `survey.groups` before passing to the hook kept the dependency chain clean and prevented unnecessary re-renders.
- The gate `screen === 'form' ? survey_id : undefined` already prevented the hook from firing API calls during the welcome screen, so the pre-hidden initial state only needed to apply once the form was active.
- Real timers with `waitFor` (rather than fake timers) proved sufficient for testing the async debounce behavior without the complexity and fragility of `vi.useFakeTimers`.

## What Was Challenging
- The `relevance` field on `QuestionResponse` can be `string | null` (not just `string | undefined`), requiring an explicit null guard (`q.relevance != null && q.relevance !== ''`) rather than a simple truthiness check, since an empty string `''` must be treated as "no condition."
- The initial `useState` call captures `initialHidden` synchronously on first render — this is correct behavior, but it means the questions array must be available at hook call time. Passing it via `useMemo` in the page component ensures this.
- Ensuring the pre-hidden state is fully replaced (not merged) by the first API response required verifying that `setState` in the success path sets a completely new `hiddenQuestions` set from the API result, discarding the pre-computed initial set.

## Key Technical Insights
1. The root cause was that `useState` initializes with an empty `Set`, so all questions appear visible until the first resolve-flow response. The fix seeds the initial state with questions that have a non-empty `relevance` expression, matching what the server will return for a form with no answers yet.
2. `computeInitialHiddenQuestions` deliberately hides any question with a non-empty relevance string — even expressions that evaluate to `true` (like `1 == 1`). This is intentional: the pre-hidden state is conservative (hide anything conditional) and is immediately replaced by the authoritative server response after the first API call completes.
3. The `relevance` field guards must use `q.relevance != null && q.relevance !== ''` — a bare `if (q.relevance)` would incorrectly treat `null` as falsy (correct) but may be confusing since the type is `string | null`; being explicit avoids subtle bugs if the type ever widens to include `undefined`.
4. Hook signature changes involving optional parameters with complex generic types (like `QuestionResponse[]`) can pass Vitest type inference but fail `tsc` — always run `npm run build` as the final validation step after modifying hook signatures.

## Reusable Patterns
- **Pre-hidden initialization pattern**: When a hook manages async-driven visibility, seed the initial state conservatively (hidden) for items that are conditionally shown, so there is never a flash of incorrect visibility before the first server response.
- **Pure helper extraction**: Extract any non-trivial initial state computation into a named, exported pure function (e.g., `computeInitialHiddenQuestions`) so it can be unit-tested independently from the hook's async lifecycle.
- **Optional questions parameter**: Making the `questions` parameter optional preserves backward compatibility — callers that do not need pre-hiding are unaffected.
- **`useMemo` for derived question lists**: Flatten `survey.groups.flatMap(g => g.questions)` inside a `useMemo` in the page component before passing to hooks, to avoid recomputing on every render.

## Files to Review for Similar Tasks
- `frontend/src/hooks/useFlowResolution.ts` — the pre-hidden initialization pattern and `computeInitialHiddenQuestions` pure function
- `frontend/src/pages/SurveyResponsePage.tsx` — how `surveyQuestions` is memoized and passed to the hook, and the `screen === 'form'` gate that controls when resolve-flow fires
- `frontend/src/hooks/__tests__/useFlowResolution.test.ts` — the `makeQuestion` helper and the dedicated `computeInitialHiddenQuestions` describe block for testing the pure function in isolation

## Gotchas and Pitfalls
- **Null vs empty string**: `relevance: null` means "no condition" (question is always visible); `relevance: ''` also means "no condition." Both must be excluded from the pre-hidden set. Only a non-null, non-empty string indicates a real relevance expression.
- **Initial state is replaced, not merged**: After the first API response, the full `hiddenQuestions` set is replaced wholesale by the server result. If the server says the conditionally-shown question is actually visible (e.g., its condition evaluates to true), the pre-hidden state is correctly discarded.
- **Fake timers and MSW conflict**: Using `vi.useFakeTimers()` while MSW is active can cause promise resolution to stall silently, causing all downstream tests to time out. Prefer real timers with `waitFor` for these tests.
- **Build validation is mandatory**: After changing hook signatures, `npm run test:run` may pass while `npm run build` surfaces TypeScript errors, particularly around optional parameters and complex nested types like `QuestionResponse`.
- **Hook fires only when `screen === 'form'`**: The `surveyId` is conditionally passed as `undefined` when the user is on the welcome screen, so the hook correctly does not make any API calls (or apply pre-hidden state meaningfully) until the form is active.