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
categories: ["react", "survey-builder", "ui-components", "shadcn-ui"]
outcome: "success"
complexity: "medium"
files_modified:
  - "src/components/survey-builder/GroupPanel.tsx"
  - "src/components/survey-builder/__tests__/GroupPanel.test.tsx"
  - "src/store/builderStore.ts"
  - "src/services/surveyService.ts"
  - "src/types/survey.ts"
---

# Lessons Learned: 3.2: Question Group Panel (List, Add, Reorder, Delete)

## What Worked Well
- GroupPanel.tsx was already fully implemented at 346 lines before the ticket work began, indicating strong carry-over from adjacent ticket work
- shadcn/ui Collapsible and Dialog components mapped cleanly onto the required expand/collapse and delete-confirmation UX patterns
- Centralizing state in useBuilderStore kept GroupPanel.tsx stateless enough to test in isolation
- Inline title editing (click-to-edit, Enter/blur-to-save) was handled entirely within the component without needing a separate modal

## What Was Challenging
- Verifying the Add Group button placement — it lives in the parent canvas component rather than GroupPanel itself, so acceptance criteria tracing required checking multiple files
- Ensuring delete confirmation copy explicitly mentioned cascading question deletion to satisfy the acceptance criterion (easy to write a generic "are you sure?" and miss the cascade warning requirement)
- Sort order rendering depends on data arriving pre-sorted or the component sorting by `sort_order`; subtle bugs can appear if the store doesn't preserve order after optimistic updates

## Key Technical Insights
1. shadcn/ui `Collapsible` is the right primitive for single-panel expand/collapse; `Accordion` is better when only one panel should be open at a time — for survey groups, independent expand/collapse per panel means `Collapsible` is the correct choice.
2. Inline title editing requires careful blur/Enter handling: save on both, but cancel (Escape) should revert to the last saved value, not an empty string.
3. Drag handles should be visually distinct but not interfere with the click target for expand/collapse — separate the handle element from the header click zone.
4. Optimistic UI for delete (remove from store immediately, revert on API error) prevents the lag that makes delete feel broken on slow connections.
5. Empty group placeholder ("Add questions here") must be inside the Collapsible content so it appears/disappears correctly with expand/collapse state.

## Reusable Patterns
- `click-to-edit` inline text: render `<span onClick={() => setEditing(true)}>` that swaps to `<input autoFocus onBlur={save} onKeyDown={handleKey}>` — reusable for any inline rename pattern in the survey builder.
- Confirmation dialog with cascade warning: wrap shadcn/ui `Dialog` with a `isDangerous` prop pattern that renders red-tinted body text when the action has irreversible side effects.
- useBuilderStore action pairing: every mutation (createGroup, renameGroup, deleteGroup) should have a matching optimistic store update + async API call + rollback on failure.

## Files to Review for Similar Tasks
- `src/components/survey-builder/GroupPanel.tsx` — reference for collapsible panel + inline edit + delete confirm pattern
- `src/store/builderStore.ts` — how group CRUD actions are structured for reuse when implementing question-level CRUD
- `src/services/surveyService.ts` — REST call patterns for survey sub-resources (groups, questions)
- `src/components/survey-builder/__tests__/GroupPanel.test.tsx` — test patterns for inline editing and dialog interactions

## Gotchas and Pitfalls
- Do not attach the drag-handle `onMouseDown` to the entire panel header — it will conflict with the expand/collapse click and the inline title edit click target.
- shadcn/ui Dialog's `onOpenChange` fires on both open and close; guard the close path to avoid triggering a delete API call when the user cancels.
- `sort_order` gaps are normal (e.g., 1, 3, 5) after deletions — render in order, never assume contiguous values or use index as a proxy for sort_order.
- When the panel title input is empty on blur/Enter, either restore the previous title or block the save — saving an empty string produces a broken UI state.
- Test the empty-group placeholder carefully: it must not appear when the collapsible is collapsed (hidden inside content), and it must appear when expanded with zero questions.
```
