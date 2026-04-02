---
date: "2026-04-02"
ticket_id: "ISS-046"
ticket_title: "3.10: Survey Preview Mode"
categories: ["testing", "api", "ui", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-046"
ticket_title: "3.10: Survey Preview Mode"
categories: ["react", "routing", "ui-components", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/App.tsx"
  - "frontend/src/pages/SurveyPreviewPage.tsx"
  - "frontend/src/components/survey-builder/QuestionPreview.tsx"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/pages/__tests__/SurveyPreviewPage.test.tsx"
---

# Lessons Learned: 3.10: Survey Preview Mode

## What Worked Well
- Reusing the full-screen page pattern from `SurveyBuilderPage` (outside `AppLayout`, inside `ProtectedRoute`) made routing straightforward with zero friction
- Adding a single optional `interactive` prop to `QuestionPreview` that toggles `pointer-events-none` was a minimal, non-breaking change to the 3.9 component
- Modeling screen state as a discriminated union (`'welcome' | 'group' | 'end'`) kept all branching logic clear and easy to test exhaustively
- The `data-testid` discipline established in earlier tickets paid off heavily — the test file is comprehensive and readable with almost no selector ambiguity
- Scoping the cancellation flag pattern (`let cancelled = false`) from `SurveyBuilderPage` into `SurveyPreviewPage` prevented state-on-unmounted-component warnings in tests

## What Was Challenging
- Deriving `one_page_per_group` correctly required careful defaulting: `survey?.settings?.one_page_per_group !== false` (default true when absent) rather than a truthy check, since `undefined` and `true` both mean paginated mode
- Progress bar semantics needed explicit design: welcome=0, group n=n, end=totalGroups — counting from 1 rather than 0 for current group to feel natural to respondents
- The `SurveyBuilderPage` Full Preview button tests required dynamically importing `SurveyBuilderPage` and manually resetting the Zustand builder store (`useBuilderStore.getState().reset()`) to avoid bleed-over from other test suites

## Key Technical Insights
1. `pointer-events-none` on the wrapper div in `QuestionPreview` is the only gate between display-only and interactive mode — propagating the `interactive` prop through to sub-components was unnecessary since the CSS class at the container level is sufficient
2. The progress bar intentionally excludes the welcome screen from its display condition (`screen === 'group' || screen === 'end'`) — showing it at 0% on welcome would mislead respondents before they start
3. `surveyService.getSurvey` returns `SurveyFullResponse` which includes nested `groups[].questions[]` — sorting groups by `sort_order` at the page level (not inside the service) keeps derivation explicit and testable
4. The `cancelled` flag in async `useEffect` hooks must be checked in both the success and error branches, not just finally, to avoid partial state updates on rapid unmounts

## Reusable Patterns
- **Full-screen protected route outside AppLayout**: nest `<Route path="..." element={<Page />} />` directly under `<Route element={<ProtectedRoute />}>` but outside the `<Route element={<AppLayout />}>` wrapper
- **Screen-state machine for multi-step flows**: `type Screen = 'welcome' | 'group' | 'end'` + `currentIndex` integer cleanly models any wizard/pagination flow
- **Opt-in interactivity via CSS toggle**: a single boolean prop toggling `pointer-events-none` on a container is sufficient to make an entire subtree interactive without threading props through every child
- **MSW per-test overrides for variant surveys**: `server.use(http.get(...))` in `beforeEach` blocks inside nested `describe` groups lets you test mode variants (single-page, multi-group, no-group) without separate fixture files

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyPreviewPage.tsx` — canonical example of a full-screen, multi-screen wizard page with progress tracking
- `frontend/src/components/survey-builder/QuestionPreview.tsx` — shows the `interactive` prop pattern for toggling display-only vs. interactive component trees
- `frontend/src/pages/__tests__/SurveyPreviewPage.test.tsx` — comprehensive test file demonstrating MSW variant overrides, Zustand store resets, and `act`/`waitFor` patterns for state-machine UIs
- `frontend/src/App.tsx` — routing structure showing full-screen pages outside AppLayout

## Gotchas and Pitfalls
- Do not check `survey?.settings?.one_page_per_group === true` for paginated mode — this misses the `undefined` (absent settings) case; always use `!== false`
- When adding the Full Preview button test inside the same test file as `SurveyPreviewPage`, the Zustand builder store must be explicitly reset both before and after the test to prevent cross-test contamination
- The navigation footer is only shown on `screen === 'group'`, not on `screen === 'end'` — omitting the end-screen nav is intentional (no back button from end screen by design)
- `QuestionPreview` renders sub-components without passing `interactive` through — the container-level CSS is the sole interactivity gate, so sub-component inputs must not have their own `disabled` or `readOnly` attributes that would override it
- Progress bar is hidden on the welcome screen and only appears once the user enters a group screen, to avoid displaying 0% before the survey has started
```
