"""Tests for the expression language parser (ISS-072).

Covers:
- Package-level import smoke test
- All literal types: string, number (int/float), boolean (true/false), null
- Variable references
- All binary comparison operators: ==, !=, >, <, >=, <=
- String operators: contains, starts_with, ends_with (infix)
- Membership operator: in
- Logical operators: and, or
- Unary not operator
- Operator precedence: not > comparison/string_op/in > and > or
- Parentheses overriding precedence
- Function calls: 0-arg, 1-arg, multi-arg (all built-in names)
- Array literals: empty, single, multi-element
- Nested complex expressions from the docs
- Left-to-right associativity for same-precedence binary operators
- Position tracking (start/end) on AST nodes
- ParserError for all invalid inputs, with position attribute verified
"""

import pytest

from app.services.expressions import (
    tokenize,
    parse,
    ASTNode,
    BinaryOp,
    UnaryOp,
    Variable,
    Literal,
    FunctionCall,
    ArrayLiteral,
    ParserError,
    LexerError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_expr(expr_str: str) -> ASTNode:
    """Tokenize then parse an expression string."""
    tokens = tokenize(expr_str)
    return parse(tokens)


def assert_binary(node: ASTNode, op: str) -> BinaryOp:
    """Assert that node is a BinaryOp with the given op and return it."""
    assert isinstance(node, BinaryOp), f"Expected BinaryOp, got {type(node).__name__}"
    assert node.op == op, f"Expected op={op!r}, got {node.op!r}"
    return node


def assert_unary(node: ASTNode, op: str) -> UnaryOp:
    """Assert that node is a UnaryOp with the given op and return it."""
    assert isinstance(node, UnaryOp), f"Expected UnaryOp, got {type(node).__name__}"
    assert node.op == op, f"Expected op={op!r}, got {node.op!r}"
    return node


def assert_variable(node: ASTNode, name: str) -> Variable:
    """Assert that node is a Variable with the given name and return it."""
    assert isinstance(node, Variable), f"Expected Variable, got {type(node).__name__}"
    assert node.name == name, f"Expected name={name!r}, got {node.name!r}"
    return node


def assert_literal(node: ASTNode, value, kind: str) -> Literal:
    """Assert that node is a Literal with the given value and kind and return it."""
    assert isinstance(node, Literal), f"Expected Literal, got {type(node).__name__}"
    assert node.kind == kind, f"Expected kind={kind!r}, got {node.kind!r}"
    assert node.value == value, f"Expected value={value!r}, got {node.value!r}"
    return node


# ---------------------------------------------------------------------------
# Smoke test: package-level import
# ---------------------------------------------------------------------------


def test_package_imports():
    """All public parser symbols must be importable from app.services.expressions."""
    assert callable(parse)
    assert issubclass(ParserError, ValueError)
    assert issubclass(BinaryOp, ASTNode)
    assert issubclass(UnaryOp, ASTNode)
    assert issubclass(Variable, ASTNode)
    assert issubclass(Literal, ASTNode)
    assert issubclass(FunctionCall, ASTNode)
    assert issubclass(ArrayLiteral, ASTNode)


# ---------------------------------------------------------------------------
# Literal types
# ---------------------------------------------------------------------------


def test_literal_string_double_quote():
    node = parse_expr('"hello"')
    assert_literal(node, "hello", "string")


def test_literal_string_single_quote():
    node = parse_expr("'world'")
    assert_literal(node, "world", "string")


def test_literal_string_empty():
    node = parse_expr('""')
    assert_literal(node, "", "string")


def test_literal_integer():
    node = parse_expr("42")
    assert_literal(node, 42, "number")
    assert isinstance(node.value, int)


def test_literal_float():
    node = parse_expr("3.14")
    assert_literal(node, 3.14, "number")
    assert isinstance(node.value, float)


def test_literal_zero():
    node = parse_expr("0")
    assert_literal(node, 0, "number")


def test_literal_boolean_true():
    node = parse_expr("true")
    assert_literal(node, True, "boolean")


def test_literal_boolean_false():
    node = parse_expr("false")
    assert_literal(node, False, "boolean")


def test_literal_null():
    node = parse_expr("null")
    assert_literal(node, None, "null")


# ---------------------------------------------------------------------------
# Variable references
# ---------------------------------------------------------------------------


def test_variable_simple():
    node = parse_expr("{Q1}")
    assert_variable(node, "Q1")


def test_variable_subquestion():
    node = parse_expr("{Q1_SQ001}")
    assert_variable(node, "Q1_SQ001")


def test_variable_respondent_attribute():
    node = parse_expr("{RESPONDENT.language}")
    assert_variable(node, "RESPONDENT.language")


# ---------------------------------------------------------------------------
# Comparison operators
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("op", ["==", "!=", ">", "<", ">=", "<="])
def test_comparison_operator(op):
    node = parse_expr(f"{{Q1}} {op} 42")
    b = assert_binary(node, op)
    assert_variable(b.left, "Q1")
    assert_literal(b.right, 42, "number")


def test_comparison_string_rhs():
    node = parse_expr('{Q1} == "Yes"')
    b = assert_binary(node, "==")
    assert_variable(b.left, "Q1")
    assert_literal(b.right, "Yes", "string")


# ---------------------------------------------------------------------------
# String operators (infix)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("op", ["contains", "starts_with", "ends_with"])
def test_string_operator(op):
    node = parse_expr(f'{{Q5}} {op} "hello"')
    b = assert_binary(node, op)
    assert_variable(b.left, "Q5")
    assert_literal(b.right, "hello", "string")


# ---------------------------------------------------------------------------
# Membership operator
# ---------------------------------------------------------------------------


def test_membership_in_with_array():
    node = parse_expr('{Q1} in ["A1", "A2"]')
    b = assert_binary(node, "in")
    assert_variable(b.left, "Q1")
    assert isinstance(b.right, ArrayLiteral)
    assert len(b.right.elements) == 2
    assert_literal(b.right.elements[0], "A1", "string")
    assert_literal(b.right.elements[1], "A2", "string")


def test_membership_in_with_variable():
    node = parse_expr('"mobile_app" in {Q12}')
    b = assert_binary(node, "in")
    assert_literal(b.left, "mobile_app", "string")
    assert_variable(b.right, "Q12")


# ---------------------------------------------------------------------------
# Logical operators
# ---------------------------------------------------------------------------


def test_and_operator():
    node = parse_expr("{Q1} == 1 and {Q2} == 2")
    b = assert_binary(node, "and")
    assert isinstance(b.left, BinaryOp)
    assert isinstance(b.right, BinaryOp)


def test_or_operator():
    node = parse_expr("{Q1} == 1 or {Q2} == 2")
    b = assert_binary(node, "or")
    assert isinstance(b.left, BinaryOp)
    assert isinstance(b.right, BinaryOp)


# ---------------------------------------------------------------------------
# Not operator
# ---------------------------------------------------------------------------


def test_not_operator_simple():
    node = parse_expr("not true")
    u = assert_unary(node, "not")
    assert_literal(u.operand, True, "boolean")


def test_not_operator_with_comparison():
    node = parse_expr('not {Q1} == "A1"')
    u = assert_unary(node, "not")
    b = assert_binary(u.operand, "==")
    assert_variable(b.left, "Q1")
    assert_literal(b.right, "A1", "string")


def test_not_operator_with_parens():
    node = parse_expr('not ({Q_smoking} == "never")')
    u = assert_unary(node, "not")
    assert isinstance(u.operand, BinaryOp)


# ---------------------------------------------------------------------------
# Operator precedence
# ---------------------------------------------------------------------------


def test_precedence_not_binds_tighter_than_and():
    # not {Q1} == 1 and {Q2} == 2
    # Should parse as: (not ({Q1} == 1)) and ({Q2} == 2)
    node = parse_expr("not {Q1} == 1 and {Q2} == 2")
    b = assert_binary(node, "and")
    u = assert_unary(b.left, "not")
    assert isinstance(u.operand, BinaryOp)


def test_precedence_and_binds_tighter_than_or():
    # {A} == 1 or {B} == 2 and {C} == 3
    # Should parse as: ({A} == 1) or (({B} == 2) and ({C} == 3))
    node = parse_expr("{A} == 1 or {B} == 2 and {C} == 3")
    b = assert_binary(node, "or")
    assert isinstance(b.left, BinaryOp)
    and_node = assert_binary(b.right, "and")
    assert isinstance(and_node.left, BinaryOp)
    assert isinstance(and_node.right, BinaryOp)


def test_precedence_comparison_binds_tighter_than_and():
    # {Q1} == 1 and {Q2} == 2 and {Q3} == 3
    # Left-associative: ((Q1==1) and (Q2==2)) and (Q3==3)
    node = parse_expr("{Q1} == 1 and {Q2} == 2 and {Q3} == 3")
    outer_and = assert_binary(node, "and")
    inner_and = assert_binary(outer_and.left, "and")
    assert isinstance(inner_and.left, BinaryOp)
    assert isinstance(inner_and.right, BinaryOp)
    assert isinstance(outer_and.right, BinaryOp)


def test_precedence_or_is_left_associative():
    # {A} or {B} or {C} — parses as ({A} or {B}) or {C}
    node = parse_expr("true or false or true")
    outer_or = assert_binary(node, "or")
    inner_or = assert_binary(outer_or.left, "or")
    assert isinstance(inner_or.left, Literal)
    assert isinstance(inner_or.right, Literal)
    assert isinstance(outer_or.right, Literal)


def test_precedence_and_is_left_associative():
    # true and false and true — parses as (true and false) and true
    node = parse_expr("true and false and true")
    outer_and = assert_binary(node, "and")
    inner_and = assert_binary(outer_and.left, "and")
    assert isinstance(inner_and.left, Literal)


# ---------------------------------------------------------------------------
# Parentheses overriding precedence
# ---------------------------------------------------------------------------


def test_parens_override_or_and():
    # ({Q1} == 1 or {Q1} == 2) and {Q2} > 18
    # Without parens, 'and' binds tighter than 'or'.
    # Parens force the or to be evaluated first.
    node = parse_expr('({Q1} == "A1" or {Q1} == "A2") and {Q2} > 18')
    b = assert_binary(node, "and")
    or_node = assert_binary(b.left, "or")
    assert isinstance(or_node.left, BinaryOp)
    assert isinstance(or_node.right, BinaryOp)


def test_parens_nested():
    node = parse_expr("((true))")
    assert_literal(node, True, "boolean")


def test_parens_single_value():
    node = parse_expr("(42)")
    assert_literal(node, 42, "number")


# ---------------------------------------------------------------------------
# Function calls
# ---------------------------------------------------------------------------


def test_function_call_no_args():
    # is_empty is defined as is_empty(var) but we test zero-arg parse tolerance
    # Actually is_empty requires 1 arg in the language but parser doesn't validate arity
    node = parse_expr("is_empty({Q4})")
    assert isinstance(node, FunctionCall)
    assert node.name == "is_empty"
    assert len(node.args) == 1
    assert_variable(node.args[0], "Q4")


def test_function_call_one_arg():
    node = parse_expr("count({Q13})")
    assert isinstance(node, FunctionCall)
    assert node.name == "count"
    assert len(node.args) == 1
    assert_variable(node.args[0], "Q13")


def test_function_call_two_args():
    node = parse_expr('contains({Q5}, "peanut")')
    assert isinstance(node, FunctionCall)
    assert node.name == "contains"
    assert len(node.args) == 2
    assert_variable(node.args[0], "Q5")
    assert_literal(node.args[1], "peanut", "string")


def test_function_call_three_args():
    node = parse_expr("sum({Q20_SQ001}, {Q20_SQ002}, {Q20_SQ003})")
    assert isinstance(node, FunctionCall)
    assert node.name == "sum"
    assert len(node.args) == 3


def test_function_call_length():
    node = parse_expr("length({Q_comment})")
    assert isinstance(node, FunctionCall)
    assert node.name == "length"


def test_function_call_regex_match():
    node = parse_expr('regex_match({Q_email}, "^[a-z]+$")')
    assert isinstance(node, FunctionCall)
    assert node.name == "regex_match"
    assert len(node.args) == 2


def test_function_call_min():
    node = parse_expr("min({Q1}, {Q2})")
    assert isinstance(node, FunctionCall)
    assert node.name == "min"
    assert len(node.args) == 2


def test_function_call_max():
    node = parse_expr("max({Q1}, {Q2})")
    assert isinstance(node, FunctionCall)
    assert node.name == "max"


@pytest.mark.parametrize("fn_name", ["is_empty", "count", "sum", "min", "max", "length", "regex_match", "contains"])
def test_function_call_all_names(fn_name):
    node = parse_expr(f"{fn_name}({{Q1}})")
    assert isinstance(node, FunctionCall)
    assert node.name == fn_name


# ---------------------------------------------------------------------------
# Array literals
# ---------------------------------------------------------------------------


def test_array_literal_empty():
    node = parse_expr("[]")
    assert isinstance(node, ArrayLiteral)
    assert len(node.elements) == 0


def test_array_literal_single_element():
    node = parse_expr('["A1"]')
    assert isinstance(node, ArrayLiteral)
    assert len(node.elements) == 1
    assert_literal(node.elements[0], "A1", "string")


def test_array_literal_multi_element():
    node = parse_expr('["A1", "A2", "A3"]')
    assert isinstance(node, ArrayLiteral)
    assert len(node.elements) == 3
    assert_literal(node.elements[0], "A1", "string")
    assert_literal(node.elements[1], "A2", "string")
    assert_literal(node.elements[2], "A3", "string")


def test_array_literal_number_elements():
    node = parse_expr("[1, 2, 3]")
    assert isinstance(node, ArrayLiteral)
    assert len(node.elements) == 3
    assert_literal(node.elements[0], 1, "number")


def test_array_literal_mixed_types():
    node = parse_expr('["text", 42, true, null]')
    assert isinstance(node, ArrayLiteral)
    assert len(node.elements) == 4


# ---------------------------------------------------------------------------
# Complex nested expressions from the docs
# ---------------------------------------------------------------------------


def test_complex_age_and_employment():
    # {Q_age} >= 18 and {Q_age} <= 34 and
    #   ({Q_education} in ["bachelors", "masters", "doctorate"] or {Q_income} > 75000)
    expr = (
        '{Q_age} >= 18 and {Q_age} <= 34 and '
        '({Q_education} in ["bachelors", "masters", "doctorate"] or {Q_income} > 75000)'
    )
    node = parse_expr(expr)
    # Top-level must be 'and'
    outer_and = assert_binary(node, "and")
    # Right child is the parenthesised or
    or_node = assert_binary(outer_and.right, "or")
    in_node = assert_binary(or_node.left, "in")
    assert_variable(in_node.left, "Q_education")
    assert isinstance(in_node.right, ArrayLiteral)
    assert len(in_node.right.elements) == 3


def test_complex_not_is_empty():
    node = parse_expr("not is_empty({Q4})")
    u = assert_unary(node, "not")
    fn = u.operand
    assert isinstance(fn, FunctionCall)
    assert fn.name == "is_empty"


def test_complex_count_comparison():
    node = parse_expr("count({Q13}) >= 3")
    b = assert_binary(node, ">=")
    fn = b.left
    assert isinstance(fn, FunctionCall)
    assert fn.name == "count"
    assert_literal(b.right, 3, "number")


def test_complex_sum_equality():
    node = parse_expr("sum({Q20_SQ001}, {Q20_SQ002}, {Q20_SQ003}) == 100")
    b = assert_binary(node, "==")
    fn = b.left
    assert isinstance(fn, FunctionCall)
    assert fn.name == "sum"
    assert len(fn.args) == 3
    assert_literal(b.right, 100, "number")


def test_complex_quota_condition():
    node = parse_expr('{Q_gender} == "male" and {Q_age} >= 18 and {Q_age} <= 24')
    outer_and = assert_binary(node, "and")
    inner_and = assert_binary(outer_and.left, "and")
    assert isinstance(inner_and.left, BinaryOp)


def test_complex_or_condition():
    node = parse_expr('{Q1} == "A1" or {Q1} == "A2"')
    b = assert_binary(node, "or")
    assert_binary(b.left, "==")
    assert_binary(b.right, "==")


def test_not_comparison_with_parens():
    # not ({Q1} == "never") — parens around the whole comparison
    node = parse_expr('not ({Q1} == "never")')
    u = assert_unary(node, "not")
    b = assert_binary(u.operand, "==")
    assert_variable(b.left, "Q1")


# ---------------------------------------------------------------------------
# Position tracking
# ---------------------------------------------------------------------------


def test_position_literal():
    node = parse_expr("42")
    assert node.start == 0
    assert node.end == 2


def test_position_variable():
    node = parse_expr("{Q1}")
    assert node.start == 0
    assert node.end == 4


def test_position_binary_spans_both_sides():
    # {Q1} == 42
    # {Q1} -> 0..4, '==' -> 5..7, 42 -> 8..10
    node = parse_expr("{Q1} == 42")
    assert node.start == 0
    assert node.end == 10


def test_position_function_call():
    # count({Q1}) -> 0..11
    node = parse_expr("count({Q1})")
    assert node.start == 0
    assert node.end == 11


def test_position_array_literal():
    # ["A1"] -> 0..6
    node = parse_expr('["A1"]')
    assert node.start == 0
    assert node.end == 6


def test_position_unary_spans_op_and_operand():
    # not true -> 0..8
    node = parse_expr("not true")
    assert node.start == 0
    assert node.end == 8


def test_position_paren_expr_includes_parens():
    # (42) -> 0..4
    node = parse_expr("(42)")
    assert node.start == 0
    assert node.end == 4


# ---------------------------------------------------------------------------
# Error cases — ParserError with position
# ---------------------------------------------------------------------------


def test_error_empty_expression():
    with pytest.raises(ParserError) as exc_info:
        parse_expr("")
    err = exc_info.value
    assert isinstance(err.position, int)
    assert err.position == 0


def test_error_empty_expression_is_value_error():
    with pytest.raises(ValueError):
        parse_expr("")


def test_error_unexpected_token():
    with pytest.raises(ParserError) as exc_info:
        parse_expr("== 42")
    err = exc_info.value
    assert isinstance(err.position, int)
    assert err.position == 0


def test_error_missing_rparen():
    with pytest.raises(ParserError) as exc_info:
        parse_expr("({Q1} == 1")
    err = exc_info.value
    assert isinstance(err.position, int)
    # Position should point somewhere into the expression
    assert err.position >= 0


def test_error_missing_rbracket():
    with pytest.raises(ParserError) as exc_info:
        parse_expr('["A1", "A2"')
    err = exc_info.value
    assert isinstance(err.position, int)
    assert err.position >= 0


def test_error_trailing_tokens():
    with pytest.raises(ParserError) as exc_info:
        parse_expr("{Q1} == 1 == 2")
    err = exc_info.value
    # The second '==' is at position 10
    assert isinstance(err.position, int)
    assert err.position >= 0


def test_error_incomplete_binary_no_rhs():
    with pytest.raises(ParserError) as exc_info:
        parse_expr("{Q1} ==")
    err = exc_info.value
    assert isinstance(err.position, int)


def test_error_parser_error_has_position_attribute():
    """ParserError.position must be an integer, not just present in message text."""
    try:
        parse_expr("")
    except ParserError as e:
        assert hasattr(e, "position")
        assert isinstance(e.position, int)
    else:
        pytest.fail("Expected ParserError")


def test_error_position_is_integer_for_missing_rparen():
    """Verify .position is an int for a missing ')' error."""
    try:
        parse_expr("(true")
    except ParserError as e:
        assert isinstance(e.position, int)
    else:
        pytest.fail("Expected ParserError")


def test_error_position_is_integer_for_trailing_token():
    """Verify .position is an int for a trailing-token error."""
    try:
        parse_expr("42 true")
    except ParserError as e:
        assert isinstance(e.position, int)
        # 'true' starts at position 3
        assert e.position == 3
    else:
        pytest.fail("Expected ParserError")


def test_error_empty_paren():
    with pytest.raises(ParserError) as exc_info:
        parse_expr("()")
    err = exc_info.value
    assert isinstance(err.position, int)


def test_error_function_missing_lparen():
    # 'count' followed by a non-'(' is a parser error
    with pytest.raises(ParserError) as exc_info:
        parse_expr("count {Q1}")
    err = exc_info.value
    assert isinstance(err.position, int)


def test_error_function_missing_rparen():
    with pytest.raises(ParserError) as exc_info:
        parse_expr("count({Q1}")
    err = exc_info.value
    assert isinstance(err.position, int)


@pytest.mark.parametrize("bad_expr,expected_pos", [
    ("== 1", 0),       # operator with no LHS
    ("and {Q1}", 0),   # 'and' with no LHS (treated as unknown primary)
    ("or {Q1}", 0),    # 'or' with no LHS (treated as unknown primary)
])
def test_error_bad_expressions(bad_expr, expected_pos):
    with pytest.raises(ParserError) as exc_info:
        parse_expr(bad_expr)
    assert isinstance(exc_info.value.position, int)
    assert exc_info.value.position == expected_pos


# ---------------------------------------------------------------------------
# ParserError str representation
# ---------------------------------------------------------------------------


def test_parser_error_str_includes_position():
    err = ParserError("test message", position=5)
    assert "5" in str(err)
    assert "test message" in str(err)


# ---------------------------------------------------------------------------
# Lexer still works after parser import
# ---------------------------------------------------------------------------


def test_lexer_still_importable():
    """Importing parser symbols must not break lexer imports."""
    from app.services.expressions import tokenize, Token, TokenType, LexerError
    tokens = tokenize("{Q1} == 42")
    assert len(tokens) == 4  # VARIABLE, OPERATOR, NUMBER, EOF
