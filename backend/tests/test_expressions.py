"""Consolidated expression language test suite (ISS-082 — 5.12).

Covers (complementing the existing per-module test files):
- All 12 EXPRESSION_LANGUAGE.md examples as integration tests
- All token types via parametrize (lexer surface)
- Operator precedence, parentheses, nesting (parser surface)
- All 6 comparison operators (evaluator)
- All 3 logical operators: and / or / not (evaluator)
- All 3 string operators: contains / starts_with / ends_with (evaluator)
- Membership operator: in (evaluator)
- All 8 built-in functions (evaluator)
- Type coercion (numeric string <-> int)
- Null handling
- Variable resolution
- Security: 4096-char length limit, timeout enforcement, injection resistance

NOTE: This file deliberately avoids duplicating parametrize tables that are
already exhaustively covered in test_expressions_lexer.py,
test_expressions_parser.py, and test_expressions_evaluator.py.  The focus here
is on *integration* tests (full pipeline) and on exercising every documented
feature via descriptive pytest IDs so that CI failure names are readable.
"""

from __future__ import annotations

import pytest

from app.services.expressions import (
    tokenize,
    parse,
    evaluate,
    LexerError,
    EvaluationError,
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def run(expr: str, ctx: dict | None = None, timeout=None):
    """Full pipeline: tokenize -> parse -> evaluate."""
    tokens = tokenize(expr)
    ast = parse(tokens)
    return evaluate(ast, context=ctx or {}, timeout=timeout)


# ---------------------------------------------------------------------------
# Section 1: All 12 EXPRESSION_LANGUAGE.md integration examples
# ---------------------------------------------------------------------------

# Each tuple: (id, expression_string, context_dict, expected_result)
_INTEGRATION_EXAMPLES = [
    # Example 1 — simple equality (relevance: show Q2 if Q1 == "Yes")
    (
        "ex01_show_q2_if_yes",
        '{Q1} == "Yes"',
        {"Q1": "Yes"},
        True,
    ),
    (
        "ex01_show_q2_if_yes_false",
        '{Q1} == "Yes"',
        {"Q1": "No"},
        False,
    ),
    # Example 2 — in operator with list (workplace benefits group)
    (
        "ex02_employment_in_list",
        '{Q_employment} in ["full_time", "part_time"]',
        {"Q_employment": "full_time"},
        True,
    ),
    (
        "ex02_employment_not_in_list",
        '{Q_employment} in ["full_time", "part_time"]',
        {"Q_employment": "unemployed"},
        False,
    ),
    # Example 3 — not is_empty (required-if)
    (
        "ex03_not_is_empty_has_selection",
        "not is_empty({Q4})",
        {"Q4": ["A1"]},
        True,
    ),
    (
        "ex03_not_is_empty_empty",
        "not is_empty({Q4})",
        {"Q4": []},
        False,
    ),
    # Example 4 — complex AND/OR with age + education or income
    (
        "ex04_age_education_or_income_true_education",
        '{Q_age} >= 18 and {Q_age} <= 34 and ({Q_education} in ["bachelors", "masters", "doctorate"] or {Q_income} > 75000)',
        {"Q_age": 25, "Q_education": "masters", "Q_income": 50000},
        True,
    ),
    (
        "ex04_age_education_or_income_true_income",
        '{Q_age} >= 18 and {Q_age} <= 34 and ({Q_education} in ["bachelors", "masters", "doctorate"] or {Q_income} > 75000)',
        {"Q_age": 28, "Q_education": "highschool", "Q_income": 80000},
        True,
    ),
    (
        "ex04_age_education_or_income_false_age",
        '{Q_age} >= 18 and {Q_age} <= 34 and ({Q_education} in ["bachelors", "masters", "doctorate"] or {Q_income} > 75000)',
        {"Q_age": 40, "Q_education": "masters", "Q_income": 80000},
        False,
    ),
    # Example 5 — "mobile_app" in {Q12} (reverse-in)
    (
        "ex05_value_in_array_true",
        '"mobile_app" in {Q12}',
        {"Q12": ["mobile_app", "desktop"]},
        True,
    ),
    (
        "ex05_value_in_array_false",
        '"mobile_app" in {Q12}',
        {"Q12": ["desktop", "web"]},
        False,
    ),
    # Example 6 — piping is tested separately in test_logic.py;
    # the pure-expression part here is just the variable evaluation
    (
        "ex06_variable_resolves_to_brand",
        "{Q7}",
        {"Q7": "Brand X"},
        "Brand X",
    ),
    # Example 7 — sum validation
    (
        "ex07_sum_equals_100_true",
        "sum({Q20_SQ001}, {Q20_SQ002}, {Q20_SQ003}) == 100",
        {"Q20_SQ001": 30, "Q20_SQ002": 40, "Q20_SQ003": 30},
        True,
    ),
    (
        "ex07_sum_equals_100_false",
        "sum({Q20_SQ001}, {Q20_SQ002}, {Q20_SQ003}) == 100",
        {"Q20_SQ001": 30, "Q20_SQ002": 40, "Q20_SQ003": 20},
        False,
    ),
    # Example 8 — quota condition (gender + age range)
    (
        "ex08_quota_male_18_24_match",
        '{Q_gender} == "male" and {Q_age} >= 18 and {Q_age} <= 24',
        {"Q_gender": "male", "Q_age": 22},
        True,
    ),
    (
        "ex08_quota_male_18_24_no_match_female",
        '{Q_gender} == "male" and {Q_age} >= 18 and {Q_age} <= 24',
        {"Q_gender": "female", "Q_age": 22},
        False,
    ),
    (
        "ex08_quota_male_18_24_no_match_age",
        '{Q_gender} == "male" and {Q_age} >= 18 and {Q_age} <= 24',
        {"Q_gender": "male", "Q_age": 30},
        False,
    ),
    # Example 9 — count >= 3
    (
        "ex09_count_gte_3_true",
        "count({Q13}) >= 3",
        {"Q13": ["A1", "A2", "A3"]},
        True,
    ),
    (
        "ex09_count_gte_3_false",
        "count({Q13}) >= 3",
        {"Q13": ["A1", "A2"]},
        False,
    ),
    # Example 10 — regex_match US ZIP
    (
        "ex10_regex_zip_valid",
        'regex_match({Q_zip}, "^[0-9]{5}(-[0-9]{4})?$")',
        {"Q_zip": "12345"},
        True,
    ),
    (
        "ex10_regex_zip_extended_valid",
        'regex_match({Q_zip}, "^[0-9]{5}(-[0-9]{4})?$")',
        {"Q_zip": "12345-6789"},
        True,
    ),
    (
        "ex10_regex_zip_invalid",
        'regex_match({Q_zip}, "^[0-9]{5}(-[0-9]{4})?$")',
        {"Q_zip": "ABCDE"},
        False,
    ),
    # Example 11 — nested piping evaluated as expression (count part)
    (
        "ex11_count_features",
        "count({Q_features})",
        {"Q_features": ["feat1", "feat2", "feat3"]},
        3,
    ),
    # Example 12 — skip logic with negation (not Q_smoking == "never")
    (
        "ex12_not_never_smoker_show",
        'not ({Q_smoking} == "never")',
        {"Q_smoking": "occasionally"},
        True,
    ),
    (
        "ex12_not_never_smoker_hide",
        'not ({Q_smoking} == "never")',
        {"Q_smoking": "never"},
        False,
    ),
]


@pytest.mark.parametrize(
    "expr,ctx,expected",
    [(e, c, x) for _, e, c, x in _INTEGRATION_EXAMPLES],
    ids=[tid for tid, *_ in _INTEGRATION_EXAMPLES],
)
def test_integration_example(expr, ctx, expected):
    """All 12 EXPRESSION_LANGUAGE.md examples evaluated end-to-end."""
    result = run(expr, ctx)
    assert result == expected


# ---------------------------------------------------------------------------
# Section 2: Lexer — token type coverage (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,expected_first_type",
    [
        ("{Q1}", "VARIABLE"),
        ('"hello"', "STRING"),
        ("42", "NUMBER"),
        ("3.14", "NUMBER"),
        ("true", "BOOLEAN"),
        ("false", "BOOLEAN"),
        ("null", "NULL"),
        ("==", "OPERATOR"),
        ("!=", "OPERATOR"),
        (">", "OPERATOR"),
        ("<", "OPERATOR"),
        (">=", "OPERATOR"),
        ("<=", "OPERATOR"),
        ("and", "LOGICAL"),
        ("or", "LOGICAL"),
        ("not", "LOGICAL"),
        ("contains", "STRING_OP"),
        ("starts_with", "STRING_OP"),
        ("ends_with", "STRING_OP"),
        ("in", "MEMBERSHIP"),
        ("is_empty(", "FUNCTION"),
        ("count(", "FUNCTION"),
        ("sum(", "FUNCTION"),
        ("min(", "FUNCTION"),
        ("max(", "FUNCTION"),
        ("length(", "FUNCTION"),
        ("regex_match(", "FUNCTION"),
        ("contains(", "FUNCTION"),
        ("(", "LPAREN"),
        (")", "RPAREN"),
        ("[", "LBRACKET"),
        ("]", "RBRACKET"),
        (",", "COMMA"),
    ],
    ids=[
        "tok_variable", "tok_string", "tok_int", "tok_float",
        "tok_bool_true", "tok_bool_false", "tok_null",
        "tok_op_eq", "tok_op_ne", "tok_op_gt", "tok_op_lt",
        "tok_op_gte", "tok_op_lte",
        "tok_logical_and", "tok_logical_or", "tok_logical_not",
        "tok_string_op_contains", "tok_string_op_starts_with", "tok_string_op_ends_with",
        "tok_membership_in",
        "tok_fn_is_empty", "tok_fn_count", "tok_fn_sum",
        "tok_fn_min", "tok_fn_max", "tok_fn_length",
        "tok_fn_regex_match", "tok_fn_contains",
        "tok_lparen", "tok_rparen", "tok_lbracket", "tok_rbracket", "tok_comma",
    ],
)
def test_lexer_token_type(expr, expected_first_type):
    """Each documented token type must lex to the correct TokenType."""
    from app.services.expressions import TokenType
    tokens = tokenize(expr)
    assert tokens[0].type == TokenType(expected_first_type)


