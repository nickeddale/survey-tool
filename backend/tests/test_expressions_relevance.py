"""Tests for the relevance evaluation service (ISS-076).

Covers:
- Package-level import smoke test
- Null relevance = always visible
- Expression evaluates to false = hidden
- Expression evaluates to true = visible
- Group hidden = all child questions hidden (regardless of their own relevance)
- Group visible = child questions use own relevance expressions
- Circular reference detection raises CircularRelevanceError
- Cache hit returns same result object without re-evaluation
- Mixed visible/hidden scenarios
- Empty survey (no groups) returns empty result
- Answers dict is None treated as empty
- RelevanceEvaluationError on bad expression syntax
- clear_relevance_cache clears cache
- Package-level imports work
"""

import uuid
from typing import Any, List, Optional
from unittest.mock import MagicMock, patch

import pytest

from app.services.expressions.relevance import (
    evaluate_relevance,
    RelevanceResult,
    CircularRelevanceError,
    RelevanceEvaluationError,
    clear_relevance_cache,
    _parse_variables,
    _detect_cycles,
    _eval_relevance,
)
from app.services.expressions import (
    evaluate_relevance as pkg_evaluate_relevance,
    RelevanceResult as pkg_RelevanceResult,
    CircularRelevanceError as pkg_CircularRelevanceError,
    RelevanceEvaluationError as pkg_RelevanceEvaluationError,
    clear_relevance_cache as pkg_clear_relevance_cache,
)


# ---------------------------------------------------------------------------
# Stub helpers
# ---------------------------------------------------------------------------


def _make_question(
    code: str,
    relevance: Optional[str] = None,
    qid: Optional[uuid.UUID] = None,
) -> MagicMock:
    """Create a mock Question with the given code and relevance expression."""
    q = MagicMock()
    q.id = qid if qid is not None else uuid.uuid4()
    q.code = code
    q.relevance = relevance
    return q


def _make_group(
    questions: List[Any],
    relevance: Optional[str] = None,
    gid: Optional[uuid.UUID] = None,
) -> MagicMock:
    """Create a mock QuestionGroup with the given questions and relevance."""
    g = MagicMock()
    g.id = gid if gid is not None else uuid.uuid4()
    g.relevance = relevance
    g.questions = questions
    return g


def _make_survey(groups: List[Any], sid: Optional[uuid.UUID] = None) -> MagicMock:
    """Create a mock Survey with the given groups."""
    s = MagicMock()
    s.id = sid if sid is not None else uuid.uuid4()
    s.groups = groups
    return s


# ---------------------------------------------------------------------------
# Package import smoke test
# ---------------------------------------------------------------------------


def test_package_imports():
    """All relevance symbols must be importable from app.services.expressions."""
    assert callable(pkg_evaluate_relevance)
    assert pkg_RelevanceResult is RelevanceResult
    assert issubclass(pkg_CircularRelevanceError, ValueError)
    assert issubclass(pkg_RelevanceEvaluationError, ValueError)
    assert callable(pkg_clear_relevance_cache)


# ---------------------------------------------------------------------------
# Null relevance = always visible
# ---------------------------------------------------------------------------


def test_null_group_relevance_visible():
    """A group with null relevance is always visible."""
    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={})

    assert g.id in result.visible_group_ids
    assert g.id not in result.hidden_group_ids


def test_null_question_relevance_visible():
    """A question with null relevance in a visible group is always visible."""
    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={})

    assert q.id in result.visible_question_ids
    assert q.id not in result.hidden_question_ids


def test_both_null_relevance_all_visible():
    """Multiple groups/questions with null relevance are all visible."""
    q1 = _make_question("Q1", relevance=None)
    q2 = _make_question("Q2", relevance=None)
    g1 = _make_group([q1], relevance=None)
    g2 = _make_group([q2], relevance=None)
    survey = _make_survey([g1, g2])

    result = evaluate_relevance(survey, answers={})

    assert g1.id in result.visible_group_ids
    assert g2.id in result.visible_group_ids
    assert q1.id in result.visible_question_ids
    assert q2.id in result.visible_question_ids
    assert not result.hidden_group_ids
    assert not result.hidden_question_ids


