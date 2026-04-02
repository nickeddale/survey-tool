---
date: "2026-04-02"
ticket_id: "ISS-047"
ticket_title: "3.11: Autosave and Save Indicator"
categories: ["testing", "api", "ui", "bug-fix", "feature", "performance", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-047"
ticket_title: "3.11: Autosave and Save Indicator"
categories: ["state-management", "ui-feedback", "optimistic-updates", "navigation-guards"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/store/builderStore.ts"
  - "frontend/src/components/survey-builder/SaveIndicator.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/components/survey-builder/QuestionEditor.tsx"
  - "frontend/src/components/survey-builder/AnswerOptionsEditor.tsx"
  - "frontend/src/store/__tests__/builderStore.test.ts"
  - "frontend/src/components/survey-builder/__tests__/SaveIndicator.test.tsx"
---

# Lessons Learned: 3.11: Autosave and Save Indicator

## What Worked Well
- Centralizing all save state (`saveStatus`, `lastSavedAt`, `saveError`) in the Zustand builder store rather than in component-local state made the indicator trivially easy to wire — any component anywhere in the tree just calls `setSaveStatus`.
- Combining the `setSaveStatus` action to automatically set `lastSavedAt = new Date()` when transitioning to `'saved'` (and clear `saveError`) reduced call-site boilerplate and made state transitions self-consistent.
- The `'idle'` state rendering nothing from `SaveIndicator` was the right default — the toolbar stays clean until the first user edit, avoiding noise on load.
- Checking `UNSAFE_DataRouterContext` before rendering `NavigationBlocker` was an effective guard that allowed the feature to work in the real app (data router) without breaking test environments using the legacy `MemoryRouter/Routes` API.
- Extracting `NavigationBlocker` into its own component that calls `useBlocker` internally kept the hook usage unconditional and avoided Rules of Hooks violations.
- Reusing the existing `undo()` action as the rollback mechanism for failed optimistic saves was clean and already battle-tested from prior tickets.

## What Was Challenging
- `useBlocker` from React Router v6 requires a data router (`createBrowserRouter`/`RouterProvider`) and throws in legacy router contexts. Detecting the data router via `useContext(UNSAFE_DataRouterContext)` works but relies on a private API (`UNSAFE_` prefix) that could break on React Router upgrades.
- The retry button in `SaveIndicator` needed a callback prop rather than a store action because "retry" has no generic meaning at the store level — each save path (drag-end, option edit, question patch) has a different retry surface. The actual retry in `SurveyBuilderPage` was simplified to `setSaveStatus('idle')` since real retry requires re-triggering the original async operation, not resetting status alone.
- The debounce in `QuestionEditor.schedulePatch` sets `saveStatus` to `'saving'` immediately (before the timeout fires) which is correct UX-wise but means `saving` status is active during the debounce window even though no network request has started yet. This is an acceptable trade-off that matches user expectations.
- `AnswerOptionsEditor` uses `defaultValue` (uncontrolled) for option title/assessment inputs and saves on `onBlur`, so those saves are immediate (not debounced). This diverges from the `QuestionEditor` debounce pattern and must be kept in mind when reasoning about save status transitions.

## Key Technical Insights
1. Centralizing save status in the store (not per-component) is the right approach whenever multiple heterogeneous components (editor, options editor, drag-and-drop) all need to update a single shared indicator.
2. The `setSaveStatus` action consolidates three related fields (`saveStatus`, `saveError`, `lastSavedAt`) in a single atomic update — this prevents intermediate render states where, e.g., `saveStatus` is `'saved'` but `lastSavedAt` is still `null`.
3. Resetting save state in both `loadSurvey` and `reset` is critical — failing to do so would cause a stale `'error'` indicator from a previous survey session to persist after loading a new survey.
4. `beforeunload` only fires a browser-native dialog on tab close/refresh — React Router navigation bypasses it entirely. Both guards (`beforeunload` + `useBlocker`) are needed to cover both escape routes.
5. The `'saving'` state is also treated as "unsaved" in `hasUnsavedChanges` (alongside `'error'`), which is correct: navigating away mid-save would abort the in-flight request and lose data.

## Reusable Patterns
- **Centralised save status slice**: `saveStatus: 'idle' | 'saving' | 'saved' | 'error'` + `saveError` + `lastSavedAt` as a reusable Zustand slice for any feature that performs async mutations with visible feedback.
- **Optimistic-update + undo-on-failure**: apply store mutation → `setSaveStatus('saving')` → `await api()` → `setSaveStatus('saved')` in try, `undo(); setSaveStatus('error', msg)` in catch. Consistent across `handleDragEnd`, `AnswerOptionsEditor`, and comparable patterns.
- **Debounced patch with immediate status**: `setSaveStatus('saving')` before the debounce timer, actual API call inside the timer — gives immediate visual feedback while batching rapid edits.
- **Conditional `useBlocker` via context guard**: wrap `<NavigationBlocker>` in `{dataRouterContext && <NavigationBlocker />}` to safely use `useBlocker` only when a data router is present.
- **`aria-live` regions on save indicator**: `polite` for saving/saved states, `assertive` for error — screen reader–appropriate urgency levels for each state.

## Files to Review for Similar Tasks
- `frontend/src/store/builderStore.ts` — canonical example of the save status slice (`SaveStatus` type, `setSaveStatus` action, reset in `loadSurvey` and `reset()`).
- `frontend/src/components/survey-builder/SaveIndicator.tsx` — minimal, store-driven indicator component with `data-testid` attributes on each state branch.
- `frontend/src/pages/SurveyBuilderPage.tsx` — shows `NavigationBlocker` isolation pattern and `beforeunload` guard wired to store-derived `hasUnsavedChanges`.
- `frontend/src/components/survey-builder/QuestionEditor.tsx` — `schedulePatch` helper demonstrating debounced save with immediate status update.
- `frontend/src/store/__tests__/builderStore.test.ts` — `setSaveStatus` describe block for state transition test patterns.
- `frontend/src/components/survey-builder/__tests__/SaveIndicator.test.tsx` — per-state rendering tests and `onRetry` callback verification.

## Gotchas and Pitfalls
- **`UNSAFE_DataRouterContext` is private**: it works today but React Router can rename or remove it. Consider an alternative approach (e.g. a feature flag or try/catch around `useBlocker`) if upgrading React Router.
- **Retry is UI reset, not re-execution**: `onRetry={() => setSaveStatus('idle')}` only hides the error indicator; it does not re-send the failed request. A true retry would require storing and replaying the last failed operation, which was out of scope here.
- **`beforeunload` message is ignored by modern browsers**: the browser always shows its own generic message regardless of `e.returnValue`. Don't rely on custom text in the `beforeunload` handler.
- **Optimistic option creation uses a temp ID**: `optimistic-${Date.now()}` is used for `addOption` before the API responds. The temp option is removed and replaced with the real one on success. Ensure `undo()` in the catch path undoes the `addOption`, not the `removeOption`.
- **`saving` status starts before the debounce fires**: in `QuestionEditor`, the UI shows "Saving…" for the full debounce window (500ms) even before the network request begins. Do not interpret this as the API being slow.
- **No per-entity dirty tracking was implemented**: the plan included `dirtyEntities: Set<string>` for selective sync, but the final implementation uses a simpler coarse-grained save status. This is fine for current scale but could cause unnecessary full reloads if entity-level diffing becomes important later.
```