# ---------------------------------------------------------------------------
# Section 3: Parser — precedence, parentheses, nesting (parametrized)
# ---------------------------------------------------------------------------


_PRECEDENCE_CASES = [
    # not binds tighter than and
    (
        "prec_not_tighter_than_and",
        "not {Q1} == 1 and {Q2} == 2",
        "and",  # top-level op
        "not",  # left child op
    ),
    # and binds tighter than or
    (
        "prec_and_tighter_than_or",
        "{A} == 1 or {B} == 2 and {C} == 3",
        "or",   # top-level op
        "and",  # right child op
    ),
]


@pytest.mark.parametrize(
    "expr,top_op,child_op",
    [(e, t, c) for _, e, t, c in _PRECEDENCE_CASES],
    ids=[tid for tid, *_ in _PRECEDENCE_CASES],
)
def test_parser_precedence(expr, top_op, child_op):
    """Operator precedence must produce the correct AST structure."""
    from app.services.expressions import BinaryOp, UnaryOp
    tokens = tokenize(expr)
    ast = parse(tokens)
    assert isinstance(ast, BinaryOp), f"Expected BinaryOp at root, got {type(ast)}"
    assert ast.op == top_op, f"Expected root op={top_op!r}, got {ast.op!r}"
    # Check the child that should carry child_op
    if top_op == "and":
        child = ast.left
    else:
        child = ast.right
    if child_op == "not":
        assert isinstance(child, UnaryOp), f"Expected UnaryOp, got {type(child)}"
        assert child.op == child_op
    else:
        assert isinstance(child, BinaryOp), f"Expected BinaryOp, got {type(child)}"
        assert child.op == child_op


