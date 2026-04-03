"""Tests for the answer piping / string interpolation module (ISS-078).

Covers:
- Package-level import smoke test
- Simple variable substitution
- Null / missing variable → empty string
- List / multi-select → comma-space join
- Numeric (int / float) raw insertion
- Escaped braces pass-through (\\{ and \\})
- Nested function call like {count({Q_multi})}
- Text with no placeholders is returned unchanged
- PipingError raised on bad expressions
- pipe_question() on title + description
- pipe_all() including answer options
"""

import uuid
from typing import Any, Optional
from unittest.mock import MagicMock

import pytest

from app.services.expressions.piping import (
    pipe,
    pipe_question,
    pipe_all,
    PipingError,
)
from app.services.expressions import (
    pipe as pkg_pipe,
    pipe_question as pkg_pipe_question,
    pipe_all as pkg_pipe_all,
    PipingError as pkg_PipingError,
)


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------


def _make_question(
    code: str,
    title: str = "",
    description: str = "",
    parent_id: Optional[uuid.UUID] = None,
    answer_options: Optional[list] = None,
) -> MagicMock:
    q = MagicMock()
    q.id = uuid.uuid4()
    q.code = code
    q.title = title
    q.description = description
    q.parent_id = parent_id
    q.answer_options = answer_options or []
    return q


def _make_option(code: str, label: str) -> MagicMock:
    opt = MagicMock()
    opt.id = uuid.uuid4()
    opt.code = code
    opt.label = label
    return opt


# ---------------------------------------------------------------------------
# Package import smoke test
# ---------------------------------------------------------------------------


def test_package_imports():
    """pipe, pipe_question, pipe_all, and PipingError must be importable from the package."""
    assert callable(pkg_pipe)
    assert callable(pkg_pipe_question)
    assert callable(pkg_pipe_all)
    assert issubclass(pkg_PipingError, ValueError)


# ---------------------------------------------------------------------------
# pipe(): simple variable substitution
# ---------------------------------------------------------------------------


def test_pipe_simple_string_variable():
    ctx = {"Q1": "Alice"}
    assert pipe("Hello {Q1}!", ctx) == "Hello Alice!"


def test_pipe_multiple_variables():
    ctx = {"Q_first": "John", "Q_last": "Doe"}
    assert pipe("{Q_first} {Q_last}", ctx) == "John Doe"


def test_pipe_variable_in_middle():
    ctx = {"NAME": "World"}
    assert pipe("Say hello to {NAME} today.", ctx) == "Say hello to World today."


def test_pipe_repeated_variable():
    ctx = {"Q1": "cat"}
    assert pipe("A {Q1} is a {Q1}.", ctx) == "A cat is a cat."


# ---------------------------------------------------------------------------
# pipe(): null / missing variable → empty string
# ---------------------------------------------------------------------------


def test_pipe_null_variable_becomes_empty_string():
    ctx = {"Q1": None}
    assert pipe("Value: {Q1}.", ctx) == "Value: ."


def test_pipe_missing_variable_becomes_empty_string():
    """Variables not in context resolve to None → empty string."""
    ctx = {}
    assert pipe("Value: {Q99}.", ctx) == "Value: ."


def test_pipe_null_only_placeholder():
    ctx = {"Q1": None}
    assert pipe("{Q1}", ctx) == ""


# ---------------------------------------------------------------------------
# pipe(): list / multi-select → comma-space join
# ---------------------------------------------------------------------------


def test_pipe_list_joined_with_comma_space():
    ctx = {"Q_multi": ["A", "B", "C"]}
    assert pipe("Selected: {Q_multi}.", ctx) == "Selected: A, B, C."


def test_pipe_list_single_item():
    ctx = {"Q_multi": ["only"]}
    assert pipe("{Q_multi}", ctx) == "only"


def test_pipe_empty_list():
    """An empty list renders as an empty string (nothing selected)."""
    ctx = {"Q_multi": []}
    assert pipe("{Q_multi}", ctx) == ""


def test_pipe_list_with_numeric_items():
    ctx = {"Q_rank": [3, 1, 2]}
    assert pipe("{Q_rank}", ctx) == "3, 1, 2"


# ---------------------------------------------------------------------------
# pipe(): numeric raw insertion
# ---------------------------------------------------------------------------


def test_pipe_integer_value():
    ctx = {"SCORE": 42}
    assert pipe("Your score is {SCORE}.", ctx) == "Your score is 42."


def test_pipe_float_value():
    ctx = {"RATIO": 3.14}
    assert pipe("Pi is {RATIO}.", ctx) == "Pi is 3.14."


def test_pipe_zero_value():
    ctx = {"Q1": 0}
    assert pipe("{Q1}", ctx) == "0"


# ---------------------------------------------------------------------------
# pipe(): escaped braces pass-through
# ---------------------------------------------------------------------------


def test_pipe_escaped_open_brace_literal():
    ctx = {}
    assert pipe(r"Show \{literal\} braces.", ctx) == "Show {literal} braces."


def test_pipe_escaped_brace_not_treated_as_placeholder():
    ctx = {"Q1": "value"}
    # \{Q1\} should NOT be substituted — it's escaped
    result = pipe(r"\{Q1\}", ctx)
    assert result == "{Q1}"


def test_pipe_mixed_escaped_and_real_placeholder():
    ctx = {"Q1": "hello"}
    result = pipe(r"\{not_a_var\} and {Q1}", ctx)
    assert result == "{not_a_var} and hello"


