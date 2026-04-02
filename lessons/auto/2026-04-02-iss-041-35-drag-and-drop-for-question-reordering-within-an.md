---
date: "2026-04-02"
ticket_id: "ISS-041"
ticket_title: "3.5: Drag-and-Drop for Question Reordering (Within and Between Groups)"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-041"
ticket_title: "3.5: Drag-and-Drop for Question Reordering (Within and Between Groups)"
categories: ["drag-and-drop", "dnd-kit", "react", "vitest", "component-extraction"]
outcome: "success"
complexity: "high"
files_modified:
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/components/survey/QuestionCard.tsx"
  - "frontend/src/components/survey/GroupPanel.tsx"
  - "frontend/src/services/surveyService.ts"
  - "frontend/package.json"
  - "frontend/package-lock.json"
  - "frontend/src/mocks/handlers.ts"
---

# Lessons Learned: 3.5: Drag-and-Drop for Question Reordering (Within and Between Groups)

## What Worked Well
- The Zustand store already had `reorderQuestions` and `moveQuestion` actions in place from earlier tickets, making the DnD integration a clean wiring exercise rather than a state design problem.
- Extracting `QuestionCard` and `GroupPanel` as dedicated components before layering DnD on top kept the refactor manageable — isolating sortable/droppable concerns to specific files rather than growing SurveyBuilderPage further.
- Using `closestCorners` collision detection from `@dnd-kit` worked well for nested sortable contexts (groups containing questions), avoiding false positives from overlapping bounding boxes that `rectIntersection` can produce.
- The `DragOverlay` pattern (render a clone outside the sortable tree) naturally avoids layout thrash during drag and gives a clean floating preview without CSS z-index fights.

## What Was Challenging
- Nested `SortableContext` trees (one per group) require careful `id` namespacing — question IDs must be globally unique across groups, or dnd-kit's internal `over` resolution will collide between containers.
- Cross-group move sequencing: the store `moveQuestion` must be called before `surveyService.reorderQuestions` for the target group, otherwise the sort_order patch references a question that isn't in the group yet on the backend.
- Empty group drop zones require an explicit `useDroppable` on the group container separate from the `SortableContext` — a `SortableContext` with no items produces no droppable surface by default.
- Testing DnD behavior in JSDOM is inherently limited: `@dnd-kit` relies on pointer events and `getBoundingClientRect` which JSDOM does not implement. Mocking `useSortable` and `useDroppable` at the module level was necessary to test component rendering and handler logic separately from actual drag mechanics.

## Key Technical Insights
1. **Two-phase cross-group move**: Always call `moveQuestion` (updates `group_id`) before `reorderQuestions` (updates `sort_order` within the target group). The backend must see the correct `group_id` before accepting a reorder payload for that group.
2. **Optimistic UI + undo**: Apply store updates immediately on `onDragEnd`, then call API endpoints. On API failure, revert store state to the snapshot captured at `onDragStart`. This keeps the UI responsive while maintaining consistency on error.
3. **`useSortable` id uniqueness**: dnd-kit tracks all registered sortable/droppable ids in a single flat registry per `DndContext`. Question IDs must not clash with group IDs or each other across the entire canvas.
4. **`DragOverlay` and `activeId` state**: Track `activeId` in `onDragStart` and clear it in `onDragEnd`. The overlay renders only when `activeId` is set, finding the question data from the store — this avoids threading drag state through props.
5. **Mock `@dnd-kit` hooks in Vitest**: Provide vi.mock('@dnd-kit/sortable', ...) and vi.mock('@dnd-kit/core', ...) returning controlled `isDragging`, `isOver`, `transform`, and `transition` values so component snapshot and class tests are deterministic without pointer event simulation.

## Reusable Patterns
- **Cross-container DnD with optimistic revert**: Capture a deep clone of relevant store slices in `onDragStart`; restore on API error in `onDragEnd`. Avoids complex rollback logic by snapshotting before mutation.
- **Empty droppable via `useDroppable`**: When a container may have zero sortable children, add a `useDroppable` wrapper around the empty state element so the group still registers as a valid drop target.
- **Module-level mock for dnd-kit in tests**: `vi.mock('@dnd-kit/sortable', () => ({ useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: null, isDragging: false }) }))` — define once in a `__mocks__` file or at the top of the test file and reuse across QuestionCard and GroupPanel tests.
- **Handler extraction for testability**: Extract `onDragEnd` logic into a pure function `handleDragEnd(event, groups, dispatch, service)` that can be unit-tested without mounting the full canvas component.

## Files to Review for Similar Tasks
- `frontend/src/components/survey/GroupPanel.tsx` — reference for nested `SortableContext` + `useDroppable` empty-zone pattern.
- `frontend/src/components/survey/QuestionCard.tsx` — reference for `useSortable` integration with drag handle and overlay clone rendering.
- `frontend/src/pages/SurveyBuilderPage.tsx` — reference for `DndContext` setup, `activeId` state, `DragOverlay`, and `onDragStart/onDragOver/onDragEnd` handler wiring.
- `frontend/src/services/surveyService.ts` — reference for `reorderQuestions` and `moveQuestion` API method signatures.

## Gotchas and Pitfalls
- **Do not rely on `SortableContext` alone for empty groups** — it renders no droppable surface when the items array is empty. Add `useDroppable` explicitly on the container element.
- **dnd-kit id registry is flat per `DndContext`** — group IDs and question IDs must all be unique within a single `DndContext` tree or drag resolution will silently target the wrong container.
- **`getBoundingClientRect` returns zeros in JSDOM** — never attempt to test actual collision detection or drag-over highlighting by simulating pointer events in Vitest. Mock the dnd-kit hooks and test handler logic and CSS class application separately.
- **Cross-group move order matters on the backend** — `PATCH /surveys/{id}/questions/{qid}` (group_id update) must complete before `PATCH /surveys/{id}/groups/{gid}/questions/reorder` for the target group. Fire sequentially, not with `Promise.all`.
- **`DragOverlay` may trigger `URL.createObjectURL`** if question content includes file attachments or images rendered as blob URLs. Pre-mock: `URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')` and restore in `afterEach` with `vi.restoreAllMocks()`. Never use `vi.stubGlobal('URL', ...)`.
- **Wrap all `userEvent.setup()` interactions in `act()`** — pointer simulation dispatches events outside React's act boundary and will produce act() warnings that contaminate subsequent `renderHook` calls.
- **Always call `vi.useRealTimers()` in `afterEach`** — any fake timer left running will silently cause all downstream tests relying on MSW promise resolution to time out.
```
