---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["react", "survey-builder", "ui-components", "drag-and-drop", "zustand"]
outcome: "success"
complexity: "medium"
files_modified:
  - "src/components/survey-builder/GroupPanel.tsx"
  - "src/pages/SurveyBuilderPage.tsx"
  - "src/store/builderStore.ts"
  - "src/services/surveyService.ts"
  - "src/components/survey-builder/__tests__/GroupPanel.test.tsx"
---

# Lessons Learned: 3.2: Question Group Panel (List, Add, Reorder, Delete)

## What Worked Well
- Pre-existing GroupPanel.tsx scaffold (354 lines) meant the implementation was largely complete before active work began, reducing implementation effort significantly.
- @radix-ui/react-collapsible provided reliable expand/collapse behavior without needing to manage open/closed state manually for each panel.
- Zustand builderStore cleanly centralized group state (addGroup, removeGroup, updateGroup) and made the GroupPanel component purely reactive.
- shadcn/ui Dialog component handled the delete confirmation pattern with cascade warning without custom modal plumbing.
- Separating the SortableGroupPanel wrapper (dnd-kit) from GroupPanel kept drag-and-drop concerns out of the panel's rendering logic.

## What Was Challenging
- The ticket's implementation was substantially complete at the start, making it difficult to distinguish what work actually remained versus what had already been done in prior commits.
- Coordinating inline title editing (click-to-edit, Enter/blur to save) with collapsible toggle required careful event handling to prevent collapse toggling when the title input is focused.
- Ensuring sort_order is respected on render required the store to maintain a sorted list or the component to sort on display — a subtle ordering concern that can silently regress.

## Key Technical Insights
1. Inline title editing on a collapsible panel header requires stopping click event propagation on the input/edit trigger to prevent unintended collapse/expand toggling.
2. The cascade delete warning in the confirmation dialog must be present in the UI copy — not just as a backend concern — to satisfy the acceptance criteria and user expectations.
3. @dnd-kit's sortable wrapper pattern (SortableGroupPanel wrapping GroupPanel) is the correct separation: the sortable context owns drag state, the panel owns display state.
4. Empty group placeholder ("Add questions here") is a display concern tied to `group.questions.length === 0`, not to collapsed state — both states should show it appropriately.
5. POST /api/v1/surveys/{survey_id}/groups should optimistically add the returned group to the store rather than refetching the full group list to keep the UI responsive.

## Reusable Patterns
- **Sortable wrapper pattern**: Wrap display components in a thin SortableItem shell that injects drag handle props and sort attributes, keeping the display component unaware of DnD.
- **Inline edit pattern**: Toggle between `<span onClick={startEdit}>` and `<input onBlur={save} onKeyDown={handleEnter}>` with a shared `isEditing` boolean state.
- **Optimistic store dispatch**: After a successful API create call, dispatch `addGroup(response.data)` to the Zustand store rather than re-fetching — avoids flicker and extra network round trips.
- **Cascade delete dialog**: Reuse shadcn/ui AlertDialog with a standardized warning message pattern for any delete that cascades to child records.

## Files to Review for Similar Tasks
- `src/components/survey-builder/GroupPanel.tsx` — canonical example of collapsible panel with inline editing and delete confirmation.
- `src/pages/SurveyBuilderPage.tsx` — shows how SortableGroupPanel wraps GroupPanel within a DndContext for reorderable lists.
- `src/store/builderStore.ts` — reference for the addGroup/removeGroup/updateGroup action pattern to replicate for questions within groups.
- `src/components/survey-builder/__tests__/GroupPanel.test.tsx` — 13-suite test file covering all acceptance criteria; use as template for similar panel component tests.

## Gotchas and Pitfalls
- Collapsible toggle and inline title edit share the same click target area — without `e.stopPropagation()` on the input, clicking to edit will also collapse the panel.
- sort_order from the API is the source of truth; never rely on array insertion order from the store for display ordering.
- The "Add Group" button must be outside the collapsible/scrollable groups list area (at the bottom of the canvas) to remain always visible regardless of how many groups exist.
- Delete confirmation dialog must explicitly mention that questions inside the group will also be deleted — omitting this fails the acceptance criterion even if the backend cascade works correctly.
- When the ticket branch already contains a full implementation, verify test coverage before marking done; green tests are the only reliable signal that all acceptance criteria are actually met.
```
