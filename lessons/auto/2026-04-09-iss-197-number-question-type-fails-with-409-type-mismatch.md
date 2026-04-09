---
date: "2026-04-09"
ticket_id: "ISS-197"
ticket_title: "Number question type fails with 409 — type mismatch"
categories: ["testing", "database", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-09"
ticket_id: "ISS-197"
ticket_title: "Number question type fails with 409 — type mismatch"
categories: ["bug-fix", "frontend", "backend", "data-integrity"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/survey-builder/QuestionPalette.tsx"
  - "backend/app/models/question.py"
---

# Lessons Learned: Number question type fails with 409 — type mismatch

## What Worked Well
- The root cause was identified quickly by tracing the error from the misleading 409 response back to the database CHECK constraint
- The fix was minimal and surgical — two small changes normalized the identifier without touching unrelated code
- The secondary display bug ("New New Question" fallback) was caught as part of the same investigation, avoiding a follow-up ticket

## What Was Challenging
- The 409 ConflictError message ("A question with that code already exists") was completely unrelated to the actual failure, which made initial diagnosis misleading
- The backend accepted `"numeric"` as valid (it was in `VALID_QUESTION_TYPES`) so Python-level validation gave no hint of the problem — the failure only surfaced at the database layer

## Key Technical Insights
1. A database CHECK constraint is the authoritative source of truth for enum-like string columns. Application-layer validation (`VALID_QUESTION_TYPES`) must be kept in exact sync with the DB constraint — extra values in the Python tuple silently pass validation but explode on insert.
2. Generic error handlers that catch `IntegrityError` and re-raise as a fixed message (e.g., "code already exists") can mask completely unrelated integrity violations. The catch block should inspect the constraint name or message before choosing an error response.
3. Frontend type identifiers, backend model constants, and database CHECK constraints form a three-way contract. Any divergence between them requires tracing all three layers to find the mismatch.

## Reusable Patterns
- When a 409 appears on question creation and no duplicate code was provided, check the DB CHECK constraint on `question_type` before assuming a code collision.
- When adding a new question type, update in lock-step: (1) DB migration to extend the CHECK constraint, (2) `VALID_QUESTION_TYPES` in `question.py`, (3) `QuestionPalette.tsx` type string, (4) `QUESTION_TYPE_LABELS` in `SurveyBuilderPage.tsx`.

## Files to Review for Similar Tasks
- `backend/app/models/question.py` — `VALID_QUESTION_TYPES` tuple and CHECK constraint definition
- `frontend/src/components/survey-builder/QuestionPalette.tsx` — question type strings sent to the API
- `frontend/src/pages/SurveyBuilderPage.tsx` — `QUESTION_TYPE_LABELS` display mapping
- `alembic/versions/` — migration that defines `ck_questions_question_type` CHECK constraint

## Gotchas and Pitfalls
- The error handler that wraps `IntegrityError` as a 409 "code already exists" response is a trap: any integrity violation on the questions table will produce this misleading message, not just duplicate codes. Be skeptical of 409 responses when no duplicate data was submitted.
- Keeping stale synonyms in `VALID_QUESTION_TYPES` (like `"numeric"`) creates a false sense of safety — they pass Python validation but will always fail the DB constraint, making the feature silently broken rather than loudly rejected.
```
