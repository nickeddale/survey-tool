---
date: "2026-04-03"
ticket_id: "ISS-064"
ticket_title: "4.8: Frontend — Choice Input Components"
categories: ["testing", "database", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-064"
ticket_title: "4.8: Frontend — Choice Input Components"
categories: ["react", "testing", "accessibility", "forms", "components"]
outcome: "success"
complexity: "high"
files_modified:
  - "frontend/src/components/question-inputs/RadioInput.tsx"
  - "frontend/src/components/question-inputs/DropdownInput.tsx"
  - "frontend/src/components/question-inputs/CheckboxInput.tsx"
  - "frontend/src/components/question-inputs/index.ts"
  - "frontend/src/components/question-inputs/__tests__/RadioInput.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/DropdownInput.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/CheckboxInput.test.tsx"
---

# Lessons Learned: 4.8: Frontend — Choice Input Components

## What Worked Well
- Following the exact prop contract from `ShortTextInput` (`value`, `onChange`, `question`, `errors?`) made all three components immediately composable with the rest of the system without integration surprises.
- Using a module-level `sessionSeeds` record (keyed by `question.id`) for Fisher-Yates shuffle produced stable ordering across re-renders without needing `useRef` or `useEffect`; `useMemo` with `[question.id, randomize]` dependencies ensured the seed was consumed consistently.
- The `externalErrors ?? (touched ? internalErrors : [])` pattern cleanly separated server-driven errors (shown immediately) from user-driven validation (shown only after blur), with a single `displayErrors` variable driving all downstream rendering.
- Placing `aria-invalid` and `aria-describedby` directly on the interactive container (`radiogroup` div, `<select>`, checkbox grid div) rather than on individual inputs satisfied accessibility requirements with minimal markup.
- Keeping `__other__` as a sentinel string value (rather than a boolean flag) simplified the value model: callers receive a uniform `string | string[]` and the component handles the "Other text" state privately.
- Inline CSS grid via `style={{ gridTemplateColumns: \`repeat(${columns}, 1fr)\` }}` was directly testable with `toHaveStyle()` from `@testing-library/jest-dom`, avoiding the need for className-based column assertions that would depend on Tailwind JIT output.

## What Was Challenging
- CheckboxInput's `validate()` function needed to correctly count `__other__` as a real choice for `min/max_choices` purposes while still distinguishing it from regular option IDs. The `realCount` calculation (`selected.filter(v => v !== OTHER_VALUE).length + (hasOtherSelected ? 1 : 0)`) required careful design to avoid double-counting.
- The `min_choices` validation needed a deliberate guard (`realCount > 0`) so that an empty selection with no `is_required` flag does not incorrectly trigger the minimum error — only the `is_required` path should fire when nothing is chosen.
- `Select All` in CheckboxInput must preserve the `__other__` value in both the check-all and uncheck-all paths, requiring filtering on `OTHER_VALUE` rather than simply setting `[]` or `allOptionIds`.
- RadioInput triggers blur on the `radiogroup` container div, but since it lacks a native `blur` event the blur had to be applied to the `onBlur` prop of the `<div>` itself and tests use `fireEvent.blur` on the container testid directly.
- The searchable filter in DropdownInput filters `answer_options` to build `filteredOptions` used in `<select>`, but the `<select>` element's current `value` may reference an option that is no longer visible after filtering — the component does not reset the selection on filter change, which is correct UX but a subtle non-obvious behaviour.

## Key Technical Insights
1. **`__other__` as a value sentinel**: Representing the "Other" selection as a fixed string value in the same `string | string[]` channel (rather than a separate boolean state) keeps the parent component's value model uniform and avoids prop proliferation.
2. **Session-stable Fisher-Yates with module-level seed cache**: Storing seeds in a module-level `Record<string, number>` means the same question always shuffles identically within a session, survives re-renders, and requires no side effects — `useMemo` re-runs only when options or question id change.
3. **Blur on container, not individual inputs**: For `radiogroup` and checkbox grid, attaching `onBlur` to the container div (not each input) fires once when focus leaves the entire group, preventing premature validation on inter-group tab movement.
4. **Lazy validation via `touched` flag**: The `externalErrors ?? (touched ? internalErrors : [])` idiom means external (server) errors always override internal ones, and internal errors are suppressed until the user has interacted — a clean UX contract with no extra state.
5. **CSS grid inline style over class**: Using `style={{ gridTemplateColumns: \`repeat(${columns}, 1fr)\` }}` allows asserting exact computed style in tests via `toHaveStyle()` without needing to resolve Tailwind class names, making column tests robust and framework-agnostic.
6. **`min_choices` short-circuits on empty selection**: Validation skips `min_choices` enforcement when `realCount === 0` because that case is covered by `is_required`. This prevents confusing double-error messages ("required" + "select at least N") for an untouched field.

## Reusable Patterns
- **`makeQuestion()` + `makeSettings()` + `makeOption()` test helpers**: Each test file defines these three minimal factory functions. The pattern avoids importing a shared factory that would couple tests, while keeping setup DRY within each file.
- **`fireEvent.blur(container)` for grouped inputs**: When testing blur-triggered validation on radio/checkbox groups, fire blur on the group container testid rather than individual inputs.
- **`act(async () => { await user.click(...) })` wrapper**: All `userEvent` interactions are wrapped in `act()` to prevent React state update warnings, consistent with the project-wide pattern established in ISS-055.
- **Conditional `aria-describedby`**: Only set `aria-describedby` when errors are present (pass `undefined` otherwise) to avoid dangling references that screen readers may report as broken.
- **`role="alert" aria-live="assertive"` on `<ul>` error list**: Errors rendered in a `<ul>` with these attributes are announced immediately by screen readers, and the `id` on the list matches the `aria-describedby` on the input for bidirectional linkage.

## Files to Review for Similar Tasks
- `frontend/src/components/question-inputs/ShortTextInput.tsx` — canonical reference for the touched/internalErrors/externalErrors pattern and component structure.
- `frontend/src/components/question-inputs/RadioInput.tsx` — reference for Fisher-Yates shuffle with session-stable seed and radiogroup container blur.
- `frontend/src/components/question-inputs/CheckboxInput.tsx` — reference for multi-value array state, Select All toggle, and `min/max_choices` validation with `__other__` counting.
- `frontend/src/components/question-inputs/__tests__/ShortTextInput.test.tsx` — reference for test file structure, helper factory pattern, and act() wrapping conventions.
- `frontend/src/types/questionSettings.ts` — source of truth for `RadioSettings`, `DropdownSettings`, `CheckboxSettings` interfaces and `getDefaultSettings()`.

## Gotchas and Pitfalls
- **`aria-invalid` is a boolean attribute but rendered as a string**: `toHaveAttribute('aria-invalid', 'false')` is the correct assertion — not `'aria-invalid', false`. React renders boolean props as `"true"` / `"false"` strings on DOM elements.
- **`__other__` must be excluded from `allOptionIds` in Select All**: `allOptionIds` must only contain real option IDs, not `__other__`, otherwise `isAllSelected` would require Other to be selected before marking Select All checked.
- **Do not reset `value` on search filter change in DropdownInput**: The parent controls `value`; the search filter only restricts which `<option>` elements are visible. Resetting on filter change would lose the user's selection unexpectedly.
- **CheckboxInput blur fires on the outer wrapper `<div>`, not the grid**: The `onBlur` is on the root `data-testid={checkbox-input-${question.id}}` div, so tests must fire blur on that testid, not on `checkbox-options-grid`.
- **RadioInput blur fires on the `radiogroup` div**: Unlike CheckboxInput, the RadioInput attaches `onBlur` to the `radio-options-grid` element (which also has `role="radiogroup"`), so blur tests target that testid.
- **`min_choices` does not fire when `selected.length === 0` and `is_required` is false**: This is intentional — the guard `realCount > 0` ensures the user is not penalised for having never touched the field. Tests should assert no error appears in this case.
- **Fisher-Yates shuffle is session-stable but not test-stable across test files**: The module-level `sessionSeeds` cache persists for the lifetime of the test module. If two tests in the same file use the same question ID with `randomize: true`, they will share the same seed. Use distinct question IDs in shuffle tests to avoid order coupling between test cases.
```
