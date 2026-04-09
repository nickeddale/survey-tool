---
date: "2026-04-09"
ticket_id: "ISS-200"
ticket_title: "Test Expression evaluator always returns true regardless of input"
categories: ["bug-fix", "api", "frontend", "expression-engine"]
outcome: "success"
complexity: "medium"
files_modified: []
---

# Lessons Learned: Test Expression evaluator always returns true regardless of input

## What Worked Well
- The existing `Evaluator` class and `evaluate()` function in `services/expressions/evaluator.py` worked without modification — the backend already had all the evaluation logic; it just wasn't exposed via an endpoint.
- Separating the evaluate endpoint cleanly from the validate endpoint kept the router well-organized. The two endpoints share schema types (`ExpressionErrorSchema`) but have distinct request/response models.
- Extracting `handleTestExpression` as a standalone exported pure function from `ExpressionPreview.tsx` made the frontend easy to unit test without mounting the full component, allowing direct assertion on API call shape.
- The two-phase error reporting approach (parse errors → evaluation errors, both returning `null` result with populated `errors` list) gave a clean, consistent response shape regardless of failure mode.
- Colocating tests for both the pure helper and the rendered component in the same test file kept coverage consolidated.

## What Was Challenging
- The root cause was subtle: the frontend was calling the validation endpoint and treating "no errors" as "evaluates to true" — a semantic conflation of syntactic validity with runtime truth value. The fix required reasoning about the distinction between "this expression is syntactically valid" vs. "this expression evaluates to true given these inputs."
- Bool coercion in the backend endpoint required duplicating the `_to_bool` logic from the `Evaluator` class inline, since `evaluate()` returns `Any` rather than `bool`. This is a minor DRY violation but acceptable given the boundary between parsing/evaluation layers.
- The evaluate endpoint accidentally called `_parse_survey_uuid` twice (once before the ownership check and once inside). This is a latent redundancy that does not affect correctness but could be cleaned up.

## Key Technical Insights
1. **Validation ≠ Evaluation**: `validate_expression` checks syntax and semantic correctness; it says nothing about the runtime result. A valid expression like `{Q1} == 'Yes'` with Q1='No' is syntactically valid but evaluates to `false`. These are distinct operations requiring distinct endpoints.
2. **Send raw expression + context dict, not interpolated string**: The previous approach interpolated sample values into the expression string before sending (e.g., turning `{Q1} == 'Yes'` into `'No' == 'Yes'`), which bypasses the variable resolution in the evaluator and produces incorrect results when values contain special characters or quotes. The correct pattern is to send the expression unchanged and pass sample values as a separate `context` dict.
3. **`null` result vs. `false` result**: The response distinguishes `result: null` (could not evaluate — syntax error or evaluation exception) from `result: false` (successfully evaluated to a falsy value). Frontend must treat these differently: `null` means "show errors", `false` means "show false badge".
4. **FastAPI + `from __future__ import annotations` interaction**: Since `logic.py` already had rate limiting and `request: Request` params in place, and did NOT have `from __future__ import annotations`, adding the new endpoint alongside existing ones avoided the known ForwardRef resolution bug (documented in MEMORY.md). No migration of annotations style was needed.
5. **Missing variable in context resolves to `None`/falsy**: The evaluator treats absent context keys as `None`, so `{Q1} == 'Yes'` with empty context evaluates to `False` cleanly rather than raising an error. This is correct and expected behavior for the test panel use case.

## Reusable Patterns
- **Backend evaluate endpoint pattern**: `tokenize → parse (catch LexerError/ParserError → return null + SYNTAX_ERROR) → evaluate (catch EvaluationError → return null + SYNTAX_ERROR) → coerce to bool → return result`. Always return HTTP 200; surface errors in the response body.
- **Frontend pure function extraction**: Extract the API call logic from the React component into an exported `handleXxx` function that takes plain arguments and returns a typed result. Test this function directly with MSW without mounting the component. Mount the component only for integration/render tests.
- **MSW body capture pattern for contract testing**: In frontend tests, capture the request body inside the MSW handler to assert that the correct payload shape is sent — especially important when verifying that values are NOT interpolated/transformed before sending.
- **Shared `ExpressionErrorSchema`**: Both validate and evaluate endpoints reuse the same error schema. When adding new logic endpoints, prefer reusing this schema rather than defining a new error shape.

## Files to Review for Similar Tasks
- `backend/app/api/logic.py`: All expression-related endpoints. Follow existing patterns for survey ownership verification, rate limiting, and error response shapes.
- `backend/app/services/expressions/evaluator.py`: The `evaluate()` function and `EvaluationError` — understand what it returns and what exceptions it raises before building around it.
- `backend/app/services/expression_engine.py`: The `validate_expression()` wrapper — useful reference for the validate endpoint but not needed for evaluate.
- `frontend/src/components/survey-builder/ExpressionPreview.tsx`: The test panel component. Future changes to the evaluate UX (e.g., adding numeric result display, streaming evaluation) start here.
- `frontend/src/services/surveyService.ts`: Add new endpoint client methods here. Keep `EvaluateExpressionPayload` and related types aligned with the backend schema.
- `backend/tests/test_logic_evaluate_expression.py`: Reference test structure for future logic endpoint tests.

## Gotchas and Pitfalls
- **Do not interpret absence of errors as `true`**: This is the exact bug that was fixed. Any test or UI logic that equates "validated successfully" with "evaluates to true" will regress this fix.
- **`evaluate()` returns `Any`, not `bool`**: The raw result requires explicit coercion. `None`, `0`, `""`, and `[]` are all falsy. Do not rely on Python's implicit bool coercion via `bool(result)` alone — handle `None` explicitly to distinguish "evaluated to falsy" from "evaluation failed".
- **Duplicate `_parse_survey_uuid` call**: The evaluate endpoint calls `_parse_survey_uuid(survey_id)` twice — once at the top (result discarded) and again before the ownership check. This is harmless but worth noting if refactoring the function.
- **Context values are strings from the frontend**: The frontend sends `Record<string, string>` context. The evaluator must handle string-to-number coercion for numeric comparisons (e.g., `{Q1} > 18` with `Q1: "25"`). Verify that the evaluator handles this before adding new numeric expression types.
- **Rate limiting applies**: The evaluate endpoint is rate-limited with `RATE_LIMITS["default_mutating"]`. Backend tests using the `client` fixture should not hit this in isolation since the test config resets the limiter per test, but concurrent or bulk test scenarios could be affected.