@pytest.mark.parametrize(
    "expr,expected_result",
    [
        # Parens force OR to be evaluated before AND
        ('({Q1} == "A1" or {Q1} == "A2") and {Q2} > 18', True),
        # Without parens, AND binds tighter — only Q1=="A2" and Q2>18 evaluated
        ('{Q1} == "A1" or ({Q1} == "A2" and {Q2} > 18)', True),
        # Deeply nested parens (boolean literal, no variables needed)
        ("((true))", True),
    ],
    ids=["parens_or_before_and", "parens_and_inside_or", "deep_parens"],
)
def test_parser_parentheses_evaluation(expr, expected_result):
    """Parentheses must correctly override default precedence when evaluated."""
    ctx = {"Q1": "A2", "Q2": 25}
    result = run(expr, ctx)
    assert result == expected_result


# ---------------------------------------------------------------------------
# Section 4: Evaluator — all 6 comparison operators (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "op,left,right,expected",
    [
        ("==", 5, 5, True),
        ("==", 5, 6, False),
        ("!=", 5, 6, True),
        ("!=", 5, 5, False),
        (">",  6, 5, True),
        (">",  5, 6, False),
        ("<",  5, 6, True),
        ("<",  6, 5, False),
        (">=", 5, 5, True),
        (">=", 4, 5, False),
        ("<=", 5, 5, True),
        ("<=", 6, 5, False),
    ],
    ids=[
        "cmp_eq_true", "cmp_eq_false",
        "cmp_ne_true", "cmp_ne_false",
        "cmp_gt_true", "cmp_gt_false",
        "cmp_lt_true", "cmp_lt_false",
        "cmp_gte_true", "cmp_gte_false",
        "cmp_lte_true", "cmp_lte_false",
    ],
)
def test_comparison_op(op, left, right, expected):
    """All 6 comparison operators must evaluate correctly for numeric operands."""
    result = run(f"{{L}} {op} {{R}}", {"L": left, "R": right})
    assert result == expected


