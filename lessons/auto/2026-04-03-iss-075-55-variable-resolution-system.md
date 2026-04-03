---
date: "2026-04-03"
ticket_id: "ISS-075"
ticket_title: "5.5: Variable Resolution System"
categories: ["expression-engine", "data-modeling", "type-coercion", "testing"]
outcome: "success"
complexity: "medium"
files_modified: []
---

# Lessons Learned: 5.5: Variable Resolution System

## What Worked Well
- The flat dict approach for the expression context is clean and maps naturally to how the evaluator consumes variables — no special-casing needed downstream.
- Separating type coercion into small, focused helpers (`_to_number`, `_to_bool`, `_coerce_value`) kept `build_expression_context` readable and independently testable.
- Mock-based unit tests with dedicated factory helpers (`_make_question`, `_make_answer`, `_make_response`, `_make_participant`) made the test suite fast and expressive without needing a database.
- Including integration tests that pipe resolver output directly into `evaluate()` caught any interface mismatches between the two layers early.
- Exporting `build_expression_context` and `ResolverError` from the package `__init__.py` alongside the evaluator kept the public API surface clean and consistent.

## What Was Challenging
- Key derivation logic for subquestions required careful attention: other-text and comment answer types must always use the **parent** question code (e.g., `Q1_other`, not `Q1_SQ001_other`), which is a non-obvious rule that could easily be implemented incorrectly.
- Python's `bool` being a subclass of `int` required an explicit guard in `_to_number` to avoid silently coercing booleans to 0/1 when they should remain `True`/`False`.
- Deciding when a scalar stored for a list-type question should be wrapped in a list (rather than rejected) required a deliberate design choice about forward-compatibility with inconsistent stored data.

## Key Technical Insights
1. **Parent code always wins for suffixes**: For `_other` and `_comment` keys, the parent question code is used regardless of whether the answer belongs to a subquestion. This keeps the context key space predictable for expression authors.
2. **Whole-float normalization**: Floats that are mathematically integers (e.g., `2.0`) are coerced to `int` to avoid surprising comparisons like `{Q1} == 2` failing when the stored value is `2.0`.
3. **Empty string for list types becomes `[]`**: An empty string value on a list-type question normalizes to an empty list, preventing downstream `count()` or `in` operations from crashing on unexpected types.
4. **RESPONDENT namespace is additive**: Participant attributes are injected as `RESPONDENT.<key>` keys only when a participant is provided; the resolver is still valid and usable without one (e.g., for anonymous responses).
5. **`answer_type` constants belong on the model**: Defining `ANSWER_TYPE_ANSWER`, `ANSWER_TYPE_OTHER`, `ANSWER_TYPE_COMMENT` as constants on `response_answer.py` rather than in the resolver prevents magic strings from spreading across the codebase.

## Reusable Patterns
- **Flat context dict from nested ORM data**: Iterating ORM relationships and building a flat `{key: coerced_value}` dict is a clean pattern for bridging between relational data and an expression evaluator. Reuse this shape for any future variable namespace (e.g., `SURVEY.*`, `LOOP.*`).
- **Guard `bool` before `int` in numeric coercions**: Any function that coerces to number must check `isinstance(value, bool)` first, since `bool` passes `isinstance(value, (int, float))`.
- **Factory helpers in test modules**: `_make_*` helper functions that return configured mock objects dramatically reduce test boilerplate and should be used in any test module dealing with complex ORM-like models.
- **Integration tests as a contract**: A small set of end-to-end tests (resolver → evaluator) that exercise real expression strings serves as a regression net whenever either layer changes.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/resolver.py` — reference implementation for building expression context from ORM data.
- `backend/tests/test_expressions_resolver.py` — reference for mock-based test structure and factory helper pattern.
- `backend/app/services/expressions/__init__.py` — shows how to expose a multi-module package through a single clean public API.
- `backend/app/models/response_answer.py` — shows where to anchor answer-type constants to avoid magic strings.

## Gotchas and Pitfalls
- **Subquestion key format is `PARENT_CHILD`, not `CHILD` alone**: Forgetting to prepend the parent code produces keys that collide or go unresolved when a survey has multiple matrix questions with identically-coded subquestions.
- **`lazy="raise"` on the `question` relationship**: `ResponseAnswer.question` will raise if accessed without an explicit join or `joinedload`. Tests must configure this relationship manually or mock it; callers must eager-load it.
- **Do not coerce `None` to a list for list-type questions**: An unanswered list question should resolve to `None`, not `[]`. Wrapping `None` in a list would break null-checks in expressions like `{Q1} == null`.
- **`image_picker` must be in `_LIST_QUESTION_TYPES`**: It is easy to overlook when adding new question types; omitting it causes image picker answers to be treated as scalars and break `count()` or `in` expressions.
- **RESPONDENT attributes come from JSONB, not columns**: Participant attributes are stored in an untyped JSONB field. Values arrive as raw JSON types (strings, numbers, booleans) with no schema enforcement, so downstream expressions must tolerate heterogeneous types.