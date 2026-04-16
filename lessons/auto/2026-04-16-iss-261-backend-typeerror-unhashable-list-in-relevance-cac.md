---
date: "2026-04-16"
ticket_id: "ISS-261"
ticket_title: "Backend: TypeError unhashable list in relevance cache key for matrix_multiple answers"
categories: ["testing", "ui", "bug-fix", "feature", "performance", "documentation"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-16"
ticket_id: "ISS-261"
ticket_title: "Backend: TypeError unhashable list in relevance cache key for matrix_multiple answers"
categories: ["bug-fix", "caching", "data-structures", "matrix-questions"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/expressions/relevance.py"
  - "backend/tests/test_expressions_relevance.py"
---

# Lessons Learned: Backend: TypeError unhashable list in relevance cache key for matrix_multiple answers

## What Worked Well
- The ticket's root cause analysis and proposed fix were both accurate and complete — the `_make_hashable` helper function prescribed in the implementation plan was implemented nearly verbatim.
- The fix was self-contained: a single helper function added at module level, replacing inline `isinstance` logic at the cache key construction site. Minimal surface area, easy to reason about.
- The `TestMakeHashable` unit test class directly tests the helper in isolation, covering primitives, flat lists, flat dicts, the ISS-261 matrix_multiple and matrix_dynamic cases, and deeply nested structures — good regression anchoring.
- Integration-level tests (`test_matrix_multiple_nested_list_values_no_type_error`, `test_matrix_dynamic_list_of_dicts_no_type_error`) exercise the full `evaluate_relevance` path, confirming the fix holds end-to-end.

## What Was Challenging
- The original ISS-252 fix handled shallow dict values but missed nested structures. It's easy to under-specify recursion depth when fixing hashability bugs — the shallow fix silently worked for simple matrix answers, masking the nested case until matrix_multiple was exercised.
- The error manifests at cache key construction time, not at evaluation time, making it harder to correlate with a specific question type at a glance — the traceback points to the frozenset call rather than to the question type that caused it.

## Key Technical Insights
1. Python's `frozenset` and `tuple` only make the outer container hashable — if any element is itself unhashable (e.g. a `list` or `dict`), the call still raises `TypeError`. Hashability is not transitive; you must recurse to every leaf.
2. `matrix_multiple` answer shape is `dict[str, list[str]]` — a dict whose values are lists. `frozenset(v.items())` produces tuples like `("SQ001", ["A1", "A2"])`, and the inner list breaks the frozenset.
3. `matrix_dynamic` answer shape is `list[dict[str, str]]` — a list whose elements are dicts. `tuple(v)` produces a tuple of dicts, and dicts are unhashable.
4. A recursive `_make_hashable` function is the canonical, future-proof pattern: `dict` → `frozenset` of `(k, _make_hashable(val))` pairs; `list` → `tuple` of `_make_hashable(item)` items; primitives pass through unchanged. This handles arbitrary nesting depth.
5. Fixing a hashability bug with a shallow one-liner and not considering deeper nesting is a predictable failure mode — always ask "can any value at any depth still be unhashable?"

## Reusable Patterns
- `_make_hashable(v)` recursive helper pattern: use whenever converting arbitrary nested Python data (from ORM, JSON, etc.) into a hashable cache key. Copy the three-branch implementation directly — it is general-purpose.
- When building cache keys from heterogeneous answer dicts (survey, form, config data), always apply recursive hashability conversion rather than a shallow `frozenset(d.items())`.
- Isolate the hashability helper with its own `TestMakeHashable` unit test class covering: primitives, flat containers, nested containers, and the specific failing shapes from the bug report.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/relevance.py` — `_make_hashable` helper (lines 60–71) and cache key construction (lines 292–295). Template for adding recursive hashability conversion elsewhere.
- `backend/tests/test_expressions_relevance.py` — `TestMakeHashable` class (lines 589–633) and ISS-261 integration tests (lines 839–924). Reference for how to structure both unit and integration tests for cache key bugs.

## Gotchas and Pitfalls
- A prior shallow fix (ISS-252) gave false confidence that the hashability problem was solved. When reviewing a "hashability fixed" PR, always check whether the fix recurses into nested containers or only handles the top level.
- `frozenset` of `dict.items()` is a common first attempt — it works for `dict[str, primitive]` but silently breaks for `dict[str, list]` or deeper nesting. Do not use it without recursion.
- The module-level `_CACHE` dict is never cleared between requests in production; cache key correctness is critical for correctness, not just performance. A wrong cache key (e.g. two distinct answer states hashing the same) would return stale visibility results to end users.
- Tests for this path do not require a database — `evaluate_relevance` operates purely on mock ORM objects and the answers dict, so these tests run fast on the host with plain `pytest` (no Docker needed).
```
