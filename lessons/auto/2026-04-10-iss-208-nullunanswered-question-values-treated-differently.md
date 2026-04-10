---
date: "2026-04-10"
ticket_id: "ISS-208"
ticket_title: "Null/unanswered question values treated differently from empty string in relevance evaluation"
categories: ["testing", "api", "ui", "bug-fix", "feature", "performance", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-10"
ticket_id: "ISS-208"
ticket_title: "Null/unanswered question values treated differently from empty string in relevance evaluation"
categories: ["expression-engine", "relevance", "normalization", "survey-logic"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/expressions/resolver.py"
  - "backend/app/api/logic.py"
  - "backend/tests/test_expressions_evaluator.py"
  - "backend/tests/test_expressions_relevance.py"
---

# Lessons Learned: Null/unanswered question values treated differently from empty string in relevance evaluation

## What Worked Well
- Identifying the correct normalization layer (resolver.py `_coerce_value`) rather than patching the evaluator — normalizing at the source ensures all comparison operators (==, !=, contains, etc.) benefit from the fix, not just equality
- The existing test structure for Scenarios 7.x made it straightforward to locate and extend test coverage for the boundary cases
- Planning explicitly called out both code paths (logic API vs response submission) before implementation, avoiding a partial fix

## What Was Challenging
- The answers dict is constructed in two independent places: `resolver.py` (response submission path) and `logic.py` (logic API path) — a fix in one does not automatically cover the other, requiring explicit verification of both paths
- The relevance cache key uses `frozenset(answers.items())`, which is sensitive to the types of answer values; any normalization that introduces list values would silently break the cache lookup for multiple_choice questions
- Distinguishing which question types should normalize None→'' vs remain None required careful type-guarding: string types (short_text, long_text, text) get '', numeric and boolean stay None

## Key Technical Insights
1. Normalize None→'' only for string question types in `resolver.py _coerce_value`, guarded by an explicit type check. Leave numeric, boolean, and multiple_choice None unchanged to preserve correct null/zero/false semantics.
2. After this change, `{Q1} == null` becomes False for unanswered string questions (they now resolve to '' not null). This is an intentional semantic behavior change and must be explicitly documented in tests, not treated as a regression.
3. The logic API path in `logic.py` builds its answers dict independently from the response submission path in resolver.py. Normalization added to resolver.py alone is insufficient — the logic.py path requires a matching normalization step.
4. The relevance cache key (`frozenset(answers.items())`) must receive only hashable values. Normalization changes must happen before cache key computation, not after, and must never introduce list values for string question types.
5. Boolean question answers are stored/expected as string `"true"`/`"false"`, not Python `True`/`False`. Unanswered boolean questions remain None — do not normalize to `''` or `"false"`.

## Reusable Patterns
- **Two-path normalization**: Whenever answer normalization logic is added to resolver.py, check whether logic.py constructs its own answers dict and apply the same normalization there. These two paths diverge early and neither automatically inherits changes from the other.
- **Type-gated None normalization**: Use an explicit allowlist of string question types (`{'short_text', 'long_text', 'text'}`) when mapping None→''. Never use a catch-all default.
- **Cache key safety**: Any change to answer values must be verified against `frozenset(answers.items())` in `relevance.py`. List values (multiple_choice) must not appear in the dict passed to this operation.
- **Boundary test for semantic changes**: When a fix intentionally changes behavior (None→'' for string questions), add an explicit test asserting the old behavior is now gone (`{Q1} == null` is False for unanswered string question) alongside tests asserting the new behavior.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/resolver.py` — `_coerce_value`: primary normalization site for question answer values
- `backend/app/api/logic.py` — answers dict construction for the logic/preview API path; must mirror resolver.py normalization
- `backend/app/services/expressions/evaluator.py` — `_eval_variable`, `_coerce_equal`: where None propagates into comparisons if not caught upstream
- `backend/app/services/relevance.py` (line ~278) — `frozenset(answers.items())` cache key; sensitive to unhashable/unexpected value types
- `backend/tests/test_expressions_evaluator.py` — unit tests for variable resolution and null/empty string boundary cases
- `backend/tests/test_expressions_relevance.py` — integration tests for Scenarios 7.x covering unanswered question relevance conditions

## Gotchas and Pitfalls
- **Partial fix trap**: Fixing only resolver.py leaves the logic API path (logic.py) still returning None for unanswered string questions, causing inconsistent behavior between survey preview and live submission.
- **Boolean string encoding**: Do not normalize unanswered boolean questions to `''` — boolean answers use `"true"`/`"false"` strings when answered, and None when unanswered. Normalizing to `''` would break boolean comparisons entirely.
- **frozenset cache key breakage**: If normalization accidentally coerces a multiple_choice answer (list) into the answers dict without converting it, the `frozenset(answers.items())` call in relevance.py will raise `unhashable type: 'list'` at runtime, not at test time unless a multiple_choice question is present in the test survey.
- **null literal tests become false positives**: After normalizing string questions to '', any existing test asserting `{Q1} == null` returns True for an unanswered string question will fail — this is correct behavior, not a regression. Update those tests to document the new semantics explicitly.
- **Scenario numbering**: Scenarios 7.2 and 7.3 in the test suite specifically cover `{Q1} == ''` and `{Q1} != ''` for unanswered questions — always run the full Scenario 7 block when touching null/empty normalization to catch the full range of edge cases.
```
