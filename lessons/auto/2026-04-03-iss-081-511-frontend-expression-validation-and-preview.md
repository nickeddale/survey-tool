---
date: "2026-04-03"
ticket_id: "ISS-081"
ticket_title: "5.11: Frontend — Expression Validation and Preview"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-081"
ticket_title: "5.11: Frontend — Expression Validation and Preview"
categories: ["frontend", "validation", "react", "testing", "typescript"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/components/survey-builder/LogicEditor.tsx"
  - "frontend/src/components/survey-builder/ExpressionPreview.tsx"
  - "frontend/src/services/surveyService.ts"
  - "frontend/src/types/survey.ts"
  - "frontend/src/mocks/handlers.ts"
  - "frontend/src/components/survey-builder/__tests__/LogicEditor.test.tsx"
  - "frontend/src/components/survey-builder/__tests__/ExpressionPreview.test.tsx"
---

# Lessons Learned: 5.11: Frontend — Expression Validation and Preview

## What Worked Well
- The debounce pattern using `useRef` to store the timeout ID was already partially in place, making the 600ms → 500ms fix and cleanup straightforward.
- MSW mock handlers provided a clean seam for testing all validation states (valid, error, warning, loading) without real network calls.
- Separating `ExpressionPreview` into its own component kept `LogicEditor` focused and made each independently testable.
- Extracting the test-expression logic into a pure `handleTestExpression(expression, sampleValues, service)` function enabled unit testing without mounting the full component tree.

## What Was Challenging
- Updating `ValidateExpressionResult` from flat `string[]` errors/warnings to structured objects with `position` and `code` fields required coordinated changes across `survey.ts`, `surveyService.ts`, and `handlers.ts` — a shape mismatch in any one of them silently passes TypeScript but breaks runtime behavior or tests.
- Fake timers for debounce testing interact poorly with MSW promise resolution: timers left running after a test case silently cause all subsequent MSW-dependent tests to time out with no obvious error pointing back to the leak.
- `userEvent` interactions that trigger debounced state updates must be wrapped in `act()`, or React produces act() warnings that contaminate subsequent `renderHook` calls and obscure real failures.
- Broken type exports in `survey.ts` surface as cryptic vitest collection errors rather than clear TypeScript import errors, making them hard to diagnose without a targeted smoke-test step.

## Key Technical Insights
1. **Type shape mismatches are silent at runtime.** When updating a TypeScript interface from `string[]` to `ExpressionError[]`, TypeScript will not catch the mismatch if the service returns `any` or if the MSW handler returns the old shape. Add an explicit shape assertion in at least one test for each mock response.
2. **Fake timer cleanup is mandatory.** `vi.useFakeTimers()` must always be paired with `vi.useRealTimers()` in `afterEach`. A leaked fake timer does not fail immediately — it causes unrelated downstream tests to time out, making the root cause very hard to find.
3. **`useRef` + `clearTimeout` in useEffect cleanup prevents post-unmount timer fires.** Without cleanup, the debounced validation API call fires after component teardown and produces act() warnings that contaminate subsequent test runs.
4. **Run an import smoke-test after type changes.** Before running the full vitest suite, verify `survey.ts` exports are valid: `node -e "import('./src/types/survey.ts')"` or equivalent. This surfaces broken exports with a clear error rather than a cryptic collection failure.
5. **MSW handler shape must exactly mirror the TypeScript type.** The mock handler for `POST /surveys/:surveyId/logic/validate-expression` must include `errors[].position`, `errors[].code`, `warnings[].position`, `warnings[].code`, and `parsed_variables` — any omission will not error at runtime but will cause silent UI rendering failures or incorrect test assertions.

## Reusable Patterns
- **Debounce with cleanup:** Store timeout ID in `useRef<ReturnType<typeof setTimeout> | null>`, call `clearTimeout` in the `useEffect` cleanup return. Reset to 500ms. Never leave debounce timeouts uncleaned on unmount.
- **Pure handler extraction for testability:** Extract `handleTestExpression(expression, sampleValues, service)` as a standalone function that can be unit-tested without mounting a component. Apply this pattern to any async action triggered by user input in a panel/modal component.
- **Structured validation UI pattern:** Green check icon on valid, red inline message with character position on error, amber message on warning, neutral variable list for `parsed_variables`. This tri-state pattern is reusable for any expression/formula editor in the survey builder.
- **Fake timer test pattern:**
  ```ts
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  // wrap userEvent + advanceTimersByTime in act()
  await act(async () => {
    await userEvent.type(input, 'expr');
    vi.advanceTimersByTime(500);
  });
  ```
- **MSW shape assertion:** In at least one test per mock endpoint, destructure and assert the shape of the mock response object to confirm it matches the TypeScript type before asserting on UI output.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/LogicEditor.tsx` — debounce + validation UI tri-state pattern, useRef cleanup
- `frontend/src/components/survey-builder/ExpressionPreview.tsx` — sample-value input + true/false result panel pattern
- `frontend/src/services/surveyService.ts` — typed API call pattern for structured validation responses
- `frontend/src/types/survey.ts` — `ExpressionError`, `ExpressionWarning`, `ValidateExpressionResult` type definitions
- `frontend/src/mocks/handlers.ts` — structured mock response shape for validate-expression endpoint
- `frontend/src/components/survey-builder/__tests__/LogicEditor.test.tsx` — fake timer + MSW + act() integration test pattern
- `frontend/src/components/survey-builder/__tests__/ExpressionPreview.test.tsx` — pure handler unit test pattern

## Gotchas and Pitfalls
- **Never leave `vi.useFakeTimers()` running between tests.** The failure mode is silent: unrelated tests that depend on MSW promises begin timing out with no obvious link to the fake timer leak.
- **Always wrap `userEvent` in `act()` when it triggers debounced state updates.** Events dispatched outside React's act boundary produce act() warnings that contaminate `renderHook` calls in subsequent tests.
- **MSW handler shape must be kept in sync with TypeScript types manually.** There is no compile-time enforcement between the two — treat every type update to `ValidateExpressionResult` as requiring a corresponding handler update and a shape assertion test.
- **Run an import smoke-test before `vitest` after any `survey.ts` edit.** Broken exports produce misleading collection errors, not TypeScript errors.
- **`URL.createObjectURL` must be mocked if any rendered content involves blob URLs.** Add `URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')` and restore with `vi.restoreAllMocks()` in `afterEach` to prevent obscure errors.
- **Debounce timing must be exactly 500ms.** The previous value of 600ms was a latent mismatch with the ticket spec; verify the constant matches the spec whenever copying this debounce pattern to a new component.
```
