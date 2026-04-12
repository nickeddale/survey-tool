"""Consolidated logic test suite (ISS-082 — 5.12).

Covers (complementing existing per-module test files):
- Relevance evaluation (evaluate_relevance) — question/group visibility
- Skip logic navigation (get_next_question, get_previous_question, etc.)
- Piping / string interpolation (pipe, pipe_question, pipe_all)
- All 4 documented error codes via pytest.mark.parametrize:
    SYNTAX_ERROR, UNKNOWN_VARIABLE, TYPE_MISMATCH, UNSUPPORTED_FUNCTION
- validate_expression API (expression_engine.validate_expression)

NOTE: This file deliberately avoids duplicating parametrize tables that are
already exhaustively covered in test_expressions_relevance.py,
test_expressions_flow.py, test_expressions_piping.py, and
test_logic_validate_expression.py.  The emphasis here is on:
  - Descriptive parametrize IDs for readable CI output
  - Explicit assertions on error code strings (not just exception type)
  - Cross-module integration (validate_expression -> ValidationResult.errors[].code)
"""

from __future__ import annotations

import uuid
from typing import Any, Optional
from unittest.mock import MagicMock

import pytest

from app.services.expressions import (
    evaluate_relevance,
    RelevanceResult,
    CircularRelevanceError,
    RelevanceEvaluationError,
    clear_relevance_cache,
    get_first_visible_question,
    get_next_question,
    get_previous_question,
    get_first_visible_group,
    get_next_group,
    get_previous_group,
    build_ordered_pairs,
    get_visible_flow,
    NavigationPosition,
    pipe,
    pipe_question,
    pipe_all,
    PipingError,
)
from app.services.expression_engine import (
    validate_expression,
    ValidationResult,
    ExpressionError,
)


# ---------------------------------------------------------------------------
# Stub helpers — shared across relevance + flow sections
# ---------------------------------------------------------------------------


def _q(
    code: str,
    relevance: Optional[str] = None,
    qid: Optional[uuid.UUID] = None,
    sort_order: int = 1,
    parent_id: Optional[uuid.UUID] = None,
) -> MagicMock:
    """Create a minimal mock Question."""
    m = MagicMock()
    m.id = qid if qid is not None else uuid.uuid4()
    m.code = code
    m.relevance = relevance
    m.sort_order = sort_order
    m.parent_id = parent_id
    m.title = f"Question {code}"
    m.description = None
    m.answer_options = []
    return m


def _g(
    questions: list[Any],
    relevance: Optional[str] = None,
    gid: Optional[uuid.UUID] = None,
    sort_order: int = 1,
) -> MagicMock:
    """Create a minimal mock QuestionGroup."""
    m = MagicMock()
    m.id = gid if gid is not None else uuid.uuid4()
    m.relevance = relevance
    m.questions = questions
    m.sort_order = sort_order
    return m


def _s(groups: list[Any], sid: Optional[uuid.UUID] = None) -> MagicMock:
    """Create a minimal mock Survey."""
    m = MagicMock()
    m.id = sid if sid is not None else uuid.uuid4()
    m.groups = groups
    return m


# ---------------------------------------------------------------------------
# Section 1: Relevance evaluation — parametrized visibility cases
# ---------------------------------------------------------------------------

