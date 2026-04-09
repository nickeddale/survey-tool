---
date: "2026-04-09"
ticket_id: "ISS-205"
ticket_title: "Number question type renders as 'Unsupported question type: number' on public form"
categories: ["testing", "api", "ui", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-09"
ticket_id: "ISS-205"
ticket_title: "Number question type renders as 'Unsupported question type: number' on public form"
categories: ["frontend", "bug-fix", "type-mismatch"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/components/responses/SurveyForm.tsx"]
---
```

# Lessons Learned: Number question type renders as 'Unsupported question type: number' on public form

## What Worked Well
- The bug was precisely located before implementation — the ticket identified the exact file and line number, making the fix straightforward
- Using a switch-case fallthrough (`case 'number': case 'numeric':`) is a clean, idiomatic JS/TS pattern for aliasing enum-like string values without duplicating handler logic
- Existing frontend tests provided a regression safety net with no additional test authoring required

## What Was Challenging
- Nothing was significantly challenging; the root cause was immediately obvious once the discrepancy between backend and frontend type strings was identified

## Key Technical Insights
1. Backend and frontend can drift on enum/string literal values for the same concept — `question_type='number'` in the ORM model vs `'numeric'` in the frontend switch-case. These are not automatically kept in sync.
2. A switch-case fallthrough is preferable to duplicating the entire case branch or adding a string normalization layer — it keeps the fix minimal and localized.
3. The `default` branch of a question-type switch renders a visible error string (`'Unsupported question type: ...'`), which is a good UX pattern for catching future mismatches during development but must be kept exhaustive as new types are added.

## Reusable Patterns
- When a new backend question type is added, always audit `SurveyForm.tsx` switch-case, `questionSettings.ts` type unions, and any question-input component prop contracts simultaneously.
- Use switch fallthrough for type aliases rather than string normalization middleware — it keeps the mapping explicit and colocated with the rendering logic.

## Files to Review for Similar Tasks
- `frontend/src/components/responses/SurveyForm.tsx` — primary switch-case dispatch for question type rendering
- `frontend/src/types/questionSettings.ts` — `QuestionType` union and settings mapping; must stay in sync with backend type strings
- `backend/app/models/question.py` — authoritative source of `question_type` enum values
- `frontend/src/components/question-inputs/` — individual input components; confirm they are type-string-agnostic (driven by props, not `question.question_type`)

## Gotchas and Pitfalls
- Adding a fallthrough case fixes rendering but does not update the `QuestionType` TypeScript union — if `'number'` is not added to the union type, TypeScript may still flag it as an invalid value elsewhere (e.g., in builder forms or mock data).
- If `questionSettings.ts` maps default settings per type, a `'number'` key may be absent, causing settings lookups to return `undefined` — check all `questionSettings[question.question_type]` access points.
- New question types discovered via QA testing (Category 2 scenario testing in this case) suggest the backend type registry and frontend rendering layer should be cross-checked as part of any question-type feature work, not just at initial implementation.
