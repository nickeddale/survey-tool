---
date: "2026-04-09"
ticket_id: "ISS-203"
ticket_title: "No forward reference warning in Logic Editor validation"
categories: ["testing", "api", "ui", "bug-fix", "feature", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-09"
ticket_id: "ISS-203"
ticket_title: "No forward reference warning in Logic Editor validation"
categories: ["backend", "frontend", "validation", "logic-editor"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/expression_engine.py"
  - "backend/tests/test_logic_validate_expression.py"
  - "frontend/src/components/survey-builder/LogicEditor.tsx"
  - "frontend/src/components/survey-builder/QuestionEditor.tsx"
  - "frontend/src/components/survey-builder/__tests__/LogicEditor.test.tsx"
  - "frontend/src/types/survey.ts"
---

# Lessons Learned: No forward reference warning in Logic Editor validation

## What Worked Well
- The existing `ValidationResult` dataclass already had a `warnings` list alongside `errors`, making the semantic reclassification of `FORWARD_REFERENCE` purely a one-line move from `result.errors.append(ExpressionError(...))` to `result.warnings.append(ExpressionWarning(...))`.
- The frontend `LogicEditor` already rendered a `logic-editor-warning` testid via `ValidationFeedback`, so no new UI components were needed — just wiring data through.
- Adding `currentQuestionCode` as an optional prop with a conditional payload (`currentQuestionCode ? { expression, question_code } : { expression }`) kept the API contract backwards compatible: callers without `question_code` continue to receive no forward-reference feedback, which is the correct behaviour.
- The `ExpressionWarningCode` type in `survey.ts` was intentionally defined as `'FORWARD_REFERENCE' | string` (an open union), anticipating that new warning codes would be added later — no breaking type changes were required.
- Test coverage was symmetric: one backend test per scenario (detected, not-detected, omitted), and frontend tests covered both the presence of `question_code` in the request body and its omission.

## What Was Challenging
- Distinguishing where `FORWARD_REFERENCE` lived in the codebase before the fix: the `ErrorCode` Literal union (`expression_engine.py:52-58`) still listed `FORWARD_REFERENCE` after the change, since it was used as the type for `ExpressionError.code`. Leaving it there is correct but can be misleading — the code is no longer emitted as an error at runtime. A comment or separate `WarningCode` Literal would improve clarity.
- The backend required `question_code` to look up `current_sort_order` via `question_sort_orders[question_code]`. This lookup path already existed in `validate_expression()`, but the API router had to pass the optional `question_code` from the request body through to the service — verifying that pipeline was complete required reading the router code carefully.

## Key Technical Insights
1. **Errors vs. warnings is a UI contract, not a data-model contract.** The backend `ValidationResult` already separated `errors` (blocking) from `warnings` (advisory). Moving `FORWARD_REFERENCE` between them only required changing one call site in `expression_engine.py`; the rest of the pipeline (serialisation, frontend rendering) already handled both lists.
2. **Optional context parameters enable graceful degradation.** `question_code` is optional in both the request schema and the `validate_expression()` signature. When absent, no sort-order comparison is attempted, so the endpoint stays useful for callers that don't know the current question (e.g. a raw expression tester with no question context).
3. **Frontend payload construction should be conditional, not additive.** Using a ternary to build the payload (`currentQuestionCode ? { expression, question_code } : { expression }`) avoids sending `question_code: undefined` as a JSON key, which some backends interpret differently from a missing key. This pattern should be followed for any future optional context fields.
4. **`FORWARD_REFERENCE` in the `ErrorCode` Literal is now a dead code path.** The type alias still lists it for historical reasons and type-checking correctness of `ExpressionError`, but nothing in the engine emits it as an error any more. If a future refactor introduces a strict `WarningCode` Literal, this entry can be removed from `ErrorCode`.

## Reusable Patterns
- **Soft-warn instead of hard-error for advisory issues:** Use `result.warnings.append(ExpressionWarning(...))` for conditions that are informational (forward references, deprecated syntax) and reserve `result.errors.append(ExpressionError(...))` for conditions that make the expression definitively invalid.
- **Conditional API payload pattern:** `const payload = optionalField ? { ...base, optionalField } : base` — cleaner than spreading `undefined` values.
- **MSW body capture in tests:** Intercept the request body with `const body = await request.json()` inside an `http.post` handler, then assert on `capturedBody` after `waitFor` resolves — reliable way to verify what the frontend actually sends without mocking the service layer.
- **`makeWarningResult()` helper function:** Centralise mock warning payloads in test helpers so all warning-state tests stay consistent when the warning shape changes.

## Files to Review for Similar Tasks
- `backend/app/services/expression_engine.py` — `validate_expression()` function; the `warnings` append block at line ~229 is the canonical pattern for adding new warning types.
- `backend/app/api/logic.py` — the `validate-expression` POST handler; shows how `question_code` is extracted from the request body and threaded into the service call.
- `frontend/src/components/survey-builder/LogicEditor.tsx` — `scheduleValidation` callback (line ~107); the conditional payload construction is the reference pattern for optional context fields.
- `frontend/src/components/survey-builder/logic/ValidationFeedback.tsx` — renders `logic-editor-warning`; any new warning display UI should extend this component.
- `frontend/src/types/survey.ts` — `ExpressionWarningCode` union (line ~100); add new warning codes here when the backend introduces them.
- `backend/tests/test_logic_validate_expression.py` — `test_forward_reference_detected` (line ~301); canonical test structure for warning-in-warnings / not-in-errors assertions.

## Gotchas and Pitfalls
- **`FORWARD_REFERENCE` remains in the `ErrorCode` Literal** (`expression_engine.py:57`) even though it is never emitted as an error after this change. Do not remove it without also removing `ExpressionError` usages that reference it — or switching to a separate `WarningCode` Literal — otherwise `mypy`/pyright will flag the type as unused.
- **Forward-reference detection only fires when both `question_sort_orders` and `current_sort_order` are provided.** If the API router fails to pass `question_code`, or the question code is not found in the sort-orders map, the check is silently skipped — not an error. Confirm the router correctly resolves `question_code` → `sort_order` before assuming detection is active.
- **The frontend filter `q.sort_order < currentSortOrder`** (LogicEditor `eligibleQuestions`) hides forward-referenced questions from the visual builder dropdown but does NOT prevent a user from typing them in raw mode. That is intentional: the warning covers raw-mode forward references that the visual builder cannot produce.
- **Test assertions must check both lists:** always assert `"FORWARD_REFERENCE" not in error_codes` AND `"FORWARD_REFERENCE" in warning_codes` (not just one) to prevent a regression where the code is emitted in both lists simultaneously.
```
