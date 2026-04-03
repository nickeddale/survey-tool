---
date: "2026-04-03"
ticket_id: "ISS-077"
ticket_title: "5.7: Skip Logic Implementation"
categories: ["navigation", "survey-flow", "expressions", "skip-logic"]
outcome: "success"
complexity: "low"
files_modified: []
---

# Lessons Learned: 5.7: Skip Logic Implementation

## What Worked Well
- Building on the existing `RelevanceResult` dataclass (visible/hidden sets) made filtering trivial — the visible flow is simply a set-membership filter on the ordered pairs list.
- The flat `(QuestionGroup, Question)` pair model cleanly unified both navigation modes (per-question and per-group) under the same underlying `get_visible_flow()` function, eliminating duplication.
- Using a frozen dataclass (`@dataclass(frozen=True)`) for `NavigationPosition` made positions safe to use as dict keys and prevented accidental mutation.
- The `_get_visible_groups()` helper — deriving visible groups from visible pairs rather than separately — ensured that a group whose relevance expression is true but whose every question is hidden is still excluded from `one_page_per_group` navigation. This is the correct UX behavior and came for free from the unified pair model.
- Patching `evaluate_relevance` at the module level (`app.services.expressions.flow.evaluate_relevance`) in tests kept unit tests fast and fully isolated from the expression engine.
- The `_make_question` / `_make_group` / `_make_survey` stub helpers (returning `MagicMock` with explicit `id`, `sort_order`, `parent_id`, `questions`, and `groups` attributes) produced clean, readable test setup with no real ORM objects needed.

## What Was Challenging
- Handling the "current position not in visible flow" edge case symmetrically for both forward and backward navigation required conscious design: the decision to return `None` (same as end/start of survey) rather than raise an error is the right choice for robustness when answer changes make a previously-visible question disappear mid-session.
- The `one_page_per_group` group-skipping nuance (a group flagged visible by relevance but with all its questions hidden) required a distinct test case (`test_get_next_group_skips_group_with_all_questions_hidden`) to surface and verify the behavior explicitly.

## Key Technical Insights
1. **Pair-first, group-second**: Deriving visible groups from `get_visible_flow()` pairs (rather than separately querying group-level relevance) is the correct architecture. It guarantees that group navigation never surfaces an empty page.
2. **None answers normalization at the boundary**: Normalizing `answers=None` to `{}` once at the entry of `get_visible_flow()` (and passing the normalized value through to `evaluate_relevance`) keeps all downstream logic clean and is worth testing explicitly.
3. **Sort stability matters**: Relying on Python's stable sort means ties in `sort_order` preserve insertion order. This is fine for now but should be documented if tie-breaking ever needs to be deterministic across DB round-trips.
4. **`parent_id is None` filter in `build_ordered_pairs`**: Subquestions must be excluded at pair-build time, not at visibility-filter time, so they never appear in navigation regardless of their relevance state.

## Reusable Patterns
- **`_make_relevance_result()` stub factory**: Produces a `RelevanceResult` with explicit visible/hidden sets; reusable across any test that needs to control the output of `evaluate_relevance`.
- **Module-level patch target**: `"app.services.expressions.flow.evaluate_relevance"` is the correct patch path (where it is imported, not where it is defined). Document this once per service module to avoid confusion.
- **Frozen dataclass for position/identity types**: Any value object that identifies a location in a graph (e.g., navigation cursor) benefits from `frozen=True` — hashability and immutability prevent a class of subtle bugs.
- **Pair-list + index lookup pattern**: The `get_next_*` / `get_previous_*` functions all follow the same structure: build the visible list, find the current index via linear scan, return index ± 1 or `None`. This pattern is simple, O(n), and correct for the survey-scale problem.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/flow.py` — canonical implementation of pair-model navigation.
- `backend/app/services/expressions/relevance.py` — `RelevanceResult` structure and `evaluate_relevance()` signature.
- `backend/tests/test_expressions_flow.py` — comprehensive test suite; reference for stub patterns and patch target syntax.
- `backend/tests/test_expressions_relevance.py` — upstream test patterns that informed mock conventions here.
- `backend/app/services/expressions/__init__.py` — package re-export pattern; all new public symbols must be added here and to `__all__`.

## Gotchas and Pitfalls
- **Forgetting to update `__init__.py`**: All new public symbols must be added to both the import block and `__all__` in the package `__init__.py`; the package smoke test (`test_package_imports`) will catch omissions immediately.
- **Patching the wrong module path**: Patching `app.services.expressions.relevance.evaluate_relevance` instead of `app.services.expressions.flow.evaluate_relevance` will not intercept calls from inside `flow.py` — always patch where the name is *used*, not where it is *defined*.
- **Group visibility ≠ group navigability**: A group being in `visible_group_ids` does not guarantee it has visible questions. Never use group-level relevance alone to determine group navigability in `one_page_per_group` mode.
- **`current_index is None` must be handled explicitly**: When the current position has been hidden by a dynamic answer change, the position will not appear in the visible flow. Both `get_next_question` and `get_previous_question` treat this as end/start respectively — ensure this behavior is preserved in any refactor.