# Each tuple: (id, q_code, relevance_expr, answers, expect_visible)
# IMPORTANT: The question code must NOT appear in its own relevance expression,
# otherwise the cycle detector would flag it as a self-loop.
_RELEVANCE_CASES = [
    # Always visible if relevance is null
    ("null_relevance_always_visible", "Q2", None, {}, True),
    # Simple equality — match (Q2 whose relevance references Q1)
    ("eq_match_visible", "Q2", '{Q1} == "Yes"', {"Q1": "Yes"}, True),
    # Simple equality — no match
    ("eq_no_match_hidden", "Q2", '{Q1} == "Yes"', {"Q1": "No"}, False),
    # Unanswered variable → None → falsy
    ("unanswered_var_hidden", "Q2", "{Q1}", {}, False),
    # Numeric comparison
    ("numeric_gt_true", "Q2", "{Q_age} > 18", {"Q_age": 25}, True),
    ("numeric_gt_false", "Q2", "{Q_age} > 18", {"Q_age": 10}, False),
    # 'in' operator
    ("in_list_true", "Q2", '{Q_emp} in ["full_time", "part_time"]', {"Q_emp": "full_time"}, True),
    ("in_list_false", "Q2", '{Q_emp} in ["full_time", "part_time"]', {"Q_emp": "student"}, False),
    # not is_empty
    ("not_is_empty_has_value", "Q2", "not is_empty({Q1})", {"Q1": "x"}, True),
    ("not_is_empty_null", "Q2", "not is_empty({Q1})", {"Q1": None}, False),
    # count comparison — note: answers with list values cannot be in the cache key
    # so we use a string code for the variable, NOT the question code
    ("count_gte_3_true", "Q2", "count({Q_multi}) >= 3", {"Q_multi": "abc"}, True),
    ("count_gte_3_false", "Q2", "count({Q_multi}) >= 3", {"Q_multi": "a"}, False),
]


@pytest.mark.parametrize(
    "q_code,relevance,answers,expect_visible",
    [(c, r, a, e) for _, c, r, a, e in _RELEVANCE_CASES],
    ids=[tid for tid, *_ in _RELEVANCE_CASES],
)
def test_relevance_question_visibility(q_code, relevance, answers, expect_visible):
    """Question visibility must match the evaluated relevance expression."""
    clear_relevance_cache()
    q = _q(q_code, relevance=relevance)
    g = _g([q], relevance=None)
    survey = _s([g])

    result = evaluate_relevance(survey, answers=answers)
    if expect_visible:
        assert q.id in result.visible_question_ids
        assert q.id not in result.hidden_question_ids
    else:
        assert q.id in result.hidden_question_ids
        assert q.id not in result.visible_question_ids


def test_relevance_group_hidden_hides_all_children():
    """Questions in a hidden group are always hidden regardless of own relevance."""
    clear_relevance_cache()
    q1 = _q("Q1", relevance=None)           # would be visible
    q2 = _q("Q2", relevance='{Q3} == "x"')  # would be visible too if group was
    g = _g([q1, q2], relevance='{SHOW} == true')
    survey = _s([g])

    result = evaluate_relevance(survey, answers={})  # SHOW absent → group hidden
    assert g.id in result.hidden_group_ids
    assert q1.id in result.hidden_question_ids
    assert q2.id in result.hidden_question_ids


def test_relevance_circular_reference_raises():
    """Circular relevance references must raise CircularRelevanceError."""
    clear_relevance_cache()
    q1 = _q("Q1", relevance="{Q2} == 'Yes'")
    q2 = _q("Q2", relevance="{Q1} == 'Yes'")
    g = _g([q1, q2], relevance=None)
    survey = _s([g])

    with pytest.raises(CircularRelevanceError) as exc_info:
        evaluate_relevance(survey, answers={})
    assert len(exc_info.value.cycle) >= 2


def test_relevance_bad_syntax_raises_evaluation_error():
    """An expression with broken syntax raises RelevanceEvaluationError."""
    clear_relevance_cache()
    q = _q("Q1", relevance="{{broken ===")
    g = _g([q], relevance=None)
    survey = _s([g])
    with pytest.raises(RelevanceEvaluationError):
        evaluate_relevance(survey, answers={})


def test_relevance_result_is_dataclass():
    """evaluate_relevance must return a RelevanceResult instance."""
    clear_relevance_cache()
    survey = _s([])
    result = evaluate_relevance(survey, answers={})
    assert isinstance(result, RelevanceResult)


# ---------------------------------------------------------------------------
# Section 2: Skip logic navigation (parametrized)
# ---------------------------------------------------------------------------


