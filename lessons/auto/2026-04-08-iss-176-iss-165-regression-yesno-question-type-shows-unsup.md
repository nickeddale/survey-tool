---
date: "2026-04-08"
ticket_id: "ISS-176"
ticket_title: "ISS-165 regression: yes_no question type shows 'Unsupported question type'"
categories: ["testing", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-176"
ticket_title: "ISS-165 regression: yes_no question type shows 'Unsupported question type'"
categories: ["frontend", "bug-fix", "regression", "switch-statement"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/components/responses/SurveyForm.tsx", "frontend/src/components/responses/__tests__/SurveyForm.test.tsx"]
---

# Lessons Learned: ISS-165 regression: yes_no question type shows 'Unsupported question type'

## What Worked Well
- The root cause was immediately obvious from the ticket description: a missing `case 'yes_no':` in a switch statement
- Fall-through case syntax in TypeScript/JavaScript made the fix a single-line addition with no duplication of logic
- The implementation plan was accurate and required no deviation

## What Was Challenging
- Nothing significant — this was a straightforward one-line fix with a clear root cause

## Key Technical Insights
1. Backend and frontend can disagree on question type string identifiers — the backend uses `yes_no` while the frontend originally only handled `boolean`, causing a silent fallback to the "Unsupported question type" default case
2. Switch statement fall-through (`case 'yes_no': case 'boolean':`) is the idiomatic pattern for aliasing multiple string values to the same handler — no duplication of the rendering logic required
3. Regressions like this often occur when a type alias or synonym is added on one side of the stack without a corresponding update on the other side

## Reusable Patterns
- When a backend enum or string type has synonyms (e.g., `yes_no` and `boolean`), use fall-through cases in frontend switch statements rather than duplicating the handler branch
- When adding new question types to the backend, always audit `QuestionInput` (or equivalent renderer switch) in the frontend for a matching case
- The "Unsupported question type" default case is a useful diagnostic signal — if it appears in production, it indicates a backend/frontend type name mismatch

## Files to Review for Similar Tasks
- `frontend/src/components/responses/SurveyForm.tsx` — contains the `QuestionInput` switch that maps question types to renderer components; any new question type must be added here
- `frontend/src/components/responses/__tests__/SurveyForm.test.tsx` — colocated tests for question rendering; add a test case per question type to prevent future regressions
- Backend question type definitions (models/schemas) — the authoritative source of question type string values that the frontend must match

## Gotchas and Pitfalls
- The frontend switch used `'boolean'` as the case label, but the backend persists and sends `'yes_no'` — these are the same semantic type with different string identifiers, which is non-obvious
- Without a test asserting that `yes_no` renders `BooleanInput`, the regression went undetected; always add render tests for each distinct question type string the backend can emit
- If a question type is added to the backend enum but not to the frontend switch, it silently falls to the default "Unsupported" case with no error thrown — consider adding a runtime warning or assertion in the default case during development
```