# ---------------------------------------------------------------------------
# pipe(): nested function calls
# ---------------------------------------------------------------------------


def test_pipe_nested_count_function():
    ctx = {"Q_multi": ["A", "B", "C"]}
    result = pipe("You selected {count({Q_multi})} options.", ctx)
    assert result == "You selected 3 options."


def test_pipe_nested_sum_function():
    ctx = {"Q_nums": [1, 2, 3, 4]}
    result = pipe("Total: {sum({Q_nums})}.", ctx)
    assert result == "Total: 10."


def test_pipe_nested_min_max():
    ctx = {"Q_nums": [5, 2, 8, 1]}
    assert pipe("Min={min({Q_nums})}, Max={max({Q_nums})}", ctx) == "Min=1, Max=8"


# ---------------------------------------------------------------------------
# pipe(): text with no placeholders
# ---------------------------------------------------------------------------


def test_pipe_no_placeholders_unchanged():
    ctx = {"Q1": "value"}
    assert pipe("Plain text with no variables.", ctx) == "Plain text with no variables."


def test_pipe_empty_string():
    assert pipe("", {}) == ""


def test_pipe_only_whitespace():
    assert pipe("   ", {}) == "   "


# ---------------------------------------------------------------------------
# pipe(): error handling
# ---------------------------------------------------------------------------


def test_pipe_bad_expression_raises_piping_error():
    ctx = {}
    with pytest.raises(PipingError):
        pipe("{== invalid}", ctx)


# ---------------------------------------------------------------------------
# pipe_question()
# ---------------------------------------------------------------------------


def test_pipe_question_title_and_description():
    ctx = {"NAME": "Alice"}
    q = _make_question(
        code="Q1",
        title="Hello {NAME}!",
        description="Welcome, {NAME}.",
    )
    result = pipe_question(q, ctx)
    assert result == {
        "Q1_title": "Hello Alice!",
        "Q1_description": "Welcome, Alice.",
    }


def test_pipe_question_none_title_becomes_empty():
    ctx = {}
    q = _make_question(code="Q2", title=None, description=None)
    result = pipe_question(q, ctx)
    assert result["Q2_title"] == ""
    assert result["Q2_description"] == ""


def test_pipe_question_no_placeholders():
    ctx = {"Q1": "ignored"}
    q = _make_question(code="Q3", title="Static title", description="Static desc")
    result = pipe_question(q, ctx)
    assert result == {
        "Q3_title": "Static title",
        "Q3_description": "Static desc",
    }


def test_pipe_question_returns_correct_keys():
    ctx = {}
    q = _make_question(code="MYCODE", title="T", description="D")
    result = pipe_question(q, ctx)
    assert set(result.keys()) == {"MYCODE_title", "MYCODE_description"}


# ---------------------------------------------------------------------------
# pipe_all()
# ---------------------------------------------------------------------------


def test_pipe_all_single_question_no_options():
    ctx = {"Q1": "Alice"}
    q = _make_question(code="Q1", title="Hello {Q1}!", description="Desc {Q1}")
    result = pipe_all([q], ctx)
    assert result["Q1_title"] == "Hello Alice!"
    assert result["Q1_description"] == "Desc Alice"


def test_pipe_all_with_answer_options():
    ctx = {"VAR": "special"}
    opt1 = _make_option("OPT1", "Option {VAR} A")
    opt2 = _make_option("OPT2", "Plain option B")
    q = _make_question(
        code="Q1",
        title="Question",
        description="",
        answer_options=[opt1, opt2],
    )
    result = pipe_all([q], ctx)
    assert result["Q1_OPT1_title"] == "Option special A"
    assert result["Q1_OPT2_title"] == "Plain option B"


def test_pipe_all_skips_subquestions():
    """Questions with parent_id set should be skipped."""
    parent_id = uuid.uuid4()
    sub = _make_question(code="SQ1", title="Sub {Q1}", description="", parent_id=parent_id)
    parent = _make_question(code="Q1", title="Parent", description="")
    result = pipe_all([parent, sub], {})
    assert "Q1_title" in result
    assert "SQ1_title" not in result


def test_pipe_all_multiple_questions():
    ctx = {"A": "foo", "B": "bar"}
    q1 = _make_question(code="Q1", title="{A}", description="")
    q2 = _make_question(code="Q2", title="{B}", description="")
    result = pipe_all([q1, q2], ctx)
    assert result["Q1_title"] == "foo"
    assert result["Q2_title"] == "bar"


def test_pipe_all_option_with_null_label():
    ctx = {}
    opt = _make_option("OPT1", None)
    opt.label = None
    q = _make_question(code="Q1", title="", description="", answer_options=[opt])
    result = pipe_all([q], ctx)
    assert result["Q1_OPT1_title"] == ""


def test_pipe_all_empty_list():
    result = pipe_all([], {})
    assert result == {}


def test_pipe_all_includes_all_keys_for_question_with_options():
    ctx = {"GREETING": "Hi"}
    opt = _make_option("A", "Choice A")
    q = _make_question(
        code="Q5",
        title="{GREETING} there",
        description="Choose one",
        answer_options=[opt],
    )
    result = pipe_all([q], ctx)
    assert set(result.keys()) == {"Q5_title", "Q5_description", "Q5_A_title"}
    assert result["Q5_title"] == "Hi there"
    assert result["Q5_description"] == "Choose one"
    assert result["Q5_A_title"] == "Choice A"