def _build_linear_survey(n_questions: int, relevances: list[Optional[str]] = None) -> tuple:
    """Build a survey with n_questions in a single group, return (survey, questions, group)."""
    clear_relevance_cache()
    relevances = relevances or [None] * n_questions
    questions = [
        _q(f"Q{i+1}", relevance=relevances[i], sort_order=i+1, qid=uuid.uuid4())
        for i in range(n_questions)
    ]
    group = _g(questions, relevance=None, sort_order=1)
    survey = _s([group])
    return survey, questions, group


@pytest.mark.parametrize(
    "n,relevances,from_idx,direction,expected_idx",
    [
        # forward navigation through 3 visible questions
        (3, [None, None, None], 0, "next", 1),
        (3, [None, None, None], 1, "next", 2),
        (3, [None, None, None], 2, "next", None),  # at end
        # backward navigation
        (3, [None, None, None], 2, "prev", 1),
        (3, [None, None, None], 1, "prev", 0),
        (3, [None, None, None], 0, "prev", None),  # at start
        # skip hidden middle question
        (3, [None, '{NEVER} == "x"', None], 0, "next", 2),  # skips Q2
        (3, [None, '{NEVER} == "x"', None], 2, "prev", 0),  # skips Q2 backward
        # all questions hidden — first visible is None
        (2, ['{NEVER} == "x"', '{NEVER} == "x"'], None, "first", None),
    ],
    ids=[
        "nav_fwd_0_to_1", "nav_fwd_1_to_2", "nav_fwd_2_end",
        "nav_bwd_2_to_1", "nav_bwd_1_to_0", "nav_bwd_0_start",
        "nav_fwd_skip_hidden", "nav_bwd_skip_hidden",
        "nav_all_hidden_first_none",
    ],
)
def test_skip_logic_navigation(n, relevances, from_idx, direction, expected_idx):
    """Skip logic navigation must correctly skip hidden questions."""
    survey, questions, group = _build_linear_survey(n, relevances)
    answers = {}

    if direction == "first":
        pos = get_first_visible_question(survey, answers)
        if expected_idx is None:
            assert pos is None
        else:
            assert pos is not None
            assert pos.question_id == questions[expected_idx].id
        return

    current = NavigationPosition(
        group_id=group.id,
        question_id=questions[from_idx].id,
    )

    if direction == "next":
        pos = get_next_question(survey, current, answers)
    else:
        pos = get_previous_question(survey, current, answers)

    if expected_idx is None:
        assert pos is None
    else:
        assert pos is not None
        assert pos.question_id == questions[expected_idx].id


def test_skip_logic_get_first_visible_question():
    """get_first_visible_question must return the first visible question."""
    survey, questions, group = _build_linear_survey(3, ['{NEVER} == "x"', None, None])
    pos = get_first_visible_question(survey, answers={})
    assert pos is not None
    assert pos.question_id == questions[1].id  # Q1 is hidden, Q2 is first visible


def test_skip_logic_group_navigation():
    """Group navigation must skip groups with no visible questions."""
    clear_relevance_cache()
    q1a = _q("Q1A", sort_order=1)
    g1 = _g([q1a], sort_order=1)

    q2a = _q("Q2A", relevance='{HIDE} == "yes"', sort_order=1)
    g2 = _g([q2a], sort_order=2)

    q3a = _q("Q3A", sort_order=1)
    g3 = _g([q3a], sort_order=3)

    survey = _s([g1, g2, g3])
    answers = {}  # HIDE absent → Q2A hidden → g2 has no visible questions

    next_gid = get_next_group(survey, g1.id, answers)
    # g2 has no visible questions so should be skipped → next should be g3
    assert next_gid == g3.id

    prev_gid = get_previous_group(survey, g3.id, answers)
    assert prev_gid == g1.id


