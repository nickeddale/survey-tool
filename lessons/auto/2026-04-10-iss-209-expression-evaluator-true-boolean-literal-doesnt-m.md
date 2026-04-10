---
date: "2026-04-10"
ticket_id: "ISS-209"
ticket_title: "Expression evaluator: == true (boolean literal) doesn't match yes_no question string values"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-10"
ticket_id: "ISS-209"
ticket_title: "Expression evaluator: == true (boolean literal) doesn't match yes_no question string values"
categories: ["expression-engine", "type-coercion", "yes-no-questions", "relevance"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/expressions/evaluator.py"
  - "backend/tests/test_expressions_evaluator.py"
  - "backend/tests/test_expressions_relevance.py"
---

# Lessons Learned: Expression evaluator: == true (boolean literal) doesn't match yes_no question string values

## What Worked Well
- The fix was surgical: a single new coercion branch added to `_coerce_equal` in `evaluator.py` (lines 298–316), with no changes needed to the parser, lexer, resolver, or any other layer.
- Reusing the same string-to-bool vocabulary (`_BOOL_TRUE_STRINGS` / `_BOOL_FALSE_STRINGS`) already implicit in `resolver._to_bool` kept the behaviour consistent across the stack.
- Both operand orderings (bool left + str right, and str left + bool right) were handled symmetrically, preventing subtle asymmetry bugs.
- The implementation plan mapped exactly to execution: no deviations, no rework.
- Test coverage was comprehensive: true/false combinations in both directions, `!=` variants, alternative truthy strings (`yes`, `no`), unrecognised strings, direct `_coerce_equal` calls, and full integration tests through `evaluate_relevance`.

## What Was Challenging
- Python's `bool` is a subclass of `int`, so existing branches that exclude `isinstance(x, bool)` had to be respected carefully to avoid the new branch interfering with numeric coercion paths.
- The coercion sets are defined inline inside the method rather than as module-level constants; this is consistent with the surrounding code style but means they are reconstructed on every call to `_coerce_equal` where the branch is reached. For hot paths this could be a micro-optimisation opportunity.

## Key Technical Insights
1. **Type mismatch between storage layer and expression layer**: The public survey form stores `yes_no` answers as the strings `'true'`/`'false'`, but the logic editor generates bare boolean literals (`== true`). These two representations must be reconciled at evaluation time because they come from different subsystems with no shared normalisation step.
2. **`bool` is a subclass of `int` in Python**: The existing numeric coercion guards (`not isinstance(x, bool)`) were already in place; the new string-to-bool branch must be placed *after* all numeric paths so it does not conflict.
3. **Placement order matters in `_coerce_equal`**: The method falls through a chain of type-specific branches. The bool/string coercion branch must sit after numeric coercion and before the final `return False` to avoid shadowing or being shadowed by other branches.
4. **Symmetric operand handling is non-negotiable**: Survey expressions can be written as either `{Q1} == true` (variable on left) or `true == {Q1}` (literal on left). Both orderings must be handled explicitly.
5. **Integration tests confirm end-to-end correctness**: Unit tests on `_coerce_equal` directly verify the coercion logic, but the integration tests through `evaluate_relevance` in `test_expressions_relevance.py` are the true regression guard because they exercise the resolver → evaluator pipeline that runs during actual survey form rendering.

## Reusable Patterns
- **Bool/string coercion via vocabulary sets**: Defining `_BOOL_TRUE_STRINGS` and `_BOOL_FALSE_STRINGS` as `frozenset`s is a clean, fast, and extensible pattern for mapping string representations of booleans. The same vocabulary (`true`, `yes`, `1`, `y` / `false`, `no`, `0`, `n`) is the right canonical set for survey contexts.
- **Testing `_coerce_equal` directly**: Because `_coerce_equal` is a `@staticmethod`, it can be called as `Evaluator._coerce_equal(left, right)` in tests without building a full AST. This is a lightweight way to cover coercion edge cases without round-tripping through the lexer and parser.
- **Pairing unit + integration tests for evaluator changes**: Unit tests on the static helper catch the coercion logic; integration tests through `evaluate_relevance` catch pipeline issues (e.g. resolver normalisation interfering with evaluator expectations).

## Files to Review for Similar Tasks
- `backend/app/services/expressions/evaluator.py` — `_coerce_equal` (lines 265–317): the central location for all equality type-coercion rules. Any new type-coercion requirement should be added here.
- `backend/app/services/expressions/resolver.py` — `_to_bool` and answer normalisation logic: understand what values reach the evaluator from the resolver before adding coercion in the evaluator.
- `backend/tests/test_expressions_evaluator.py` — ISS-209 section (lines 1184–1262): reference test patterns for future coercion unit tests.
- `backend/tests/test_expressions_relevance.py` — ISS-209 section (lines 659–712): reference integration test patterns for future yes/no or type-mismatch relevance scenarios.

## Gotchas and Pitfalls
- **Do not use `== True` / `== False` for bool identity checks inside the coercion branch**: use `is True` / `is False`. Python's `==` on bools would pass for `1 == True` (since `bool` is a subclass of `int`), causing numeric `1` to incorrectly match the bool/string coercion branch.
- **The fix does not normalise `yes_no` answers at the resolver level**: this is intentional. The coercion is handled in the evaluator so that the resolver does not need to know about expression syntax, maintaining separation of concerns. A future attempt to "fix this properly" by normalising in the resolver would require understanding all downstream consumers of resolver output.
- **Unrecognised strings return `False`, not an error**: `'maybe' == true` silently returns `False`. This matches the general evaluator philosophy of returning `False` for unresolvable comparisons rather than raising, which keeps hidden/visible logic predictable.
- **`_BOOL_TRUE_STRINGS` / `_BOOL_FALSE_STRINGS` are case-insensitive via `.lower()`**: the comparison normalises the string to lowercase before lookup. Strings like `'TRUE'` or `'Yes'` are handled correctly. Do not remove the `.lower()` call.
```
