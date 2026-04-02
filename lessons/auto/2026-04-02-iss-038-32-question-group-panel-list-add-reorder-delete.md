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
- GroupPanel.tsx was already substantially complete with collapsible panels, inline title editing, delete confirmation, drag handle, and read-only mode — exploration-first approach correctly identified this before writing redundant code
- Radix UI Collapsible integrated cleanly with shadcn/ui without custom animation wiring
- Zustand builderStore actions (addGroup, removeGroup, updateGroup, reorderGroups) provided a clean boundary between UI state and API calls
- MSW-based tests allowed realistic API interaction testing without a running backend
- Inline title editing pattern (click → input → Enter/blur to save, Escape to cancel) was self-contained within the component with no prop-drilling

## What Was Challenging
- Verifying completeness against acceptance criteria required reading multiple files (GroupPanel, SurveyBuilderPage, builderStore, surveyService) since state, API, and UI are split across layers
- Confirming the "empty group placeholder" and "question count" were both rendered required careful component-level inspection rather than just checking store shape
- Drag-and-drop reorder (sort_order) is coordinated between SurveyBuilderPage and builderStore, making the data flow less obvious from the component alone

## Key Technical Insights
1. Radix UI Collapsible requires explicit `open`/`onOpenChange` props for controlled mode; uncontrolled mode loses expand state on re-render when the parent re-sorts groups by sort_order.
2. Inline editing with a conditional `<input>` / `<span>` swap avoids a separate modal and keeps UX snappy, but requires careful `onBlur` handling — blur fires before Enter's `onKeyDown` in some browsers, so save logic must be idempotent.
3. Delete confirmation dialogs that mention cascading effects (questions being deleted) should include the group name in the dialog body to prevent accidental deletion of the wrong group when multiple groups exist.
4. PATCH for title save should be debounced or deferred to blur/Enter only — do not call PATCH on every keystroke, as the survey builder canvas re-renders on store updates and causes cursor-jump in the input.
5. sort_order rendering in SurveyBuilderPage: always derive display order from a sorted copy of the groups array rather than relying on insertion order in the store map.

## Reusable Patterns
- Click-to-edit inline title: `isEditing` local state, conditional render of `<input>` vs `<span>`, save on Enter/blur, cancel on Escape — reuse for question titles in the Question Editor panel.
- Delete confirmation dialog with cascade warning: extract to a generic `<ConfirmDeleteDialog title entity cascadeDescription />` component to reuse across groups, questions, and surveys.
- MSW handler pattern for PATCH endpoints: return the request body merged with existing fixture data so tests can assert the saved value without a real DB.
- Collapsible group panel with header row (drag handle + toggle + actions): this layout pattern will repeat for question items; extract the header row layout to a shared primitive.

## Files to Review for Similar Tasks
- `src/components/survey-builder/GroupPanel.tsx` — canonical example of collapsible panel with inline editing and delete dialog in this codebase
- `src/store/builderStore.ts` — reference for how optimistic UI updates are structured before the API call resolves
- `src/services/surveyService.ts` — reference for group CRUD method signatures (createGroup, updateGroup, deleteGroup, reorderGroups)
- `src/components/survey-builder/__tests__/GroupPanel.test.tsx` — MSW + Vitest patterns for testing collapsible UI, inline edits, and confirmation dialogs

## Gotchas and Pitfalls
- Do not use Radix Accordion as a drop-in for Collapsible when multiple groups must be independently expanded — Accordion enforces single-open-at-a-time by default; use Collapsible per group instead.
- `onBlur` on the title input fires when focus moves to the delete button inside the same panel; guard against treating that as a "cancel" or premature "save" by checking `relatedTarget` or deferring blur handling with `setTimeout(0)`.
- MSW handlers for DELETE endpoints must return a 204 (no body) — returning 200 with `{}` causes some fetch wrappers to attempt JSON parsing and throw unexpectedly.
- When testing drag-handle reorder, avoid asserting on DOM order directly; instead assert on the sort_order values passed to the reorderGroups store action, since DOM order depends on the parent component's sort logic.
- Cascade delete warning text must be present in the confirmation dialog for the acceptance criterion to pass — a generic "Are you sure?" is insufficient; include explicit mention of questions being deleted.
```