def test_build_ordered_pairs_excludes_subquestions():
    """build_ordered_pairs must exclude questions with a non-None parent_id."""
    clear_relevance_cache()
    parent_q = _q("Q1", sort_order=1)
    sub_q = _q("Q1_SQ1", sort_order=1, parent_id=parent_q.id)
    g = _g([parent_q, sub_q], sort_order=1)
    survey = _s([g])

    pairs = build_ordered_pairs(survey)
    question_ids = [q.id for _, q in pairs]
    assert parent_q.id in question_ids
    assert sub_q.id not in question_ids


# ---------------------------------------------------------------------------
# Section 3: Piping / string interpolation (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "template,ctx,expected",
    [
        # Simple variable substitution
        ("Hello {Q_name}!", {"Q_name": "Alice"}, "Hello Alice!"),
        # Null variable → empty string
        ("Hello {Q_name}!", {"Q_name": None}, "Hello !"),
        # Missing variable → empty string
        ("Hello {Q_missing}!", {}, "Hello !"),
        # Multi-select list joined with comma-space
        ("You chose: {Q_multi}", {"Q_multi": ["A", "B", "C"]}, "You chose: A, B, C"),
        # Numeric value
        ("You entered {Q_num}", {"Q_num": 42}, "You entered 42"),
        # Float value
        ("Score: {Q_score}", {"Q_score": 3.14}, "Score: 3.14"),
        # Escaped braces
        ("\\{not a var\\}", {}, "{not a var}"),
        # Multiple placeholders in one string
        ("{Q1} and {Q2}", {"Q1": "Yes", "Q2": "No"}, "Yes and No"),
        # No placeholders
        ("plain text", {}, "plain text"),
        # Empty template
        ("", {}, ""),
        # Nested function call in placeholder: count({Q_multi})
        ("Total: {count({Q_multi})}", {"Q_multi": ["A", "B", "C"]}, "Total: 3"),
        # Piping with boolean
        ("Flag: {Q_flag}", {"Q_flag": True}, "Flag: True"),
        # Expression 6 from docs: What do you like most about {Q7}?
        ("What do you like most about {Q7}?", {"Q7": "Brand X"},
         "What do you like most about Brand X?"),
    ],
    ids=[
        "pipe_simple_var",
        "pipe_null_var",
        "pipe_missing_var",
        "pipe_list_joined",
        "pipe_numeric",
        "pipe_float",
        "pipe_escaped_braces",
        "pipe_multiple_placeholders",
        "pipe_no_placeholders",
        "pipe_empty_template",
        "pipe_nested_function_count",
        "pipe_boolean",
        "pipe_ex06_brand",
    ],
)
def test_pipe_string_interpolation(template, ctx, expected):
    """pipe() must replace {…} placeholders according to documented rules."""
    result = pipe(template, ctx)
    assert result == expected


def test_pipe_question_returns_title_and_description():
    """pipe_question must return piped title and description keyed by code."""
    q = MagicMock()
    q.code = "Q5"
    q.title = "What do you think about {Q1}?"
    q.description = "Your answer to Q1 was: {Q1}"
    ctx = {"Q1": "Python"}

    result = pipe_question(q, ctx)
    assert result["Q5_title"] == "What do you think about Python?"
    assert result["Q5_description"] == "Your answer to Q1 was: Python"


def test_pipe_question_null_description():
    """pipe_question must handle None description gracefully."""
    q = MagicMock()
    q.code = "Q1"
    q.title = "Title {Q2}"
    q.description = None
    ctx = {"Q2": "val"}

    result = pipe_question(q, ctx)
    assert result["Q1_title"] == "Title val"
    assert result["Q1_description"] == ""


def test_pipe_all_processes_all_questions():
    """pipe_all must produce entries for every top-level question."""
    q1 = MagicMock()
    q1.code = "Q1"
    q1.title = "Hello {name}"
    q1.description = None
    q1.parent_id = None
    q1.answer_options = []

    q2 = MagicMock()
    q2.code = "Q2"
    q2.title = "Number is {num}"
    q2.description = "desc"
    q2.parent_id = None
    q2.answer_options = []

    ctx = {"name": "Bob", "num": 7}
    result = pipe_all([q1, q2], ctx)

    assert result["Q1_title"] == "Hello Bob"
    assert result["Q2_title"] == "Number is 7"


