---
date: "2026-04-03"
ticket_id: "ISS-068"
ticket_title: "4.12: Frontend — Client-Side Validation Framework"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-068"
ticket_title: "4.12: Frontend — Client-Side Validation Framework"
categories: ["validation", "react-hooks", "testing", "frontend-architecture"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/utils/validation.ts"
  - "frontend/src/components/common/ValidationErrors.tsx"
  - "frontend/src/hooks/useValidation.ts"
  - "frontend/src/utils/__tests__/validation.test.ts"
  - "frontend/src/components/common/__tests__/ValidationErrors.test.tsx"
  - "frontend/src/hooks/__tests__/useValidation.test.ts"
---

# Lessons Learned: 4.12: Frontend — Client-Side Validation Framework

## What Worked Well
- Separating the core `validateAnswer()` function as a pure utility made it trivially testable with plain Vitest — no React infrastructure needed, no act() concerns, fast feedback loop
- The three-layer architecture (pure function → presentational component → stateful hook) kept each piece independently testable and easy to reason about
- Extracting validation logic from individual input components into one place eliminated duplication that had been spread across 18 component files
- The `ValidationErrors` component stayed purely presentational (props-in, JSX-out), which kept its test surface minimal
- Using `Record<questionId, string[]>` as the errors shape in `useValidation` made it easy to target per-question error display without index juggling

## What Was Challenging
- Consolidating 18 question types with different constraint shapes (min/max length, min/max value, regex, min/max choices, file size/type) into a single function signature required careful enumeration to avoid missed cases
- The `validation` JSONB field on questions is open-ended, so defensive access patterns were needed throughout to avoid runtime errors on missing keys
- Hook tests using `renderHook()` required the same act() discipline as full component tests — forgetting this caused async state warnings that contaminated subsequent tests

## Key Technical Insights
1. Pure functions with no side effects are the ideal unit-test target: `validateAnswer()` needed no mocking, no DOM, and no async handling — plain `expect(validateAnswer(q, a)).toEqual(...)` covered the full contract
2. `act()` is required around any hook call that mutates React state, even when using `renderHook()` — `validateField`, `validateAll`, and `clearErrors` all needed `act()` wrappers or warnings leaked into later tests
3. `localStorage.removeItem('devtracker_refresh_token')` in `beforeEach` is mandatory for any test file that renders React components or uses `renderHook()` — without it, `AuthProvider.initialize()` fires async state updates outside act() and contaminates the test run
4. If `useValidation` ever introduces debouncing or `setTimeout` for blur validation, fake timers must be cleaned up with `vi.useRealTimers()` in `afterEach` — otherwise downstream tests that rely on promise resolution will silently time out
5. `role="alert"` with `aria-live="assertive"` on the error list ensures screen readers announce validation errors without requiring focus to move — this is the correct pattern for inline form validation feedback
6. `findBy*` must replace `getBy*` after any hook state change triggered asynchronously; `getBy*` will throw before React has flushed the update

## Reusable Patterns
- **Pure validation core:** Keep `validateAnswer(question, answer): ValidationResult` as a pure function in `utils/` — no React imports, no hooks. This makes it usable outside of components and trivially unit-testable.
- **Three-layer validation stack:** `utils/validation.ts` (pure logic) → `components/common/ValidationErrors.tsx` (display) → `hooks/useValidation.ts` (state management). Each layer has a single responsibility and its own test file.
- **Hook test setup:**
  ```ts
  beforeEach(() => {
    localStorage.removeItem('devtracker_refresh_token')
  })
  // wrap all state-mutating calls:
  act(() => { result.current.validateField(question, answer) })
  ```
- **Import smoke-test:** After creating a new module, verify it imports cleanly before running the full test suite to catch broken exports early.
- **ValidationErrors aria pattern:**
  ```tsx
  <ul role="alert" aria-live="assertive">
    {errors.map((e, i) => <li key={i}>{e}</li>)}
  </ul>
  ```

## Files to Review for Similar Tasks
- `frontend/src/utils/validation.ts` — reference for how all 18 question types are dispatched and how the `validation` JSONB field is accessed defensively
- `frontend/src/hooks/useValidation.ts` — reference for managing per-question error state with `useState` and exposing `validateField`/`validateAll`/`clearErrors`
- `frontend/src/utils/__tests__/validation.test.ts` — reference for writing exhaustive pure-function tests covering boundary values, empty vs null answers, and all type-specific constraints
- `frontend/src/hooks/__tests__/useValidation.test.ts` — reference for `renderHook()` test setup with proper act() wrapping and localStorage cleanup
- `frontend/src/pages/__tests__/SurveysPage.test.tsx` — canonical reference for the standard act() / AuthProvider fix pattern

## Gotchas and Pitfalls
- **Missing `localStorage.removeItem` in hook tests:** Forgetting to clear `devtracker_refresh_token` before rendering or using `renderHook()` causes `AuthProvider.initialize()` to fire outside act(), producing warnings that corrupt subsequent test results
- **`getBy*` after async hook state changes:** Hook state updates from `validateField`/`validateAll` may be asynchronous; always use `findBy*` or `waitFor` when asserting on state that changed after a hook call
- **Fake timer leakage:** Any test using `vi.useFakeTimers()` (e.g., for debounce testing) must call `vi.useRealTimers()` in `afterEach` — leaking fake timers causes downstream tests to silently hang on unresolved promises
- **JSONB validation field access:** The `question.validation` object may be `null`, `undefined`, or missing expected keys — always use optional chaining (`question.validation?.min_length`) throughout `validateAnswer()`
- **Multi-select min/max choices:** `min_choices` and `max_choices` live on the question object (not inside `validation` JSONB) for checkbox/multi-select types — confirm the correct source field during consolidation to avoid silent no-ops
- **act() in `renderHook` tests:** Unlike pure function tests, `renderHook()` tests are React tests and require the full act() discipline — every call to a hook function that triggers `setState` must be wrapped
```
