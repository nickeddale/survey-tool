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
categories: ["drag-and-drop", "merge-conflicts", "react", "dnd-kit"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/package.json
  - frontend/package-lock.json
  - frontend/src/pages/SurveyBuilderPage.tsx
  - frontend/src/services/surveyService.ts
  - frontend/src/components/survey/GroupPanel.tsx
  - frontend/src/components/survey/QuestionCard.tsx
  - frontend/src/mocks/handlers.ts
  - frontend/src/components/survey/__tests__/dnd.test.tsx
---

# Lessons Learned: 3.3: Drag-and-Drop for Group Reordering

## What Worked Well
- @dnd-kit/core and @dnd-kit/sortable provided clean abstractions for both group-level and question-level drag-and-drop within the same DndContext
- DragOverlay component decoupled the drag preview rendering from the actual sortable items, enabling miniature previews without disrupting layout
- arrayMove utility from @dnd-kit/sortable handled sort_order updates cleanly without manual index arithmetic
- Merging group reordering (ISS-039) with question reordering (ISS-041) in a single DndContext kept the architecture unified rather than having nested or competing drag contexts

## What Was Challenging
- Merge conflicts across four files simultaneously (package.json, package-lock.json, SurveyBuilderPage.tsx, surveyService.ts) required careful analysis of both branches before resolving to avoid losing functionality from either side
- Distinguishing drag events for group-level vs question-level reordering within a single onDragEnd handler required a clear data type/id convention on draggable items
- package-lock.json conflicts are mechanical but tedious — the safest resolution is to delete and regenerate rather than hand-merge

## Key Technical Insights
1. When two features both add drag-and-drop (groups vs questions), use a single top-level DndContext with a discriminated union on drag item `data` (e.g., `{ type: 'group' | 'question', id, groupId }`) to route onDragEnd logic correctly.
2. The `isOverlay` prop pattern on sortable components (e.g., GroupPanel) allows the same component to render differently inside DragOverlay vs in the actual list — prevents double-rendering of interactive controls in the overlay.
3. useSortable must apply `attributes`, `listeners`, and `setNodeRef` separately: `setNodeRef` on the container, `listeners` only on the drag handle element — attaching listeners to the whole card prevents click events on interactive children.
4. Optimistic store updates (arrayMove before API call) with rollback on failure provide responsive UX; keep a snapshot of pre-drag order in onDragStart for reliable undo.
5. Collision detection strategy matters: `closestCenter` works well for vertical lists; switching to `closestCorners` can improve accuracy when groups have variable heights.

## Reusable Patterns
- **Single DndContext with typed drag items**: wrap the entire builder in one DndContext, tag each draggable's `data` with `{ type, id }`, and switch in onDragEnd.
- **isOverlay prop for DragOverlay**: pass `isOverlay={true}` to components rendered inside DragOverlay to strip interactive controls and apply visual styling.
- **Optimistic reorder with rollback**: `const prev = [...items]; reorderInStore(newOrder); try { await reorderAPI(...) } catch { restoreInStore(prev); toast.error(...) }`.
- **package-lock.json conflict resolution**: `rm frontend/package-lock.json && cd frontend && npm install` is faster and safer than hand-resolving lock file conflicts.
- **MSW PATCH handler for reorder**: validate that the request body contains a `group_ids` (or `question_ids`) array and return the updated objects; use this as the canonical mock shape for reorder endpoints.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyBuilderPage.tsx` — canonical example of multi-level DndContext with typed drag dispatch
- `frontend/src/components/survey/GroupPanel.tsx` — reference for useSortable + drag handle + isOverlay pattern
- `frontend/src/components/survey/QuestionCard.tsx` — reference for question-level sortable item
- `frontend/src/services/surveyService.ts` — reorderGroups() and reorderQuestions() API call patterns
- `frontend/src/components/survey/__tests__/dnd.test.tsx` — DnD test patterns using fireEvent/act rather than userEvent for drag simulation

## Gotchas and Pitfalls
- Do not attach `listeners` (from useSortable) to the entire card element — this swallows click events on inputs, buttons, and collapsible triggers inside the card. Always scope listeners to a dedicated drag handle element.
- DragOverlay renders in a portal outside the normal React tree; any context (store, router) needed by the preview component must be available at the portal root — usually fine since the portal is inside the same app tree.
- @dnd-kit sensors need a minimum drag distance (`activationConstraint: { distance: 8 }`) to avoid accidental drags when clicking interactive children.
- When merging branches that both touch package.json, verify that dependency versions from both branches are compatible before committing — especially peer dependencies between @dnd-kit packages.
- Keyboard accessibility (as required by acceptance criteria) requires the KeyboardSensor from @dnd-kit/core with appropriate coordinateGetter; it is not enabled by default with PointerSensor alone.
```
