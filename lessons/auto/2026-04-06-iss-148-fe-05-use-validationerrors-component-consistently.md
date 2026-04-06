---
date: "2026-04-06"
ticket_id: "ISS-148"
ticket_title: "FE-05: Use ValidationErrors component consistently"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-148"
ticket_title: "FE-05: Use ValidationErrors component consistently"
categories: ["frontend", "refactoring", "accessibility", "components"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/components/common/ValidationErrors.tsx
  - frontend/src/components/question-inputs/BooleanInput.tsx
  - frontend/src/components/question-inputs/CheckboxInput.tsx
  - frontend/src/components/question-inputs/DateInput.tsx
  - frontend/src/components/question-inputs/DropdownInput.tsx
  - frontend/src/components/question-inputs/FileUploadInput.tsx
  - frontend/src/components/question-inputs/HugeTextInput.tsx
  - frontend/src/components/question-inputs/ImagePickerInput.tsx
  - frontend/src/components/question-inputs/LongTextInput.tsx
  - frontend/src/components/question-inputs/MatrixDropdownInput.tsx
  - frontend/src/components/question-inputs/MatrixDynamicInput.tsx
  - frontend/src/components/question-inputs/MatrixInput.tsx
  - frontend/src/components/question-inputs/NumericInput.tsx
  - frontend/src/components/question-inputs/RadioInput.tsx
  - frontend/src/components/question-inputs/RankingInput.tsx
  - frontend/src/components/question-inputs/RatingInput.tsx
  - frontend/src/components/question-inputs/ShortTextInput.tsx
  - frontend/src/components/question-inputs/__tests__/BooleanInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/CheckboxInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/DateInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/DropdownInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/FileUploadInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/HugeTextInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/ImagePickerInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/LongTextInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/MatrixDropdownInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/MatrixDynamicInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/MatrixInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/NumericInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/RadioInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/RankingInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/RatingInput.test.tsx
  - frontend/src/components/question-inputs/__tests__/ShortTextInput.test.tsx
  - frontend/src/components/responses/__tests__/SurveyForm.test.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/RegisterPage.tsx
  - frontend/src/pages/SurveyFormPage.tsx
---

# Lessons Learned: FE-05: Use ValidationErrors component consistently

## What Worked Well
- The batch-by-category approach (question-inputs first, then pages) kept regressions isolated and easy to diagnose
- `npx tsc --noEmit` after each batch surfaced missing `id` props and wrong `errors` prop types as clear compiler errors rather than cryptic test failures
- Wrapping single-string error values in an array (`errors={error ? [error] : []}`) avoided any need to extend or modify `ValidationErrors.tsx` props, keeping the shared component contract stable
- All 17 question input components shared an identical inline ul/li pattern, so the replacement was highly mechanical and low-risk once the pattern was confirmed
- Test files for each question input component were updated alongside the component changes, preventing silent test drift

## What Was Challenging
- Test files that asserted on old DOM structure (specific class names like `text-xs text-destructive`, `ul`/`li` elements, or `data-testid` attributes on the error list) required updates across all 17 question input test files — this was the bulk of the work
- Distinguishing between array-based error patterns (suited for ValidationErrors) and single-string patterns (LoginPage, RegisterPage) required a deliberate audit before starting; mixing them up would have either broken the component contract or left some pages non-standard
- Verifying `aria-describedby` linkage was preserved required explicit attention — no test failure occurs if the `id` prop is simply omitted from `<ValidationErrors />`, so it could silently break accessibility

## Key Technical Insights
1. `ValidationErrors.tsx` must guard against empty arrays internally (rendering nothing, not an empty `<ul>`) — confirm this before replacing any conditional inline patterns like `{errors.length > 0 && <ul>...</ul>}`, otherwise every component renders a vacuous element on every render
2. `aria-describedby` on the associated input and the `id` prop on `<ValidationErrors />` must be kept in sync — this linkage is invisible to most tests and requires an explicit assertion or manual accessibility audit to verify
3. Single-string error values (login/register pages) should be wrapped in an array at the call site rather than widening the `ValidationErrors` prop type to accept `string | string[]` — prop contract stability matters more than avoiding a one-liner wrapper
4. When a shared component already exists but is used in only one place, its existing behaviour (empty-array guard, aria attributes, class names) must be read and confirmed before assuming it is a drop-in replacement for 17+ inline patterns
5. TypeScript's structural type system will not catch a missing `id` prop if the prop is optional — always check whether `id` is required for correct aria wiring even when the compiler does not complain

## Reusable Patterns
- **Batch-and-check refactor loop:** process changes in cohesive batches (e.g., all question-inputs → builder components → pages), running `npx tsc --noEmit && vitest run` after each batch to isolate regressions to the most recent set of files
- **Single-string to array wrapping:** `errors={error ? [error] : []}` is the standard pattern for adapting single-string error state to a shared array-based error component without modifying the component
- **Compound grep audit:** after completing replacements, verify no inline patterns remain using a compound search for `text-xs text-destructive`, `role="alert"`, and `.map(` combined with `error`/`err` outside the canonical component file
- **Accessibility linkage test:** for any component that wires `aria-describedby` to an error container `id`, add at least one explicit assertion that the attribute is present and matches the rendered `id` — do not rely on visual review alone
- **Pre-flight behaviour check:** before replacing a conditional inline pattern with a shared component, read the shared component to confirm it handles the empty/null/undefined case identically to the inline guard being replaced

## Files to Review for Similar Tasks
- `frontend/src/components/common/ValidationErrors.tsx` — canonical implementation; check empty-array guard, aria attributes, and class names before reusing
- `frontend/src/components/question-inputs/ShortTextInput.tsx` — representative example of the post-refactor pattern for question input components
- `frontend/src/pages/LoginPage.tsx` — representative example of the single-string-to-array wrapping pattern for page-level error state
- `frontend/src/components/question-inputs/__tests__/ShortTextInput.test.tsx` — representative example of updated test assertions after inline error markup was replaced

## Gotchas and Pitfalls
- **Empty array rendering:** if `ValidationErrors` does not guard against `errors=[]` internally, replacing `{errors.length > 0 && <ul>...</ul>}` with `<ValidationErrors errors={errors} />` will render a vacuous element on every render — verify the guard first
- **Silent aria breakage:** omitting the `id` prop on `<ValidationErrors />` breaks `aria-describedby` linkage without causing any TypeScript or test error unless explicitly asserted
- **Test DOM assertions:** any test querying by `ul`, `li`, specific class names (`text-xs text-destructive`), or `data-testid` on the old inline error markup will silently pass (finding nothing) or fail (finding the wrong element) after the refactor — all test files must be updated alongside component changes
- **Do not extend ValidationErrors for edge cases:** adding a `string | string[]` union to the `errors` prop to accommodate single-string callers widens the contract for all existing usages and risks regressions — always wrap at the call site instead
- **Import hygiene:** each of the 17 question input files requires a new import for `ValidationErrors`; a missing import compiles silently if a local variable shadows the name — run `tsc --noEmit` to catch this class of error early
```
