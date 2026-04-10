---
date: "2026-04-10"
ticket_id: "ISS-206"
ticket_title: "Expression evaluator crashes on None/NoneType numeric comparisons in OR expressions"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-10"
ticket_id: "ISS-206"
ticket_title: "Expression evaluator crashes on None/NoneType numeric comparisons in OR expressions"
categories: ["expression-engine", "null-handling", "bug-fix", "testing"]
outcome: "success"
complexity: "low"
files_modified:
  - backend/app/services/expressions/evaluator.py
  - backend/tests/test_expressions/test_evaluator.py
---

# Lessons Learned: Expression evaluator crashes on None/NoneType numeric comparisons in OR expressions

## What Worked Well
- The fix was narrowly scoped to `_coerce_compare()` in `evaluator.py`, consistent with the existing pattern established by `_coerce_equal()` and `_to_bool()` which already handle None gracefully
- AND expressions already short-circuit and avoided this crash — the same logic needed to be made safe for OR expression paths that do not short-circuit
- The implementation plan correctly identified the root cause at evaluator.py line 238 before any code was touched

## What Was Challenging
- Deciding the correct semantics for None in ordering comparisons: treating None as less than any number makes `{Q} > 10` correctly False when Q is unanswered, but also makes `{Q} < 10` True — which may not match the intended UX of "unanswered means does not satisfy any condition"
- The implementation plan flagged a genuine semantic ambiguity in step 6d vs. the ticket description; this required deliberate design intent to be stated before writing tests, not discovered after
- The pre-existing frozenset cache bug at relevance.py:278 is easy to conflate with this ticket; tests using multiple_choice answers would fail for a completely different reason and mask whether the None fix was correct

## Key Technical Insights
1. `_coerce_compare(left, right)` returning -1 means `left < right`. For `{Q2} > 10` with Q2=None: left=None, right=10, return -1 → operator sees (-1 > 0) → False. This is the correct survey UX. However, `{Q} < 10` with Q=None also returns -1 → (None < 10) → True, which may violate the "unanswered means does not satisfy condition" principle. Document and test both directions explicitly.
2. Two distinct None-handling patterns exist in the evaluator: equality (`_coerce_equal`) returns False for None operands cleanly; ordering (`_coerce_compare`) needed the same treatment but the right sentinel value (-1 vs. early-return-False) determines the UX for `<` comparisons.
3. The OR expression does not short-circuit when the left operand is False — it must evaluate the right operand. Any unanswered numeric question in the right side of an OR will hit `_coerce_compare` with None, which was the crash site.
4. The error wrapping at relevance.py:238 converts raw `EvaluationError` into `RelevanceEvaluationError`, which then surfaces as HTTP 500 at the flow resolution API. Fixing the evaluator stops the 500 without touching the API layer.

## Reusable Patterns
- When adding None guards to comparison functions, follow the existing pattern: check `if left is None or right is None` at the top of the method and return a safe sentinel or raise a typed error before any type coercion
- Use `number` or `text` question types (never `multiple_choice`) in unit tests that trigger relevance evaluation — multiple_choice stores list values that break `frozenset(answers.items())` at relevance.py:278, causing an unrelated failure
- Run `pytest -k expression` before and after any evaluator change to establish a baseline and confirm the specific failing test transitions to passing without regressions
- Boolean answers must be string `"true"` / `"false"`, not Python `True` / `False` — relevant if boolean questions are mixed into expression tests

## Files to Review for Similar Tasks
- `backend/app/services/expressions/evaluator.py` — `_coerce_compare()`, `_coerce_equal()`, `_to_bool()`: the three None-sensitive coercion methods; any new type handling should mirror all three
- `backend/app/services/expressions/relevance.py` lines 220-290 — error wrapping at line 238, cache key via `frozenset(answers.items())` at line 278
- `backend/tests/test_expressions/test_evaluator.py` — Category 3 scenarios; Scenario 3.2 was the reproducer for this ticket

## Gotchas and Pitfalls
- The frozenset cache bug (relevance.py:278) is a separate pre-existing issue. Do not fix it as part of a None-comparison ticket — it requires its own targeted fix and tests
- Treating None as -1 (less than everything) fixes `{Q} > 10` → False but makes `{Q} < 10` → True. If the intended UX is "unanswered never satisfies any condition", an early-return-False approach is semantically cleaner but requires operator-aware logic rather than a simple sentinel
- The DATABASE_URL for Docker tests must use `postgresql+asyncpg://` scheme — ad-hoc pytest runs outside Docker will fail unless DATABASE_URL is explicitly overridden
- Do not conflate AND short-circuit behavior (which already avoided this crash) with OR behavior (which does not short-circuit on a False left operand) when writing the test matrix
```