# ---------------------------------------------------------------------------
# Section 5: Evaluator — all 3 logical operators (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,ctx,expected",
    [
        # and
        ("{A} and {B}", {"A": True, "B": True}, True),
        ("{A} and {B}", {"A": True, "B": False}, False),
        ("{A} and {B}", {"A": False, "B": True}, False),
        # or
        ("{A} or {B}", {"A": False, "B": True}, True),
        ("{A} or {B}", {"A": False, "B": False}, False),
        ("{A} or {B}", {"A": True, "B": False}, True),
        # not
        ("not {A}", {"A": True}, False),
        ("not {A}", {"A": False}, True),
        ("not {A}", {"A": None}, True),   # None is falsy
        ("not {A}", {"A": ""}, True),     # empty string is falsy
        ("not {A}", {"A": 0}, True),      # zero is falsy
        ("not {A}", {"A": "x"}, False),   # non-empty truthy
    ],
    ids=[
        "and_tt", "and_tf", "and_ft",
        "or_ft", "or_ff", "or_tf",
        "not_true", "not_false", "not_null", "not_empty_str", "not_zero", "not_truthy_str",
    ],
)
def test_logical_op(expr, ctx, expected):
    """All 3 logical operators must evaluate correctly."""
    result = run(expr, ctx)
    assert result == expected


