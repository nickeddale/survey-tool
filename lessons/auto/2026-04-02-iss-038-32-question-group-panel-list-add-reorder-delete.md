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
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/store/builderStore.ts"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx"
  - "frontend/src/mocks/handlers.ts"
---

# Lessons Learned: 3.2: Question Group Panel (List, Add, Reorder, Delete)

## What Worked Well
- Implementation was largely pre-existing at 1,332 lines — the ticket was effectively a verification and completion pass rather than a greenfield build
- MSW handlers covered all CRUD operations (POST, PATCH, DELETE) cleanly, enabling isolated component tests without real API calls
- shadcn/ui Collapsible provided the expand/collapse behavior with minimal custom logic
- builderStore actions (addGroup, removeGroup, updateGroup, reorderGroups) kept API side effects cleanly separated from UI state

## What Was Challenging
- Large component file (1,332 lines) makes navigation and targeted modifications slow — risk of unintended side effects when editing
- Inline title editing (click-to-edit, Enter/blur to save) requires careful focus management and edge case handling (empty title, concurrent blur+Enter events)
- Delete confirmation dialog needed to clearly communicate cascading question deletion without alarming users unnecessarily
- sort_order rendering depends on consistent store state — if reorderGroups is called optimistically before the API confirms, a failed request can leave UI out of sync with backend

## Key Technical Insights
1. Inline editing with dual-save triggers (Enter keydown + blur) requires a guard (e.g., a `saving` ref) to prevent double PATCH requests when the user presses Enter and focus simultaneously moves away
2. Collapsible panels from shadcn/ui need controlled `open` state wired to store if expand/collapse state must survive re-renders or be driven externally (e.g., auto-expand newly added groups)
3. Empty group placeholder ('Add questions here') should be rendered inside CollapsibleContent so it only appears when the group is expanded — rendering it outside causes it to show even when collapsed
4. Delete with cascade warning: the confirmation dialog message should be static (not dynamically listing question titles) to avoid an extra API fetch just for the dialog

## Reusable Patterns
- Click-to-edit inline title pattern: input hidden by default, shown on click with `autoFocus`, saved on Enter/blur, reverted on Escape — reusable for any entity title in the builder
- Optimistic store update + rollback on API error: update store immediately, call API, catch error and revert with previous state snapshot
- MSW handler structure for CRUD: define handlers for the resource in `handlers.ts` and import into test setup; keeps test files free of `http.post(...)` boilerplate
- Confirmation dialog with cascade warning: accept a `warningMessage` prop so the same ConfirmDialog component can be reused for groups, questions, and surveys

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/GroupPanel.tsx` — reference for collapsible panel, inline editing, delete confirmation patterns
- `frontend/src/store/builderStore.ts` — reference for optimistic CRUD actions with rollback
- `frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx` — reference for MSW-based component tests covering full CRUD lifecycle
- `frontend/src/mocks/handlers.ts` — reference for registering MSW handlers for survey builder endpoints

## Gotchas and Pitfalls
- Double-save on inline edit: blur fires after Enter in some browsers; always debounce or gate with a ref to avoid duplicate PATCH calls
- sort_order gaps: after deletion, sort_order values may have gaps — backend should renumber on delete, or frontend must tolerate non-contiguous ordering
- Drag handle and click events conflict: ensure drag handle has `onMouseDown` with `e.stopPropagation()` so dragging doesn't trigger the title-edit click handler
- act() warnings in tests when testing inline edit: state updates from blur events fired via `userEvent` should be wrapped in `await act(async () => { ... })` per project memory guidelines
- Collapsible animation and test assertions: `CollapsibleContent` may use CSS `display:none` or height animation — query by visibility or role rather than presence in DOM to avoid false positives
```