# ---------------------------------------------------------------------------
# Expression evaluates to false = hidden
# ---------------------------------------------------------------------------


def test_group_relevance_false_hidden():
    """A group whose relevance evaluates to false is hidden."""
    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance="{Q1} == 'Yes'")
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={"Q1": "No"})

    assert g.id in result.hidden_group_ids
    assert g.id not in result.visible_group_ids


def test_question_relevance_false_hidden():
    """A question whose relevance evaluates to false is hidden."""
    q = _make_question("Q2", relevance="{Q1} == 'Yes'")
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={"Q1": "No"})

    assert q.id in result.hidden_question_ids
    assert q.id not in result.visible_question_ids


def test_question_relevance_unanswered_variable_is_hidden():
    """A question whose relevance references an unanswered variable evaluates
    to false (None is falsy) and is hidden."""
    q = _make_question("Q2", relevance="{Q1}")
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    # Q1 not in answers at all
    result = evaluate_relevance(survey, answers={})

    assert q.id in result.hidden_question_ids


# ---------------------------------------------------------------------------
# Expression evaluates to true = visible
# ---------------------------------------------------------------------------


def test_group_relevance_true_visible():
    """A group whose relevance evaluates to true is visible."""
    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance="{Q1} == 'Yes'")
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={"Q1": "Yes"})

    assert g.id in result.visible_group_ids
    assert g.id not in result.hidden_group_ids


def test_question_relevance_true_visible():
    """A question whose relevance evaluates to true is visible."""
    q = _make_question("Q2", relevance="{Q1} == 'Yes'")
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={"Q1": "Yes"})

    assert q.id in result.visible_question_ids
    assert q.id not in result.hidden_question_ids


# ---------------------------------------------------------------------------
# Group hidden = child questions hidden regardless of their own relevance
# ---------------------------------------------------------------------------


def test_group_hidden_hides_all_child_questions():
    """Questions in a hidden group are always hidden, even with null relevance."""
    q1 = _make_question("Q1", relevance=None)
    q2 = _make_question("Q2", relevance="{Q3} == 'Yes'")  # would be visible if group was
    g = _make_group([q1, q2], relevance="{SHOW_GROUP} == true")
    survey = _make_survey([g])

    # SHOW_GROUP is absent -> group hidden
    result = evaluate_relevance(survey, answers={})

    assert g.id in result.hidden_group_ids
    assert q1.id in result.hidden_question_ids
    assert q2.id in result.hidden_question_ids
    assert q1.id not in result.visible_question_ids
    assert q2.id not in result.visible_question_ids


def test_group_hidden_question_with_true_relevance_still_hidden():
    """Even if a question's own relevance expression would be True, it is
    hidden when its group is hidden."""
    q = _make_question("Q1", relevance="{Q2} == 'Yes'")
    g = _make_group([q], relevance="{SHOW_GROUP} == true")
    survey = _make_survey([g])

    # Q2 satisfies Q1's relevance, but SHOW_GROUP is absent -> group hidden
    result = evaluate_relevance(survey, answers={"Q2": "Yes"})

    assert g.id in result.hidden_group_ids
    assert q.id in result.hidden_question_ids


def test_group_visible_questions_use_own_relevance():
    """When a group is visible, its questions evaluate their own expressions."""
    q_visible = _make_question("Q1", relevance="{FLAG} == 'yes'")
    q_hidden = _make_question("Q2", relevance="{FLAG} == 'yes'")
    g = _make_group([q_visible, q_hidden], relevance=None)
    survey = _make_survey([g])

    # Q1 and Q2 share the same expression, so one test for each branch:
    # Let's use different expressions
    q_visible2 = _make_question("Q1", relevance="{FLAG} == 'yes'")
    q_hidden2 = _make_question("Q2", relevance="{FLAG} == 'no'")
    g2 = _make_group([q_visible2, q_hidden2], relevance=None)
    survey2 = _make_survey([g2])

    result = evaluate_relevance(survey2, answers={"FLAG": "yes"})

    assert q_visible2.id in result.visible_question_ids
    assert q_hidden2.id in result.hidden_question_ids


# ---------------------------------------------------------------------------
# Circular reference detection
# ---------------------------------------------------------------------------