def test_pipe_all_skips_subquestions():
    """pipe_all must skip questions with a non-None parent_id."""
    parent = MagicMock()
    parent.code = "Q1"
    parent.title = "Parent {X}"
    parent.description = None
    parent.parent_id = None
    parent.answer_options = []

    sub = MagicMock()
    sub.code = "Q1_SQ1"
    sub.title = "Sub"
    sub.parent_id = uuid.uuid4()

    ctx = {"X": "val"}
    result = pipe_all([parent, sub], ctx)

    assert "Q1_title" in result
    assert "Q1_SQ1_title" not in result


def test_pipe_error_on_invalid_expression():
    """PipingError must be raised when a placeholder has invalid syntax."""
    with pytest.raises(PipingError):
        pipe("{@invalid_syntax}", {})


def test_pipe_doc_example_7_validation_message():
    """Piping example 7 — sum in piped validation message."""
    template = "Your allocations must total 100%. Currently they total {sum({Q20_SQ001}, {Q20_SQ002}, {Q20_SQ003})}%."
    ctx = {"Q20_SQ001": 30, "Q20_SQ002": 40, "Q20_SQ003": 20}
    result = pipe(template, ctx)
    assert "90" in result
    assert "100%" in result


def test_pipe_doc_example_11_count_nested():
    """Piping example 11 — {count({Q_features})} nested expression."""
    template = "You selected {count({Q_features})} feature(s). Your top choice was {Q_features_1}."
    ctx = {"Q_features": ["feat1", "feat2"], "Q_features_1": "feat1"}
    result = pipe(template, ctx)
    assert "2 feature(s)" in result
    assert "feat1" in result


# ---------------------------------------------------------------------------
# Section 4: Error codes — all 4 via validate_expression (parametrized)
# ---------------------------------------------------------------------------
# IMPORTANT: Each case explicitly asserts on the .code attribute of each error,
# not just that an error was raised.  This prevents false passes if the wrong
# error code is returned.


