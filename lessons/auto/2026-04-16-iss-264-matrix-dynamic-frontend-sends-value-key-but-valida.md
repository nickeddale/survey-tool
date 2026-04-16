---
date: "2026-04-16"
ticket_id: "ISS-264"
ticket_title: "Matrix dynamic: frontend sends 'value' key but validator expects 'values' key"
categories: ["testing", "api", "ui", "bug-fix", "feature", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-264"
ticket_title: "Matrix dynamic: frontend sends 'value' key but validator expects 'values' key"
categories: ["bug-fix", "validation", "api-contract"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/services/validators/matrix_validators.py", "backend/tests/test_matrix_validators.py"]
---

# Lessons Learned: Matrix dynamic: frontend sends 'value' key but validator expects 'values' key

## What Worked Well
- The root cause was immediately identifiable from the error message — the field name mismatch was explicit in the 422 response body.
- The implementation plan was straightforward: a one-line fix to align the backend with the established convention used by all other question types.
- Existing test coverage made it easy to verify the fix by updating test payloads to match the corrected key.

## What Was Challenging
- The `values` key was likely introduced as a reasonable plural name for a list field, making it a non-obvious deviation from convention — nothing in the naming screamed "wrong" until compared against other validators.
- Identifying all tests that needed updating required a full scan of `test_matrix_validators.py` to avoid leaving stale `values`-keyed test cases that would pass against old behavior.

## Key Technical Insights
1. All question type validators in this codebase use the `value` key (singular) for the answer payload — `matrix_dynamic` was an outlier using `values` (plural), causing a silent contract mismatch between frontend and backend.
2. Frontend answer payloads follow a consistent shape: `{"value": <answer_data>}` regardless of whether the data is a scalar, list, or list-of-objects. Backend validators must mirror this convention.
3. A 422 with a message referencing a missing field (e.g., `'values' must be a list`) is a strong signal of a key name mismatch rather than a logic error — check the frontend payload shape first.

## Reusable Patterns
- When adding a new question type validator, always check an existing validator (e.g., `validate_matrix_rating_answer`) to confirm the expected key name before reading from `answer.get(...)`.
- Search for `answer.get(` across all validators periodically to audit for key name consistency.
- When a specific field name is referenced in an error message and it 422s, grep the frontend payload construction to confirm the key name matches before assuming the data is missing.

## Files to Review for Similar Tasks
- `backend/app/services/validators/matrix_validators.py` — all `validate_matrix_*` functions; verify each reads `answer.get('value')`.
- `backend/app/services/validators/scalar_validators.py` — reference implementation for the `value` key convention.
- `backend/tests/test_matrix_validators.py` — ensure all test payloads use `{'value': ...}` after this fix.
- `frontend/src/components/question-inputs/MatrixDynamicInput.tsx` — source of truth for how `matrix_dynamic` answers are constructed before submission.

## Gotchas and Pitfalls
- Using a semantically appropriate plural name (`values`) for a list field feels natural but breaks the uniform `value` contract — always defer to the established convention over semantic accuracy.
- Updating tests to use the new key without re-reading the validator logic risks masking a partial fix — confirm the implementation change and the test change together.
- Other `matrix_*` validators (e.g., `matrix_rating`, `matrix_checkbox`) may have been written at the same time as `matrix_dynamic` and could share the same `values` bug — worth auditing all of them when fixing one.
```
