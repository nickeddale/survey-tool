---
date: "2026-04-18"
ticket_id: "ISS-282"
ticket_title: "Builder sends wrong question type code 'number' instead of 'numeric'"
categories: ["testing", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-18"
ticket_id: "ISS-282"
ticket_title: "Builder sends wrong question type code 'number' instead of 'numeric'"
categories: ["frontend", "bug-fix", "type-mismatch", "survey-builder"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/survey-builder/BuilderToolbar.tsx"
  - "frontend/src/components/survey-builder/QuestionPalette.tsx"
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
---

# Lessons Learned: Builder sends wrong question type code 'number' instead of 'numeric'

## What Worked Well
- The bug was isolated to frontend constant definitions, making the fix mechanical and low-risk
- The ticket clearly identified exact file paths and line numbers, enabling fast, targeted fixes
- The fix required no backend changes — the API contract was already correct
- Existing test suite provided confidence that changes didn't introduce regressions

## What Was Challenging
- The mismatch between a natural English word ('number') and the backend's enum value ('numeric') is easy to introduce silently — no TypeScript type error would catch it unless the type is strongly typed against a union of valid strings
- The GroupPanel omission of 'matrix_single' and 'matrix_multiple' was a separate, complementary bug that could easily be overlooked without thorough testing of all question types

## Key Technical Insights
1. Frontend QUESTION_TYPES arrays in BuilderToolbar.tsx, QuestionPalette.tsx, and GroupPanel.tsx each maintain their own independent copies of the question type list — there is no single source of truth enforcing consistency across them.
2. The backend uses the string literal 'numeric' (not 'number') for numeric question types; any frontend code sending 'number' will receive a validation error at runtime, not at compile time.
3. GroupPanel.tsx has a separate, narrower list of question types (for group-level filtering) that must be kept in sync with the full list — omissions here silently hide valid question types from users.

## Reusable Patterns
- When fixing a string literal mismatch against a backend enum, search all frontend files for the incorrect value to catch every occurrence: `grep -r "'number'" src/components/survey-builder/`
- After any change to question type constants, verify all three components (BuilderToolbar, QuestionPalette, GroupPanel) remain consistent
- Use TypeScript union types or a shared constant for question type codes to make future mismatches compile-time errors rather than runtime failures

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/BuilderToolbar.tsx` — primary QUESTION_TYPES definition used in the toolbar
- `frontend/src/components/survey-builder/QuestionPalette.tsx` — palette-level QUESTION_TYPES list
- `frontend/src/components/survey-builder/GroupPanel.tsx` — group-level question type dropdown, subset of full list
- `frontend/src/types/` — check for any existing QuestionType union/enum definitions that should be the canonical source
- `backend/app/models/` or `backend/app/schemas/` — to confirm the authoritative enum values the API expects

## Gotchas and Pitfalls
- There are at least three separate places in the survey builder that define question type arrays; fixing one without fixing the others leaves the bug partially in place
- 'matrix_single' and 'matrix_multiple' were missing only from GroupPanel, not from the other two components — review scope must match the component's role
- The natural name 'number' vs the backend enum 'numeric' is a recurring trap; document the correct value prominently near the constant definitions
- No automated test validated that the strings sent by the UI match the backend's accepted enum values — consider adding an integration or contract test to catch this class of mismatch early
```
