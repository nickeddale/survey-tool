---
date: "2026-04-08"
ticket_id: "ISS-186"
ticket_title: "Survey submission 422: answer format mismatches between frontend and backend"
categories: ["testing", "api", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-08"
ticket_id: "ISS-186"
ticket_title: "Survey submission 422: answer format mismatches between frontend and backend"
categories: ["frontend", "api-contract", "serialization", "form-handling"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/question-inputs/RadioInput.tsx"
  - "frontend/src/components/question-inputs/DropdownInput.tsx"
  - "frontend/src/components/question-inputs/__tests__/RadioInput.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/DropdownInput.test.tsx"
  - "frontend/src/components/survey-response/responseHelpers.ts"
  - "frontend/src/pages/SurveyResponsePage.tsx"
---

# Lessons Learned: Survey submission 422: answer format mismatches between frontend and backend

## What Worked Well
- The implementation plan correctly identified all three mismatches upfront by reading backend validators before writing any frontend code
- Fixing at the source (input components storing the correct format in AnswerMap) rather than transforming at serialization time in answersToInput kept the fix clean and localized
- The gap between saveProgress (200) and completeResponse (422) was a useful diagnostic signal: validation only fires on completion, so partial saves masked the format errors during development

## What Was Challenging
- Mismatches were silent during normal development because saveProgress accepts and stores any format — the 422 only surfaced at the final submission step, making it easy to miss in manual testing
- Three separate question types each had a distinct format mismatch (UUID vs code, string vs integer, true/false vs yes/no), requiring careful per-type investigation rather than a single systematic fix

## Key Technical Insights
1. **option.id vs option.code**: For single_choice/dropdown, the backend validator expects the option's `code` field, not its UUID `id`. Radio and dropdown inputs were storing `option.id` (UUID) in the AnswerMap, which the backend rejected.
2. **rating as integer**: The backend rating validator expects a numeric integer, not a string. Input components that call `onChange(String(value))` will produce 422 errors on completion even though the displayed value looks correct.
3. **yes_no as 'yes'/'no' not 'true'/'false'**: The backend yes_no validator uses the strings `'yes'` and `'no'`. Boolean-style toggle components that store `'true'`/`'false'` (or JS booleans) must be mapped explicitly.
4. **saveProgress is not a validation proxy**: A 200 from saveProgress does not guarantee completeResponse will succeed. The completion endpoint runs full per-question validation that saveProgress skips.

## Reusable Patterns
- When adding a new question input component, immediately check the backend validator in `backend/app/services/validators/` to confirm the exact wire format before wiring up onChange
- Store answers in AnswerMap in the exact format the backend expects — avoid storing a UI-convenient format and transforming later, as intermediate transforms are easy to miss or get wrong
- For choice-based questions, always use the semantic identifier the backend indexes on (e.g., `code`) rather than the database primary key (UUID), since backend logic references codes in expressions and statistics

## Files to Review for Similar Tasks
- `frontend/src/components/question-inputs/RadioInput.tsx` — pattern for storing option.code instead of option.id
- `frontend/src/components/question-inputs/DropdownInput.tsx` — same pattern as RadioInput for dropdown/single_choice
- `frontend/src/components/survey-response/responseHelpers.ts` — answersToInput serialization; check if any type coercion is needed as a safety net
- `backend/app/services/validators/` — source of truth for expected answer formats per question type
- `backend/app/api/responses.py` — where completion validation is applied but saveProgress is not

## Gotchas and Pitfalls
- **UUID vs code confusion**: option objects have both `id` (UUID) and `code` (short string). It is easy to default to `id` because it is the standard React key prop and feels like the canonical identifier — but the backend uses `code` for answer validation and expression evaluation.
- **String coercion in onChange signatures**: If the AnswerMap type is `string | string[]`, numeric values get implicitly stringified. Ensure the rating component calls `onChange(Number(value))` or that answersToInput explicitly coerces rating answers to integers before sending.
- **Component-level comparisons must stay in sync**: If you change the stored format (e.g., yes_no from 'true' to 'yes'), every comparison in the same component (e.g., `value === 'true'` for checked state) must be updated in the same change — partial updates cause the UI to desync from the stored value.
- **Tests may pass even with wrong format**: Vitest unit tests that mock onChange and only assert it was called with a value will not catch format mismatches — tests must assert the exact value passed (e.g., `expect(onChange).toHaveBeenCalledWith('yes')` not just `toHaveBeenCalled()`).
```
