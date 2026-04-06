---
date: "2026-04-06"
ticket_id: "ISS-145"
ticket_title: "FE-02: Break up LogicEditor"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-145"
ticket_title: "FE-02: Break up LogicEditor"
categories: ["frontend", "refactoring", "react", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/components/survey-builder/LogicEditor.tsx
  - frontend/src/components/survey-builder/logic/types.ts
  - frontend/src/components/survey-builder/logic/expressionUtils.ts
  - frontend/src/components/survey-builder/logic/ValueInput.tsx
  - frontend/src/components/survey-builder/logic/ConditionRowEditor.tsx
  - frontend/src/components/survey-builder/logic/ConditionGroupEditor.tsx
  - frontend/src/components/survey-builder/logic/ValidationFeedback.tsx
  - frontend/src/components/survey-builder/__tests__/expressionUtils.test.ts
  - frontend/src/components/survey-builder/__tests__/ConditionRowEditor.test.tsx
---

# Lessons Learned: FE-02: Break up LogicEditor

## What Worked Well
- Extracting pure utility functions (serialize/parse/operator tables) into `expressionUtils.ts` first provided a stable, independently testable foundation before touching any component code.
- Keeping `types.ts` as a strictly type-only file (zero runtime imports) eliminated any risk of circular dependency chains between `expressionUtils.ts` and sub-component files.
- Preserving all `data-testid` attributes exactly in place during extraction meant the existing `LogicEditor.test.tsx` continued to pass without a single line change.
- Bottom-up extraction order (utilities → leaf components → composite components → root) minimised the number of times any single file needed to be revisited.

## What Was Challenging
- Identifying the precise extraction boundaries for `ValidationFeedback` required reading conditional rendering wrappers carefully to ensure no `data-testid` attribute was accidentally suppressed.
- Fake timer leakage is a silent failure mode: if any test file uses `vi.useFakeTimers()` without a matching `vi.useRealTimers()` in `afterEach`, downstream async assertions in `ConditionGroupEditor` tests time out with no obvious error message.
- `userEvent.setup()` interactions not wrapped in `act()` produce warnings that contaminate subsequent `renderHook` calls in the same suite, causing misleading failures unrelated to the code under test.

## Key Technical Insights
1. **Circular import prevention**: `types.ts` must contain only `interface` and `type` declarations — no `import` statements for values. Any operator constants (e.g., `TEXT_OPERATORS`) belong in `expressionUtils.ts`, not in `types.ts`, even if they feel like "configuration".
2. **Round-trip test coverage**: For expression serialization, assert both `serialize(parse(expr)) === expr` and `parse(serialize(group))` deep-equals the original group. This catches asymmetric bugs in either direction that a one-way test would miss.
3. **Import smoke-test before running Vitest**: Running `npx tsc --noEmit` after the refactor surfaces broken re-exports and circular imports as clear TypeScript errors rather than cryptic Vitest collection failures.
4. **data-testid attributes survive file moves**: Moving JSX to a sub-component file does not change the rendered attribute — but conditional rendering wrappers that previously relied on local state may need their predicates passed as props to the sub-component to keep the attribute visible.
5. **Handler extraction for testability**: Pulling `onChange` and condition-builder callbacks out of component bodies into standalone pure functions allows unit-testing the logic without mounting any component tree.

## Reusable Patterns
- **Type-only boundary file**: For any multi-file feature module, create a `types.ts` with zero runtime imports as the shared type contract. All other files import from it; it imports from nothing.
- **Round-trip test template** (`expressionUtils.test.ts`): `expect(serialize(parse(rawExpr))).toBe(rawExpr)` and `expect(parse(serialize(group))).toEqual(group)`.
- **Fake timer cleanup**: Add `afterEach(() => vi.useRealTimers())` to every test file that calls `vi.useFakeTimers()`, regardless of whether individual tests appear to clean up after themselves.
- **act() wrapper for userEvent**: `await act(async () => { await user.click(element); })` — apply consistently to all `userEvent` interactions in sub-component tests to prevent act() boundary warnings.
- **Bottom-up extraction order**: utilities → leaf components → composite components → root orchestrator. Each layer only depends on already-extracted layers, so imports are always resolved before the file that needs them is written.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/logic/types.ts` — canonical example of a type-only boundary file.
- `frontend/src/components/survey-builder/logic/expressionUtils.ts` — canonical example of extracted pure utilities with no component dependencies.
- `frontend/src/components/survey-builder/__tests__/expressionUtils.test.ts` — round-trip test pattern for parse/serialize pairs.
- `frontend/src/components/survey-builder/__tests__/ConditionRowEditor.test.tsx` — independent sub-component render test without mounting the full parent tree.

## Gotchas and Pitfalls
- **Silent fake-timer leakage**: `vi.useFakeTimers()` without `vi.useRealTimers()` in `afterEach` causes async state update assertions in unrelated test files to hang silently — always pair them.
- **act() contamination**: Missing `act()` wrappers around `userEvent` calls do not fail immediately — they produce warnings that surface as false failures in the next `renderHook` test in the suite.
- **Conditional rendering and testids**: When extracting a sub-component that wraps a `data-testid` node in a conditional, ensure the condition predicate is passed as a prop rather than hardcoded — otherwise the testid disappears from the render output and the existing test suite breaks.
- **Operator constant placement**: Operator arrays (`TEXT_OPERATORS`, etc.) look like types but are runtime values. Placing them in `types.ts` creates a value import that breaks the type-only contract and risks circular dependencies if sub-components also import from `expressionUtils.ts`.
- **Mock scope for sub-component hooks**: Do not mock `@dnd-kit` or other heavy external libraries in sub-component tests. Do mock any hooks from sibling sub-components that rely on module-level singletons or context providers — place these `vi.mock()` calls at the top of the test file, not inside individual tests.
```
