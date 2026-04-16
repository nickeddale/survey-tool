---
date: "2026-04-16"
ticket_id: "ISS-263"
ticket_title: "Matrix dropdown: rating cell value sent as string instead of number, fails validation"
categories: ["testing", "database", "ui", "bug-fix", "feature", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-16"
ticket_id: "ISS-263"
ticket_title: "Matrix dropdown: rating cell value sent as string instead of number, fails validation"
categories: ["backend", "validation", "frontend-backend-contract", "matrix-questions"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/validators/matrix_validators.py"
  - "backend/tests/test_matrix_validators.py"
---

# Lessons Learned: Matrix dropdown: rating cell value sent as string instead of number, fails validation

## What Worked Well
- Fixing the boundary on the backend (accepting coercible strings) rather than changing the frontend kept the change minimal and contained to one validator function.
- The existing `_validate_cell_value` helper was well-isolated, making the rating branch easy to extend without touching other cell types.
- Tests were added in a dedicated section clearly labelled with the ticket number (`ISS-263`), making it easy to trace tests back to the originating bug.
- Comprehensive test coverage for the fix: numeric int, numeric float, string int, all string values 1–5, string float, non-numeric string rejection, and boolean rejection — covering the full input space.

## What Was Challenging
- The root cause was a silent type mismatch at the frontend/backend boundary: HTML radio button `value` attributes are always strings, so `"5"` arrives instead of `5`. This category of bug is easy to miss during initial development because it only surfaces at runtime with real form submissions.
- The fix required careful boolean guarding. In Python, `bool` is a subclass of `int`, so `isinstance(True, int)` is `True`. Without an explicit `isinstance(cell_value, bool)` check first, a boolean `True` would pass numeric validation for rating cells.

## Key Technical Insights
1. HTML `<input type="radio">` values are always strings. Any backend validator for a field populated from radio buttons must either coerce strings or explicitly accept them, regardless of the intended semantic type.
2. Python's `bool` subclasses `int` — always check `isinstance(value, bool)` before `isinstance(value, (int, float))` when booleans are not semantically valid for a numeric field.
3. The backend-side coercion approach (accept strings, validate they are numeric) is preferable to frontend conversion when: (a) the frontend pattern is consistent across many components, and (b) the backend is the system of record for data integrity.
4. Using `float(cell_value)` wrapped in a `try/except ValueError` is a clean way to validate that a string is a valid number without restricting to integer-only input.

## Reusable Patterns
- **Lenient numeric validation pattern**: For any validator accepting user-facing numeric input, use the guard sequence: `if isinstance(value, bool): reject` → `if isinstance(value, str): try float(value) except reject` → `elif not isinstance(value, (int, float)): reject`.
- **Test section labelling**: When adding tests for a specific bug fix, group them in a dedicated section comment (e.g., `# --- ISS-263 ---`) to make regression tests traceable.
- **String coercion over frontend conversion**: When a data type mismatch originates from an HTML form control (radio, select, input), fix it at the backend boundary rather than adding `.toString()` / `Number()` calls scattered across frontend components.

## Files to Review for Similar Tasks
- `backend/app/services/validators/matrix_validators.py` — `_validate_cell_value()` at line 191: the central dispatch for all matrix_dropdown cell type validation; any new cell type or type-coercion change goes here.
- `backend/tests/test_matrix_validators.py` — lines 710–768: the ISS-263 rating cell test block; use as a template for adding tests when new cell types are introduced or existing ones are changed.
- `frontend/src/components/question-inputs/MatrixDropdownInput.tsx` — the rating `onChange` handler; review if the frontend is ever refactored to send typed values, as the backend coercion would then be redundant but harmless.

## Gotchas and Pitfalls
- **Boolean subclass trap**: `isinstance(True, int)` returns `True` in Python. Always check for `bool` explicitly before checking for `int`/`float` in numeric validators. Forgetting this would allow `True` (treated as `1`) and `False` (treated as `0`) to silently pass rating validation.
- **Scope of the coercion**: The fix only coerces for `cell_type=rating`. The `number` cell type still strictly requires `int` or `float`. If `number` columns are ever exposed to similar radio/select inputs, they will need the same treatment.
- **No data mutation**: The validator accepts the string but does not rewrite it to a float in the stored answer. Downstream code reading a rating value from the database may still receive a string `"5"` if the frontend sent one. If numeric arithmetic on stored rating values is ever needed, a separate coercion step at persistence time should be added.
- **Test the boolean guard explicitly**: When modifying the `_validate_cell_value` rating branch, always include a test case for `True` and `False` — they are the most common accidental truthy/falsy values that would otherwise slip through unnoticed.
```
