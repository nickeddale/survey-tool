---
date: "2026-04-02"
ticket_id: "ISS-039"
ticket_title: "3.3: Drag-and-Drop for Group Reordering"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-039"
ticket_title: "3.3: Drag-and-Drop for Group Reordering"
categories: ["drag-and-drop", "dnd-kit", "zustand", "optimistic-updates", "accessibility"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/components/survey/GroupPanel.tsx"
---

# Lessons Learned: 3.3: Drag-and-Drop for Group Reordering

## What Worked Well
- Prefixing draggable IDs with a namespace (`group:`) cleanly disambiguates groups from questions inside a single shared `DndContext`, avoiding id collisions and simplifying the `handleDragEnd` routing logic.
- Wrapping `GroupPanel` in a thin `SortableGroupPanel` component kept `useSortable` logic out of `GroupPanel` itself — `GroupPanel` remains a pure presentational component that simply accepts `dragListeners` and `dragAttributes` props.
- Optimistic updates via `reorderGroups()` followed by `undo()` on API failure gave instant visual feedback with safe rollback, requiring no extra loading state.
- Using a stable `groupsRef` (updated each render) inside `useCallback` handlers eliminated stale closure issues without widening dependency arrays.
- `CSS.Transform.toString(transform)` combined with the `transition` value from `useSortable` produced smooth animations with zero custom CSS.
- Including `KeyboardSensor` with `sortableKeyboardCoordinates` satisfied keyboard accessibility without extra work.

## What Was Challenging
- The single `DndContext` must handle three distinct drag scenarios (group reorder, same-group question reorder, cross-group question move). Branching logic in `handleDragEnd` grows quickly and requires careful ordering of checks.
- Cross-group question movement required two sequential API calls (`moveQuestion` then `reorderQuestions`) and a post-move snapshot of store state via `groupsRef.current` to build the correct final order.
- `SortableContext` items must use the same prefixed IDs (`group:${id}`) that `useSortable` receives, or sorting detection silently breaks.
- The `PointerSensor` `activationConstraint: { distance: 5 }` is essential — without it, every click on a draggable element triggers a drag start and suppresses click events on buttons inside the card.

## Key Technical Insights
1. **ID namespacing is mandatory in shared DndContext.** When groups and questions coexist under one `DndContext`, prefix group IDs (e.g., `group:<uuid>`) so `onDragStart`/`onDragEnd` can branch correctly without querying the DOM.
2. **Stable refs prevent stale closures in async drag handlers.** Because `handleDragEnd` is async and `useCallback`-memoized, `groups` state read directly would be stale. A `groupsRef` updated each render solves this cleanly.
3. **`useSortable` transform + transition = free animation.** Applying `CSS.Transform.toString(transform)` and `transition` from `useSortable` to the wrapper element's `style` prop gives dnd-kit's built-in spring animation at no extra cost.
4. **`DragOverlay` needs its own data source, not the live DOM.** `activeGroup` state is set in `onDragStart` so the overlay renders a frozen snapshot of the group, independent of any DOM mutations during the drag.
5. **`useDroppable` on `GroupPanel` enables cross-group drops.** Making each group card a droppable zone (id = `group.id`, without prefix) allows questions to be dragged into empty groups or onto the group header without a question target underneath.

## Reusable Patterns
- **Namespace-prefixed sortable IDs:** `'group:' + id` / `'question:' + id` — use whenever multiple entity types share a `DndContext`.
- **SortableWrapper + presentational component split:** thin wrapper owns `useSortable` and passes `listeners`/`attributes`/`isDragging` as props; inner component stays unaware of dnd-kit.
- **Optimistic update + `undo()` on failure:** call store action immediately, await API, catch and call `undo()` — works for any reordering action backed by a Zustand history slice.
- **`groupsRef` stable ref pattern:** `const ref = useRef(state); ref.current = state;` inside the component body keeps async callbacks current without adding state to `useCallback` deps.
- **`distance: 5` activation constraint on PointerSensor:** standard guard to prevent drag activation on click; apply to every sortable list with interactive child elements.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyBuilderPage.tsx` — full DndContext setup, SortableGroupPanel wrapper, GroupDragPreview overlay, and handleDragEnd branching logic.
- `frontend/src/components/survey/GroupPanel.tsx` — pattern for a component that is both a `useDroppable` target (for cross-group drops) and a drag-handle consumer via props.
- `frontend/src/store/builderStore.ts` — `reorderGroups` action and `undo` mechanism for optimistic update rollback.
- `frontend/src/services/surveyService.ts` — `reorderGroups` (PATCH) and `moveQuestion` service methods.

## Gotchas and Pitfalls
- **Forgetting to sort by `sort_order` before `arrayMove`.** `arrayMove` requires a stable, sorted array as input; unsorted groups produce incorrect new orders silently.
- **`SortableContext` items array must match `useSortable` IDs exactly.** A mismatch (e.g., passing raw IDs to `SortableContext` but `group:<id>` to `useSortable`) causes the sorting strategy to malfunction with no error.
- **`tabIndex={-1}` on the drag handle button.** The drag handle gets keyboard focus through `useSortable` attributes already; an additional `tabIndex={0}` would double-expose it in the tab order.
- **DragOverlay renders outside the normal React tree.** Styles from parent `overflow: hidden` containers do not clip the overlay — this is intentional but can surprise if the overlay unexpectedly bleeds over fixed headers or sidebars.
- **Two API calls for cross-group moves must be sequential.** Calling `reorderQuestions` before `moveQuestion` completes will operate on stale server state; always await `moveQuestion` first.
```
