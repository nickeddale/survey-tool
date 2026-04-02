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
categories: ["react", "survey-builder", "ui-components", "state-management"]
outcome: "success"
complexity: "medium"
files_modified:
  - "src/components/survey-builder/GroupPanel.tsx"
  - "src/components/survey-builder/__tests__/GroupPanel.test.tsx"
  - "src/pages/SurveyBuilderPage.tsx"
  - "src/store/builderStore.ts"
  - "src/services/surveyService.ts"
  - "src/types/survey.ts"
---

# Lessons Learned: 3.2: Question Group Panel (List, Add, Reorder, Delete)

## What Worked Well
- Radix UI Collapsible provided expand/collapse behavior without needing shadcn/ui Accordion, keeping the implementation lean
- Zustand + Immer in builderStore.ts cleanly handled group/question state mutations without boilerplate
- Inline title editing (click-to-edit → Enter/blur to save) was self-contained within GroupPanel.tsx with no extra context needed
- Delete confirmation dialog with cascade warning was straightforward using a local `useState` boolean for dialog visibility

## What Was Challenging
- Coordinating sort_order rendering with optimistic UI updates — the store needed to maintain sorted order after add/delete without re-fetching
- Ensuring the "Add questions here" placeholder only appeared for empty groups (question count === 0 AND expanded) without double-rendering logic
- Read-only mode and selection support added conditional rendering branches that increased component complexity

## Key Technical Insights
1. Inline editing state (isEditing, draftTitle) is best kept local to the component rather than in the global store — it's ephemeral UI state, not domain state.
2. When a group is deleted, the builder store should reindex sort_order of remaining groups to avoid gaps, otherwise drag-and-drop reorder logic breaks.
3. The drag handle should render but be visually inactive in read-only mode — removing it entirely causes layout shift.
4. PATCH title save should debounce or only fire on commit (Enter/blur), not on every keystroke, to avoid excessive API calls during fast typing.

## Reusable Patterns
- Click-to-edit inline title: local `isEditing` state, `<input>` on true / `<span onClick>` on false, `onKeyDown` for Enter, `onBlur` for save
- Cascade delete confirmation: local `showConfirm` boolean, shadcn AlertDialog with explicit warning text, destructive variant button
- Empty-state placeholder inside collapsible content: check `questions.length === 0` and render a muted placeholder `<p>` instead of a list
- Sort-order rendering: always sort groups by `sort_order` at the selector/render level, not at mutation time, to keep store mutations simple

## Files to Review for Similar Tasks
- `src/components/survey-builder/GroupPanel.tsx` — canonical pattern for collapsible panel with inline edit, drag handle, and delete confirmation
- `src/store/builderStore.ts` — Zustand+Immer slice pattern for nested group/question mutations
- `src/pages/SurveyBuilderPage.tsx` — Add Group button wiring: POST API call → store dispatch → optimistic append
- `src/services/surveyService.ts` — group CRUD endpoints (POST, PATCH, DELETE) for reuse in question-level services

## Gotchas and Pitfalls
- Radix UI Collapsible does not animate height by default — requires explicit `overflow: hidden` + CSS transition on the content wrapper or it snaps open/closed
- `onBlur` for title save fires before `onKeyDown` Enter in some browsers when clicking away; guard against double-save by tracking a `savedRef` or checking if value actually changed
- shadcn/ui Collapsible and Accordion share similar APIs but Accordion manages open state externally by default — if using Accordion, you must pass `type="multiple"` and control value to avoid all groups collapsing when one opens
- Deleting a group while it is selected in the builder should immediately clear the selection in the store, otherwise the properties panel renders stale data for a deleted entity
```