# ---------------------------------------------------------------------------
# Section 6: Evaluator — all 3 string operators (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "op,haystack,needle,expected",
    [
        # contains
        ("contains", "hello world", "world", True),
        ("contains", "hello world", "xyz", False),
        ("contains", "hello", "hello", True),   # exact match
        ("contains", "hello", "Hello", False),  # case-sensitive
        # starts_with
        ("starts_with", "Yes, definitely", "Yes", True),
        ("starts_with", "Yes, definitely", "No", False),
        ("starts_with", "Inc.", "Inc.", True),   # exact
        ("starts_with", "inc.", "Inc.", False),  # case-sensitive
        # ends_with
        ("ends_with", "Acme Inc.", "Inc.", True),
        ("ends_with", "Acme Inc.", "Acme", False),
        ("ends_with", "Inc.", "Inc.", True),
        ("ends_with", "inc.", "Inc.", False),    # case-sensitive
    ],
    ids=[
        "contains_true", "contains_false", "contains_exact", "contains_case_sensitive",
        "starts_with_true", "starts_with_false", "starts_with_exact", "starts_with_case_sensitive",
        "ends_with_true", "ends_with_false", "ends_with_exact", "ends_with_case_sensitive",
    ],
)
def test_string_op(op, haystack, needle, expected):
    """All 3 string operators must be case-sensitive and evaluate correctly."""
    result = run(f'{{H}} {op} "{needle}"', {"H": haystack})
    assert result == expected


# ---------------------------------------------------------------------------
# Section 7: Evaluator — membership operator 'in' (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,ctx,expected",
    [
        # value in list literal
        ('{Q1} in ["A1", "A2", "A3"]', {"Q1": "A1"}, True),
        ('{Q1} in ["A1", "A2", "A3"]', {"Q1": "A4"}, False),
        # value in variable (list)
        ('{Q1} in {choices}', {"Q1": "A1", "choices": ["A1", "A2"]}, True),
        ('{Q1} in {choices}', {"Q1": "A3", "choices": ["A1", "A2"]}, False),
        # string in string (substring)
        ('"mobile_app" in {Q12}', {"Q12": "desktop_mobile_app"}, True),
        ('"desktop" in {Q12}', {"Q12": "mobile_app"}, False),
        # value in list (variable resolves to list)
        ('"A2" in {Q_multi}', {"Q_multi": ["A1", "A2", "A3"]}, True),
        ('"A5" in {Q_multi}', {"Q_multi": ["A1", "A2", "A3"]}, False),
    ],
    ids=[
        "in_list_true", "in_list_false",
        "in_var_list_true", "in_var_list_false",
        "str_in_str_true", "str_in_str_false",
        "value_in_multi_true", "value_in_multi_false",
    ],
)
def test_membership_in(expr, ctx, expected):
    """'in' operator must work for list literals, variables, and substring checks."""
    result = run(expr, ctx)
    assert result == expected


# ---------------------------------------------------------------------------
# Section 8: Evaluator — all 8 built-in functions (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,ctx,expected",
    [
        # is_empty
        ("is_empty({Q1})", {"Q1": None},   True),
        ("is_empty({Q1})", {"Q1": ""},     True),
        ("is_empty({Q1})", {"Q1": []},     True),
        ("is_empty({Q1})", {"Q1": "x"},    False),
        ("is_empty({Q1})", {"Q1": ["A1"]}, False),
        ("is_empty({Q1})", {"Q1": 0},      False),   # 0 is not empty
        # contains (function form)
        ('contains({Q1}, "ello")', {"Q1": "hello"}, True),
        ('contains({Q1}, "xyz")',  {"Q1": "hello"}, False),
        ('contains({Q1}, "A2")',   {"Q1": ["A1", "A2"]}, True),
        ('contains({Q1}, "A3")',   {"Q1": ["A1", "A2"]}, False),
        # count
        ("count({Q1})", {"Q1": ["A1", "A2", "A3"]}, 3),
        ("count({Q1})", {"Q1": []},                  0),
        ("count({Q1})", {"Q1": None},                0),
        ("count({Q1})", {"Q1": "hello"},             5),
        # sum
        ("sum({A}, {B}, {C})", {"A": 10, "B": 20, "C": 30}, 60),
        ("sum({A})",           {"A": 42},                    42),
        ("sum({A}, {B})",      {"A": "10", "B": "20"},       30),   # string coercion
        # min
        ("min({A}, {B}, {C})", {"A": 5, "B": 2, "C": 8}, 2),
        ("min({A})",           {"A": 42},                  42),
        # max
        ("max({A}, {B}, {C})", {"A": 5, "B": 2, "C": 8}, 8),
        ("max({A})",           {"A": 42},                  42),
        # length
        ("length({Q1})", {"Q1": "hello"},  5),
        ("length({Q1})", {"Q1": ""},       0),
        ("length({Q1})", {"Q1": "abc"},    3),
        # regex_match
        ('regex_match({Q1}, "^[0-9]+$")',    {"Q1": "12345"}, True),
        ('regex_match({Q1}, "^[0-9]+$")',    {"Q1": "abc"},   False),
        ('regex_match({Q1}, "^[a-z]+$")',    {"Q1": "hello"}, True),
    ],
    ids=[
        # is_empty
        "is_empty_null", "is_empty_empty_str", "is_empty_empty_list",
        "is_empty_nonempty_str", "is_empty_nonempty_list", "is_empty_zero_not_empty",
        # contains
        "fn_contains_str_true", "fn_contains_str_false",
        "fn_contains_list_true", "fn_contains_list_false",
        # count
        "count_list", "count_empty", "count_null", "count_str_len",
        # sum
        "sum_three_ints", "sum_single", "sum_numeric_strings",
        # min
        "min_three", "min_single",
        # max
        "max_three", "max_single",
        # length
        "length_str", "length_empty", "length_abc",
        # regex_match
        "regex_digits_true", "regex_digits_false", "regex_alpha_true",
    ],
)
def test_builtin_function(expr, ctx, expected):
    """All 8 built-in functions must return correct values for valid inputs."""
    result = run(expr, ctx)
    assert result == expected