def test_circular_reference_direct():
    """Two questions referencing each other in relevance expressions raises an error."""
    q1 = _make_question("Q1", relevance="{Q2} == 'Yes'")
    q2 = _make_question("Q2", relevance="{Q1} == 'Yes'")
    g = _make_group([q1, q2], relevance=None)
    survey = _make_survey([g])

    with pytest.raises(CircularRelevanceError) as exc_info:
        evaluate_relevance(survey, answers={})

    assert exc_info.value.cycle is not None
    assert len(exc_info.value.cycle) >= 2


def test_circular_reference_indirect():
    """Three questions forming a chain A->B->C->A raises an error."""
    q1 = _make_question("A", relevance="{C} == 'Yes'")
    q2 = _make_question("B", relevance="{A} == 'Yes'")
    q3 = _make_question("C", relevance="{B} == 'Yes'")
    g = _make_group([q1, q2, q3], relevance=None)
    survey = _make_survey([g])

    with pytest.raises(CircularRelevanceError):
        evaluate_relevance(survey, answers={})


def test_no_false_positive_for_shared_dependency():
    """Two questions referencing the same variable (not each other) is NOT a cycle."""
    q1 = _make_question("Q1", relevance="{COMMON} == 'Yes'")
    q2 = _make_question("Q2", relevance="{COMMON} == 'No'")
    g = _make_group([q1, q2], relevance=None)
    survey = _make_survey([g])

    # Should not raise
    result = evaluate_relevance(survey, answers={"COMMON": "Yes"})

    assert q1.id in result.visible_question_ids
    assert q2.id in result.hidden_question_ids


# ---------------------------------------------------------------------------
# Cache behaviour
# ---------------------------------------------------------------------------


def test_cache_hit_returns_same_result():
    """Calling evaluate_relevance with identical answers returns cached result."""
    clear_relevance_cache()

    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])
    answers = {"Q1": "Yes"}

    result1 = evaluate_relevance(survey, answers=answers)
    result2 = evaluate_relevance(survey, answers=answers)

    # Same object from cache
    assert result1 is result2


def test_cache_different_answers_different_result():
    """Different answer dicts produce different (non-cached) results."""
    clear_relevance_cache()

    q = _make_question("Q1", relevance="{FLAG} == 'show'")
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    result_show = evaluate_relevance(survey, answers={"FLAG": "show"})
    result_hide = evaluate_relevance(survey, answers={"FLAG": "hide"})

    assert result_show is not result_hide
    assert q.id in result_show.visible_question_ids
    assert q.id in result_hide.hidden_question_ids


def test_cache_key_uses_both_key_and_value():
    """Cache key distinguishes between {"X": "Y"} and {"Y": "X"}."""
    clear_relevance_cache()

    # Use a question "Q1" that references a different variable "FLAG"
    q = _make_question("Q1", relevance="{FLAG} == 'yes'")
    g = _make_group([q], relevance=None)
    # Use same survey id so the only difference is answers
    sid = uuid.uuid4()
    survey = _make_survey([g], sid=sid)

    r1 = evaluate_relevance(survey, answers={"FLAG": "yes"})
    r2 = evaluate_relevance(survey, answers={"yes": "FLAG"})

    assert r1 is not r2


def test_clear_cache_allows_reevaluation():
    """After clearing the cache a fresh evaluation is performed."""
    clear_relevance_cache()

    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])
    answers = {"Q1": "Yes"}

    result1 = evaluate_relevance(survey, answers=answers)
    clear_relevance_cache()
    result2 = evaluate_relevance(survey, answers=answers)

    # After clearing, a new object is created
    assert result1 is not result2


# ---------------------------------------------------------------------------
# Mixed visible/hidden scenarios
# ---------------------------------------------------------------------------


