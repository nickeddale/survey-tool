---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["testing", "api", "ui", "refactoring", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["frontend", "drag-and-drop", "react", "testing", "survey-builder"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
  - "frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx"
  - "frontend/package.json"
  - "frontend/package-lock.json"
---

# Lessons Learned: 3.2: Question Group Panel (List, Add, Reorder, Delete)

## What Worked Well
- Separating drag-and-drop concerns cleanly: `GroupPanel` accepts `dragListeners` and `dragAttributes` as props, keeping the component unaware of `@dnd-kit` internals. The `SortableGroupPanel` wrapper in `SurveyBuilderPage` owns the sortable hook and passes down only the needed handlers.
- Optimistic reordering with rollback: `handleDragEnd` updates the store immediately via `reorderGroups()`, then persists to the API. On failure it reverts to the previous order, providing instant visual feedback with graceful error recovery.
- Splitting integration tests across two files: `GroupPanel.test.tsx` covers isolated component behaviour (collapsible, inline edit, delete dialog, drag prop spreading); `SurveyBuilderPage.test.tsx` covers page-level flows (Add Group API call, reorder store action, reorder API call).
- `SortableContext` receives `items` as an array of string IDs derived from `sortedGroups`; pairing this with `verticalListSortingStrategy` gives correct index-based reordering with no additional configuration.
- Using `fireEvent` rather than `userEvent` for header click and keyboard events avoids act() warnings from `userEvent.setup()` pointer simulation mode — consistent with the established project testing pattern.

## What Was Challenging
- Drag-and-drop is inherently difficult to test at the DOM level with `@dnd-kit` in JSDOM. Rather than simulating pointer drag events (which require `PointerSensor` to fire and are fragile in JSDOM), the reorder logic was tested by calling the store's `reorderGroups` action directly and verifying the API call via MSW. The actual DnD interaction was verified manually rather than through automated tests.
- The `SortableGroupPanel` wrapper must be a stable component defined outside `SurveyCanvas` to avoid re-mounting on every render; defining it inline as an anonymous function would cause `useSortable` to unmount and remount on each state change.
- Inline title editing requires careful event propagation control: the title input's `onClick`, the rename button's `onClick`, and the delete button's `onClick` all call `e.stopPropagation()` to prevent the header's `onSelect` from firing simultaneously.

## Key Technical Insights
1. **Props-based DnD integration pattern**: Keep leaf components (e.g. `GroupPanel`) DnD-agnostic by accepting `dragListeners` and `dragAttributes` as optional props. The sortable wrapper (`SortableGroupPanel`) calls `useSortable`, applies `setNodeRef` and `style` to a container `<div>`, and passes only the listeners/attributes down. This keeps `GroupPanel` independently testable and reusable.
2. **Optimistic update with rollback**: Capture the pre-drag `sortedGroups` array in the `handleDragEnd` closure before mutating. After calling `reorderGroups(orderedIds)`, pass `sortedGroups.map(g => g.id)` to `reorderGroups` inside the catch block to restore the previous visual order on API failure.
3. **`sortedGroups` must be computed in render scope, not inside `handleDragEnd`**: `handleDragEnd` is memoised with `useCallback`; passing `sortedGroups` as a dependency ensures the closure always uses the current order when computing `oldIndex`/`newIndex`.
4. **`DndContext` and `SortableContext` live in the canvas, not the page**: Scoping these to `SurveyCanvas` keeps drag-and-drop state local and avoids prop-drilling the event handlers up to `SurveyBuilderPage`.
5. **Collapsible panels use shadcn/ui `Collapsible`**: Collapse toggle must call `e.stopPropagation()` inside `CollapsibleTrigger` to prevent the parent header's `onSelect` from firing. The `asChild` pattern on `CollapsibleTrigger` lets a `<button>` own the toggle without adding a redundant wrapper element.

## Reusable Patterns
- **Props-based DnD handle**: any sortable list item component can accept `dragListeners?: DraggableSyntheticListeners` and `dragAttributes?: React.HTMLAttributes<HTMLElement>` and spread them onto a handle `<span>`. The parent sortable wrapper calls `useSortable` and passes down `listeners` and `attributes`.
- **Optimistic reorder with revert**: `const prev = [...list]; optimisticUpdate(newOrder); try { await api.reorder(newOrder) } catch { revert(prev) }` — works for any ordered list backed by a store.
- **Inline title editing pattern**: `isEditingTitle` boolean state gates between a static `<span>` (with `onDoubleClick` and explicit rename button) and an `<input>` that saves on `Enter`/blur and cancels on `Escape`. Always guard against empty string and unchanged value before making the API call.
- **Testing DnD without simulating pointer events**: test the store action (`reorderGroups`) and the API call (`surveyService.reorderGroups`) in isolation; test that drag handle props are correctly spread to the DOM element using `fireEvent.pointerDown` and attribute assertions.
- **Add item flow test pattern**: register an MSW `http.post` override that captures request bodies, click the trigger button inside `act()`, then `waitFor` both the captured request assertion and the new DOM element's presence.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyBuilderPage.tsx` — `SortableGroupPanel` and `SurveyCanvas` components show the canonical way to wire `@dnd-kit/sortable` to a list of panels with optimistic reorder.
- `frontend/src/components/survey-builder/GroupPanel.tsx` — reference implementation for inline title editing, delete confirmation dialog with cascade warning, and props-based drag handle integration.
- `frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx` — shows how to test drag handle prop spreading, collapsible toggle, inline edit (Enter/blur/Escape), and delete confirm/cancel without rendering the full page.
- `frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx` — shows integration-level Add Group and reorder tests; note the strategy of calling `surveyService.reorderGroups` directly to test the API contract without simulating DnD events.

## Gotchas and Pitfalls
- **Do not call `useSortable` inside a component that is re-created on every render** (e.g. a component defined inline inside another component's render function). React will remount the hook on every parent render, causing flickering and lost drag state. Always define sortable wrapper components at module scope.
- **`sortedGroups` in `handleDragEnd`**: if `sortedGroups` is not in the `useCallback` dependency array, the closure will capture a stale snapshot and compute wrong indices after any reorder. Include it in deps even though it makes the callback recreate on every render — the correctness trade-off is worth it.
- **`e.stopPropagation()` is mandatory on every interactive element inside the group header** (collapse toggle, title input, rename button, delete button). Without it, clicking any child element also fires the header's `onSelect`, toggling the selection unintentionally.
- **Empty-title guard in `saveTitle`**: trimming the edited value and comparing to the current title before issuing a PATCH prevents unnecessary API calls when the user presses Enter without changing anything, or types only whitespace.
- **`@dnd-kit/core` `PointerSensor` requires a drag distance threshold** — without it, a simple click on a draggable element can trigger `onDragEnd`. If click-to-select and drag-to-reorder coexist on the same element, configure `PointerSensor` with `activationConstraint: { distance: 8 }` to distinguish taps from drags.
- **Test MSW override scoping**: use `server.use(...)` with one-time handlers inside individual `it` blocks rather than overriding in `beforeEach` unless every test in the suite needs the same handler, to avoid cross-test pollution.
```
