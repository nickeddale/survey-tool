---
date: "2026-04-16"
ticket_id: "ISS-254"
ticket_title: "Matrix Dynamic: min/max row count constraints not enforced"
categories: ["frontend", "ui-constraints", "accessibility", "form-validation"]
outcome: "success"
complexity: "low"
files_modified: []
---

# Lessons Learned: Matrix Dynamic: min/max row count constraints not enforced

## What Worked Well
- The constraint logic (`canAddRow`, `canRemoveRow`) was already correctly computed in the component — only the rendering strategy needed to change.
- The implementation plan accurately identified the root cause (conditional rendering vs. disabled attribute) before any code was written, making the fix surgical.
- Using `disabled={!canAddRow}` and `disabled={!canRemoveRow}` on HTML `<button>` elements naturally prevents click events from firing, eliminating the need for defensive guards in the click handlers (though the guards remain as a safety net).
- Tailwind utility classes (`opacity-50 cursor-not-allowed`) provided a clean visual affordance for the disabled state without custom CSS.
- The test suite was written alongside the fix and covers all boundary conditions: at min, at max, below min, below max, and the unlimited (`null`) case.

## What Was Challenging
- Distinguishing "button not rendered" from "button disabled" — the original approach hid buttons at limits, which is functionally correct but violates the ticket's expected UX (visible but inactive).
- The Remove button is rendered per-row inside a `map()`, so `disabled` state must be derived from a single shared `canRemoveRow` boolean — there is no per-row minimum concept.

## Key Technical Insights
1. **Conditional rendering vs. disabled attribute**: Hiding a button (`{condition && <button>}`) prevents action but removes the affordance entirely. Using `disabled` keeps the button visible, communicates the constraint to the user, and is the standard HTML pattern for form constraints.
2. **`disabled` on `<button>` suppresses click events natively**: No need to check `canAddRow` inside `handleAddRow` when the button is properly disabled, though defensive checks are harmless and useful as a fallback (e.g., if the button is ever invoked programmatically).
3. **Shared disabled state for per-row buttons**: All Remove buttons share the same `canRemoveRow` value because the minimum applies to the total row count, not to any individual row. This means all Remove buttons disable simultaneously at the floor.
4. **`null` as "unlimited"**: `max_row_count: null` means no upper bound. The `canAddRow` check must handle `null` explicitly — `maxRowCount === null || rows.length < maxRowCount` — to avoid a falsy-null bug that would disable Add Row when no max is configured.

## Reusable Patterns
- **Constraint-driven button disabling pattern**: Compute boolean flags (`canDoX`) from settings and current state at the top of the component, then pass `disabled={!canDoX}` to buttons with matching Tailwind classes for visual feedback.
- **Tailwind disabled styling**: `className={canDoX ? 'text-primary' : 'text-muted-foreground cursor-not-allowed opacity-50'}` is a reusable pattern for visually indicating disabled interactive elements.
- **Test structure for bounded UI controls**: Test at boundary (disabled), just inside boundary (enabled), and the unlimited/default case — three test cases cover the full constraint surface for any min/max-bounded control.

## Files to Review for Similar Tasks
- `frontend/src/components/question-inputs/MatrixDynamicInput.tsx` — canonical example of disabled button pattern with `canAddRow`/`canRemoveRow`.
- `frontend/src/components/question-inputs/__tests__/MatrixDynamicInput.test.tsx` — reference test structure for boundary condition coverage on dynamic row controls.
- `frontend/src/types/questionSettings.ts` — defines `MatrixDynamicSettings` including `min_row_count`, `max_row_count`, and `row_count`; check here when adding new constraint settings.

## Gotchas and Pitfalls
- **`null` vs `0` for max_row_count**: `null` means unlimited; `0` would mean no rows allowed. Guard the `canAddRow` check against `null` explicitly — do not use a falsy check (`!maxRowCount`) as that would incorrectly treat `0` and `null` the same way.
- **Default values matter**: `min_row_count` defaults to `0` (not `1`). Without this default, a question with no explicit `min_row_count` setting would block all row removal. Verify defaults in `getDefaultSettings` match expected UX.
- **Internal state initialization**: `rows` is initialized from `value` prop only once (via `useState` initializer). If the parent changes `value` after mount, internal state does not update — this is intentional for performance but means tests must pass the correct initial `value`.
- **Remove buttons only exist when rows exist**: If the table has zero rows, no Remove button renders at all — this is not a bug, and tests should assert `queryByTestId` returns `null` in that case rather than expecting a disabled button.