def test_mixed_groups_and_questions():
    """Complex survey: some groups/questions hidden, some visible."""
    q1a = _make_question("Q1A", relevance=None)
    q1b = _make_question("Q1B", relevance="{Q1A} == 'skip'")
    g1 = _make_group([q1a, q1b], relevance=None)

    q2a = _make_question("Q2A", relevance=None)
    g2 = _make_group([q2a], relevance="{SHOW_G2} == true")

    survey = _make_survey([g1, g2])
    answers = {"Q1A": "answer", "SHOW_G2": False}

    result = evaluate_relevance(survey, answers=answers)

    # Group 1 visible
    assert g1.id in result.visible_group_ids
    # Q1A visible (null relevance)
    assert q1a.id in result.visible_question_ids
    # Q1B hidden (Q1A != 'skip')
    assert q1b.id in result.hidden_question_ids

    # Group 2 hidden (SHOW_G2 = False)
    assert g2.id in result.hidden_group_ids
    # Q2A hidden because its group is hidden
    assert q2a.id in result.hidden_question_ids


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_empty_survey_returns_empty_result():
    """A survey with no groups returns empty result sets."""
    survey = _make_survey([])

    result = evaluate_relevance(survey, answers={})

    assert not result.visible_group_ids
    assert not result.hidden_group_ids
    assert not result.visible_question_ids
    assert not result.hidden_question_ids


def test_none_answers_treated_as_empty():
    """Passing None for answers is equivalent to passing an empty dict."""
    clear_relevance_cache()

    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers=None)

    assert q.id in result.visible_question_ids


def test_group_with_no_questions():
    """A group with no questions only produces group-level results."""
    g = _make_group([], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={})

    assert g.id in result.visible_group_ids
    assert not result.visible_question_ids
    assert not result.hidden_question_ids


def test_relevance_returns_result_dataclass():
    """evaluate_relevance returns a RelevanceResult instance."""
    survey = _make_survey([])
    result = evaluate_relevance(survey, answers={})
    assert isinstance(result, RelevanceResult)


# ---------------------------------------------------------------------------
# RelevanceEvaluationError on bad expression
# ---------------------------------------------------------------------------


def test_bad_syntax_raises_relevance_evaluation_error():
    """An expression with invalid syntax raises RelevanceEvaluationError."""
    q = _make_question("Q1", relevance="{{broken syntax ===")
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    with pytest.raises(RelevanceEvaluationError):
        evaluate_relevance(survey, answers={})


def test_group_bad_syntax_raises_relevance_evaluation_error():
    """A group expression with invalid syntax raises RelevanceEvaluationError."""
    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance="{{broken ===")
    survey = _make_survey([g])

    with pytest.raises(RelevanceEvaluationError):
        evaluate_relevance(survey, answers={})


# ---------------------------------------------------------------------------
# Unit tests for internal helpers
# ---------------------------------------------------------------------------


class TestParseVariables:
    def test_simple_variable(self):
        assert _parse_variables("{Q1} == 'Yes'") == ["Q1"]

    def test_multiple_variables(self):
        vars_ = _parse_variables("{Q1} == 'Yes' and {Q2} > 5")
        assert "Q1" in vars_
        assert "Q2" in vars_

    def test_no_variables(self):
        assert _parse_variables("1 == 1") == []

    def test_syntax_error_returns_empty(self):
        # Bad syntax should not raise, just return []
        assert _parse_variables("{{bad") == []

    def test_function_call_variable(self):
        vars_ = _parse_variables("count({Q1}) > 2")
        assert "Q1" in vars_


class TestDetectCycles:
    def test_no_cycle(self):
        graph = {"A": ["B"], "B": ["C"], "C": []}
        assert _detect_cycles(graph) is None

    def test_direct_cycle(self):
        graph = {"A": ["B"], "B": ["A"]}
        cycle = _detect_cycles(graph)
        assert cycle is not None
        assert "A" in cycle
        assert "B" in cycle

    def test_indirect_cycle(self):
        graph = {"A": ["B"], "B": ["C"], "C": ["A"]}
        cycle = _detect_cycles(graph)
        assert cycle is not None

    def test_self_loop(self):
        graph = {"A": ["A"]}
        cycle = _detect_cycles(graph)
        assert cycle is not None

    def test_empty_graph(self):
        assert _detect_cycles({}) is None

    def test_isolated_node(self):
        assert _detect_cycles({"A": []}) is None


