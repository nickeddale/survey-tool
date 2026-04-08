---
date: "2026-04-08"
ticket_id: "ISS-173"
ticket_title: "Clone dialog stays open after successful clone navigation"
categories: ["testing", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-173"
ticket_title: "Clone dialog stays open after successful clone navigation"
categories: ["frontend", "modal", "navigation", "bug-fix"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/pages/SurveyDetailPage.tsx"]
---

# Lessons Learned: Clone dialog stays open after successful clone navigation

## What Worked Well
- Root cause was immediately identifiable by reading a single file
- Fix was a one-line addition (`closeModal()` before `navigate()`) with no side effects
- Existing tests provided a safety net to confirm no regressions

## What Was Challenging
- Nothing significant — straightforward UI state management bug

## Key Technical Insights
1. React navigation (`useNavigate`) does not unmount the current page's modals synchronously — the component stays mounted briefly during navigation, so modal state must be explicitly cleared before navigating
2. `closeModal()` must precede `navigate()` on the success path to ensure modal state is reset while the component is still the active owner of that state
3. Inconsistency in modal-dismissal patterns (some handlers calling `closeModal()`, others not) is a common source of these bugs — all async action handlers that conclude with navigation should follow the pattern: reset state → navigate

## Reusable Patterns
- **Modal + navigation pattern**: Always call `closeModal()` (or equivalent state reset) _before_ calling `navigate()` in any success handler that both dismisses a modal and redirects the user
- Scan for `navigate(` calls inside modal action handlers as a checklist item during code review for this class of bug

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyDetailPage.tsx` — contains multiple modal handlers; verify each follows close-then-navigate ordering
- Any other page-level components that render `ConfirmModal` or similar dialogs alongside async actions that conclude with navigation

## Gotchas and Pitfalls
- Forgetting `closeModal()` on the success path is easy because the navigation _appears_ to work correctly — the bug is only visible if the user navigates back to the originating page, or if the modal briefly flashes on the new page before unmount
- If `closeModal()` is called _after_ `navigate()`, timing issues may mean the state update has no visible effect on the old page and the new page briefly inherits stale modal state
```
