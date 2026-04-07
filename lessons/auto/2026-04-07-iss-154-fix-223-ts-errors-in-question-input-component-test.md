---
date: "2026-04-07"
ticket_id: "ISS-154"
ticket_title: "Fix 223 TS errors in question input component tests"
categories: ["testing", "api", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-07"
ticket_id: "ISS-154"
ticket_title: "Fix 223 TS errors in question input component tests"
categories: ["typescript", "testing", "refactoring", "type-safety"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/types/survey.ts"
  - "frontend/src/components/question-inputs/__tests__/ExpressionDisplay.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/HtmlContent.test.tsx"
  - "frontend/src/components/__tests__/AppLayout.test.tsx"
  - "frontend/src/components/survey-builder/QuestionEditor.tsx"
  - "frontend/src/components/survey-builder/__tests__/ExpressionPreview.test.tsx"
  - "frontend/src/components/survey-builder/__tests__/GroupPanel.test.tsx"
  - "frontend/src/components/survey-builder/__tests__/LogicEditor.test.tsx"
  - "frontend/src/components/survey-builder/__tests__/QuestionEditor.test.tsx"
  - "frontend/src/components/survey-builder/__tests__/QuestionPreview.test.tsx"
  - "frontend/src/components/__tests__/ProtectedRoute.test.tsx"
  - "frontend/src/components/__tests__/PublicRoute.test.tsx"
  - "frontend/src/components/question-inputs/__tests__/ShortTextInput.test.tsx"
  - "frontend/src/contexts/__tests__/AuthContext.test.tsx"
  - "frontend/src/pages/__tests__/AssessmentsPage.test.tsx"
  - "frontend/src/pages/__tests__/DashboardPage.test.tsx"
  - "frontend/src/pages/__tests__/LoginPage.test.tsx"
  - "frontend/src/pages/__tests__/ParticipantsPage.test.tsx"
  - "frontend/src/pages/__tests__/QuotasPage.test.tsx"
  - "frontend/src/pages/__tests__/SettingsPage.test.tsx"
  - "frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx"
  - "frontend/src/pages/__tests__/SurveyDetailPage.test.tsx"
  - "frontend/src/pages/__tests__/SurveyFormPage.test.tsx"
  - "frontend/src/pages/__tests__/SurveyPreviewPage.test.tsx"
  - "frontend/src/pages/__tests__/SurveysPage.test.tsx"
  - "frontend/src/pages/__tests__/WebhooksPage.test.tsx"
  - "frontend/src/services/__tests__/assessmentService.test.ts"
  - "frontend/src/services/__tests__/participantService.test.ts"
---
```

# Lessons Learned: Fix 223 TS errors in question input component tests

## What Worked Well
- A single type change in a shared interface (`QuestionResponse.settings` in `survey.ts`) resolved the vast majority (~290) of errors across all question-input test files in one shot — confirming the value of identifying the root cause before touching individual test files
- Running `npx tsc --noEmit` after each fix gave fast, precise feedback on error reduction, making it easy to verify progress without running the full test suite
- The implementation plan correctly identified that `BuilderQuestion` (in `builderStore.ts`) extends `QuestionResponse`, so the settings type fix propagated through the inheritance chain automatically

## What Was Challenging
- The 223 errors reported in the ticket title understated the actual scope — the true count across all affected files was closer to 347, spanning not just question-input tests but also survey-builder tests, page tests, service tests, and auth context tests
- Secondary errors were heterogeneous: unused imports (TS6133), wrong auth token call signatures, and incorrect `screen.unmount()` usage each required a different fix, making the work feel scattered after the main type change
- Distinguishing which errors were caused by the `settings` type mismatch versus pre-existing drift in test fixtures required careful reading of each error before acting

## Key Technical Insights
1. **Widening a shared interface type is a high-leverage fix for cascading TS errors**: changing `Record<string, unknown> | null` to a specific union type (`QuestionSettings | null`) both narrows the type correctly and satisfies test fixtures that were already passing specific `settings` shapes
2. **`screen.unmount()` does not exist** — React Testing Library's `screen` object has no `unmount` method; the correct pattern is to destructure `unmount` from the `render(...)` return value and call that
3. **Auth store token signature changes silently break many tests**: any test that calls `setTokens(...)` with a stale signature (e.g., passing `refresh_token` after it was removed from the interface) will produce TS2345 errors scattered across unrelated test files, not just auth-specific ones
4. **TS6133 unused import errors in test files** are a sign that test setup/teardown hooks (`beforeEach`, `afterEach`) were removed or never used but their imports were not cleaned up — always audit imports when removing hooks
5. When a type is used by both production code and tests, fixing it in the type file is always preferable to suppressing errors per-file with `// @ts-ignore` or `as unknown as X` casts

## Reusable Patterns
- **Root-cause-first approach for mass TS errors**: when many test files share the same TS2322 error shape, find the single shared interface or type and fix it there before touching individual files
- **`tsc --noEmit` as a progress meter**: run after each logical group of changes; a large drop in errors confirms the fix was correct; no drop signals the wrong location was edited
- **Correct `unmount` pattern in RTL**:
  ```ts
  const { unmount } = render(<MyComponent />);
  // ...
  unmount(); // correct
  // NOT: screen.unmount() — this does not exist
  ```
- **Auth token test helper pattern**: when the auth store's token interface changes, update a single test helper/factory function rather than patching each test call site individually

## Files to Review for Similar Tasks
- `frontend/src/types/survey.ts` — central interface definitions; `QuestionResponse` and `BuilderQuestion` shape cascades into nearly every component test
- `frontend/src/types/questionSettings.ts` — the `QuestionSettings` union type; add new question type settings here when new input types are added
- `frontend/src/store/builderStore.ts` — `BuilderQuestion` extends `QuestionResponse`; changes to the parent interface affect all builder-related tests
- `frontend/src/store/authStore.ts` — `setTokens` signature; verify this matches all test call sites after any auth-related changes
- `frontend/src/components/question-inputs/__tests__/` — all files in this directory share the same prop-shape assumptions; a component interface change will affect all of them simultaneously

## Gotchas and Pitfalls
- **Do not start by fixing individual test files** when mass TS errors all trace back to one shared type — it wastes time and leaves the root cause unfixed
- **The error count in a ticket description may be stale**: always run `tsc --noEmit` first to get the current error count before estimating effort
- **`screen` from RTL has no `unmount`**: this is a common mistake when refactoring cleanup logic — the `unmount` function comes from the `render()` return value, not from the global `screen` object
- **Removing `refresh_token` from an auth store interface** will silently break every test that passes it, even tests that have nothing to do with authentication — search for all call sites before shipping the interface change
- **TS6133 unused import errors are not always pre-existing**: verify whether imports became unused due to test restructuring in the same branch, to avoid accidentally hiding real cleanup debt