class TestEvalRelevance:
    def test_true_expression(self):
        assert _eval_relevance("{Q1} == 'Yes'", {"Q1": "Yes"}) is True

    def test_false_expression(self):
        assert _eval_relevance("{Q1} == 'Yes'", {"Q1": "No"}) is False

    def test_null_variable_is_false(self):
        assert _eval_relevance("{Q1}", {}) is False

    def test_numeric_comparison(self):
        assert _eval_relevance("{Q1} > 5", {"Q1": 10}) is True

    def test_boolean_true(self):
        assert _eval_relevance("{Q1}", {"Q1": True}) is True

    def test_boolean_false(self):
        assert _eval_relevance("{Q1}", {"Q1": False}) is False

    def test_syntax_error_raises(self):
        with pytest.raises(RelevanceEvaluationError):
            _eval_relevance("{{bad ===", {})

    # -- ISS-208: empty string context values (from resolver normalisation) --

    def test_scenario_7_2_empty_string_equals_empty(self):
        """Scenario 7.2: {Q1} == '' is True when Q1 normalised to '' (unanswered
        string question).  The answers dict is pre-normalised by resolver."""
        assert _eval_relevance("{Q1} == ''", {"Q1": ""}) is True

    def test_scenario_7_3_empty_string_not_equal_is_false(self):
        """Scenario 7.3: {Q1} != '' is False when Q1 normalised to ''."""
        assert _eval_relevance("{Q1} != ''", {"Q1": ""}) is False

    def test_null_check_false_for_normalised_string(self):
        """After normalisation, {Q1} == null must be False (Q1 is '' not None)."""
        assert _eval_relevance("{Q1} == null", {"Q1": ""}) is False


# ---------------------------------------------------------------------------
# ISS-208: Scenario 7.2 and 7.3 — relevance visibility with empty string
# ---------------------------------------------------------------------------


def test_scenario_7_2_question_hidden_when_empty_string_required():
    """Scenario 7.2: A question with relevance {Q1} == '' should be VISIBLE
    when Q1 is unanswered and resolver normalises it to ''."""
    q_target = _make_question("Q2", relevance="{Q1} == ''")
    g = _make_group([q_target], relevance=None)
    survey = _make_survey([g])

    # Q1 normalised to '' by resolver/logic path; simulate that here.
    result = evaluate_relevance(survey, answers={"Q1": ""})

    assert q_target.id in result.visible_question_ids
    assert q_target.id not in result.hidden_question_ids


def test_scenario_7_2_question_visible_with_answered_value():
    """When Q1 has a non-empty answer, {Q1} == '' should be False → Q2 hidden."""
    q_target = _make_question("Q2", relevance="{Q1} == ''")
    g = _make_group([q_target], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={"Q1": "some answer"})

    assert q_target.id in result.hidden_question_ids
    assert q_target.id not in result.visible_question_ids


def test_scenario_7_3_question_hidden_when_not_empty_required():
    """Scenario 7.3: A question with relevance {Q1} != '' should be HIDDEN
    when Q1 is unanswered (normalised to ''), matching user expectation that
    is_not_empty conditions hide questions before interaction."""
    q_target = _make_question("Q2", relevance="{Q1} != ''")
    g = _make_group([q_target], relevance=None)
    survey = _make_survey([g])

    # Q1 normalised to '' by resolver/logic path.
    result = evaluate_relevance(survey, answers={"Q1": ""})

    assert q_target.id in result.hidden_question_ids
    assert q_target.id not in result.visible_question_ids


def test_scenario_7_3_question_visible_with_answered_value():
    """When Q1 has a non-empty answer, {Q1} != '' should be True → Q2 visible."""
    q_target = _make_question("Q2", relevance="{Q1} != ''")
    g = _make_group([q_target], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={"Q1": "some answer"})

    assert q_target.id in result.visible_question_ids
    assert q_target.id not in result.hidden_question_ids


def test_null_answer_not_equal_to_empty_string_for_numeric():
    """A numeric unanswered question stays None (not '').  {Q_num} == '' is
    False and {Q_num} != '' is True — distinct from string normalisation."""
    q_cond = _make_question("Q2", relevance="{Q_num} != ''")
    g = _make_group([q_cond], relevance=None)
    survey = _make_survey([g])

    # Numeric unanswered questions remain None, so != '' is True → visible.
    result = evaluate_relevance(survey, answers={"Q_num": None})

    assert q_cond.id in result.visible_question_ids


