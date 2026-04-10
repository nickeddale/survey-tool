---
date: "2026-04-10"
ticket_id: "ISS-210"
ticket_title: "500 server error on resolve-flow when numeric field is cleared and used in comparison"
categories: ["testing", "api", "ui", "bug-fix", "feature", "documentation"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-10"
ticket_id: "ISS-210"
ticket_title: "500 server error on resolve-flow when numeric field is cleared and used in comparison"
categories: ["expression-evaluator", "error-handling", "numeric-input", "api-stability"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/expressions/evaluator.py"
  - "backend/tests/test_expressions_evaluator.py"
  - "backend/tests/test_logic_resolve_flow.py"
---

# Lessons Learned: 500 server error on resolve-flow when numeric field is cleared and used in comparison

## What Worked Well
- The implementation plan correctly identified the exact failure path: `float('')` raising `ValueError` inside `_coerce_compare`, propagating as an unhandled `EvaluationError` to the API layer.
- Treating empty string as `None` at the binary operator dispatch level (alongside existing `None` guards) was the cleanest fix — it kept `_coerce_compare` focused and consistent with the existing None-returns-False contract.
- The layered test strategy (unit tests for the evaluator, integration test for the endpoint) gave high confidence the fix was complete and didn't regress anything.

## What Was Challenging
- Understanding why the existing `None` guard didn't catch empty strings required tracing the full call chain: UI sends `''`, resolver passes it through (numeric types are excluded from empty-string normalization), then `_coerce_compare` receives `''` and blows up on `float('')`.
- The fix location was subtle: the guard had to be placed in the dispatch block rather than inside `_coerce_compare` itself to match the existing None-handling pattern and avoid divergence.

## Key Technical Insights
1. When a numeric input is cleared in the UI, it is transmitted as an empty string `''`, not `None`. The resolver only normalizes empty strings to `None` for `_STRING_QUESTION_TYPES`, so numeric types pass `''` through to the evaluator unchanged.
2. `float('')` raises `ValueError` in Python, unlike `float('0')` or `float(None)` — the try/except in `_coerce_compare` catches it but then re-raises as `EvaluationError`, which was not being caught at the API boundary.
3. The semantically correct behavior for a cleared numeric field in an ordering comparison (`>`, `<`, `>=`, `<=`) is `False` — the question has no value and cannot be meaningfully ordered. This mirrors how `None` is already handled.
4. The fix must be symmetric: both `left == ''` and `right == ''` need to short-circuit to `False` to handle expressions in either direction (`{Q2} > 100` and `100 < {Q2}`).

## Reusable Patterns
- **Empty-string-as-None for numeric comparisons**: Any ordering operator dispatch guard for `None` should also guard `''` for the same reason — both represent "no value" for numeric fields.
- **Resolve-flow 500 debugging pattern**: When resolve-flow returns 500 on a specific input, trace: UI input value → resolver normalization → evaluator dispatch → coerce/compare internals. The failure almost always lives in a coercion function that doesn't account for all "empty" representations.
- **Test both sides of symmetric operators**: For binary comparison operators, always test `'' > number` and `number > ''` as separate cases since dispatch logic may branch differently.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/evaluator.py` — binary op dispatch and `_coerce_compare`; all ordering operators share the same coercion path
- `backend/app/services/expressions/resolver.py` — `_STRING_QUESTION_TYPES` and empty-string normalization logic; controls what reaches the evaluator
- `backend/tests/test_expressions_evaluator.py` — existing null/empty comparison test patterns to follow
- `backend/tests/test_logic_resolve_flow.py` — integration test patterns for resolve-flow endpoint with edge-case answer values

## Gotchas and Pitfalls
- Do not add the empty-string guard only inside `_coerce_compare` — callers would still need to handle the resulting `EvaluationError`. The cleaner fix is at the dispatch level, consistent with how `None` is handled.
- Do not normalize `''` to `None` inside the resolver for numeric types globally — other parts of the system (e.g., equality checks `==`, `!=`) may need to distinguish between "cleared" and "null" semantics. Scope the guard to ordering operators only.
- The 500 is silent in the UI: the frontend retains the last known visibility state when the API errors, which can appear to be a UI bug rather than a backend crash. Always check server logs when question visibility seems stuck.
- If adding new question types that are numeric but not currently in the resolver's type list, verify they also bypass empty-string normalization — otherwise the evaluator will receive `None` for cleared fields, which is fine, but the inconsistency could cause confusion.
```
