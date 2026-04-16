"""Tests for the variable resolver (ISS-075).

Covers:
- Package-level import smoke test
- Direct answer {Q1} for various question types
- Subquestion/matrix answer {Q1_SQ001}
- Other-text answer {Q1_other}
- Comment answer {Q1_comment}
- RESPONDENT.attribute from participant JSONB
- Multi-select / checkbox -> Python list
- Rating / numeric -> Python int/float
- Yes/no / boolean -> Python bool
- Unanswered string-type (None value) -> '' (empty string, ISS-208)
- Unanswered numeric/boolean/list (None value) -> Python None
- Missing participant -> no RESPONDENT keys
- Integration: resolver output feeds into evaluate() end-to-end
"""

import uuid
from typing import Any, List, Optional
from unittest.mock import MagicMock

import pytest

from app.services.expressions.resolver import (
    build_expression_context,
    ResolverError,
    _coerce_value,
    _to_number,
    _to_bool,
    _resolve_respondent,
)
from app.services.expressions import (
    build_expression_context as pkg_build_expression_context,
    evaluate,
    parse,
    tokenize,
    ResolverError as pkg_ResolverError,
)
from app.models.response_answer import (
    ANSWER_TYPE_ANSWER,
    ANSWER_TYPE_OTHER,
    ANSWER_TYPE_COMMENT,
)


# ---------------------------------------------------------------------------
# Stub helpers
# ---------------------------------------------------------------------------


def _make_question(
    code: str,
    question_type: str,
    parent: Optional[Any] = None,
    parent_id: Optional[uuid.UUID] = None,
) -> MagicMock:
    """Create a mock Question with the given code and type."""
    q = MagicMock()
    q.id = uuid.uuid4()
    q.code = code
    q.question_type = question_type
    q.parent = parent
    q.parent_id = parent_id
    return q


def _make_answer(
    question: Any,
    value: Any,
    answer_type: str = ANSWER_TYPE_ANSWER,
) -> MagicMock:
    """Create a mock ResponseAnswer."""
    a = MagicMock()
    a.id = uuid.uuid4()
    a.question = question
    a.value = value
    a.answer_type = answer_type
    return a


def _make_response(answers: List[Any]) -> MagicMock:
    """Create a mock Response with the given list of answers."""
    r = MagicMock()
    r.id = uuid.uuid4()
    r.answers = answers
    return r


def _make_participant(attributes: Optional[dict] = None) -> MagicMock:
    """Create a mock Participant with the given attributes dict."""
    p = MagicMock()
    p.id = uuid.uuid4()
    p.attributes = attributes
    return p


def _eval_expr(expr_str: str, context: dict, timeout=None) -> Any:
    """Tokenize, parse, and evaluate an expression string against context."""
    tokens = tokenize(expr_str)
    ast = parse(tokens)
    return evaluate(ast, context=context, timeout=timeout)


# ---------------------------------------------------------------------------
# Package import smoke test
# ---------------------------------------------------------------------------


def test_package_imports():
    """build_expression_context and ResolverError must be importable from the package."""
    assert callable(pkg_build_expression_context)
    assert issubclass(pkg_ResolverError, ValueError)


# ---------------------------------------------------------------------------
# Direct answer {Q1}
# ---------------------------------------------------------------------------


def test_direct_answer_string():
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, "Hello World")
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == "Hello World"


def test_direct_answer_none_unanswered():
    # ISS-208: unanswered string-type questions normalise to '' not None.
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ""


def test_direct_answer_multiple_questions():
    q1 = _make_question("Q1", "short_text")
    q2 = _make_question("Q2", "short_text")
    a1 = _make_answer(q1, "Answer1")
    a2 = _make_answer(q2, "Answer2")
    ctx = build_expression_context(_make_response([a1, a2]))
    assert ctx["Q1"] == "Answer1"
    assert ctx["Q2"] == "Answer2"


# ---------------------------------------------------------------------------
# Subquestion / matrix {Q1_SQ001}
# ---------------------------------------------------------------------------


def test_subquestion_answer():
    parent = _make_question("Q1", "matrix_single")
    child = _make_question("SQ001", "short_text", parent=parent, parent_id=parent.id)
    a = _make_answer(child, "Row answer")
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1_SQ001"] == "Row answer"


