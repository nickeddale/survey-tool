---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-038"
ticket_title: "3.2: Question Group Panel (List, Add, Reorder, Delete)"
categories: ["frontend", "react", "dnd-kit", "merge-conflicts", "testing", "survey-builder"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/survey/GroupPanel.tsx"
  - "frontend/src/components/survey/__tests__/dnd.test.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/services/surveyService.ts"
  - "frontend/package.json"
  - "frontend/package-lock.json"
  - "lessons/auto/index.json"
  - "frontend/src/components/survey-builder/GroupPanel.tsx"
---

# Lessons Learned: 3.2: Question Group Panel (List, Add, Reorder, Delete)

## What Worked Well
- The advanced `survey-builder/GroupPanel.tsx` was already largely complete before merge conflict resolution, providing collapsible panels, inline title editing, drag handles, delete confirmation dialogs, and empty group placeholders out of the box.
- The implementation plan warnings about AA-conflicted files accurately predicted the resolution strategy: picking the more complete HEAD version rather than attempting to merge two independently-developed implementations of the same component.
- DnD provider nesting (outermost `DnDContext` wrapping all `SortableContext` instances in `SurveyBuilderPage.tsx`) worked correctly when the correct provider order from past lessons was followed.

## What Was Challenging
- Resolving AA-conflicted files (`GroupPanel.tsx`, `dnd.test.tsx`) where both branches independently added the same file required careful judgment about which version was more complete rather than a standard merge.
- `package-lock.json` conflicts in large lock files are inherently error-prone to merge manually — the correct resolution was to accept one side and re-run `npm install` to regenerate a consistent dependency tree.
- Ensuring all userEvent interactions in DnD-related tests were wrapped in `await act(async () => {...})` to prevent act() warnings from contaminating subsequent test renders required disciplined application of the pattern.

## Key Technical Insights
1. **AA conflict resolution strategy**: When both branches independently add the same file (AA state in `git status`), the correct resolution is always to pick the more complete implementation. Attempting to merge two parallel implementations risks duplicate test names, overlapping logic, and inconsistent behavior.
2. **Lock file conflict resolution**: Never manually merge `package-lock.json`. Accept one side entirely (`git checkout --theirs` or `--ours`) then run `npm install` to regenerate. Manual lock file merges produce inconsistent dependency trees that cause silent runtime failures.
3. **DnD context nesting order**: The outermost `DnDContext` must wrap all `SortableContext` instances. Getting this wrong causes silent DnD failures with no error messages — the drag events simply don't fire. The `onDragEnd` handler must be registered at the `DnDContext` level, not inside a `SortableContext`.
4. **TypeScript smoke-test after merge conflict resolution**: Running `tsc --noEmit` immediately after resolving conflicts catches type errors in merged files before running the full test suite. This is the frontend equivalent of a Python import smoke-test and saves significant debugging time.
5. **Inline title editing state isolation**: When implementing click-to-edit inline fields, the editing state (`isEditing`, `draftTitle`) must be local to the component instance — not hoisted to a shared store — to avoid one group's editing state affecting others when multiple groups are rendered.

## Reusable Patterns
- **userEvent wrapped in act()**: Every `await user.click/type/selectOptions(...)` call in tests involving async state updates must be wrapped: `await act(async () => { await user.click(...) })`. Bare `await user.click()` dispatches state updates outside React's act() boundary.
- **vi.useRealTimers() in afterEach**: Add to every test file that touches DnD, GroupPanel, or any async survey state. Leaked fake timers block MSW promise resolution and cause all subsequent tests to time out.
- **Delete confirmation with cascade warning**: Assert both that the dialog appears AND that the specific cascade warning text is visible before simulating confirmation. This verifies UX correctness, not just that *a* dialog showed.
- **MemoryRouter future flags**: Add `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` to all `MemoryRouter` instances in tests to suppress React Router v7 future flag warnings.
- **Preventing AuthProvider.initialize() warnings**: After `setTokens(...)` in `beforeEach`, call `localStorage.removeItem('devtracker_refresh_token')` and directly set `useAuthStore.setState(...)` to prevent `pendingInit=true` from triggering async initialization during the test.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/GroupPanel.tsx` — canonical collapsible group panel with inline editing, drag handle, delete dialog, and empty placeholder
- `frontend/src/pages/SurveyBuilderPage.tsx` — correct DnDContext/SortableContext provider nesting and onDragEnd handler registration
- `frontend/src/services/surveyService.ts` — createGroup, updateGroup, deleteGroup, reorderGroups API methods pattern
- `frontend/src/components/survey/__tests__/dnd.test.tsx` — DnD interaction test patterns with act()-wrapped userEvent calls
- `frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx` — GroupPanel unit test patterns including inline edit and delete dialog assertions

## Gotchas and Pitfalls
- **Silent DnD failures**: Incorrect provider nesting (`SortableContext` outside `DnDContext`, or `onDragEnd` at the wrong level) produces zero errors — drag events simply do nothing. Always verify the nesting order visually in the component tree.
- **AA-conflicted test files with duplicate test descriptions**: If two independently-added test files are naively merged, duplicate `describe`/`it` block names cause Vitest to silently skip one suite. Always pick one file as canonical.
- **Collapsible component import path**: Shadcn/ui `Collapsible` is from `@radix-ui/react-collapsible` and must be listed in `package.json` dependencies. If the conflict resolution drops this dependency, the component will fail to import with a cryptic module resolution error rather than a missing-package error.
- **sort_order vs array index**: Groups must always be rendered ordered by `sort_order` from the API response, not by insertion order in the local store. After an optimistic reorder update, re-sort the local array by the updated `sort_order` values before re-rendering to avoid visual flicker.
- **Inline editing Enter key handler**: The `onKeyDown` handler for inline title input must call `event.stopPropagation()` to prevent Enter from bubbling to parent collapsible/accordion components that might toggle expand/collapse state simultaneously.
```
