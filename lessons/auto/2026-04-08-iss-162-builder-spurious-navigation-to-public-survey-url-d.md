---
date: "2026-04-08"
ticket_id: "ISS-162"
ticket_title: "Builder: Spurious navigation to public survey URL during interactions"
categories: ["testing", "api", "ui", "bug-fix", "feature", "ci-cd", "refactoring"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-162"
ticket_title: "Builder: Spurious navigation to public survey URL during interactions"
categories: ["frontend", "dnd-kit", "event-handling", "react", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
  - "frontend/src/components/survey-builder/SortableGroupPanel.tsx"
  - "frontend/src/components/survey-builder/SurveyCanvas.tsx"
  - "frontend/src/components/survey/GroupPanel.tsx"
  - "frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx"
---

# Lessons Learned: Builder: Spurious navigation to public survey URL during interactions

## What Worked Well
- The root cause was clearly identified upfront: a conflicting `onClick` on a `CardHeader` in the old `survey/GroupPanel.tsx` was allowing click events to bubble up to anchor/router-link elements, causing spurious navigation
- The fix strategy — replacing the legacy `survey/GroupPanel.tsx` with the feature-complete `survey-builder/GroupPanel.tsx` — eliminated the problematic event handler rather than patching around it
- Deleting the orphaned `survey/GroupPanel.tsx` enforced a clean architecture with a single canonical GroupPanel implementation

## What Was Challenging
- Two GroupPanel implementations coexisted with overlapping but non-identical prop interfaces, requiring careful auditing before the swap to avoid silent prop mismatches
- The `survey-builder/GroupPanel.tsx` was missing capabilities from `survey/GroupPanel.tsx` that had to be backported: `isOver` drop-zone highlight, `onAddQuestion` dropdown, and the nested SortableContext + question list rendering
- dnd-kit's flat id registry per `DndContext` meant that after swapping GroupPanel implementations, all `useSortable`/`useDroppable` id values across SurveyCanvas had to be audited for collisions — silent collisions break drag-over resolution without obvious error messages

## Key Technical Insights
1. **Event bubbling is the typical cause of spurious navigation in builders**: broad `onClick` handlers on container elements (especially `CardHeader`) propagate clicks to parent anchor or `<Link>` elements. Always use `e.stopPropagation()` on interactive controls inside clickable containers, or restructure to avoid nesting interactives inside anchors.
2. **Two GroupPanel implementations is a maintenance hazard**: when a newer component exists but isn't wired in, the older one accumulates divergent behaviour. Wire in or delete promptly.
3. **dnd-kit `SortableContext` with an empty `items` array produces no droppable surface**: empty groups require an explicit `useDroppable` on the container element independent of the `SortableContext`.
4. **dnd-kit id registry is flat per `DndContext`**: group-level `useDroppable` ids and question-level `useSortable` ids must all be globally unique within a single `DndContext` tree — collisions are silent and cause incorrect drag-over resolution.
5. **JSDOM does not implement `getBoundingClientRect` or pointer events**: never test actual dnd-kit drag collision detection or `isOver` CSS highlights via simulated pointer events in Vitest; mock dnd-kit hooks and test handler logic and CSS class application separately.

## Reusable Patterns
- **Module-level dnd-kit mock for Vitest**: define once per test file:
  ```ts
  vi.mock('@dnd-kit/sortable', () => ({
    useSortable: () => ({
      attributes: {}, listeners: {}, setNodeRef: vi.fn(),
      transform: null, transition: null, isDragging: false,
    }),
  }))
  vi.mock('@dnd-kit/core', () => ({
    useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
  }))
  ```
- **`afterEach: vi.useRealTimers()`** whenever fake timers are used in any test file — leftover fake timers silently cause MSW promise resolution to time out in downstream tests.
- **Wrap `userEvent.setup()` interactions in `act()`** in Vitest/RTL tests to avoid act() boundary warnings that contaminate subsequent `renderHook` calls.
- **Separate `useDroppable` from `SortableContext`** on group containers so empty groups remain valid drop targets.
- **Explicit non-navigation tests**: after any builder interaction fix, add test cases asserting that clicking the Add Question button, drag handle, collapse toggle, and group header do NOT call `navigate()`.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/GroupPanel.tsx` — canonical GroupPanel; check for broad `onClick` on container elements
- `frontend/src/components/survey-builder/SortableGroupPanel.tsx` — prop mapping layer between SurveyCanvas and GroupPanel; verify prop names match after any interface change
- `frontend/src/components/survey-builder/SurveyCanvas.tsx` — hosts the top-level `DndContext`; audit all `useSortable`/`useDroppable` ids for uniqueness after any GroupPanel swap
- `frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx` — reference for dnd-kit mock patterns and non-navigation assertions

## Gotchas and Pitfalls
- **Prop name drift between old and new GroupPanel**: `onSelectItem` vs `onSelect`, `selectedItem` vs `isSelected`, `isDragging` sourced from `useSortable` vs passed as a prop — verify every prop at the SortableGroupPanel boundary after a swap.
- **Silent dnd-kit id collisions**: no console error is thrown when group and question ids collide in the `DndContext` registry — the only symptom is incorrect drag-over resolution. Always audit ids after structural changes.
- **Empty SortableContext is not a drop target**: a group with zero questions will not accept drops unless wrapped independently with `useDroppable`.
- **Fake timer bleed-through**: a single `vi.useFakeTimers()` call without a matching `vi.useRealTimers()` in `afterEach` will cause all subsequent MSW-dependent tests in the same run to silently time out.
- **`CardHeader` onClick as navigation source**: broad click handlers on card header components are a common source of spurious navigation when the builder renders inside a page that also contains `<Link>` or `<a>` elements — always scope click handlers tightly or call `stopPropagation` on child interactive elements.
```
