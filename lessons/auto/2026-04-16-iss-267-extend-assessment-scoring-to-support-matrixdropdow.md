---
date: "2026-04-16"
ticket_id: "ISS-267"
ticket_title: "Extend assessment scoring to support matrix_dropdown and matrix_dynamic answers"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-267"
ticket_title: "Extend assessment scoring to support matrix_dropdown and matrix_dynamic answers"
categories: ["assessment-scoring", "matrix-questions", "backend", "fastapi"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/assessment_service.py"
  - "backend/tests/test_assessments.py"
---

# Lessons Learned: Extend assessment scoring to support matrix_dropdown and matrix_dynamic answers

## What Worked Well
- Reading `assessment_service.py` before writing any code confirmed whether `question_settings_map` already existed from ISS-266, preventing duplicate infrastructure
- Defining `SCORABLE_CELL_TYPES = {'dropdown', 'radio', 'rating', 'checkbox'}` as a module-level constant kept both helpers consistent and made the intent explicit
- The dispatch logic pattern established in ISS-266 for `matrix_single`/`matrix_multiple` translated cleanly to the two new types with minimal friction
- Defensive settings access (`settings_map.get(question_id, {}).get('column_types', {})`) prevented silent failures on questions created before the `column_types` field existed

## What Was Challenging
- `matrix_dropdown` and `matrix_dynamic` have structurally different answer formats (subq→column dict vs. list of row dicts), requiring two distinct helper functions rather than a single generalized one
- Distinguishing correct text-column behavior (score=0) from a silent bug caused by column name casing mismatches is impossible without carefully verifying that `column_types` keys exactly match the answer dict keys in test fixtures
- `matrix_dynamic` has no subquestion IDs by design, so the subquestion scope test returning 0 could be a false pass if the helper incorrectly attempted subquestion resolution and simply found no matches

## Key Technical Insights
1. **Column name casing must be consistent**: `column_types` keys in question settings must exactly match the column name keys in the answer dict. Any mismatch silently scores 0, making a bug indistinguishable from correct text-column filtering.
2. **matrix_dynamic always returns `sq_id=None`**: Rows are user-defined with no subquestion codes. Never attempt to resolve them against `subquestion_id_map` — doing so would cause the subquestion scope test to pass for the wrong reason (no crash rather than correct zero-return logic).
3. **`question.settings` may be `None`**: Questions created before the settings field was added will have `None` rather than an empty dict. Always guard with `or {}`: `(question.settings or {})` when building the settings map.
4. **Import smoke-test before Docker pytest**: Running `python -c 'from app.services.assessment_service import compute_score'` inside the container surfaces broken imports as clean tracebacks, whereas pytest surfaces them as cryptic collection errors.
5. **`settings_map` reuse from ISS-266**: The `question_settings_map` built in ISS-266 should be reused without duplication. Always verify its existence by reading the file — never assume.

## Reusable Patterns
- Defensive column type lookup: `col_type = column_types.get(col_name, '')` before checking against the scorable set — handles columns present in the answer but absent from `column_types` (e.g., deleted columns)
- Settings access chain: `settings_map.get(question_id, {}).get('column_types', {}) or {}` — guards against missing question, missing key, and `None` value in one expression
- Scorable set membership: `if col_type in SCORABLE_CELL_TYPES` — prefer a module-level frozenset constant over inline literals for consistency across helpers
- Subquestion scope guard for dynamic rows: early-return 0 when assessment scope is `subquestion` and question type is `matrix_dynamic`, since dynamic rows never have subquestion IDs to match

## Files to Review for Similar Tasks
- `backend/app/services/assessment_service.py` — dispatch logic, `compute_score()`, `_extract_matrix_*` helper pattern, `question_settings_map` construction
- `backend/tests/test_assessments.py` — fixture pattern for questions with `column_types` in settings, how `subquestion_id_map` is populated, existing `matrix_single`/`matrix_multiple` tests as reference for new matrix test structure

## Gotchas and Pitfalls
- **Silent score=0 on column name mismatch**: If `column_types` keys don't exactly match answer dict keys, all columns silently fail the scorable check. Always verify fixture column names match settings keys exactly.
- **False-pass subquestion scope test**: If `_extract_matrix_dynamic_codes` mistakenly returns any `sq_id` values, the subquestion scope test may still pass (because no IDs match) without validating the intended logic — ensure `sq_id=None` is returned unconditionally.
- **`question.settings` attribute name**: Confirm the ORM attribute name (`question.settings` vs `question.question_settings`) by reading the model before implementing `question_settings_map` construction — do not assume.
- **Don't duplicate `question_settings_map`**: If ISS-266 already built it, adding a second construction loop introduces subtle bugs if the two loops use different fallback logic for `None` settings.
- **Run existing matrix tests before adding new ones**: Confirm no regressions were introduced by the dispatch logic changes before attributing test failures to the new code.
```
