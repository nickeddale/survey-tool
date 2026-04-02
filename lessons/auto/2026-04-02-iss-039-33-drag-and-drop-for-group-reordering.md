---
date: "2026-04-02"
ticket_id: "ISS-039"
ticket_title: "3.3: Drag-and-Drop for Group Reordering"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-039"
ticket_title: "3.3: Drag-and-Drop for Group Reordering"
categories: ["drag-and-drop", "dnd-kit", "react", "accessibility", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
  - "frontend/src/store/builderStore.ts"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/components/survey/__tests__/dnd.test.tsx"
---

# Lessons Learned: 3.3: Drag-and-Drop for Group Reordering

## What Worked Well
- @dnd-kit/core + @dnd-kit/sortable proved to be a clean abstraction: `useSortable` encapsulates transform, transition, isDragging, listeners, and attributes in a single hook call, keeping GroupPanel concerns localized.
- Separating drag-handle rendering from the sortable wrapper kept the GroupPanel markup clear — passing `listeners` and `attributes` only to the handle element (not the whole panel) prevented accidental drags on interactive children.
- The `arrayMove` utility from @dnd-kit/sortable made the reorder logic in `handleDragEnd` trivial to implement correctly.
- Optimistic updates in the builder store (reorder immediately, undo on API failure) gave a snappy UX without waiting for the network round-trip.

## What Was Challenging
- JSDOM does not implement Pointer Events, so testing actual drag sequences (pointerdown → pointermove → pointerup) is not feasible. This forced a mocking strategy at the @dnd-kit boundary rather than simulating real gestures.
- DragOverlay requires the dragged item to be rendered outside the SortableContext portal, which means maintaining an `activeGroup` state derived from `activeId` and re-rendering a simplified (or full) GroupPanel inside `DragOverlay` — easy to forget that the overlay clone is not connected to any sortable context.
- KeyboardSensor requires a `coordinateGetter` (usually `sortableKeyboardCoordinates` from @dnd-kit/sortable) to function correctly; omitting it silently disables keyboard reordering.
- The `activationConstraint` on PointerSensor (distance: 8) is important to prevent accidental drags when users click buttons inside the group panel.

## Key Technical Insights
1. `DragOverlay` renders into a portal at the document body — any styles (shadows, opacity, width) must be self-contained or passed via inline style, since the overlay is outside the normal component tree and may not inherit scoped CSS.
2. `useSortable` returns `isDragging` which should be used to apply a placeholder/ghost style to the original item's position while the overlay is active; failing to do so causes a visual "double" of the item.
3. Both `PointerSensor` and `KeyboardSensor` should be registered in `useSensors`; using only `PointerSensor` fails WCAG keyboard accessibility requirements for drag-and-drop interactions.
4. The PATCH `/surveys/{id}/groups/reorder` endpoint should receive the full ordered array of `group_id`s (not just the two swapped items), so `arrayMove` must be applied to the full groups array before extracting IDs for the API payload.
5. When the `handleDragEnd` fires with `over === null` (dropped outside any droppable), the reorder should be aborted — always guard against a null `over` before calling `arrayMove`.

## Reusable Patterns
- **Optimistic reorder with undo**: call `reorderGroups(newOrder)` in the store immediately on drop, capture the previous order before mutation, and restore it if the API call rejects.
- **Drag handle pattern**: pass `{...listeners, ...attributes}` only to a dedicated `<button aria-label="Drag to reorder">` child rather than the container, so clicks elsewhere are not intercepted.
- **Mock @dnd-kit in Vitest**: mock the module at the test file level to expose a `simulateDragEnd(activeId, overId)` helper that directly invokes the `onDragEnd` callback registered on `DndContext`, bypassing JSDOM pointer event limitations.
- **sortableKeyboardCoordinates**: always import and pass this as `coordinateGetter` to `KeyboardSensor` for correct keyboard-driven reordering in sorted lists.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyBuilderPage.tsx` — DndContext setup, sensors, handleDragEnd, DragOverlay, activeId state management
- `frontend/src/components/survey-builder/GroupPanel.tsx` — useSortable integration, drag handle markup, isDragging ghost style, keyboard attributes
- `frontend/src/store/builderStore.ts` — reorderGroups() action, optimistic update + rollback pattern
- `frontend/src/components/survey/__tests__/dnd.test.tsx` — @dnd-kit mock strategy, reorderGroups store test, API call assertion

## Gotchas and Pitfalls
- Forgetting `transition` from `useSortable` on the panel's style causes other items to snap rather than animate when a group is dragged past them.
- Rendering the full `GroupPanel` inside `DragOverlay` without stripping its own `useSortable` context causes a React error — the overlay clone must be a plain presentational render, not another sortable item.
- `KeyboardSensor` with no `coordinateGetter` will silently fail to move items; always pair it with `sortableKeyboardCoordinates`.
- `sort_order` values in the backend should be derived from the array index sent in the PATCH payload, not from client-computed integers — avoid sending explicit `sort_order` numbers and let the backend assign them from the ordered ID list.
- Tests that skip the DragOverlay render assertion will pass locally but miss the visual regression; explicitly assert `DragOverlay` content renders when `activeId` is set.
```