def test_subquestion_multiple_rows():
    parent = _make_question("MATRIX1", "matrix_single")
    sq1 = _make_question("R1", "short_text", parent=parent, parent_id=parent.id)
    sq2 = _make_question("R2", "short_text", parent=parent, parent_id=parent.id)
    a1 = _make_answer(sq1, "Row 1 value")
    a2 = _make_answer(sq2, "Row 2 value")
    ctx = build_expression_context(_make_response([a1, a2]))
    assert ctx["MATRIX1_R1"] == "Row 1 value"
    assert ctx["MATRIX1_R2"] == "Row 2 value"


def test_subquestion_top_level_parent_is_none():
    """A question with no parent is treated as top-level even with parent_id=None."""
    q = _make_question("Q5", "short_text", parent=None, parent_id=None)
    a = _make_answer(q, "Top level answer")
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q5"] == "Top level answer"


# ---------------------------------------------------------------------------
# Other-text {Q1_other}
# ---------------------------------------------------------------------------


def test_other_text_top_level():
    q = _make_question("Q1", "single_choice", parent=None, parent_id=None)
    a = _make_answer(q, "My custom option", answer_type=ANSWER_TYPE_OTHER)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1_other"] == "My custom option"


def test_other_text_subquestion_uses_parent_code():
    parent = _make_question("Q2", "matrix_single")
    child = _make_question("SQ001", "single_choice", parent=parent, parent_id=parent.id)
    a = _make_answer(child, "Other text here", answer_type=ANSWER_TYPE_OTHER)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q2_other"] == "Other text here"


def test_other_text_none_value():
    q = _make_question("Q1", "single_choice")
    a = _make_answer(q, None, answer_type=ANSWER_TYPE_OTHER)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1_other"] is None


# ---------------------------------------------------------------------------
# Comment {Q1_comment}
# ---------------------------------------------------------------------------


def test_comment_top_level():
    q = _make_question("Q3", "rating", parent=None, parent_id=None)
    a = _make_answer(q, "Great service!", answer_type=ANSWER_TYPE_COMMENT)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q3_comment"] == "Great service!"


def test_comment_subquestion_uses_parent_code():
    parent = _make_question("Q4", "matrix_single")
    child = _make_question("ROW1", "rating", parent=parent, parent_id=parent.id)
    a = _make_answer(child, "Nice", answer_type=ANSWER_TYPE_COMMENT)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q4_comment"] == "Nice"


def test_comment_none_value():
    q = _make_question("Q3", "rating")
    a = _make_answer(q, None, answer_type=ANSWER_TYPE_COMMENT)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q3_comment"] is None


# ---------------------------------------------------------------------------
# RESPONDENT attributes
# ---------------------------------------------------------------------------


def test_respondent_attributes_present():
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, "Yes")
    participant = _make_participant({"language": "en", "region": "US"})
    ctx = build_expression_context(_make_response([a]), participant=participant)
    assert ctx["RESPONDENT.language"] == "en"
    assert ctx["RESPONDENT.region"] == "US"


def test_respondent_no_participant():
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, "Yes")
    ctx = build_expression_context(_make_response([a]), participant=None)
    respondent_keys = [k for k in ctx if k.startswith("RESPONDENT.")]
    assert respondent_keys == []


def test_respondent_empty_attributes():
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, "Yes")
    participant = _make_participant({})
    ctx = build_expression_context(_make_response([a]), participant=participant)
    respondent_keys = [k for k in ctx if k.startswith("RESPONDENT.")]
    assert respondent_keys == []


def test_respondent_none_attributes():
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, "Yes")
    participant = _make_participant(None)
    ctx = build_expression_context(_make_response([a]), participant=participant)
    respondent_keys = [k for k in ctx if k.startswith("RESPONDENT.")]
    assert respondent_keys == []


def test_respondent_multiple_attributes():
    participant = _make_participant(
        {"lang": "fr", "country": "FR", "age_group": "25-34"}
    )
    ctx = build_expression_context(_make_response([]), participant=participant)
    assert ctx["RESPONDENT.lang"] == "fr"
    assert ctx["RESPONDENT.country"] == "FR"
    assert ctx["RESPONDENT.age_group"] == "25-34"


# ---------------------------------------------------------------------------
# Type conversions: multi-select -> list
# ---------------------------------------------------------------------------


def test_multiple_choice_list():
    q = _make_question("Q1", "multiple_choice")
    a = _make_answer(q, ["A1", "A2", "A3"])
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ["A1", "A2", "A3"]
    assert isinstance(ctx["Q1"], list)


