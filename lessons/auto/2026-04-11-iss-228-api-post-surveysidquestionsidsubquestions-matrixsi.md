---
date: "2026-04-11"
ticket_id: "ISS-228"
ticket_title: "[API] POST /surveys/{id}/questions/{id}/subquestions — matrix_single and matrix_multiple not recognized as matrix types"
categories: ["testing", "api", "bug-fix", "feature"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-228"
ticket_title: "[API] POST /surveys/{id}/questions/{id}/subquestions — matrix_single and matrix_multiple not recognized as matrix types"
categories: ["bug-fix", "backend", "question-types"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/services/question_service.py", "backend/tests/test_matrix_questions.py"]
---

# Lessons Learned: [API] POST /surveys/{id}/questions/{id}/subquestions — matrix_single and matrix_multiple not recognized as matrix types

## What Worked Well
- The root cause was precisely identified upfront — a single frozenset omitting two members — making the fix surgical and low-risk.
- The existing test file (`test_matrix_questions.py`) already contained the full helper scaffolding (`auth_headers`, `create_survey`, `create_group`, `subquestions_url`), so adding the regression test required minimal boilerplate.
- Using `@pytest.mark.parametrize` for the two new types (`matrix_single`, `matrix_multiple`) kept the regression test concise while covering both cases with a single function.
- Tests were placed in a dedicated matrix test file rather than the general `test_questions.py`, which kept related coverage co-located and easy to find.

## What Was Challenging
- Nothing significant. The change was a one-line frozenset update. The main risk was ensuring no other code paths depended on `matrix_single`/`matrix_multiple` being absent from `MATRIX_QUESTION_TYPES`, but no such dependencies existed.

## Key Technical Insights
1. `MATRIX_QUESTION_TYPES` is a module-level `frozenset` in `question_service.py` (line 381) used as the single source of truth for which question types support subquestions. Any new matrix-family type must be added here to unlock subquestion creation.
2. The error message from the service layer (`"Subquestions can only be added to matrix question types (got '...')"`) is surfaced directly as a 422 response, which makes this class of omission easy to diagnose from API responses alone.
3. `matrix_single` and `matrix_multiple` are valid question types accepted by the question creation endpoint but were never registered as matrix types in the subquestion gating logic — a classic "added a type, forgot to update a guard" gap.

## Reusable Patterns
- When adding a new member to an enum-like set (`MATRIX_QUESTION_TYPES`, similar allowlists), search the codebase for all uses of the set to audit every gate that will be affected before and after.
- Parametrized regression tests (`@pytest.mark.parametrize`) are the right tool when a bug affects a family of values that should behave identically — avoids duplicating test logic per variant.
- The test helper pattern in `test_matrix_questions.py` (register+login → create survey → create group → create question → act) is the standard integration test scaffolding for this project; reuse it for any new question-related endpoint tests.

## Files to Review for Similar Tasks
- `backend/app/services/question_service.py` — `MATRIX_QUESTION_TYPES` frozenset (line 381); `create_subquestion` function for the guard logic.
- `backend/tests/test_matrix_questions.py` — full suite of matrix question integration tests; contains all relevant helpers for question/subquestion/option endpoint tests.
- `backend/app/models/` — question model to check which `question_type` values are valid at the DB/schema level when adding new types.

## Gotchas and Pitfalls
- The frozenset name `MATRIX_QUESTION_TYPES` implies it is exhaustive, but it can silently become stale whenever a new matrix-family type is introduced elsewhere. There is no compile-time or startup check enforcing parity between accepted `question_type` values and this set.
- Test emails must be unique per test function. The parametrized test here uses `f"matrix_sq_{question_type}@example.com"` to derive unique emails from the parameter value — follow this convention to avoid collisions between parametrized cases.
- The subquestion creation endpoint lives at `/api/v1/surveys/{survey_id}/questions/{question_id}/subquestions` (not nested under a group), which differs from question creation (`/surveys/{id}/groups/{id}/questions`). Keep this URL shape in mind when writing or debugging tests.
```