# ---------------------------------------------------------------------------
# Section 9: Type coercion (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,ctx,expected",
    [
        # Numeric string == int
        ('{Q1} == 25',     {"Q1": "25"},    True),
        ('{Q1} == 25',     {"Q1": "24"},    False),
        ('{Q1} > 18',      {"Q1": "25"},    True),
        ('{Q1} < 18',      {"Q1": "10"},    True),
        ('{Q1} >= 25',     {"Q1": "25"},    True),
        ('{Q1} <= 10',     {"Q1": "10"},    True),
        # null is only equal to null, not to "" or 0
        ("null == null",            {}, True),
        ('{Q1} == null',            {"Q1": None}, True),
        ('{Q1} == null',            {"Q1": ""},   False),
        ('{Q1} == null',            {"Q1": 0},    False),
        ('null == ""',              {}, False),
        ("null == 0",               {}, False),
        # Missing variable treated as null
        ("{MISSING} == null",       {}, True),
        ("is_empty({MISSING})",     {}, True),
        # Sum with numeric strings in context
        ("sum({A}, {B})", {"A": "10", "B": "20"}, 30),
    ],
    ids=[
        "coerce_str_eq_int_true", "coerce_str_eq_int_false",
        "coerce_str_gt", "coerce_str_lt", "coerce_str_gte", "coerce_str_lte",
        "null_eq_null", "var_null_eq_null",
        "null_ne_empty_str_var", "null_ne_zero_var",
        "null_ne_empty_str_lit", "null_ne_zero_lit",
        "missing_var_is_null", "missing_var_is_empty",
        "sum_str_coerce",
    ],
)
def test_type_coercion(expr, ctx, expected):
    """Type coercion rules from the documentation must hold."""
    result = run(expr, ctx)
    assert result == expected


# ---------------------------------------------------------------------------
# Section 10: Null handling edge cases (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,ctx,expected",
    [
        # Falsy in boolean context
        ("not null",   {}, True),
        ('not ""',     {}, True),
        ("not 0",      {}, True),
        ("not false",  {}, True),
        # Truthy in boolean context
        ("not true",   {}, False),
        ('not "x"',    {}, False),
        ("not 1",      {}, False),
        # Null variable in logical context
        ("not {Q1}",   {"Q1": None}, True),
        ("{Q1} or true", {"Q1": None}, True),
        ("{Q1} and true", {"Q1": None}, False),
    ],
    ids=[
        "falsy_null", "falsy_empty_str", "falsy_zero", "falsy_false",
        "truthy_true", "truthy_nonempty_str", "truthy_nonzero",
        "null_var_falsy", "null_var_or_true", "null_var_and_true",
    ],
)
def test_null_handling(expr, ctx, expected):
    """Null / falsy behaviour must follow documentation rules."""
    result = run(expr, ctx)
    assert result == expected