def test_checkbox_list():
    q = _make_question("Q1", "checkbox")
    a = _make_answer(q, ["opt1", "opt3"])
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ["opt1", "opt3"]


def test_ranking_list():
    q = _make_question("Q1", "ranking")
    a = _make_answer(q, ["first", "second", "third"])
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ["first", "second", "third"]


def test_multiple_choice_scalar_wrapped_in_list():
    """A scalar stored for a list-type question is wrapped in a list."""
    q = _make_question("Q1", "multiple_choice")
    a = _make_answer(q, "A1")
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ["A1"]


def test_multiple_choice_none():
    q = _make_question("Q1", "multiple_choice")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is None


# ---------------------------------------------------------------------------
# Type conversions: numeric
# ---------------------------------------------------------------------------


def test_rating_int():
    q = _make_question("Q1", "rating")
    a = _make_answer(q, 5)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == 5
    assert isinstance(ctx["Q1"], int)


def test_number_float():
    q = _make_question("Q1", "numeric")
    a = _make_answer(q, 3.14)
    ctx = build_expression_context(_make_response([a]))
    assert abs(ctx["Q1"] - 3.14) < 1e-10
    assert isinstance(ctx["Q1"], float)


def test_numeric_string_coerced():
    q = _make_question("Q1", "numeric")
    a = _make_answer(q, "42")
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == 42
    assert isinstance(ctx["Q1"], int)


def test_scale_float_whole_returns_int():
    """A float that is a whole number should be returned as int."""
    q = _make_question("Q1", "scale")
    a = _make_answer(q, 7.0)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == 7
    assert isinstance(ctx["Q1"], int)


def test_rating_none():
    q = _make_question("Q1", "rating")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is None


# ---------------------------------------------------------------------------
# Type conversions: boolean
# ---------------------------------------------------------------------------


def test_yes_no_true():
    q = _make_question("Q1", "yes_no")
    a = _make_answer(q, True)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is True


def test_yes_no_false():
    q = _make_question("Q1", "yes_no")
    a = _make_answer(q, False)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is False


def test_boolean_string_true():
    q = _make_question("Q1", "boolean")
    a = _make_answer(q, "yes")
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is True


def test_boolean_string_false():
    q = _make_question("Q1", "boolean")
    a = _make_answer(q, "no")
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is False


def test_boolean_int_1():
    q = _make_question("Q1", "boolean")
    a = _make_answer(q, 1)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is True


def test_boolean_none():
    q = _make_question("Q1", "yes_no")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is None


# ---------------------------------------------------------------------------
# Unanswered -> None
# ---------------------------------------------------------------------------


def test_empty_response_produces_empty_context():
    ctx = build_expression_context(_make_response([]))
    assert ctx == {}


def test_unanswered_single_choice_is_empty_string():
    # ISS-208: unanswered single_choice normalises to '' (string-type question).
    q = _make_question("Q1", "single_choice")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ""


# ---------------------------------------------------------------------------
# Unit tests for internal helpers
# ---------------------------------------------------------------------------


class TestCoerceValue:
    def test_none_string_type_returns_empty_string(self):
        # ISS-208: unanswered string-type questions normalise to ''.
        assert _coerce_value(None, "short_text") == ""

    def test_none_numeric_type_returns_none(self):
        # Numeric unanswered questions stay None so null-checks still work.
        assert _coerce_value(None, "rating") is None

    def test_none_boolean_type_returns_none(self):
        # Boolean unanswered questions stay None.
        assert _coerce_value(None, "boolean") is None

    def test_none_list_type_returns_none(self):
        # List-type unanswered questions stay None.
        assert _coerce_value(None, "multiple_choice") is None

    def test_string_passthrough(self):
        assert _coerce_value("hello", "short_text") == "hello"

    def test_non_string_to_str(self):
        assert _coerce_value(42, "short_text") == "42"

    def test_list_type_list(self):
        assert _coerce_value(["a", "b"], "multiple_choice") == ["a", "b"]

    def test_list_type_scalar_wrapped(self):
        assert _coerce_value("x", "checkbox") == ["x"]

    def test_numeric_type_int(self):
        assert _coerce_value(5, "rating") == 5

    def test_numeric_type_float(self):
        result = _coerce_value(2.5, "numeric")
        assert abs(result - 2.5) < 1e-10

    def test_boolean_type_bool(self):
        assert _coerce_value(True, "yes_no") is True

    def test_boolean_type_string(self):
        assert _coerce_value("false", "boolean") is False


