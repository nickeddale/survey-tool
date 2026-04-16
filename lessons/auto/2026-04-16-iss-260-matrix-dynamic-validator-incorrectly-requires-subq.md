---
date: "2026-04-16"
ticket_id: "ISS-260"
ticket_title: "Matrix Dynamic validator incorrectly requires subquestions, blocking settings save"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "documentation", "config"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-260"
ticket_title: "Matrix Dynamic validator incorrectly requires subquestions, blocking settings save"
categories: ["validation", "matrix-questions", "bug-fix", "backend"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/validators/matrix_validators.py"
  - "backend/tests/test_matrix_validators.py"
---

# Lessons Learned: Matrix Dynamic validator incorrectly requires subquestions, blocking settings save

## What Worked Well
- The root cause was precisely identified from the ticket description — a single incorrect guard clause in the validator.
- The fix was surgical: removing 4 lines and updating a docstring, with no risk of side effects.
- The test name was updated to reflect the corrected expectation (`_raises` → `_valid`), keeping the test suite semantically accurate.
- The implementation plan correctly distinguished matrix_dynamic's data model from other matrix types before touching any code.

## What Was Challenging
- Nothing significant — the fix was straightforward once the matrix_dynamic data model was understood.
- The subtle challenge was recognising that the same validator file handles multiple matrix question types with meaningfully different semantics.

## Key Technical Insights
1. `matrix_dynamic` and `matrix_single`/`matrix_multiple`/`matrix_dropdown` use different data structures: dynamic uses `answer_options` as column templates with user-added rows at response time, while the others use `subquestions` as fixed row definitions.
2. A validator shared across question types must branch on question type before applying structural requirements — a check valid for one type can be completely wrong for another.
3. ISS-258 (key name fix) and ISS-254 (min/max constraints) were both silently broken by this validator error — a single incorrect guard can mask multiple downstream bugs.
4. When a PATCH endpoint returns 422 on every request regardless of payload, suspect the config/settings validator running before the update is applied.

## Reusable Patterns
- When a settings PATCH always returns 422, check whether the validator is asserting structural requirements (subquestions, answer_options) that may not apply to the specific question type being updated.
- For question-type validators that share a function signature, add an explicit type-dispatch block at the top and document which fields each type uses.
- Rename tests when their expectation inverts (e.g., `_raises` → `_valid`) rather than just changing the assertion body — test names are documentation.

## Files to Review for Similar Tasks
- `backend/app/services/validators/matrix_validators.py` — contains validators for all matrix question subtypes; each subtype has different required/optional field semantics.
- `backend/tests/test_matrix_validators.py` — covers all matrix validator permutations; a good reference for how each subtype is tested.

## Gotchas and Pitfalls
- Do not assume that because one matrix type requires subquestions, all matrix types do — `matrix_dynamic` is the exception.
- Docstrings in the validator incorrectly described subquestions as "row templates" for `matrix_dynamic`; always verify docstring accuracy when fixing a logic error, as misleading docs can perpetuate the same mistake.
- Fixing a key name or constraint issue in `matrix_dynamic` settings will have no effect if the validator blocks all PATCH requests first — always check the full validation chain when a settings change appears to not persist.
```
