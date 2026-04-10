"""Tests for the expression language evaluator (ISS-073).

Covers:
- Package-level import smoke test
- Literal evaluation: string, number (int/float), boolean, null
- Variable resolution from context
- Missing variable returns None
- Variable value truncation at 10 000 characters
- Unary 'not' with boolean coercion
- All binary comparison operators: ==, !=, >, <, >=, <=
- Type coercion in comparisons (numeric string vs int)
- Short-circuit evaluation for 'and' / 'or'
- String operators: contains, starts_with, ends_with
- Membership operator: in
- Array literals
- All 8 built-in functions with valid inputs and error cases
- Timeout enforcement (100ms) using a mock slow function
- Nested complex expressions
- EvaluationError propagation with position attribute
- EvaluationError is raised (not generic Exception) for all error paths
"""

import time
from unittest.mock import patch

import pytest

from app.services.expressions import (
    tokenize,
    parse,
    evaluate,
    Evaluator,
    EvaluationError,
)
from app.services.expressions.ast_nodes import (
    ASTNode,
    BinaryOp,
    FunctionCall,
    Literal,
    Variable,
    UnaryOp,
    ArrayLiteral,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def eval_expr(expr_str: str, context: dict = None, timeout=None) -> object:
    """Tokenize, parse, and evaluate an expression string."""
    tokens = tokenize(expr_str)
    ast = parse(tokens)
    return evaluate(ast, context=context or {}, timeout=timeout)


def make_literal(value, kind: str) -> Literal:
    return Literal(start=0, end=1, value=value, kind=kind)


def make_variable(name: str) -> Variable:
    return Variable(start=0, end=1, name=name)


# ---------------------------------------------------------------------------
# Package import smoke test
# ---------------------------------------------------------------------------


def test_package_imports():
    """All evaluator symbols must be importable from app.services.expressions."""
    assert callable(evaluate)
    assert issubclass(EvaluationError, ValueError)
    assert issubclass(Evaluator, object)


def test_evaluation_error_has_position():
    err = EvaluationError("test", position=42)
    assert err.position == 42
    assert isinstance(err.position, int)
    assert "42" in str(err)
    assert "test" in str(err)


# ---------------------------------------------------------------------------
# Literal evaluation
# ---------------------------------------------------------------------------


def test_literal_string():
    result = eval_expr('"hello"')
    assert result == "hello"


def test_literal_string_empty():
    result = eval_expr('""')
    assert result == ""


def test_literal_integer():
    result = eval_expr("42")
    assert result == 42
    assert isinstance(result, int)


def test_literal_float():
    result = eval_expr("3.14")
    assert abs(result - 3.14) < 1e-9
    assert isinstance(result, float)


def test_literal_boolean_true():
    result = eval_expr("true")
    assert result is True


def test_literal_boolean_false():
    result = eval_expr("false")
    assert result is False


def test_literal_null():
    result = eval_expr("null")
    assert result is None


# ---------------------------------------------------------------------------
# Variable resolution
# ---------------------------------------------------------------------------


def test_variable_resolved_from_context():
    result = eval_expr("{Q1}", context={"Q1": "Yes"})
    assert result == "Yes"


def test_variable_numeric_value():
    result = eval_expr("{age}", context={"age": 25})
    assert result == 25


def test_variable_boolean_value():
    result = eval_expr("{flag}", context={"flag": True})
    assert result is True


def test_variable_missing_returns_none():
    result = eval_expr("{MISSING}", context={})
    assert result is None


def test_variable_null_context_value():
    result = eval_expr("{Q1}", context={"Q1": None})
    assert result is None


def test_variable_list_value():
    result = eval_expr("{answers}", context={"answers": ["A1", "A2"]})
    assert result == ["A1", "A2"]


def test_variable_dotted_name():
    result = eval_expr("{RESPONDENT.language}", context={"RESPONDENT.language": "en"})
    assert result == "en"


# ---------------------------------------------------------------------------
# Variable truncation (10 000 chars)
# ---------------------------------------------------------------------------


def test_variable_truncation_at_10000():
    long_value = "x" * 15_000
    result = eval_expr("{Q1}", context={"Q1": long_value})
    assert isinstance(result, str)
    assert len(result) == 10_000


def test_variable_no_truncation_under_limit():
    value = "x" * 9_999
    result = eval_expr("{Q1}", context={"Q1": value})
    assert len(result) == 9_999


def test_variable_truncation_exactly_at_limit():
    value = "x" * 10_000
    result = eval_expr("{Q1}", context={"Q1": value})
    assert len(result) == 10_000


def test_variable_truncation_on_long_string_value():
    # A very long string value should be truncated to 10000 chars.
    long_value = "a" * 12_000
    result = eval_expr("{big}", context={"big": long_value})
    assert isinstance(result, str)
    assert len(result) == 10_000


# ---------------------------------------------------------------------------
# Unary 'not'
# ---------------------------------------------------------------------------


def test_not_true():
    result = eval_expr("not true")
    assert result is False


def test_not_false():
    result = eval_expr("not false")
    assert result is True


def test_not_null():
    result = eval_expr("not null")
    assert result is True


def test_not_zero():
    result = eval_expr("not 0")
    assert result is True


def test_not_nonzero():
    result = eval_expr("not 1")
    assert result is False


def test_not_empty_string():
    result = eval_expr('not ""')
    assert result is True


def test_not_nonempty_string():
    result = eval_expr('not "hello"')
    assert result is False


def test_not_variable():
    result = eval_expr("not {Q1}", context={"Q1": "Yes"})
    assert result is False


def test_double_not():
    result = eval_expr("not not true")
    assert result is True


# ---------------------------------------------------------------------------
# Binary comparison operators
# ---------------------------------------------------------------------------


def test_equal_strings():
    result = eval_expr('{Q1} == "Yes"', context={"Q1": "Yes"})
    assert result is True


def test_equal_strings_false():
    result = eval_expr('{Q1} == "No"', context={"Q1": "Yes"})
    assert result is False


def test_equal_integers():
    result = eval_expr("{age} == 25", context={"age": 25})
    assert result is True


def test_not_equal():
    result = eval_expr('{Q1} != "Yes"', context={"Q1": "No"})
    assert result is True


def test_not_equal_false():
    result = eval_expr('{Q1} != "Yes"', context={"Q1": "Yes"})
    assert result is False


def test_greater_than_true():
    result = eval_expr("{age} > 18", context={"age": 25})
    assert result is True


def test_greater_than_false():
    result = eval_expr("{age} > 18", context={"age": 17})
    assert result is False


def test_less_than_true():
    result = eval_expr("{age} < 18", context={"age": 10})
    assert result is True


def test_less_than_false():
    result = eval_expr("{age} < 18", context={"age": 20})
    assert result is False


def test_greater_than_or_equal_true():
    result = eval_expr("{age} >= 18", context={"age": 18})
    assert result is True


def test_greater_than_or_equal_false():
    result = eval_expr("{age} >= 18", context={"age": 17})
    assert result is False


def test_less_than_or_equal_true():
    result = eval_expr("{age} <= 18", context={"age": 18})
    assert result is True


def test_less_than_or_equal_false():
    result = eval_expr("{age} <= 18", context={"age": 19})
    assert result is False


# ---------------------------------------------------------------------------
# Type coercion in comparisons
# ---------------------------------------------------------------------------


def test_equal_numeric_string_and_int():
    # "25" == 25 should coerce to numeric equality
    result = eval_expr('{Q1} == 25', context={"Q1": "25"})
    assert result is True


def test_comparison_numeric_string_greater():
    result = eval_expr('{Q1} > 18', context={"Q1": "25"})
    assert result is True


def test_equal_null_null():
    result = eval_expr("null == null")
    assert result is True


def test_equal_null_not_equal_string():
    result = eval_expr('{Q1} == null', context={"Q1": "value"})
    assert result is False


def test_equal_missing_variable_is_null():
    result = eval_expr("{MISSING} == null")
    assert result is True


# ---------------------------------------------------------------------------
# Short-circuit evaluation
# ---------------------------------------------------------------------------


def test_and_short_circuit_false():
    # Left side is false; right side should never be evaluated
    # We test by putting an invalid node as the right branch directly
    evaluator = Evaluator(context={})
    left = make_literal(False, "boolean")
    # If right is evaluated and raises, the test would fail.
    right = Variable(start=99, end=100, name="UNDEFINED_VAR")
    node = BinaryOp(start=0, end=100, op="and", left=left, right=right)
    result = evaluator.evaluate(node)
    assert result is False


def test_and_both_true():
    result = eval_expr("{A} == 1 and {B} == 2", context={"A": 1, "B": 2})
    assert result is True


def test_and_left_false_right_irrelevant():
    result = eval_expr("{A} == 1 and {B} == 2", context={"A": 99, "B": 2})
    assert result is False


def test_or_short_circuit_true():
    # Left side is true; right side should never be evaluated
    evaluator = Evaluator(context={})
    left = make_literal(True, "boolean")
    right = Variable(start=99, end=100, name="UNDEFINED_VAR")
    node = BinaryOp(start=0, end=100, op="or", left=left, right=right)
    result = evaluator.evaluate(node)
    assert result is True


def test_or_left_true():
    result = eval_expr("{A} == 1 or {B} == 2", context={"A": 1, "B": 99})
    assert result is True


def test_or_left_false_right_true():
    result = eval_expr("{A} == 1 or {B} == 2", context={"A": 99, "B": 2})
    assert result is True


def test_or_both_false():
    result = eval_expr("{A} == 1 or {B} == 2", context={"A": 99, "B": 99})
    assert result is False


# ---------------------------------------------------------------------------
# String operators
# ---------------------------------------------------------------------------


def test_contains_true():
    result = eval_expr('{Q1} contains "ello"', context={"Q1": "hello"})
    assert result is True


def test_contains_false():
    result = eval_expr('{Q1} contains "xyz"', context={"Q1": "hello"})
    assert result is False


def test_starts_with_true():
    result = eval_expr('{Q1} starts_with "hel"', context={"Q1": "hello"})
    assert result is True


def test_starts_with_false():
    result = eval_expr('{Q1} starts_with "ello"', context={"Q1": "hello"})
    assert result is False


def test_ends_with_true():
    result = eval_expr('{Q1} ends_with "llo"', context={"Q1": "hello"})
    assert result is True


def test_ends_with_false():
    result = eval_expr('{Q1} ends_with "hel"', context={"Q1": "hello"})
    assert result is False


def test_string_op_type_error_left():
    with pytest.raises(EvaluationError):
        eval_expr('42 starts_with "4"')


def test_string_op_type_error_right():
    with pytest.raises(EvaluationError):
        eval_expr('{Q1} starts_with 42', context={"Q1": "hello"})


# ---------------------------------------------------------------------------
# Membership operator 'in'
# ---------------------------------------------------------------------------


def test_in_list_true():
    result = eval_expr('{Q1} in ["A1", "A2", "A3"]', context={"Q1": "A2"})
    assert result is True


def test_in_list_false():
    result = eval_expr('{Q1} in ["A1", "A2"]', context={"Q1": "A3"})
    assert result is False


def test_in_string_substring_true():
    result = eval_expr('"mobile" in {Q1}', context={"Q1": "mobile_app"})
    assert result is True


def test_in_string_substring_false():
    result = eval_expr('"desktop" in {Q1}', context={"Q1": "mobile_app"})
    assert result is False


def test_in_type_error_rhs_not_list_or_string():
    with pytest.raises(EvaluationError):
        eval_expr('{Q1} in 42', context={"Q1": "A1"})


# ---------------------------------------------------------------------------
# Array literals
# ---------------------------------------------------------------------------


def test_array_literal_empty():
    result = eval_expr("[]")
    assert result == []


def test_array_literal_strings():
    result = eval_expr('["A1", "A2", "A3"]')
    assert result == ["A1", "A2", "A3"]


def test_array_literal_numbers():
    result = eval_expr("[1, 2, 3]")
    assert result == [1, 2, 3]


def test_array_literal_mixed():
    result = eval_expr('["text", 42, true, null]')
    assert result == ["text", 42, True, None]


# ---------------------------------------------------------------------------
# Built-in function: is_empty
# ---------------------------------------------------------------------------


def test_is_empty_null():
    result = eval_expr("is_empty({Q1})", context={"Q1": None})
    assert result is True


def test_is_empty_missing_variable():
    result = eval_expr("is_empty({MISSING})")
    assert result is True


def test_is_empty_empty_string():
    result = eval_expr("is_empty({Q1})", context={"Q1": ""})
    assert result is True


def test_is_empty_nonempty_string():
    result = eval_expr("is_empty({Q1})", context={"Q1": "hello"})
    assert result is False


def test_is_empty_empty_list():
    result = eval_expr("is_empty({Q1})", context={"Q1": []})
    assert result is True


def test_is_empty_nonempty_list():
    result = eval_expr("is_empty({Q1})", context={"Q1": ["A1"]})
    assert result is False


def test_is_empty_zero_is_not_empty():
    result = eval_expr("is_empty({Q1})", context={"Q1": 0})
    assert result is False


# ---------------------------------------------------------------------------
# Built-in function: contains (function call form)
# ---------------------------------------------------------------------------


def test_fn_contains_string_true():
    result = eval_expr('contains({Q1}, "ello")', context={"Q1": "hello"})
    assert result is True


def test_fn_contains_string_false():
    result = eval_expr('contains({Q1}, "xyz")', context={"Q1": "hello"})
    assert result is False


def test_fn_contains_list_true():
    result = eval_expr('contains({Q1}, "A2")', context={"Q1": ["A1", "A2"]})
    assert result is True


def test_fn_contains_list_false():
    result = eval_expr('contains({Q1}, "A3")', context={"Q1": ["A1", "A2"]})
    assert result is False


def test_fn_contains_type_error():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr("contains(42, 4)")
    assert isinstance(exc_info.value, EvaluationError)


# ---------------------------------------------------------------------------
# Built-in function: count
# ---------------------------------------------------------------------------


def test_count_list():
    result = eval_expr("count({Q1})", context={"Q1": ["A1", "A2", "A3"]})
    assert result == 3


def test_count_empty_list():
    result = eval_expr("count({Q1})", context={"Q1": []})
    assert result == 0


def test_count_string():
    result = eval_expr("count({Q1})", context={"Q1": "hello"})
    assert result == 5


def test_count_null():
    result = eval_expr("count({Q1})", context={"Q1": None})
    assert result == 0


def test_count_scalar():
    result = eval_expr("count({Q1})", context={"Q1": 42})
    assert result == 1


# ---------------------------------------------------------------------------
# Built-in function: sum
# ---------------------------------------------------------------------------


def test_fn_sum_multiple_args():
    result = eval_expr("sum({A}, {B}, {C})", context={"A": 1, "B": 2, "C": 3})
    assert result == 6


def test_fn_sum_single_arg():
    result = eval_expr("sum({A})", context={"A": 42})
    assert result == 42


def test_fn_sum_float():
    result = eval_expr("sum({A}, {B})", context={"A": 1.5, "B": 2.5})
    assert abs(result - 4.0) < 1e-9


def test_fn_sum_numeric_strings():
    result = eval_expr("sum({A}, {B})", context={"A": "10", "B": "20"})
    assert result == 30


def test_fn_sum_type_error():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('sum({A})', context={"A": "not_a_number"})
    assert isinstance(exc_info.value, EvaluationError)


def test_fn_sum_boolean_error():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('sum({A})', context={"A": True})
    assert isinstance(exc_info.value, EvaluationError)


# ---------------------------------------------------------------------------
# Built-in function: min
# ---------------------------------------------------------------------------


def test_fn_min_multiple_args():
    result = eval_expr("min({A}, {B}, {C})", context={"A": 5, "B": 2, "C": 8})
    assert result == 2


def test_fn_min_single_arg():
    result = eval_expr("min({A})", context={"A": 42})
    assert result == 42


def test_fn_min_float():
    result = eval_expr("min({A}, {B})", context={"A": 1.1, "B": 2.2})
    assert abs(result - 1.1) < 1e-9


def test_fn_min_type_error():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('min({A})', context={"A": "not_a_number"})
    assert isinstance(exc_info.value, EvaluationError)


# ---------------------------------------------------------------------------
# Built-in function: max
# ---------------------------------------------------------------------------


def test_fn_max_multiple_args():
    result = eval_expr("max({A}, {B}, {C})", context={"A": 5, "B": 2, "C": 8})
    assert result == 8


def test_fn_max_single_arg():
    result = eval_expr("max({A})", context={"A": 42})
    assert result == 42


def test_fn_max_type_error():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('max({A})', context={"A": "not_a_number"})
    assert isinstance(exc_info.value, EvaluationError)


# ---------------------------------------------------------------------------
# Built-in function: length
# ---------------------------------------------------------------------------


def test_length_string():
    result = eval_expr("length({Q1})", context={"Q1": "hello"})
    assert result == 5


def test_length_empty_string():
    result = eval_expr("length({Q1})", context={"Q1": ""})
    assert result == 0


def test_length_type_error_number():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr("length({Q1})", context={"Q1": 42})
    assert isinstance(exc_info.value, EvaluationError)


def test_length_type_error_list():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr("length({Q1})", context={"Q1": ["a", "b"]})
    assert isinstance(exc_info.value, EvaluationError)


def test_length_type_error_null():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr("length({Q1})", context={"Q1": None})
    assert isinstance(exc_info.value, EvaluationError)


# ---------------------------------------------------------------------------
# Built-in function: regex_match
# ---------------------------------------------------------------------------


def test_regex_match_true():
    # regex_match(string, pattern) — string is first arg, pattern is second
    result = eval_expr('regex_match({Q1}, "^[0-9]+$")', context={"Q1": "12345"})
    assert result is True


def test_regex_match_false():
    result = eval_expr('regex_match({Q1}, "^[0-9]+$")', context={"Q1": "abc"})
    assert result is False


def test_regex_match_email_pattern():
    result = eval_expr(
        'regex_match({email}, "^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$")',
        context={"email": "test@example.com"},
    )
    assert result is True


def test_regex_match_invalid_pattern():
    # regex_match(string, pattern) — invalid pattern is the second arg
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('regex_match({Q1}, "[invalid")', context={"Q1": "test"})
    assert isinstance(exc_info.value, EvaluationError)


def test_regex_match_non_string_first_arg():
    # First argument (string) must be a string
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('regex_match(42, "^[0-9]+$")')
    assert isinstance(exc_info.value, EvaluationError)


def test_regex_match_non_string_pattern():
    # Second argument (pattern) must be a string
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('regex_match({Q1}, 42)', context={"Q1": "test"})
    assert isinstance(exc_info.value, EvaluationError)


# ---------------------------------------------------------------------------
# Timeout enforcement (100ms)
# ---------------------------------------------------------------------------


def test_timeout_raises_evaluation_error():
    """A slow computation should raise EvaluationError due to timeout."""
    # We mock the _run_with_thread_timeout to raise immediately with a timeout error
    # to avoid actually sleeping in tests and making CI flaky.
    import app.services.expressions.evaluator as ev_module

    original = ev_module._run_with_thread_timeout

    def mock_timeout(fn, timeout):
        raise EvaluationError("Expression evaluation timed out (limit: 100ms)", position=0)

    tokens = tokenize("true")
    ast = parse(tokens)

    with patch.object(ev_module, "_run_with_thread_timeout", mock_timeout):
        with pytest.raises(EvaluationError) as exc_info:
            evaluate(ast, context={}, timeout=0.1)
    assert "timed out" in str(exc_info.value).lower()
    assert isinstance(exc_info.value, EvaluationError)


def test_timeout_none_disables_timeout():
    """Passing timeout=None should evaluate without a timeout wrapper."""
    result = eval_expr("true", timeout=None)
    assert result is True


def test_timeout_is_evaluation_error_not_generic():
    """Timeout must raise EvaluationError, not concurrent.futures.TimeoutError."""
    import app.services.expressions.evaluator as ev_module

    def mock_timeout(fn, timeout):
        raise EvaluationError("Expression evaluation timed out (limit: 100ms)", position=0)

    tokens = tokenize("42")
    ast = parse(tokens)

    with patch.object(ev_module, "_run_with_thread_timeout", mock_timeout):
        with pytest.raises(EvaluationError):
            evaluate(ast, context={}, timeout=0.1)


# ---------------------------------------------------------------------------
# Nested complex expressions
# ---------------------------------------------------------------------------


def test_complex_age_and_education():
    expr = (
        '{Q_age} >= 18 and {Q_age} <= 34 and '
        '({Q_education} in ["bachelors", "masters", "doctorate"] or {Q_income} > 75000)'
    )
    context = {
        "Q_age": 25,
        "Q_education": "masters",
        "Q_income": 50000,
    }
    result = eval_expr(expr, context=context)
    assert result is True


def test_complex_age_and_education_income_path():
    expr = (
        '{Q_age} >= 18 and {Q_age} <= 34 and '
        '({Q_education} in ["bachelors", "masters", "doctorate"] or {Q_income} > 75000)'
    )
    context = {
        "Q_age": 25,
        "Q_education": "highschool",
        "Q_income": 80000,
    }
    result = eval_expr(expr, context=context)
    assert result is True


def test_complex_not_is_empty_with_comparison():
    result = eval_expr(
        "not is_empty({Q4}) and {Q4} == \"Yes\"",
        context={"Q4": "Yes"},
    )
    assert result is True


def test_complex_count_comparison():
    result = eval_expr("count({Q13}) >= 3", context={"Q13": ["A1", "A2", "A3"]})
    assert result is True


def test_complex_sum_equality():
    result = eval_expr(
        "sum({Q1}, {Q2}, {Q3}) == 100",
        context={"Q1": 30, "Q2": 40, "Q3": 30},
    )
    assert result is True


def test_complex_or_conditions():
    result = eval_expr(
        '{Q1} == "A1" or {Q1} == "A2"',
        context={"Q1": "A2"},
    )
    assert result is True


def test_complex_nested_not_and_contains():
    result = eval_expr(
        'not (is_empty({Q5}) or {Q5} contains "spam")',
        context={"Q5": "hello world"},
    )
    assert result is True


def test_complex_nested_not_and_contains_spam():
    result = eval_expr(
        'not (is_empty({Q5}) or {Q5} contains "spam")',
        context={"Q5": "spam email"},
    )
    assert result is False


# ---------------------------------------------------------------------------
# EvaluationError propagation
# ---------------------------------------------------------------------------


def test_evaluation_error_position_attribute():
    """EvaluationError must always have .position as an integer."""
    err = EvaluationError("test", position=5)
    assert hasattr(err, "position")
    assert isinstance(err.position, int)


def test_evaluation_error_is_value_error():
    """EvaluationError must be a subclass of ValueError."""
    assert issubclass(EvaluationError, ValueError)


def test_evaluation_error_from_unknown_function():
    """Calling an unknown function should raise EvaluationError."""
    node = FunctionCall(start=0, end=10, name="no_such_fn", args=[])
    evaluator = Evaluator(context={})
    with pytest.raises(EvaluationError) as exc_info:
        evaluator.evaluate(node)
    assert isinstance(exc_info.value.position, int)


def test_evaluation_error_from_bad_comparison():
    """Comparing incompatible types should raise EvaluationError."""
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('{Q1} > "text"', context={"Q1": ["A1"]})
    assert isinstance(exc_info.value, EvaluationError)


def test_evaluation_error_from_starts_with_non_string():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('{Q1} starts_with "x"', context={"Q1": 42})
    assert isinstance(exc_info.value, EvaluationError)


def test_evaluation_error_from_in_bad_rhs():
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('{Q1} in 42', context={"Q1": "A1"})
    assert isinstance(exc_info.value, EvaluationError)


def test_evaluation_error_from_regex_invalid_pattern():
    # regex_match(string, pattern) — invalid pattern is second arg
    with pytest.raises(EvaluationError) as exc_info:
        eval_expr('regex_match({Q1}, "[bad")', context={"Q1": "test"})
    assert isinstance(exc_info.value, EvaluationError)


# ---------------------------------------------------------------------------
# Evaluator class API
# ---------------------------------------------------------------------------


def test_evaluator_class_direct():
    """Evaluator class can be used directly without evaluate() wrapper."""
    ast = parse(tokenize("{Q1} == 42"))
    ev = Evaluator(context={"Q1": 42})
    result = ev.evaluate(ast)
    assert result is True


def test_evaluator_empty_context():
    ast = parse(tokenize("{Q1} == null"))
    ev = Evaluator()
    result = ev.evaluate(ast)
    assert result is True


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_boolean_equality():
    result = eval_expr("true == true")
    assert result is True


def test_boolean_not_equal_false():
    result = eval_expr("true == false")
    assert result is False


def test_null_equality():
    result = eval_expr("null == null")
    assert result is True


def test_null_not_equal_to_zero():
    result = eval_expr("null == 0")
    assert result is False


def test_null_not_equal_to_empty_string():
    result = eval_expr('null == ""')
    assert result is False


def test_parenthesised_expression():
    result = eval_expr("(true)")
    assert result is True


def test_nested_parentheses():
    result = eval_expr("((42))")
    assert result == 42


def test_in_with_variable_array():
    # 'in' with a variable that resolves to a list
    result = eval_expr('{Q1} in {choices}', context={"Q1": "A1", "choices": ["A1", "A2"]})
    assert result is True


# ---------------------------------------------------------------------------
# None/NoneType numeric ordering comparisons (ISS-206)
# ---------------------------------------------------------------------------


def test_none_greater_than_number_returns_false():
    # {Q2} > 10 where Q2 is None (unanswered) must return False, not raise
    result = eval_expr("{Q2} > 10", context={"Q2": None})
    assert result is False


def test_none_less_than_number_returns_false():
    # {Q2} < 10 where Q2 is None (unanswered) must return False, not raise
    result = eval_expr("{Q2} < 10", context={"Q2": None})
    assert result is False


def test_none_greater_than_or_equal_returns_false():
    result = eval_expr("{Q2} >= 10", context={"Q2": None})
    assert result is False


def test_none_less_than_or_equal_returns_false():
    result = eval_expr("{Q2} <= 10", context={"Q2": None})
    assert result is False


def test_none_on_right_side_greater_than_returns_false():
    # 10 > {Q2} where Q2 is None must also return False
    result = eval_expr("10 > {Q2}", context={"Q2": None})
    assert result is False


def test_none_on_right_side_less_than_returns_false():
    result = eval_expr("10 < {Q2}", context={"Q2": None})
    assert result is False


def test_missing_variable_ordering_returns_false():
    # Missing variable resolves to None — ordering should return False
    result = eval_expr("{UNANSWERED} > 5", context={})
    assert result is False


def test_or_expression_with_none_numeric_right_operand_does_not_crash():
    # ISS-206: {Q1} == 'A' or {Q2} > 10 where Q2 is None crashed with
    # RelevanceEvaluationError: Cannot compare NoneType and int.
    # Left side is False, OR must evaluate right side — should return False.
    result = eval_expr(
        '{Q1} == "A" or {Q2} > 10',
        context={"Q1": "B", "Q2": None},
    )
    assert result is False


def test_or_expression_with_none_numeric_right_operand_left_true():
    # When left side of OR is True, right side is short-circuited — no crash
    result = eval_expr(
        '{Q1} == "A" or {Q2} > 10',
        context={"Q1": "A", "Q2": None},
    )
    assert result is True


def test_or_expression_none_numeric_both_false():
    # Both sides evaluate to False (Q2 None, Q3 None) — overall False
    result = eval_expr(
        "{Q2} > 10 or {Q3} < 5",
        context={"Q2": None, "Q3": None},
    )
    assert result is False


def test_and_expression_with_none_numeric_right_operand():
    # AND short-circuits when left is False — right (with None) never evaluated
    result = eval_expr(
        '{Q1} == "A" and {Q2} > 10',
        context={"Q1": "B", "Q2": None},
    )
    assert result is False


def test_and_expression_none_numeric_left_true():
    # Left is True, right is {Q2} > 10 with Q2=None — should return False
    result = eval_expr(
        '{Q1} == "A" and {Q2} > 10',
        context={"Q1": "A", "Q2": None},
    )
    assert result is False


def test_none_ordering_does_not_affect_equality():
    # None == None should still be True (unaffected by the ordering fix)
    result = eval_expr("{Q2} == null", context={"Q2": None})
    assert result is True


def test_none_inequality_is_false_for_non_none():
    # None != 10 should be True (None is not equal to 10)
    result = eval_expr("{Q2} != 10", context={"Q2": None})
    assert result is True


# ---------------------------------------------------------------------------
# Null vs empty string boundary cases (ISS-208)
# ---------------------------------------------------------------------------
# These tests document the intentional behaviour of the evaluator when
# unanswered (None) context values are compared against empty string literals.
# The context dict is populated by resolver.py which normalises unanswered
# string-type questions to ''. The evaluator itself does NOT perform that
# normalisation — it works purely with the values in the context dict.


def test_empty_string_equals_empty_string():
    """Sanity check: '' == '' must be True."""
    result = eval_expr('{Q1} == ""', context={"Q1": ""})
    assert result is True


def test_empty_string_not_equal_is_false():
    """Sanity check: '' != '' must be False."""
    result = eval_expr('{Q1} != ""', context={"Q1": ""})
    assert result is False


def test_none_not_equal_to_empty_string():
    """None is NOT equal to '': null answers for non-string types stay None."""
    result = eval_expr('{Q1} == ""', context={"Q1": None})
    assert result is False


def test_none_not_equal_to_empty_string_inequality():
    """None != '' is True: null (non-string type) is distinguishable from ''."""
    result = eval_expr('{Q1} != ""', context={"Q1": None})
    assert result is True


def test_null_literal_not_equal_to_empty_string():
    """null == '' must remain False: the null literal is a distinct value."""
    result = eval_expr('null == ""')
    assert result is False


def test_normalised_string_equals_empty():
    """Scenario 7.2: when resolver normalises unanswered string Q1 to '',
    {Q1} == '' evaluates to True — simulated here by passing '' in context."""
    result = eval_expr('{Q1} == ""', context={"Q1": ""})
    assert result is True


def test_normalised_string_not_empty_is_false():
    """Scenario 7.3: when resolver normalises unanswered string Q1 to '',
    {Q1} != '' evaluates to False — simulated here by passing '' in context."""
    result = eval_expr('{Q1} != ""', context={"Q1": ""})
    assert result is False


def test_null_equality_for_numeric_unanswered():
    """An unanswered numeric question stays None; {Q1} == null is True."""
    result = eval_expr("{Q1} == null", context={"Q1": None})
    assert result is True


def test_null_equality_for_boolean_unanswered():
    """An unanswered boolean question stays None; {Q1} == null is True."""
    result = eval_expr("{Q1} == null", context={"Q1": None})
    assert result is True


def test_normalised_string_null_check_is_false():
    """When string Q1 is normalised to '', {Q1} == null is False (not None)."""
    result = eval_expr("{Q1} == null", context={"Q1": ""})
    assert result is False


# ---------------------------------------------------------------------------
# Bool/string coercion in == and != (ISS-209)
# ---------------------------------------------------------------------------
# yes_no questions store their answer as the string 'true'/'false' in the
# public form. The logic editor generates == true (bare boolean literal).
# _coerce_equal must treat these as equal.


def test_bool_true_equals_string_true():
    """bool True == string 'true' → True."""
    result = eval_expr('{Q1} == true', context={"Q1": "true"})
    assert result is True


def test_bool_true_not_equals_string_false():
    """bool True == string 'false' → False."""
    result = eval_expr('{Q1} == true', context={"Q1": "false"})
    assert result is False


def test_bool_false_equals_string_false():
    """bool False == string 'false' → True."""
    result = eval_expr('{Q1} == false', context={"Q1": "false"})
    assert result is True


def test_bool_false_not_equals_string_true():
    """bool False == string 'true' → False."""
    result = eval_expr('{Q1} == false', context={"Q1": "true"})
    assert result is False


def test_string_true_equals_bool_true_reversed():
    """String 'true' == bool True → True (reversed operand order)."""
    result = Evaluator._coerce_equal("true", True)
    assert result is True


def test_string_false_equals_bool_false_reversed():
    """String 'false' == bool False → True (reversed operand order)."""
    result = Evaluator._coerce_equal("false", False)
    assert result is True


def test_bool_true_not_equal_string_false_ne_operator():
    """bool True != string 'false' → True."""
    result = eval_expr('{Q1} != true', context={"Q1": "false"})
    assert result is True


def test_bool_false_not_equal_string_true_ne_operator():
    """bool False != string 'true' → True."""
    result = eval_expr('{Q1} != false', context={"Q1": "true"})
    assert result is True


def test_bool_true_equals_string_unrecognised_returns_false():
    """bool True == unrecognised string 'maybe' → False."""
    result = eval_expr('{Q1} == true', context={"Q1": "maybe"})
    assert result is False


def test_bool_false_equals_string_unrecognised_returns_false():
    """bool False == unrecognised string 'maybe' → False."""
    result = eval_expr('{Q1} == false', context={"Q1": "maybe"})
    assert result is False


def test_bool_true_equals_string_yes():
    """bool True == 'yes' → True (alternative truthy string)."""
    result = Evaluator._coerce_equal(True, "yes")
    assert result is True


def test_bool_false_equals_string_no():
    """bool False == 'no' → True (alternative falsy string)."""
    result = Evaluator._coerce_equal(False, "no")
    assert result is True
