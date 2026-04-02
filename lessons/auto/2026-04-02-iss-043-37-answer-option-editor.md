---
date: "2026-04-02"
ticket_id: "ISS-043"
ticket_title: "3.7: Answer Option Editor"
categories: ["testing", "api", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-043"
ticket_title: "3.7: Answer Option Editor"
categories: ["react-components", "drag-and-drop", "optimistic-updates", "form-editing", "survey-builder"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/survey-builder/AnswerOptionsEditor.tsx"
  - "frontend/src/components/survey-builder/__tests__/AnswerOptionsEditor.test.tsx"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/mocks/handlers.ts"
---

# Lessons Learned: 3.7: Answer Option Editor

## What Worked Well
- Extracting a self-contained `SortableOptionRow` sub-component kept `AnswerOptionsEditor` focused on orchestration logic; the row handled its own DnD wiring cleanly
- Reusing the Zustand `undo()` pattern (already established for question reordering) gave consistent rollback behavior across all four mutation types (add, update, delete, reorder) without extra plumbing
- Using `defaultValue` (uncontrolled) for the title and assessment inputs and saving only on `onBlur` avoided unnecessary API calls on every keystroke while keeping the UX snappy
- `data-testid` attributes on every interactive element made the test suite straightforward to write and read
- Mocking `@dnd-kit/core` and `@dnd-kit/sortable` completely in tests prevented JSDOM pointer-event errors that DnD libraries reliably trigger, following the pattern established in ISS-041

## What Was Challenging
- The optimistic "add" flow is more complex than update/delete because the temporary `optimistic-{timestamp}` ID must be swapped out for the real server-assigned ID; this required a `removeOption` + `addOption` pair rather than a single `updateOption`, making the undo path slightly fragile if the store snapshot captured both interim states
- MSW handler ordering matters: the `PATCH .../options/reorder` route must be registered **before** `PATCH .../options/:optionId` to avoid the generic handler consuming reorder requests (`:optionId` would match the literal string `reorder`)
- `image_url` is not stored in the local Zustand state (no field on `AnswerOptionResponse` for it), so `handleImageUrlChange` calls `updateOption(groupId, questionId, optionId, {})` as a no-op optimistic update — this is a minor inconsistency that could confuse future maintainers
- The `useRef` trick (`optionsRef.current = options`) is needed in `handleDragEnd` to avoid a stale-closure capture of the `options` prop; this is non-obvious and should be documented where it appears

## Key Technical Insights
1. **MSW route registration order is significant for overlapping patterns**: always register more-specific paths (e.g., `.../options/reorder`) before parameterised ones (`.../options/:optionId`), or MSW will match the wrong handler
2. **Optimistic ID replacement requires two store mutations**: `removeOption(optimisticId)` + `addOption(realOption)` is the correct approach; attempting to patch the ID field via `updateOption` does not work if the store uses ID-keyed lookups
3. **`defaultValue` vs `value` for save-on-blur patterns**: uncontrolled inputs with `defaultValue` are the right choice here — controlled inputs would require syncing every keystroke back to the store, which creates feedback loops with optimistic updates
4. **`useSortable({ disabled: readOnly })`** cleanly disables DnD on the row without conditional hook calls, which would violate the rules of hooks

## Reusable Patterns
- **Optimistic mutation template**: `storeAction(...)` → `await apiCall(...)` → `catch { undo() }` — used identically for title, assessment value, delete, and reorder; copy this pattern for any future auto-saved field
- **DnD mock for Vitest/JSDOM**: mock `DndContext` and `SortableContext` as pass-through fragments, mock `useSortable` returning static shape, keep `arrayMove` from the real module — avoids pointer-event crashes in all future DnD component tests
- **`optionsRef.current = options` stale-closure guard**: assign the prop to a ref at render-time and read from `ref.current` inside `useCallback` handlers that depend on the latest prop value
- **Inline confirmation panel** (not a modal dialog): render a bordered `role="dialog"` div inline beneath the list header instead of a portal modal; lower complexity, easy to test, no focus-trap needed for simple confirm/cancel

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/AnswerOptionsEditor.tsx` — full implementation reference for optimistic CRUD with DnD on a sub-resource list
- `frontend/src/components/survey-builder/__tests__/AnswerOptionsEditor.test.tsx` — reference for mocking DnD libs and testing optimistic undo scenarios
- `frontend/src/mocks/handlers.ts` — shows the required ordering of overlapping MSW PATCH routes for options endpoints
- `frontend/src/components/survey/GroupPanel.tsx` — prior DnD pattern to compare against (question-level DnD)
- `frontend/src/store/builderStore.ts` — `addOption`, `removeOption`, `updateOption`, `reorderOptions`, `undo` actions

## Gotchas and Pitfalls
- **MSW handler ordering**: `PATCH .../options/reorder` MUST come before `PATCH .../options/:optionId` in the handlers array — reversing them silently routes reorder requests to the single-option update handler
- **`image_url` is not in `AnswerOptionResponse`**: the type doesn't include it, so image URL changes are fire-and-forget to the API with no local state update; if the type is extended in future, `handleImageUrlChange` must be updated to call `updateOption` with the field
- **Optimistic add undo edge case**: the `undo()` snapshot is taken before the optimistic `addOption`; if the API succeeds but `removeOption` + `addOption` (ID swap) fails mid-way, the store could hold the real option but the undo stack points back to pre-add state — prefer replacing the optimistic option in a single atomic store action in future
- **Assessment value NaN guard**: the `onBlur` handler skips the API call if `parseFloat` returns `NaN`, but does not reset the input to its previous value; a user who clears the field and tabs away will see the old `defaultValue` still displayed (inputs don't re-render on `options` prop change when using `defaultValue`)
- **`readOnly` prop must be threaded through to `SortableOptionRow`**: the parent `AnswerOptionsEditor` does not render controls when `readOnly`, but `useSortable({ disabled: readOnly })` inside the row is also necessary to prevent keyboard DnD on read-only rows
```