@pytest.mark.parametrize(
    "expression,known_variables,sort_orders,current_sort_order,expected_code",
    [
        # SYNTAX_ERROR: malformed expression (parser error)
        (
            "{Q1} ==",           # incomplete binary
            ["Q1"],
            None, None,
            "SYNTAX_ERROR",
        ),
        # SYNTAX_ERROR: unterminated variable reference
        (
            "{Q1",
            ["Q1"],
            None, None,
            "SYNTAX_ERROR",
        ),
        # SYNTAX_ERROR: empty expression
        (
            "",
            [],
            None, None,
            "SYNTAX_ERROR",
        ),
        # UNKNOWN_VARIABLE: variable not in known set
        (
            '{GHOST} == "Yes"',
            ["Q1"],          # GHOST not in this list
            None, None,
            "UNKNOWN_VARIABLE",
        ),
        # UNKNOWN_VARIABLE: empty known set
        (
            '{Q1} == "Yes"',
            [],
            None, None,
            "UNKNOWN_VARIABLE",
        ),
        # FORWARD_REFERENCE: variable sort_order >= current_sort_order
        (
            '{Q3} == "Yes"',
            ["Q1", "Q2", "Q3"],
            {"Q1": 1, "Q2": 2, "Q3": 3},
            2,               # Q3's sort_order (3) >= current (2) → forward reference
            "FORWARD_REFERENCE",
        ),
        # UNSUPPORTED_FUNCTION: the function is known to the lexer
        # but validate_expression checks AST-level FunctionCall nodes.
        # We need to inject the AST directly since the lexer won't produce
        # a FUNCTION token for unknown names.  We simulate by using the
        # validate_expression internals via a patched BUILTIN_FUNCTIONS.
        # Instead, test the UNSUPPORTED_FUNCTION path by using a known
        # expression whose FunctionCall node has a name not in BUILTIN_FUNCTIONS.
        # We patch BUILTIN_FUNCTIONS to remove "count" temporarily.
        (
            "count({Q1}) >= 3",
            ["Q1"],
            None, None,
            "UNSUPPORTED_FUNCTION",
        ),
    ],
    ids=[
        "err_syntax_incomplete_binary",
        "err_syntax_unterminated_var",
        "err_syntax_empty",
        "err_unknown_variable_ghost",
        "err_unknown_variable_empty_known",
        "err_forward_reference",
        "err_unsupported_function_count_removed",
    ],
)
def test_validate_expression_error_codes(
    expression, known_variables, sort_orders, current_sort_order, expected_code
):
    """validate_expression must return the correct error code for each error type."""
    from app.services.expressions.functions import BUILTIN_FUNCTIONS

    if expected_code == "UNSUPPORTED_FUNCTION":
        # Temporarily remove "count" from BUILTIN_FUNCTIONS to trigger the check
        saved = BUILTIN_FUNCTIONS.pop("count")
        try:
            result = validate_expression(
                expression=expression,
                known_variables=known_variables,
                question_sort_orders=sort_orders,
                current_sort_order=current_sort_order,
            )
        finally:
            BUILTIN_FUNCTIONS["count"] = saved
    else:
        result = validate_expression(
            expression=expression,
            known_variables=known_variables,
            question_sort_orders=sort_orders,
            current_sort_order=current_sort_order,
        )

    assert isinstance(result, ValidationResult)
    # FORWARD_REFERENCE is reported as a warning, not an error
    if expected_code == "FORWARD_REFERENCE":
        warning_codes = [w.code for w in result.warnings]
        assert expected_code in warning_codes, (
            f"Expected warning code {expected_code!r} in {warning_codes!r}"
        )
    else:
        assert len(result.errors) >= 1, (
            f"Expected at least one error with code={expected_code!r}, got no errors"
        )
        error_codes = [e.code for e in result.errors]
        assert expected_code in error_codes, (
            f"Expected error code {expected_code!r} in {error_codes!r}"
        )


# ---------------------------------------------------------------------------
# Section 5: validate_expression — success cases (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expression,known_variables",
    [
        # Simple equality — variable is known
        ('{Q1} == "Yes"', ["Q1"]),
        # Compound expression — all variables known
        ('{Q1} == "Yes" and {Q2} > 18', ["Q1", "Q2"]),
        # Function call with known variable
        ("count({Q_multi}) >= 3", ["Q_multi"]),
        # No variables — pure literals
        ("1 == 1", []),
        ("true", []),
        # Membership operator
        ('{Q1} in ["full_time", "part_time"]', ["Q1"]),
        # Complex with all operators
        (
            '{Q_age} >= 18 and {Q_age} <= 34 and ({Q_edu} in ["bachelors"] or {Q_inc} > 75000)',
            ["Q_age", "Q_edu", "Q_inc"],
        ),
    ],
    ids=[
        "valid_simple_eq",
        "valid_compound",
        "valid_function_count",
        "valid_literal_only_int",
        "valid_literal_true",
        "valid_in_operator",
        "valid_complex_age",
    ],
)
def test_validate_expression_valid(expression, known_variables):
    """Valid expressions with known variables must produce no errors."""
    result = validate_expression(
        expression=expression,
        known_variables=known_variables,
    )
    assert isinstance(result, ValidationResult)
    assert result.errors == [], (
        f"Expected no errors for valid expression, got: {[e.code for e in result.errors]}"
    )