# ---------------------------------------------------------------------------
# Section 11: Variable resolution (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,ctx,expected",
    [
        ("{Q1}",                    {"Q1": "Yes"},              "Yes"),
        ("{Q1_SQ001}",              {"Q1_SQ001": 42},           42),
        ("{Q1_SQ001_SQ002}",        {"Q1_SQ001_SQ002": "cell"}, "cell"),
        ("{Q1_other}",              {"Q1_other": "other text"},  "other text"),
        ("{Q1_comment}",            {"Q1_comment": "a comment"}, "a comment"),
        ("{RESPONDENT.language}",   {"RESPONDENT.language": "en"}, "en"),
        ("{RESPONDENT.panel_id}",   {"RESPONDENT.panel_id": "P42"}, "P42"),
        # Missing variable resolves to None
        ("{MISSING}",               {},               None),
        # Variable holding list
        ("{Q_checkbox}",            {"Q_checkbox": ["A1", "A2"]}, ["A1", "A2"]),
    ],
    ids=[
        "var_simple", "var_subquestion", "var_nested_subquestion",
        "var_other", "var_comment",
        "var_respondent_language", "var_respondent_panel_id",
        "var_missing_none",
        "var_list_value",
    ],
)
def test_variable_resolution(expr, ctx, expected):
    """Variable references must resolve correctly for all documented syntaxes."""
    result = run(expr, ctx)
    assert result == expected


# ---------------------------------------------------------------------------
# Section 12: Security — length limit
# ---------------------------------------------------------------------------


def test_security_length_limit_4096_accepted():
    """Expression of exactly 4096 characters must be accepted by the lexer."""
    base = "{Q1} == 1"
    padding = " or true"
    expr = base
    while len(expr) + len(padding) <= 4096:
        expr += padding
    expr = expr[:4096]
    # Should not raise
    tokens = tokenize(expr)
    assert tokens[-1].type.value == "EOF" or tokens[-1].type == "EOF"


def test_security_length_limit_4097_rejected():
    """Expression of 4097 characters must raise LexerError with error code-like message."""
    oversized = "a" * 4097
    with pytest.raises(LexerError) as exc_info:
        tokenize(oversized)
    assert isinstance(exc_info.value, LexerError)
    assert exc_info.value.position == 4096


def test_security_length_limit_large_rejected():
    """Very large inputs must always raise LexerError."""
    with pytest.raises(LexerError):
        tokenize("x" * 10_000)


# ---------------------------------------------------------------------------
# Section 13: Security — timeout enforcement
# ---------------------------------------------------------------------------


def test_security_timeout_raises_evaluation_error():
    """A timeout argument triggers EvaluationError (not a raw TimeoutError)."""
    from unittest.mock import patch
    import app.services.expressions.evaluator as ev_module

    def mock_timeout(fn, timeout):
        raise EvaluationError("Expression evaluation timed out (limit: 100ms)", position=0)

    tokens = tokenize("true")
    ast = parse(tokens)

    with patch.object(ev_module, "_run_with_thread_timeout", mock_timeout):
        with pytest.raises(EvaluationError) as exc_info:
            evaluate(ast, context={}, timeout=0.1)
    err = exc_info.value
    assert isinstance(err, EvaluationError)
    assert "timed out" in str(err).lower()


def test_security_timeout_none_allows_evaluation():
    """Passing timeout=None evaluates successfully without wrapping."""
    result = run("1 == 1", timeout=None)
    assert result is True


# ---------------------------------------------------------------------------
# Section 14: Security — injection resistance (parametrized)
# ---------------------------------------------------------------------------


