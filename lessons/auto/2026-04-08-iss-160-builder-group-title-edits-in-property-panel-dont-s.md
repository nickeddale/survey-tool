---
date: "2026-04-08"
ticket_id: "ISS-160"
ticket_title: "Builder: Group title edits in property panel don't sync or persist"
categories: ["testing", "api", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-160"
ticket_title: "Builder: Group title edits in property panel don't sync or persist"
categories: ["frontend", "react", "state-management", "survey-builder"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/components/survey-builder/PropertyEditor.tsx", "frontend/src/components/survey-builder/__tests__/PropertyEditor.test.tsx"]
---

# Lessons Learned: Builder: Group title edits in property panel don't sync or persist

## What Worked Well
- The root cause was immediately obvious from the bug description: `defaultValue` instead of controlled inputs with `onChange` handlers
- The builderStore already had a working `updateGroup` action with undo/redo and dirty-flag API sync — no new store logic was needed
- The fix was entirely additive (wiring up existing functionality), reducing risk of regressions

## What Was Challenging
- Nothing significantly challenging; this was a straightforward wiring bug

## Key Technical Insights
1. Using `defaultValue` on an input in React makes it uncontrolled — the DOM manages the value and no React state is updated on change. Any store dispatch requires an explicit `onChange` handler regardless of whether `defaultValue` or `value` is used.
2. In the builder, `updateGroup` already integrates with `pushUndo` and the dirty flag, so wiring a new field to it gives undo history and API persistence for free.
3. The pattern for adding a new editable field in PropertyEditor is: (a) select the store action via `useBuilderStore`, (b) add `onChange` calling that action — no changes to the store or API layer are required if the entity update action already exists.

## Reusable Patterns
- **Controlled input wiring pattern**: `<input value={selectedGroup.title} onChange={e => updateGroup(selectedGroup.id, { title: e.target.value })} />` — use `value` (not `defaultValue`) so React controls the field and dispatches are guaranteed.
- **Store action reuse**: Before adding new store logic for a UI field, check whether an existing entity-level update action (e.g., `updateGroup`, `updateQuestion`) already covers the field — it likely does and already handles undo/dirty state.
- **Test pattern**: Mount PropertyEditor with a mocked store providing a selected group, fire a `change` event on the target input, assert the mocked action was called with the correct id and partial update object.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/PropertyEditor.tsx` — all entity property inputs; audit for any remaining `defaultValue` usage without `onChange`
- `frontend/src/store/builderStore.ts` — `updateGroup`, `updateQuestion`, `pushUndo`, dirty-flag/auto-save logic
- `frontend/src/components/survey-builder/__tests__/PropertyEditor.test.tsx` — reference test structure for PropertyEditor unit tests

## Gotchas and Pitfalls
- `defaultValue` silently swallows user input from React's perspective — no error is thrown, the field appears to work visually, but nothing propagates to the store. Always audit new editable fields to confirm they use controlled `value` + `onChange`.
- If a group or question field appears to "work" on first render but resets on navigation or reload, the first thing to check is whether the input is uncontrolled (`defaultValue`) with no `onChange`.
- Do not duplicate the auto-save/API sync wiring — `updateGroup` already marks the store dirty and triggers the debounced save. Calling any additional save logic from the component would cause double-saves.
```