class TestToNumber:
    def test_int_passthrough(self):
        assert _to_number(7) == 7

    def test_float_fractional(self):
        result = _to_number(3.14)
        assert abs(result - 3.14) < 1e-10

    def test_float_whole_to_int(self):
        assert _to_number(4.0) == 4
        assert isinstance(_to_number(4.0), int)

    def test_string_int(self):
        assert _to_number("10") == 10

    def test_string_float(self):
        result = _to_number("1.5")
        assert abs(result - 1.5) < 1e-10

    def test_string_non_numeric(self):
        assert _to_number("abc") is None

    def test_bool_returns_none(self):
        assert _to_number(True) is None
        assert _to_number(False) is None

    def test_none_returns_none(self):
        assert _to_number(None) is None


class TestToBool:
    def test_true(self):
        assert _to_bool(True) is True

    def test_false(self):
        assert _to_bool(False) is False

    def test_int_1(self):
        assert _to_bool(1) is True

    def test_int_0(self):
        assert _to_bool(0) is False

    def test_string_yes(self):
        assert _to_bool("yes") is True

    def test_string_no(self):
        assert _to_bool("no") is False

    def test_string_true(self):
        assert _to_bool("true") is True

    def test_string_false(self):
        assert _to_bool("false") is False

    def test_string_1(self):
        assert _to_bool("1") is True

    def test_string_0(self):
        assert _to_bool("0") is False

    def test_string_y(self):
        assert _to_bool("y") is True

    def test_string_n(self):
        assert _to_bool("n") is False

    def test_unrecognised_string(self):
        assert _to_bool("maybe") is None

    def test_none_returns_none(self):
        assert _to_bool(None) is None


class TestResolveRespondent:
    def test_none_participant_empty(self):
        assert _resolve_respondent(None) == {}

    def test_empty_attributes_empty(self):
        p = _make_participant({})
        assert _resolve_respondent(p) == {}

    def test_none_attributes_empty(self):
        p = _make_participant(None)
        assert _resolve_respondent(p) == {}

    def test_attributes_prefixed(self):
        p = _make_participant({"lang": "en", "country": "US"})
        result = _resolve_respondent(p)
        assert result == {"RESPONDENT.lang": "en", "RESPONDENT.country": "US"}


# ---------------------------------------------------------------------------
# Integration tests: resolver output -> evaluate()
# ---------------------------------------------------------------------------


def test_integration_direct_answer_string_comparison():
    q = _make_question("Q1", "single_choice")
    a = _make_answer(q, "Yes")
    ctx = build_expression_context(_make_response([a]))
    assert _eval_expr("{Q1} == 'Yes'", ctx) is True
    assert _eval_expr("{Q1} == 'No'", ctx) is False


def test_integration_unanswered_string_normalised_to_empty():
    # ISS-208: unanswered short_text normalises to ''; {Q1} == null is now
    # False (it is '' not null) and {Q1} == '' is True.
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert _eval_expr("{Q1} == ''", ctx) is True
    assert _eval_expr("{Q1} == null", ctx) is False


def test_integration_numeric_comparison():
    q = _make_question("Q1", "rating")
    a = _make_answer(q, 8)
    ctx = build_expression_context(_make_response([a]))
    assert _eval_expr("{Q1} >= 7", ctx) is True
    assert _eval_expr("{Q1} < 5", ctx) is False


def test_integration_multiselect_in_operator():
    q = _make_question("Q1", "multiple_choice")
    a = _make_answer(q, ["A1", "A3"])
    ctx = build_expression_context(_make_response([a]))
    assert _eval_expr("'A1' in {Q1}", ctx) is True
    assert _eval_expr("'A2' in {Q1}", ctx) is False


def test_integration_multiselect_count_function():
    q = _make_question("Q1", "multiple_choice")
    a = _make_answer(q, ["A1", "A2", "A3"])
    ctx = build_expression_context(_make_response([a]))
    assert _eval_expr("count({Q1}) == 3", ctx) is True


def test_integration_boolean_expression():
    q = _make_question("Q1", "yes_no")
    a = _make_answer(q, True)
    ctx = build_expression_context(_make_response([a]))
    assert _eval_expr("{Q1} == true", ctx) is True


