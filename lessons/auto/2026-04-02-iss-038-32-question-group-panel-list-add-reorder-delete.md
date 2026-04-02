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
categories: ["react", "ui-components", "survey-builder", "state-management", "drag-and-drop"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
  - "frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/store/builderStore.ts"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/types/survey.ts"
---
```

# Lessons Learned: 3.2: Question Group Panel (List, Add, Reorder, Delete)

## What Worked Well
- The existing service layer (surveyService.ts), store (builderStore.ts), and types (survey.ts) were already in place, making the component integration straightforward
- shadcn/ui Collapsible and Dialog components composed cleanly for expand/collapse and delete confirmation flows
- Zustand store pattern made optimistic updates simple: update local state immediately, then call API, roll back on failure
- @dnd-kit integration for drag handles aligned naturally with the existing drag-and-drop infrastructure from ISS-039 (3.3)

## What Was Challenging
- Coordinating inline title editing state (view/edit/saving modes) with blur and keyboard events required careful handling to avoid double-save on Enter+blur sequences
- Delete confirmation dialog with cascade warning needed to clearly communicate destructive consequences without being overly blocking to the user flow
- Ensuring groups render in sort_order without duplicating sort logic across the component and the store
- Testing drag handle rendering in Vitest without a real DnD context required careful mock setup

## Key Technical Insights
1. Inline editing with Enter/blur/Escape: cancel on Escape by tracking the original value in a ref, save on Enter by calling blur programmatically (to avoid double-save), and save on blur only if the value actually changed
2. Collapsible expand/collapse state is local UI state—do not persist it to the store or API unless the product explicitly requires it; keeping it local simplifies state shape
3. sort_order rendering should happen at the point of consumption (component), not mutation (store action), to avoid ordering side effects when adding or removing groups mid-list
4. Cascade delete warnings in confirmation dialogs should name the affected resource type explicitly ("All questions in this group will also be deleted") rather than generic "this action cannot be undone" copy

## Reusable Patterns
- Inline edit field pattern: icon button toggles edit mode → input with onKeyDown (Enter saves, Escape cancels) → onBlur saves if changed → loading spinner during API call
- Optimistic store update pattern: dispatch store action immediately, call API, on error dispatch rollback action and show toast
- Confirmation dialog with destructive action: shadcn/ui Dialog with a red/destructive variant confirm button, explicit cascade warning in body text, cancel as the visually dominant default
- Empty state placeholder inside a collapsible: render placeholder only when group is expanded and questions array is empty, preventing layout shift on collapse

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/GroupPanel.tsx` — reference for inline editing, collapsible panel structure, and delete confirmation dialog composition
- `frontend/src/store/builderStore.ts` — reference for addGroup/removeGroup/updateGroup action patterns and optimistic update shape
- `frontend/src/services/surveyService.ts` — reference for createGroup/updateGroup/deleteGroup API method signatures
- `frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx` — reference for testing inline edit flows, dialog interactions, and MSW API mocking with Zustand store pre-population

## Gotchas and Pitfalls
- Double-save on Enter+blur: pressing Enter fires the save handler and then immediately triggers onBlur; guard against this by using a `isSaving` ref or by calling `event.target.blur()` inside the Enter handler and skipping the onBlur save if Enter already committed the value
- sort_order gaps after deletion: deleting a group leaves gaps in sort_order; avoid re-normalizing sort_order on every delete as it causes unnecessary PATCH calls; only re-normalize on explicit reorder operations
- DnD context requirement: @dnd-kit useSortable must be called inside a SortableContext; rendering GroupPanel outside of SortableContext silently breaks drag without throwing an error
- Dialog accessibility: shadcn/ui Dialog traps focus correctly, but confirm button must not be auto-focused by default on open to prevent accidental destructive action on rapid keyboard use; set focus to the cancel button or dialog description instead
```
