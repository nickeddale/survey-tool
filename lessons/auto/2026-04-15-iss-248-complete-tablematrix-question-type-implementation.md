---
date: "2026-04-15"
ticket_id: "ISS-248"
ticket_title: "Complete table/matrix question type implementation"
categories: ["validation", "frontend-components", "testing", "data-modeling"]
outcome: "success"
complexity: "high"
files_modified: []
---

# Lessons Learned: Complete table/matrix question type implementation

## What Worked Well
- Starting with a thorough read of existing validators before writing new ones prevented duplicate logic and ensured consistent error message patterns across matrix subtypes.
- The three-tier complexity model (simple radio / multi-select / heterogeneous-cell) mapped cleanly onto the five question types, giving a mental framework that reduced ambiguity during implementation.
- Factoring shared logic (row presence checks, `is_all_rows_required` enforcement, column_types lookup) into helper functions kept the new `validate_matrix_multiple_answer` and updated `validate_matrix_dropdown_answer` lean and consistent.
- Fisher-Yates shuffle with session-stable seeding (used in `MatrixInput.tsx` and copied to `MatrixMultipleInput.tsx`) kept row randomization deterministic within a session without needing server-side state.
- A single `MatrixPreview.tsx` component handling all five subtypes with conditional rendering kept the builder surface area small.

## What Was Challenging
- The response shape mismatch between `matrix_dropdown`'s old flat shape (`{sq_code: opt_code}`) and the new nested shape (`{row_code: {col_code: cell_value}}`) required careful backward-compatibility reasoning — existing saved responses in the flat format had to be considered even though migration was out of scope.
- Per-column cell type validation in `validate_matrix_dropdown_answer` required cross-referencing question settings at validation time, which made the validator signature more complex than other types (settings must be passed alongside the answer).
- The `transpose` feature touches rendering in three separate places (MatrixInput, MatrixPreview, MatrixDropdownInput) with subtly different table construction logic — easy to introduce inconsistencies.
- `matrix_single` vs `matrix` disambiguation required tracing the full validator dispatch chain in `__init__.py` to confirm they share the same validator, not add a redundant one.

## Key Technical Insights
1. **Response shape is the source of truth for validator design.** Before writing any validation code, lock down the exact JSON shape for each subtype: `{row: col}` for radio, `{row: [col1, col2]}` for multiple, `{row: {col: val}}` for dropdown, `[{col: val}]` for dynamic. Every ambiguity downstream traces back to an unresolved shape decision.
2. **Cell-level type validation requires the settings object.** Unlike scalar validators that only need the raw answer, matrix_dropdown validators must receive both the answer and the question's `column_types` setting to know what type to validate each cell against. The validator dispatch in `__init__.py` must pass settings through for these types.
3. **`is_all_rows_required` must be enforced in both frontend (UX) and backend (integrity).** Frontend validation on blur gives immediate feedback; backend validation is the authoritative gate. Both need the same row-completeness logic.
4. **TypeScript interface hierarchy matters.** `MatrixDropdownSettings` extends `MatrixSettings`, and `MatrixDynamicSettings` extends `MatrixDropdownSettings`. Adding `transpose` only to `MatrixSettings` automatically propagates it to all subtypes, but adding it only to a subtype interface breaks preview components that accept the base type.
5. **`matrix_single` is intentionally identical to `matrix` at the validator level.** The distinction is semantic (explicit single-select intent vs. default), not behavioral. Both dispatch to `validate_matrix_answer`. No separate validator is needed.

## Reusable Patterns
- **Fisher-Yates shuffle with a seed derived from `question.id`** — use this pattern in any component that needs stable-per-session row/option randomization without server state.
- **`PreviewCell` sub-component pattern** — when a grid has heterogeneous cell types, extract a `<PreviewCell type={colType} />` component that switches on type internally. Keeps the outer grid loop clean.
- **Validator dispatch with settings passthrough** — for question types whose answer validity depends on settings (e.g., column_types), the `_ANSWER_VALIDATORS` registry entry should accept `(answer, question_config)` not just `(answer)`. Standardize this signature across all complex validators.
- **`alternate_rows` via CSS class on `<tr>`** — apply a conditional class like `bg-gray-50` on odd rows rather than inline styles; keeps styling in Tailwind and testable via `classList`.

## Files to Review for Similar Tasks
- `backend/app/services/validators/__init__.py` — validator dispatch registry; any new question type or shape change starts here.
- `backend/app/services/validators/matrix_validators.py` — canonical reference for multi-field, settings-dependent validation patterns.
- `frontend/src/types/questionSettings.ts` — interface hierarchy for all question settings; add new settings here first before touching components.
- `frontend/src/components/question-inputs/MatrixMultipleInput.tsx` — reference implementation of a checkbox-grid input with randomization, transpose, and validation.
- `frontend/src/components/survey-builder/previews/MatrixPreview.tsx` — shows how to branch rendering for multiple subtypes of the same question family in a single component.

## Gotchas and Pitfalls
- **`default` Jinja-style thinking doesn't apply here, but Python `None` vs missing key does.** When reading `column_types` from settings, always use `.get(col_code)` with a fallback default cell type (e.g., `"dropdown"`), not direct dict access — missing column type entries are valid and should fall back gracefully.
- **Do not reuse `matrix_dropdown` flat-shape tests as the baseline for nested-shape tests.** The old flat shape tests will pass against the new validator if the guard logic is too permissive. Write explicit rejection tests for the old shape to confirm the migration cut.
- **Transpose swap must be applied before randomize_rows.** Randomizing after transposing operates on columns (original rows), not the display rows. Apply `randomize_rows` to the source subquestion list before any transpose layout computation.
- **Registering a new component in `index.ts` is required but easy to forget.** If `MatrixMultipleInput` is built but not exported from the barrel, the SurveyForm dispatcher silently falls through to a default or undefined renderer with no error.
- **Backend `asyncio_mode = "auto"` means no `@pytest.mark.asyncio` decorator needed** — adding it anyway causes a pytest warning that can mask real failures in CI output.