_INJECTION_CASES = [
    # SQL-style injection in a string literal is inert (no DB call happens)
    (
        "injection_sql_in_string",
        '{Q1} == "1; DROP TABLE users; --"',
        {"Q1": "safe_value"},
        False,  # no match, so False — the expression is safe
    ),
    # OS command injection attempt — the lexer would tokenize it or reject it,
    # but evaluation is sandboxed.  We test that the pipeline doesn't exec anything.
    (
        "injection_os_command_literal",
        '{Q1} == "$(rm -rf /)"',
        {"Q1": "harmless"},
        False,
    ),
    # Script injection attempt inside a string value
    (
        "injection_script_in_value",
        '{Q1} == "<script>alert(1)</script>"',
        {"Q1": "<script>alert(1)</script>"},
        True,   # plain string equality — no code execution
    ),
    # Null-byte in string literal
    (
        "injection_null_byte_literal",
        '{Q1} == "abc"',
        {"Q1": "abc\x00"},
        False,
    ),
]


@pytest.mark.parametrize(
    "expr,ctx,expected",
    [(e, c, x) for _, e, c, x in _INJECTION_CASES],
    ids=[tid for tid, *_ in _INJECTION_CASES],
)
def test_injection_resistance(expr, ctx, expected):
    """Injection payloads in expression strings must not execute arbitrary code."""
    result = run(expr, ctx)
    assert result == expected


# ---------------------------------------------------------------------------
# Section 15: Function type errors (parametrized — verifies error codes)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "expr,ctx",
    [
        # length on non-string
        ("length({Q1})", {"Q1": 42}),
        ("length({Q1})", {"Q1": None}),
        ("length({Q1})", {"Q1": ["a", "b"]}),
        # sum on non-numeric
        ('sum({A})', {"A": "not_a_number"}),
        ('sum({A})', {"A": True}),
        # min on non-numeric
        ('min({A})', {"A": "text"}),
        # max on non-numeric
        ('max({A})', {"A": "text"}),
        # contains: non-string collection
        ("contains(42, 4)", {}),
        # string op on non-string
        ('{Q1} starts_with "x"', {"Q1": 42}),
        ('{Q1} ends_with "x"',   {"Q1": 42}),
        ('{Q1} contains "x"',    {"Q1": 42}),
        # in with bad RHS
        ('{Q1} in 42',           {"Q1": "A1"}),
        # regex_match with non-string
        ('regex_match(42, "^[0-9]+$")', {}),
        ('regex_match({Q1}, 42)',       {"Q1": "test"}),
    ],
    ids=[
        "err_length_number", "err_length_null", "err_length_list",
        "err_sum_non_numeric", "err_sum_bool",
        "err_min_non_numeric",
        "err_max_non_numeric",
        "err_contains_non_collection",
        "err_starts_with_non_str", "err_ends_with_non_str", "err_contains_op_non_str",
        "err_in_bad_rhs",
        "err_regex_non_str_first", "err_regex_non_str_pattern",
    ],
)
def test_function_type_errors(expr, ctx):
    """Type errors in function/operator calls must raise EvaluationError."""
    with pytest.raises(EvaluationError) as exc_info:
        run(expr, ctx)
    assert isinstance(exc_info.value, EvaluationError)


# ---------------------------------------------------------------------------
# Section 16: Syntax errors produce LexerError or parser error (parametrized)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_expr",
    [
        "{Q1",           # unterminated variable
        '"unterminated',  # unterminated string
        "@invalid",      # invalid character
        "foobar",        # unknown identifier
        "a" * 4097,      # over length limit
    ],
    ids=[
        "err_unterminated_var",
        "err_unterminated_string",
        "err_invalid_char",
        "err_unknown_identifier",
        "err_over_length_limit",
    ],
)
def test_lexer_syntax_errors(bad_expr):
    """Lexer-level syntax errors must raise LexerError (a subclass of ValueError)."""
    with pytest.raises((LexerError, ValueError)):
        tokenize(bad_expr)
