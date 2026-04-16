---
date: "2026-04-16"
ticket_id: "ISS-252"
ticket_title: "Backend: TypeError unhashable dict in relevance cache key blocks all matrix submissions"
categories: ["bug-fix", "caching", "matrix-questions", "expressions"]
outcome: "success"
complexity: "low"
files_modified: []
---

# Lessons Learned: Backend: TypeError unhashable dict in relevance cache key blocks all matrix submissions

## What Worked Well
- The root cause was precisely identified in the ticket before implementation began — line 278 of `relevance.py` — which made the fix surgical and fast.
- The existing test suite provided a clear pattern for writing new cache-related tests, making it straightforward to add thorough coverage.
- Four targeted test cases were added covering all important cache behaviours for dict answers: no TypeError on dict values, cache hit with identical dicts, cache miss with different dicts, and mixed scalar/list/dict answer types in a single call.

## What Was Challenging
- Nothing significant. The fix was a one-line change with a well-understood Python idiom (`frozenset(v.items())`).

## Key Technical Insights
1. Python's `frozenset()` requires all elements to be hashable. The cache key construction used `tuple(v)` for `list` values but had no branch for `dict` values, which are unhashable. The fix adds `frozenset(v.items()) if isinstance(v, dict)` before the list branch.
2. Matrix question answers are structured as dicts (e.g. `{"SQ001": "A1", "SQ002": "A2"}`), not scalars or lists. This is a structural difference from all other question types and must be accounted for anywhere answer values are used as dict keys or in sets.
3. `frozenset(v.items())` is the canonical Python idiom for making a flat `dict` hashable when insertion order is irrelevant and values are themselves hashable. It is unordered, so `{"a": 1, "b": 2}` and `{"b": 2, "a": 1}` produce the same frozenset — which is correct for a cache key.
4. The bug was CRITICAL in scope (all matrix question types) but trivial to fix — a 1-line change inside a generator expression.

## Reusable Patterns
- **Hashable answer values pattern** (in `relevance.py:278-280`):
  ```python
  cache_key = (survey.id, frozenset(
      (k, frozenset(v.items()) if isinstance(v, dict) else (tuple(v) if isinstance(v, list) else v))
      for k, v in answers.items()
  ))
  ```
  Apply this same guard anywhere answer dicts are converted to cache keys or set members.
- When writing cache key tests, always cover: (1) no crash, (2) cache hit on identical input, (3) cache miss on different input, (4) mixed value types.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/relevance.py` — cache key construction at line 278; add new answer-type branches here if future question types introduce non-scalar, non-list, non-dict answer shapes.
- `backend/tests/test_expressions_relevance.py` — ISS-252 test block at the bottom of the file for examples of dict-answer cache tests.

## Gotchas and Pitfalls
- `frozenset(v.items())` only works when dict _values_ are themselves hashable (e.g. strings, ints, booleans). If matrix sub-answers ever become nested dicts or lists, this will raise `TypeError` again and require recursive conversion.
- `isinstance(v, dict)` must come **before** `isinstance(v, list)` in the conditional chain; dicts are not lists, but the ordering matters for readability and future `OrderedDict` / `defaultdict` subclasses.
- The bug only manifests at runtime when a matrix answer is present — surveys without matrix questions are completely unaffected, which explains why it was not caught earlier.