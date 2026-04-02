---
date: "2026-04-02"
ticket_id: "ISS-049"
ticket_title: "3.13: Builder Toolbar"
categories: ["testing", "api", "ui", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-049"
ticket_title: "3.13: Builder Toolbar"
categories: ["react-component", "ui-composition", "state-management", "responsive-design", "accessibility"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/survey-builder/BuilderToolbar.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
---

# Lessons Learned: 3.13: Builder Toolbar

## What Worked Well
- Extracting the toolbar into a dedicated component cleanly separated concerns: `SurveyBuilderPage` retains page-level orchestration (data fetching, undo/redo keyboard shortcuts, navigation blocking) while `BuilderToolbar` owns all toolbar rendering and action dispatch.
- Reading directly from `useBuilderStore` inside `BuilderToolbar` (rather than passing all values as props) kept the parent's JSX minimal — only `surveyId`, `isPreviewMode`, `onTogglePreview`, `readOnly`, and `undoRedoPendingRef` cross the boundary.
- Using Tailwind responsive prefixes (`hidden md:flex`, `hidden sm:inline`) achieved the collapse behavior without a separate hook or resize observer, keeping the component stateless with respect to viewport.
- Wrapping every actionable button in a `<Tooltip>` via `TooltipProvider` at the toolbar root gave consistent keyboard-discoverable hints with no per-button boilerplate.
- The `undoRedoPendingRef` ref prop pattern (passed from page, mutated in toolbar) cleanly bridged undo/redo button clicks with the autosave effect in `SurveyBuilderPage` without introducing new shared state.

## What Was Challenging
- The `<DropdownMenuTrigger asChild>` inside a `<TooltipTrigger asChild>` nesting required careful ordering: `TooltipTrigger` must be the outer wrapper, otherwise the tooltip fires on the wrong element and the dropdown may not open on click.
- Inline title editing requires a `setTimeout(() => titleInputRef.current?.select(), 0)` to focus the input after React renders it, because the input doesn't exist in the DOM at the moment `setEditingTitle(true)` is called.
- The `handleAddGroup` logic is duplicated between `BuilderToolbar` (toolbar button) and `SurveyCanvas` (empty-state button + bottom button). This duplication is acceptable for now but represents a future consolidation opportunity.
- The Add Question dropdown must be conditionally rendered only when `groups.length > 0` to avoid calling `addQuestion` to a non-existent last group; this guard must be applied in both the desktop and overflow paths.

## Key Technical Insights
1. `sticky top-0 z-20` on the `<header>` combined with `overflow-hidden` on the page wrapper and `overflow-y-auto` on the canvas panel is the minimum required for the toolbar to remain visible during canvas scroll — if `overflow-hidden` is missing on the flex parent, sticky positioning silently fails.
2. The store's `setTitle` action only mutates in-memory state; the toolbar must also call `surveyService.updateSurvey` directly and manage `setSaveStatus` itself for title changes, because title edits bypass the autosave watcher (which is triggered by structural changes to `groups`).
3. On activation error the dialog intentionally stays open (no `setActivateDialogOpen(false)` in the catch block) so the user can retry or cancel — swallowing the error silently would leave the user uncertain about whether activation succeeded.
4. `status === 'draft'` is the single gating condition for showing the Activate button. Non-draft surveys set `readOnly = true` upstream, but the status check is still needed inside the overflow dropdown where `readOnly` is already false for draft surveys.
5. Using `data-testid` attributes on every interactive element from the start (e.g., `toolbar-back-button`, `undo-button`, `toolbar-activate-button`) makes future Playwright/Cypress tests straightforward to write without relying on fragile text or role selectors.

## Reusable Patterns
- **Overflow collapse pattern**: desktop buttons with `hidden md:flex` + a single `md:hidden` `MoreHorizontal` `DropdownMenu` that mirrors the same actions. Apply this pattern to any toolbar that needs to degrade gracefully on mobile without a media-query hook.
- **Inline edit toggle**: `editingTitle` boolean switches between a styled `<h1>` (click-to-edit) and a transparent `<input>` (onBlur/Enter commits, Escape cancels). Reuse for any in-place text field where a full form is overkill.
- **Confirmation dialog for destructive/irreversible actions**: `Dialog` with a descriptive `DialogDescription`, Cancel and Confirm buttons, and an `isActivating` loading state that disables both buttons during the async call.
- **Ref-based cross-component signal**: passing a `MutableRefObject<boolean>` from parent to child to communicate ephemeral intent (e.g., "this save was triggered by undo/redo") without triggering re-renders or polluting the store.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/BuilderToolbar.tsx` — reference implementation for sticky responsive toolbars with inline editing, confirmation dialogs, and overflow collapse.
- `frontend/src/pages/SurveyBuilderPage.tsx` — shows how to pass `undoRedoPendingRef` and wire keyboard shortcuts that coordinate with toolbar button clicks.
- `frontend/src/store/builderStore.ts` — confirms which store actions push undo snapshots (structural mutations) vs. which do not (metadata like `setTitle`, UI like `setSelectedItem`), which determines whether the toolbar needs to call `setSaveStatus` manually.
- `frontend/src/components/survey-builder/SaveIndicator.tsx` — companion component consumed by the toolbar; review before adding new save-state UI.

## Gotchas and Pitfalls
- **`sticky` requires a scrollable ancestor, not an `overflow: hidden` one.** The canvas panel must be the element with `overflow-y-auto`, not a parent above the sticky toolbar.
- **`TooltipProvider` must wrap the entire toolbar**, not individual tooltips, to avoid multiple provider instances causing z-index and portal conflicts.
- **`DropdownMenuTrigger asChild` + `TooltipTrigger asChild` ordering matters.** Always put `TooltipTrigger` outside `DropdownMenuTrigger`; inverting them breaks tooltip positioning.
- **Title commit on blur fires before navigation.** If the user clicks the back button while the title input is focused, `commitTitle` fires (triggering a save) before navigation. This is correct behavior but should be considered when adding navigation guards.
- **`groups.length` check for Add Question.** Calling `handleAddQuestion` when `groups` is empty silently no-ops (early return), but the button itself should be hidden to avoid confusing UX — ensure the `groups.length > 0` guard is present on both the desktop button and the overflow menu entry.
- **Activate button in overflow menu ignores `readOnly`.** The overflow dropdown's `!readOnly` outer guard is sufficient, but if `readOnly` logic ever changes, the overflow `Activate` entry needs its own guard to match the desktop button's `!readOnly && status === 'draft'` condition.
```
