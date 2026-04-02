---
date: "2026-04-02"
ticket_id: "ISS-042"
ticket_title: "3.6: Question Editor Panel (Properties Editor)"
categories: ["testing", "api", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-042"
ticket_title: "3.6: Question Editor Panel (Properties Editor)"
categories: ["react", "forms", "zustand", "survey-builder", "debouncing"]
outcome: "success"
complexity: "high"
files_modified: ["frontend/src/components/survey-builder/QuestionEditor.tsx", "frontend/src/components/survey-builder/__tests__/QuestionEditor.test.tsx"]
---

# Lessons Learned: 3.6: Question Editor Panel (Properties Editor)

## What Worked Well
- The component was substantially pre-implemented (487 lines) before the ticket was formally worked, meaning the implementation plan's explore steps could quickly confirm completeness rather than requiring significant new code
- Controlled form components bound directly to the Zustand builder store provided a clean, predictable data flow with no local state drift
- The 500ms debounce pattern for PATCH calls effectively balanced responsiveness with network efficiency — typing feels instant while API calls are batched
- Separating the `schedulePatch` concern from `updateQuestion` kept the store action pure and the side-effect logic localized in the component

## What Was Challenging
- Incompatible question type changes require a confirmation dialog, which adds async flow complexity to an otherwise synchronous onChange handler — the dialog must gate the store update, not just the API call
- Syncing form fields from the store on `selectedItem` change (without causing infinite re-render loops) requires careful dependency management in `useEffect`
- Validating JSONB inline (for the validation field) without a dedicated schema editor means the component must parse JSON on every keystroke and display errors without disrupting the editing experience
- Testing debounced behavior requires careful use of fake timers — mixing `vi.useFakeTimers()` with `userEvent` interactions and `waitFor` can produce flaky results if not properly sequenced

## Key Technical Insights
1. For debounced PATCH calls, store a ref to the debounced function (not recreating it on every render) using `useRef` combined with `useCallback` — recreating the debounced function on each render resets the timer and defeats the debounce
2. The incompatible type change warning dialog should be implemented as a controlled confirmation flow: stage the intended new type in local state, show the dialog, and only commit to the store if the user confirms — this keeps the store as the single source of truth
3. When syncing a controlled form from an external store selection (e.g., `selectedQuestion`), use a `useEffect` with the question's `id` as the dependency (not the full object) to avoid resetting form fields during in-flight edits
4. Inline JSON validation should treat empty string as valid (no error) and only show an error when non-empty and non-parseable — otherwise toggling away from a blank field triggers spurious errors
5. The empty state (`selectedItem` is null or not type `question`) is a first-class render path — keeping it as a simple early return before the form JSX avoids conditional hook issues

## Reusable Patterns
- **Debounced PATCH with store sync**: `updateQuestion(groupId, questionId, updates)` → immediate store update → `schedulePatch()` debounced 500ms → `surveyService.updateQuestion()`. This pattern applies to any auto-saving property editor in the builder
- **Incompatible change guard**: stage change in local state → render confirmation dialog → on confirm, apply to store; on cancel, reset staged value. Reusable for any destructive field change (e.g., switching question type, changing list source)
- **Code auto-generation toggle**: derive `autoCode` as boolean local state; when true, compute code from title (slugify) and write to store; when false, allow manual input. The same pattern applies to any field with an "auto" mode
- **JSONB textarea with inline error**: parse on change, set error string if invalid, pass `error` prop to a helper text component. Keep the raw string in state separate from the parsed value

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/QuestionEditor.tsx` — canonical example of a debounced property editor panel bound to Zustand
- `frontend/src/store/builderStore.ts` — `updateQuestion` action signature and `selectedItem` shape; required reading before building any builder panel
- `frontend/src/components/survey-builder/__tests__/QuestionEditor.test.tsx` — full test patterns for store-driven forms, fake-timer debounce testing, and confirmation dialog flows
- `frontend/src/services/surveyService.ts` — `updateQuestion()` call signature and error shape for PATCH /api/v1/surveys/{id}/questions/{id}
- `frontend/src/pages/SurveyBuilderPage.tsx` — how QuestionEditor is wired into the right panel and how `surveyId` is passed down

## Gotchas and Pitfalls
- Do not recreate the debounced function on every render — it must be stable across renders or the 500ms window resets on each keystroke, resulting in the PATCH never firing while the user is typing
- `vi.useFakeTimers()` must be called before `userEvent.setup()` in tests that verify debounce behavior; calling it after results in timers that don't advance with `vi.advanceTimersByTime()`
- The builder store's `selectedItem` holds `{ type, groupId, questionId }`, not the question data itself — always derive the actual question object via a selector, never cache it in local state
- Changing question type may silently drop incompatible answer options from the store if the confirmation dialog is skipped or the guard is not implemented — always gate type changes behind the confirmation flow
- JSON.parse throws on trailing commas and comments (which users often type) — consider wrapping parse in try/catch and giving a clear error message rather than a generic "invalid JSON"
```