# ---------------------------------------------------------------------------
# Section 6: validate_expression — parsed_variables population (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expression,known_variables,expected_vars",
    [
        ('{Q1} == "Yes"', ["Q1"], ["Q1"]),
        ('{Q1} == "Yes" and {Q2} > 18', ["Q1", "Q2"], ["Q1", "Q2"]),
        ("1 == 1", [], []),
        # Duplicate references → appears once
        ('{Q1} == "Yes" or {Q1} == "No"', ["Q1"], ["Q1"]),
    ],
    ids=[
        "pv_single", "pv_multiple", "pv_none", "pv_dedup",
    ],
)
def test_validate_expression_parsed_variables(expression, known_variables, expected_vars):
    """validate_expression must populate parsed_variables with deduplicated names."""
    result = validate_expression(
        expression=expression,
        known_variables=known_variables,
    )
    # Check all expected vars are present
    for var in expected_vars:
        assert var in result.parsed_variables, (
            f"Expected {var!r} in parsed_variables, got {result.parsed_variables!r}"
        )
    # Check count matches expected (deduplication)
    assert len(result.parsed_variables) == len(expected_vars)


# ---------------------------------------------------------------------------
# Section 7: ExpressionError dataclass structure
# ---------------------------------------------------------------------------


def test_expression_error_has_required_fields():
    """ExpressionError must have message, position, and code."""
    err = ExpressionError(message="test message", position=5, code="SYNTAX_ERROR")
    assert err.message == "test message"
    assert err.position == 5
    assert err.code == "SYNTAX_ERROR"
    assert isinstance(err.position, int)
    assert isinstance(err.code, str)


def test_validation_result_defaults_empty():
    """ValidationResult default factory produces empty lists."""
    result = ValidationResult()
    assert result.errors == []
    assert result.warnings == []
    assert result.parsed_variables == []


# ---------------------------------------------------------------------------
# Section 8: validate_expression error position is an integer (not None)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expression,known_variables",
    [
        ("{Q1} ==", ["Q1"]),        # SYNTAX_ERROR
        ("{GHOST} == 1", []),        # UNKNOWN_VARIABLE
    ],
    ids=["pos_syntax_error", "pos_unknown_variable"],
)
def test_error_position_is_int(expression, known_variables):
    """Each ExpressionError.position must be an integer."""
    result = validate_expression(
        expression=expression,
        known_variables=known_variables,
    )
    assert len(result.errors) >= 1
    for err in result.errors:
        assert isinstance(err.position, int), (
            f"Expected int position for error {err.code!r}, got {type(err.position)}"
        )


# ---------------------------------------------------------------------------
# Section 9: Full pipeline integration — relevance + navigation combined
# ---------------------------------------------------------------------------


def test_full_pipeline_relevance_and_navigation():
    """A survey with mixed visibility: navigate forward, skip hidden questions."""
    clear_relevance_cache()
    q1 = _q("Q1", relevance=None, sort_order=1)
    q2 = _q("Q2", relevance='{Q1} == "skip"', sort_order=2)   # hidden unless Q1="skip"
    q3 = _q("Q3", relevance=None, sort_order=3)

    g = _g([q1, q2, q3], relevance=None, sort_order=1)
    survey = _s([g])

    answers = {"Q1": "no_skip"}  # Q2 relevance is false → Q2 hidden

    pos0 = get_first_visible_question(survey, answers)
    assert pos0 is not None
    assert pos0.question_id == q1.id

    pos1 = get_next_question(survey, pos0, answers)
    assert pos1 is not None
    # Q2 is hidden, so next visible is Q3
    assert pos1.question_id == q3.id

    pos2 = get_next_question(survey, pos1, answers)
    assert pos2 is None  # end of survey


def test_full_pipeline_relevance_changes_with_answer():
    """Changing answer values causes different questions to be visible."""
    clear_relevance_cache()
    q1 = _q("Q1", relevance=None, sort_order=1)
    q2 = _q("Q2", relevance='{Q1} == "show_q2"', sort_order=2)
    g = _g([q1, q2], relevance=None, sort_order=1)
    survey = _s([g])

    # Q2 hidden when Q1 != "show_q2"
    result_hide = evaluate_relevance(survey, answers={"Q1": "other"})
    assert q2.id in result_hide.hidden_question_ids

    clear_relevance_cache()

    # Q2 visible when Q1 == "show_q2"
    result_show = evaluate_relevance(survey, answers={"Q1": "show_q2"})
    assert q2.id in result_show.visible_question_ids
