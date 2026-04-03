---
date: "2026-04-03"
ticket_id: "ISS-065"
ticket_title: "4.9: Frontend — Matrix Input Components"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-03"
ticket_id: "ISS-065"
ticket_title: "4.9: Frontend — Matrix Input Components"
categories: ["react", "components", "tables", "forms", "testing"]
outcome: "success"
complexity: "high"
files_modified:
  - "frontend/src/components/question-inputs/MatrixInput.tsx"
  - "frontend/src/components/question-inputs/MatrixDropdownInput.tsx"
  - "frontend/src/components/question-inputs/MatrixDynamicInput.tsx"
  - "frontend/src/components/question-inputs/index.ts"
  - "frontend/src/components/question-inputs/__tests__/MatrixInput.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/MatrixDropdownInput.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/MatrixDynamicInput.test.tsx"
---

# Lessons Learned: 4.9: Frontend — Matrix Input Components

## What Worked Well
- Following the established touched/internalErrors/externalErrors pattern from RadioInput/CheckboxInput kept validation logic consistent and predictable across all three components
- Using `data-testid` attributes with a systematic naming convention (`matrix-{type}-{role}-{code}`) made test selectors easy to write and read without coupling to DOM structure or text content
- Placing the `onBlur` handler on the outer container `<div>` rather than individual inputs correctly captures blur events for the whole matrix via event bubbling, avoiding the need to attach handlers to every radio/select/input
- The `useMemo` pattern for `orderedSubquestions` correctly prevents re-shuffling on every render while still responding to prop changes
- Session-stable seeded shuffle (module-level `sessionSeeds` map) ensures rows stay in the same random order during a session without needing external state management
- MatrixDynamic correctly uses internal `rows` state (initialized from `value` prop) to allow cell edits to work without requiring the parent to re-render synchronously on every keystroke

## What Was Challenging
- MatrixDropdownInput diverges structurally from MatrixInput: the spec implies columns per answer option, but a single dropdown-per-row layout is more usable and avoids a very wide table. This required a judgment call that the column layout used by MatrixInput is not appropriate for the dropdown variant
- MatrixDynamicInput has a fundamentally different data model (user-added rows vs. predefined subquestions) meaning the `value` prop type is `Record<string, string>[]` (an array) rather than `Record<string, string>` (a map) — this difference is easy to get wrong when wiring up in parent components
- The shuffle helper (seeded Fisher-Yates using a linear congruential generator) was duplicated in both MatrixInput and MatrixDropdownInput. Extracting it to a shared utility was the right call but was not done — future work should consolidate this
- MatrixDynamic's validation is entirely external (no `is_all_rows_required`-style internal validation) because row constraints are structural (min/max count enforced via button visibility), not user-input based — this is a deliberate design difference but could surprise a developer expecting parity with the other two

## Key Technical Insights
1. For matrix-style components, placing `onBlur` on the wrapping `<div>` captures focus leaving any descendant input via event bubbling — this is the correct pattern for "touched" detection across compound inputs
2. Seeded randomization must be stable across re-renders: using a module-level `sessionSeeds` map keyed by question ID avoids re-shuffling when parent state changes while still producing a different order on page reload
3. The `value` prop for MatrixDynamic is used only for initialization (via `useState` lazy initializer) — subsequent changes are driven by internal state and then surfaced via `onChange`. This means the parent's `value` after initial mount is informational only; the component is semi-controlled
4. `aria-invalid` on a `<table>` is not a standard ARIA pattern but is used here consistently with the other input components (which apply it to their root element) — tests verify the attribute string values `"true"` / `"false"` because React serializes boolean attributes as strings on DOM elements
5. Row index keys (`key={rowIdx}`) in MatrixDynamic are fragile when rows are removed from the middle — a stable UUID per row would be more correct but adds complexity; the current approach is acceptable for short user-edited lists

## Reusable Patterns
- **Seeded shuffle utility**: `seededRandom` + `shuffleWithSeed` + `getSessionSeed` — should be extracted to `src/utils/shuffle.ts` and shared across all three matrix components and any future components needing deterministic-per-session randomization
- **touched/internalErrors pattern**: `const displayErrors = externalErrors ?? (touched ? internalErrors : [])` — standard across all input components; always prefer external errors, gate internal errors on touched state
- **Overflow scroll wrapper**: `<div className="overflow-x-auto">` wrapping `<table>` is the standard responsive table pattern used here; reuse for any tabular input
- **Error list markup**: `<ul id={errorId} role="alert" aria-live="assertive" data-testid="...-errors">` with `<li>` children — consistent error display pattern across all components
- **`data-testid` naming for tables**: `{component}-col-{code}`, `{component}-row-{code}`, `{component}-cell-{sqCode}-{optCode}` gives precise targeting without brittle text matching

## Files to Review for Similar Tasks
- `frontend/src/components/question-inputs/MatrixInput.tsx` — reference for radio-based matrix with full feature set (alternate_rows, randomize_rows, is_all_rows_required)
- `frontend/src/components/question-inputs/MatrixDynamicInput.tsx` — reference for user-editable dynamic rows with Add/Remove constraints
- `frontend/src/components/question-inputs/__tests__/MatrixInput.test.tsx` — most comprehensive matrix test file; shows all test categories including accessibility, blur-triggered validation, and external error override
- `frontend/src/components/question-inputs/RadioInput.tsx` — base pattern this ticket followed for props interface, CSS classes, and validation structure
- `frontend/src/types/questionSettings.ts` — source of truth for MatrixSettings, MatrixDropdownSettings, MatrixDynamicSettings interfaces and their defaults

## Gotchas and Pitfalls
- `MatrixDropdownInput` uses a single dropdown per row (one `<select>` column), not a dropdown per cell like `MatrixInput` uses radios per cell — the two components look structurally similar in the plan but differ in their column layout
- `MatrixDynamicInput.value` is `Record<string, string>[]` (array), not `Record<string, string>` (map) — mixing these types up when wiring the component into a survey form will cause silent runtime failures
- The `sessionSeeds` object is module-level and never cleared — in tests, seeds from one test can bleed into another if the same question ID is reused across tests. Always use distinct question IDs in tests that exercise `randomize_rows`
- The Fisher-Yates shuffle helper is copy-pasted between MatrixInput and MatrixDropdownInput — if a bug is found in the shuffle logic, both files must be updated. Extract to a shared utility before adding a third consumer
- `canRemoveRow` is based on `rows.length > minRowCount` (strictly greater) — a `min_row_count: 0` with `rows.length: 0` correctly hides the Remove button (no rows to remove), but a `min_row_count: 1` with `rows.length: 1` also hides it. Verify the exact boundary behavior when writing tests for edge cases
- `MatrixDynamic` does not have `is_all_rows_required` validation — if the backend requires a minimum number of filled rows, that must be enforced via the external `errors` prop passed down from the parent form submission handler
```
