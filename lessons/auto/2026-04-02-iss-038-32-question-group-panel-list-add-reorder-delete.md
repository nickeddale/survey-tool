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
categories: ["frontend", "react", "survey-builder", "ui-components", "testing"]
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
- GroupPanel.tsx was already fully implemented prior to the ticket being actioned, meaning the implementation plan served primarily as a verification and test-coverage exercise
- shadcn/ui Collapsible component integrated cleanly with the existing design system
- Zustand+Immer store pattern (builderStore) handled optimistic UI updates for add/rename/delete group operations without requiring manual immutability management
- @dnd-kit drag handle integration coexisted naturally with the collapsible panel interaction model — drag handle captured pointer events independently from expand/collapse trigger
- MSW handlers provided reliable API mocking for PATCH/DELETE endpoints in unit tests

## What Was Challenging
- Distinguishing between click-to-edit (inline title) and click-to-expand (collapsible) required careful event handling — both targets lived in the group header area
- Delete confirmation dialog needed to surface cascade warning text clearly; verifying the exact warning copy in tests required knowing the precise string rendered
- Ensuring the Add Group button appeared at the bottom of the canvas (outside the group list scroll area) required attention to layout structure in SurveyBuilderPage.tsx
- act() boundary warnings when testing async store actions (addGroup, removeGroup) that triggered re-renders needed the established pattern of wrapping userEvent interactions

## Key Technical Insights
1. Inline title editing pattern: render a `<span>` in display mode and swap to `<input>` on click; save on Enter keydown or onBlur, cancel on Escape — prevents accidental saves while keeping UX natural
2. Collapsible expand/collapse state should live in local component state (not the store) unless cross-component synchronization is needed — avoids polluting global state with transient UI state
3. Delete confirmation dialogs that warn about cascading deletes must render the warning text unconditionally inside the dialog (not conditionally based on question count) so tests can assert its presence reliably
4. sort_order rendering: always derive display order from `[...groups].sort((a, b) => a.sort_order - b.sort_order)` at render time rather than relying on store insertion order
5. Empty group placeholder (`Add questions here`) should be rendered inside the Collapsible content area so it is only visible when the group is expanded, matching user expectations

## Reusable Patterns
- Inline edit pattern: `isEditing` local state + controlled input + onKeyDown for Enter/Escape + onBlur for save — reusable for any inline rename interaction
- Confirmation dialog with cascade warning: shadcn/ui AlertDialog with destructive variant button; warning text as a separate paragraph styled with `text-destructive` or muted tone
- Group header layout: flex row with drag handle (cursor-grab, stops propagation), expand/collapse trigger (flex-1), badge (question count), action buttons (icon-only, stops propagation)
- MSW handler pattern for PATCH: `http.patch('/api/v1/surveys/:surveyId/groups/:groupId', ...)` returning the updated resource — reuse for any entity rename endpoint
- builderStore action pattern: call surveyService, then update Immer draft directly on success, catch and surface error without rolling back (let the next fetch reconcile state)

## Files to Review for Similar Tasks
- `src/components/survey-builder/GroupPanel.tsx` — reference for collapsible panel with inline edit, drag handle, and delete confirmation pattern
- `src/store/builderStore.ts` — reference for Zustand+Immer async action pattern (add/update/remove entity)
- `src/components/survey-builder/__tests__/GroupPanel.test.tsx` — reference for testing collapsible, inline edit, and delete dialog with MSW
- `src/pages/SurveyBuilderPage.tsx` — reference for canvas layout with sticky Add button at canvas bottom
- `src/services/surveyService.ts` — reference for PATCH/DELETE group API call signatures

## Gotchas and Pitfalls
- Event propagation: clicks on action buttons (rename, delete) inside the group header must call `e.stopPropagation()` to prevent triggering the collapsible toggle
- Drag handle events must also stop propagation to prevent the Collapsible from toggling when the user initiates a drag
- `useRealTimers()` in afterEach is mandatory — any fake timer leak will cause subsequent async tests to hang indefinitely
- When asserting the cascade warning text in delete dialog tests, the dialog must be opened first (click delete button) before querying for the warning — shadcn AlertDialog is not pre-rendered in the DOM
- Avoid storing `isExpanded` in the builder store — it is transient UI state; storing it causes unnecessary re-renders of unrelated components on every expand/collapse
- PATCH title save should debounce or only fire on commit (Enter/blur), not on every keystroke, to avoid flooding the API during typing
```