# ---------------------------------------------------------------------------
# ISS-209: yes_no string values compared with bare boolean literals
# ---------------------------------------------------------------------------


def test_yes_no_string_true_matches_bool_literal_true():
    """yes_no question answered 'true' (string) matches {Q1} == true (bool literal).
    The public form stores yes_no answers as strings 'true'/'false'."""
    q_target = _make_question("Q2", relevance="{Q1} == true")
    g = _make_group([q_target], relevance=None)
    survey = _make_survey([g])

    # yes_no answer stored as the string 'true' in public survey form
    result = evaluate_relevance(survey, answers={"Q1": "true"})

    assert q_target.id in result.visible_question_ids
    assert q_target.id not in result.hidden_question_ids


def test_yes_no_string_false_does_not_match_bool_literal_true():
    """yes_no question answered 'false' (string) does NOT match {Q1} == true."""
    q_target = _make_question("Q2", relevance="{Q1} == true")
    g = _make_group([q_target], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={"Q1": "false"})

    assert q_target.id in result.hidden_question_ids
    assert q_target.id not in result.visible_question_ids


def test_yes_no_string_false_matches_bool_literal_false():
    """yes_no question answered 'false' (string) matches {Q1} == false."""
    q_target = _make_question("Q2", relevance="{Q1} == false")
    g = _make_group([q_target], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={"Q1": "false"})

    assert q_target.id in result.visible_question_ids
    assert q_target.id not in result.hidden_question_ids


def test_yes_no_string_true_does_not_match_bool_literal_false():
    """yes_no question answered 'true' (string) does NOT match {Q1} == false."""
    q_target = _make_question("Q2", relevance="{Q1} == false")
    g = _make_group([q_target], relevance=None)
    survey = _make_survey([g])

    result = evaluate_relevance(survey, answers={"Q1": "true"})

    assert q_target.id in result.hidden_question_ids
    assert q_target.id not in result.visible_question_ids


# ---------------------------------------------------------------------------
# ISS-252: matrix answer dict values must not cause TypeError in cache key
# ---------------------------------------------------------------------------


def test_matrix_answer_dict_does_not_raise_type_error():
    """Matrix answers are dicts (e.g. {'SQ001': 'A1', 'SQ002': 'A2'}).
    The cache key must handle dict values without raising TypeError."""
    clear_relevance_cache()

    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    matrix_answers = {"Q1": {"SQ001": "A1", "SQ002": "A2"}}

    # Must not raise TypeError: unhashable type: 'dict'
    result = evaluate_relevance(survey, answers=matrix_answers)

    assert q.id in result.visible_question_ids


def test_matrix_answer_dict_cache_hit():
    """Identical matrix answer dicts produce a cache hit (same result object)."""
    clear_relevance_cache()

    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance=None)
    sid = uuid.uuid4()
    survey = _make_survey([g], sid=sid)

    matrix_answers = {"Q1": {"SQ001": "A1", "SQ002": "A2"}}

    result1 = evaluate_relevance(survey, answers=matrix_answers)
    result2 = evaluate_relevance(survey, answers=matrix_answers)

    assert result1 is result2


def test_matrix_answer_dict_different_values_different_results():
    """Different matrix answer dicts produce different cache entries."""
    clear_relevance_cache()

    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance=None)
    sid = uuid.uuid4()
    survey = _make_survey([g], sid=sid)

    result1 = evaluate_relevance(survey, answers={"Q1": {"SQ001": "A1"}})
    result2 = evaluate_relevance(survey, answers={"Q1": {"SQ001": "A2"}})

    assert result1 is not result2


def test_mixed_answer_types_no_error():
    """A mix of scalar, list, and dict answer values all hash without error."""
    clear_relevance_cache()

    q = _make_question("Q1", relevance=None)
    g = _make_group([q], relevance=None)
    survey = _make_survey([g])

    mixed_answers = {
        "Q1": "scalar",
        "Q2": ["choice1", "choice2"],
        "Q3": {"SQ001": "A1", "SQ002": "A2"},
    }

    # Must not raise
    result = evaluate_relevance(survey, answers=mixed_answers)
    assert q.id in result.visible_question_ids