def test_integration_respondent_attribute():
    participant = _make_participant({"language": "en"})
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, "Hello")
    ctx = build_expression_context(_make_response([a]), participant=participant)
    assert _eval_expr("{RESPONDENT.language} == 'en'", ctx) is True


def test_integration_subquestion_evaluation():
    parent = _make_question("Q1", "matrix_single")
    child = _make_question("ROW1", "single_choice", parent=parent, parent_id=parent.id)
    a = _make_answer(child, "Agree")
    ctx = build_expression_context(_make_response([a]))
    assert _eval_expr("{Q1_ROW1} == 'Agree'", ctx) is True


def test_integration_complex_and_expression():
    q1 = _make_question("Q1", "yes_no")
    q2 = _make_question("Q2", "rating")
    a1 = _make_answer(q1, True)
    a2 = _make_answer(q2, 9)
    ctx = build_expression_context(_make_response([a1, a2]))
    assert _eval_expr("{Q1} == true and {Q2} >= 8", ctx) is True


def test_integration_other_text_in_expression():
    q = _make_question("Q1", "single_choice")
    a = _make_answer(q, "Please specify...", answer_type=ANSWER_TYPE_OTHER)
    ctx = build_expression_context(_make_response([a]))
    assert _eval_expr("{Q1_other} != null", ctx) is True


def test_integration_comment_in_expression():
    q = _make_question("Q1", "rating")
    a = _make_answer(q, "Good product", answer_type=ANSWER_TYPE_COMMENT)
    ctx = build_expression_context(_make_response([a]))
    assert _eval_expr("{Q1_comment} != null", ctx) is True


def test_integration_unanswered_missing_from_context():
    """Variables not in context (never answered) resolve to None."""
    ctx = build_expression_context(_make_response([]))
    # Q99 was never answered — evaluator treats missing variable as None
    assert _eval_expr("{Q99} == null", ctx) is True


# ---------------------------------------------------------------------------
# ISS-208: String-type unanswered questions normalise to empty string
# ---------------------------------------------------------------------------


def test_iss208_short_text_unanswered_is_empty_string():
    """ISS-208 Scenario 7.2: unanswered short_text normalises to ''."""
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ""
    assert _eval_expr("{Q1} == ''", ctx) is True
    assert _eval_expr("{Q1} != ''", ctx) is False


def test_iss208_long_text_unanswered_is_empty_string():
    """ISS-208: unanswered long_text normalises to ''."""
    q = _make_question("Q1", "long_text")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ""


def test_iss208_dropdown_unanswered_is_empty_string():
    """ISS-208: unanswered dropdown normalises to ''."""
    q = _make_question("Q1", "dropdown")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ""


def test_iss208_radio_unanswered_is_empty_string():
    """ISS-208: unanswered radio normalises to ''."""
    q = _make_question("Q1", "radio")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] == ""


def test_iss208_numeric_unanswered_stays_none():
    """ISS-208: unanswered numeric question stays None (null-check preserved)."""
    q = _make_question("Q1", "rating")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is None
    assert _eval_expr("{Q1} == null", ctx) is True


def test_iss208_boolean_unanswered_stays_none():
    """ISS-208: unanswered boolean question stays None."""
    q = _make_question("Q1", "boolean")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is None
    assert _eval_expr("{Q1} == null", ctx) is True


def test_iss208_multiple_choice_unanswered_stays_none():
    """ISS-208: unanswered multiple_choice question stays None (list type)."""
    q = _make_question("Q1", "multiple_choice")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    assert ctx["Q1"] is None


def test_iss208_scenario_7_2_empty_string_equals_empty():
    """Scenario 7.2: {Q1} == '' is True for unanswered short_text question."""
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    result = _eval_expr("{Q1} == ''", ctx)
    assert result is True


def test_iss208_scenario_7_3_not_empty_is_false():
    """Scenario 7.3: {Q1} != '' is False for unanswered short_text question."""
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    result = _eval_expr("{Q1} != ''", ctx)
    assert result is False


def test_iss208_null_check_false_for_string_type():
    """{Q1} == null is False after string normalisation (Q1 is '' not null)."""
    q = _make_question("Q1", "short_text")
    a = _make_answer(q, None)
    ctx = build_expression_context(_make_response([a]))
    result = _eval_expr("{Q1} == null", ctx)
    assert result is False
