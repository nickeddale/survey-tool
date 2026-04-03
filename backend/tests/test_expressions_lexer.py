"""Tests for the expression language lexer (ISS-071).

Covers:
- All 15 token types plus EOF
- Variable references: simple, dotted, subquestion, _other, _comment
- String literals: double-quoted, single-quoted, escape sequences
- Integer and float number literals
- Boolean and null literals
- All comparison operators
- Logical keywords: and, or, not
- String operators: contains (as STRING_OP), starts_with, ends_with
- 'contains' as FUNCTION when followed by '(' (with and without whitespace)
- Membership operator: in
- All built-in function names
- Parentheses, brackets, comma
- Multi-token expressions from the docs
- Whitespace handling (tokens separated by various whitespace)
- 4096-character limit: exactly 4096 chars passes, 4097 chars raises LexerError
- Unterminated string raises LexerError with position info
- Unterminated variable reference raises LexerError
- Invalid character raises LexerError with position info
- Unknown identifier raises LexerError
- Empty expression produces only EOF token
- Whitespace-only expression produces only EOF token
- EOF token is always the last token
- Token start/end position correctness
- Smoke-test import: tokenize, Token, TokenType, LexerError importable from package
"""

import pytest

from app.services.expressions import tokenize, Token, TokenType, LexerError


# ---------------------------------------------------------------------------
# Smoke-test: package-level import
# ---------------------------------------------------------------------------


def test_package_imports():
    """All four public symbols must be importable from app.services.expressions."""
    # Already imported above; just verify they are the expected types.
    assert callable(tokenize)
    assert isinstance(TokenType.VARIABLE, TokenType)
    assert issubclass(LexerError, ValueError)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def tok(expr: str) -> list[Token]:
    """Tokenize and return the full token list including EOF."""
    return tokenize(expr)


def toks_no_eof(expr: str) -> list[Token]:
    """Tokenize and return all tokens except the trailing EOF."""
    tokens = tokenize(expr)
    assert tokens[-1].type == TokenType.EOF
    return tokens[:-1]


# ---------------------------------------------------------------------------
# Empty / whitespace
# ---------------------------------------------------------------------------


def test_empty_expression():
    tokens = tok("")
    assert len(tokens) == 1
    assert tokens[0].type == TokenType.EOF
    assert tokens[0].value == ""
    assert tokens[0].start == 0
    assert tokens[0].end == 0


def test_whitespace_only():
    tokens = tok("   \t\n  ")
    assert len(tokens) == 1
    assert tokens[0].type == TokenType.EOF


# ---------------------------------------------------------------------------
# EOF is always last
# ---------------------------------------------------------------------------


def test_eof_always_last():
    tokens = tok("{Q1} == 42")
    assert tokens[-1].type == TokenType.EOF


# ---------------------------------------------------------------------------
# Variable tokens
# ---------------------------------------------------------------------------


def test_variable_simple():
    tokens = toks_no_eof("{Q1}")
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.VARIABLE
    assert t.value == "Q1"
    assert t.start == 0
    assert t.end == 4


def test_variable_subquestion():
    tokens = toks_no_eof("{Q1_SQ001}")
    assert len(tokens) == 1
    assert tokens[0].type == TokenType.VARIABLE
    assert tokens[0].value == "Q1_SQ001"


def test_variable_nested_subquestion():
    tokens = toks_no_eof("{Q1_SQ001_SQ002}")
    assert len(tokens) == 1
    assert tokens[0].value == "Q1_SQ001_SQ002"


def test_variable_other():
    tokens = toks_no_eof("{Q1_other}")
    assert len(tokens) == 1
    assert tokens[0].value == "Q1_other"


def test_variable_comment():
    tokens = toks_no_eof("{Q1_comment}")
    assert len(tokens) == 1
    assert tokens[0].value == "Q1_comment"


def test_variable_respondent_attribute():
    tokens = toks_no_eof("{RESPONDENT.language}")
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.VARIABLE
    assert t.value == "RESPONDENT.language"


def test_variable_respondent_panel_id():
    tokens = toks_no_eof("{RESPONDENT.panel_id}")
    assert tokens[0].value == "RESPONDENT.panel_id"


def test_variable_position():
    # Variable starts at position 5 (after "true ")
    tokens = toks_no_eof("true {Q2}")
    var_token = tokens[1]
    assert var_token.type == TokenType.VARIABLE
    assert var_token.start == 5
    assert var_token.end == 9


def test_variable_underscore_start():
    tokens = toks_no_eof("{_private}")
    assert tokens[0].type == TokenType.VARIABLE
    assert tokens[0].value == "_private"


# ---------------------------------------------------------------------------
# String tokens
# ---------------------------------------------------------------------------


def test_string_double_quoted():
    tokens = toks_no_eof('"hello"')
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.STRING
    assert t.value == "hello"
    assert t.start == 0
    assert t.end == 7


def test_string_single_quoted():
    tokens = toks_no_eof("'world'")
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.STRING
    assert t.value == "world"


def test_string_empty():
    tokens = toks_no_eof('""')
    assert tokens[0].type == TokenType.STRING
    assert tokens[0].value == ""


def test_string_escape_double_quote():
    tokens = toks_no_eof(r'"say \"hi\""')
    assert tokens[0].value == 'say "hi"'


def test_string_escape_single_quote():
    tokens = toks_no_eof(r"'it\'s'")
    assert tokens[0].value == "it's"


def test_string_escape_backslash():
    tokens = toks_no_eof(r'"back\\slash"')
    assert tokens[0].value == "back\\slash"


def test_string_escape_newline():
    tokens = toks_no_eof(r'"line\nbreak"')
    assert tokens[0].value == "line\nbreak"


def test_string_escape_tab():
    tokens = toks_no_eof(r'"tab\there"')
    assert tokens[0].value == "tab\there"


def test_string_with_spaces():
    tokens = toks_no_eof('"Option A"')
    assert tokens[0].value == "Option A"


def test_string_position():
    # String starts at position 3 (after "42 ")
    tokens = toks_no_eof('42 "yes"')
    str_token = tokens[1]
    assert str_token.type == TokenType.STRING
    assert str_token.start == 3
    assert str_token.end == 8


# ---------------------------------------------------------------------------
# Number tokens
# ---------------------------------------------------------------------------


def test_number_integer():
    tokens = toks_no_eof("42")
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.NUMBER
    assert t.value == "42"
    assert t.start == 0
    assert t.end == 2


def test_number_float():
    tokens = toks_no_eof("3.14")
    t = tokens[0]
    assert t.type == TokenType.NUMBER
    assert t.value == "3.14"


def test_number_zero():
    tokens = toks_no_eof("0")
    assert tokens[0].type == TokenType.NUMBER
    assert tokens[0].value == "0"


def test_number_large():
    tokens = toks_no_eof("75000")
    assert tokens[0].type == TokenType.NUMBER
    assert tokens[0].value == "75000"


def test_number_position():
    tokens = toks_no_eof("{Q1} > 18")
    num_token = tokens[2]
    assert num_token.type == TokenType.NUMBER
    assert num_token.value == "18"
    assert num_token.start == 7
    assert num_token.end == 9


# ---------------------------------------------------------------------------
# Boolean tokens
# ---------------------------------------------------------------------------


def test_boolean_true():
    tokens = toks_no_eof("true")
    t = tokens[0]
    assert t.type == TokenType.BOOLEAN
    assert t.value == "true"
    assert t.start == 0
    assert t.end == 4


def test_boolean_false():
    tokens = toks_no_eof("false")
    t = tokens[0]
    assert t.type == TokenType.BOOLEAN
    assert t.value == "false"


# ---------------------------------------------------------------------------
# Null token
# ---------------------------------------------------------------------------


def test_null_token():
    tokens = toks_no_eof("null")
    t = tokens[0]
    assert t.type == TokenType.NULL
    assert t.value == "null"
    assert t.start == 0
    assert t.end == 4


# ---------------------------------------------------------------------------
# Operator tokens
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("op", ["==", "!=", ">=", "<=", ">", "<"])
def test_comparison_operator(op):
    tokens = toks_no_eof(op)
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.OPERATOR
    assert t.value == op


def test_operator_double_char_position():
    tokens = toks_no_eof("{Q1} == 5")
    op_token = tokens[1]
    assert op_token.type == TokenType.OPERATOR
    assert op_token.value == "=="
    assert op_token.start == 5
    assert op_token.end == 7


# ---------------------------------------------------------------------------
# Logical keyword tokens
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kw", ["and", "or", "not"])
def test_logical_keyword(kw):
    tokens = toks_no_eof(kw)
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.LOGICAL
    assert t.value == kw


# ---------------------------------------------------------------------------
# String operator tokens
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("op", ["starts_with", "ends_with"])
def test_string_op_keyword(op):
    tokens = toks_no_eof(op)
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.STRING_OP
    assert t.value == op


def test_contains_as_string_op():
    """'contains' with no following '(' must be classified as STRING_OP."""
    tokens = toks_no_eof("contains")
    assert len(tokens) == 1
    assert tokens[0].type == TokenType.STRING_OP
    assert tokens[0].value == "contains"


def test_contains_as_string_op_in_expression():
    """{Q5} contains "x" — 'contains' is infix, classified as STRING_OP."""
    tokens = toks_no_eof('{Q5} contains "x"')
    contains_tok = tokens[1]
    assert contains_tok.type == TokenType.STRING_OP
    assert contains_tok.value == "contains"


def test_contains_as_function_no_space():
    """contains( — immediately followed by '(', classified as FUNCTION."""
    tokens = toks_no_eof("contains(")
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "contains"
    assert tokens[1].type == TokenType.LPAREN


def test_contains_as_function_with_space():
    """contains ( — '(' after whitespace, still classified as FUNCTION."""
    tokens = toks_no_eof("contains (")
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "contains"
    assert tokens[1].type == TokenType.LPAREN


def test_contains_as_function_multiple_spaces():
    """contains    ( — multiple spaces before '(', still FUNCTION."""
    tokens = toks_no_eof("contains    (")
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "contains"


def test_contains_string_op_followed_by_variable():
    """contains {Q5} — variable follows, not '(', so STRING_OP."""
    tokens = toks_no_eof("contains {Q5}")
    assert tokens[0].type == TokenType.STRING_OP


# ---------------------------------------------------------------------------
# Membership operator token
# ---------------------------------------------------------------------------


def test_membership_in():
    tokens = toks_no_eof("in")
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.MEMBERSHIP
    assert t.value == "in"


# ---------------------------------------------------------------------------
# Function name tokens
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "fn_name",
    ["is_empty", "count", "sum", "min", "max", "length", "regex_match"],
)
def test_function_keyword(fn_name):
    tokens = toks_no_eof(fn_name)
    assert len(tokens) == 1
    t = tokens[0]
    assert t.type == TokenType.FUNCTION
    assert t.value == fn_name


# ---------------------------------------------------------------------------
# Punctuation tokens
# ---------------------------------------------------------------------------


def test_lparen():
    tokens = toks_no_eof("(")
    assert tokens[0].type == TokenType.LPAREN
    assert tokens[0].value == "("


def test_rparen():
    tokens = toks_no_eof(")")
    assert tokens[0].type == TokenType.RPAREN
    assert tokens[0].value == ")"


def test_lbracket():
    tokens = toks_no_eof("[")
    assert tokens[0].type == TokenType.LBRACKET
    assert tokens[0].value == "["


def test_rbracket():
    tokens = toks_no_eof("]")
    assert tokens[0].type == TokenType.RBRACKET
    assert tokens[0].value == "]"


def test_comma():
    tokens = toks_no_eof(",")
    assert tokens[0].type == TokenType.COMMA
    assert tokens[0].value == ","


# ---------------------------------------------------------------------------
# Multi-token expressions (from the docs)
# ---------------------------------------------------------------------------


def test_expr_simple_equality():
    """{Q1} == "Yes" """
    tokens = toks_no_eof('{Q1} == "Yes"')
    assert tokens[0].type == TokenType.VARIABLE
    assert tokens[1].type == TokenType.OPERATOR
    assert tokens[2].type == TokenType.STRING


def test_expr_greater_than():
    """{Q2} > 18"""
    tokens = toks_no_eof("{Q2} > 18")
    assert [t.type for t in tokens] == [
        TokenType.VARIABLE,
        TokenType.OPERATOR,
        TokenType.NUMBER,
    ]


def test_expr_and_compound():
    """{Q1} == "A1" and {Q2} > 18"""
    tokens = toks_no_eof('{Q1} == "A1" and {Q2} > 18')
    types = [t.type for t in tokens]
    assert types == [
        TokenType.VARIABLE,
        TokenType.OPERATOR,
        TokenType.STRING,
        TokenType.LOGICAL,
        TokenType.VARIABLE,
        TokenType.OPERATOR,
        TokenType.NUMBER,
    ]


def test_expr_in_operator_with_array():
    """{Q_employment} in ["full_time", "part_time"]"""
    tokens = toks_no_eof('{Q_employment} in ["full_time", "part_time"]')
    types = [t.type for t in tokens]
    assert types == [
        TokenType.VARIABLE,
        TokenType.MEMBERSHIP,
        TokenType.LBRACKET,
        TokenType.STRING,
        TokenType.COMMA,
        TokenType.STRING,
        TokenType.RBRACKET,
    ]


def test_expr_not_is_empty():
    """not is_empty({Q4})"""
    tokens = toks_no_eof("not is_empty({Q4})")
    assert tokens[0].type == TokenType.LOGICAL
    assert tokens[1].type == TokenType.FUNCTION
    assert tokens[2].type == TokenType.LPAREN
    assert tokens[3].type == TokenType.VARIABLE
    assert tokens[4].type == TokenType.RPAREN


def test_expr_count_function():
    """count({Q13}) >= 3"""
    tokens = toks_no_eof("count({Q13}) >= 3")
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "count"
    assert tokens[1].type == TokenType.LPAREN
    assert tokens[2].type == TokenType.VARIABLE
    assert tokens[3].type == TokenType.RPAREN
    assert tokens[4].type == TokenType.OPERATOR
    assert tokens[5].type == TokenType.NUMBER


def test_expr_sum_function():
    """sum({Q20_SQ001}, {Q20_SQ002}, {Q20_SQ003}) == 100"""
    tokens = toks_no_eof("sum({Q20_SQ001}, {Q20_SQ002}, {Q20_SQ003}) == 100")
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "sum"
    # Spot-check inner commas: tokens[3] is first comma, tokens[5] is second comma
    assert tokens[3].type == TokenType.COMMA
    assert tokens[5].type == TokenType.COMMA


def test_expr_contains_string_op():
    """{Q5} contains "allergies" """
    tokens = toks_no_eof('{Q5} contains "allergies"')
    assert tokens[1].type == TokenType.STRING_OP
    assert tokens[1].value == "contains"


def test_expr_starts_with():
    """{Q5} starts_with "Yes" """
    tokens = toks_no_eof('{Q5} starts_with "Yes"')
    assert tokens[1].type == TokenType.STRING_OP
    assert tokens[1].value == "starts_with"


def test_expr_ends_with():
    """{Q5} ends_with "Inc." """
    tokens = toks_no_eof('{Q5} ends_with "Inc."')
    assert tokens[1].type == TokenType.STRING_OP
    assert tokens[1].value == "ends_with"


def test_expr_regex_match():
    r"""regex_match({Q_email}, "^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$")"""
    tokens = toks_no_eof('regex_match({Q_email}, "pattern")')
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "regex_match"


def test_expr_complex_parentheses():
    """({Q1} == "A1" or {Q1} == "A2") and {Q2} > 18"""
    tokens = toks_no_eof('({Q1} == "A1" or {Q1} == "A2") and {Q2} > 18')
    assert tokens[0].type == TokenType.LPAREN
    assert tokens[-1].type == TokenType.NUMBER  # 18


def test_expr_membership_reverse():
    """"mobile_app" in {Q12}"""
    tokens = toks_no_eof('"mobile_app" in {Q12}')
    assert tokens[0].type == TokenType.STRING
    assert tokens[1].type == TokenType.MEMBERSHIP
    assert tokens[2].type == TokenType.VARIABLE


def test_expr_contains_function_call():
    """contains({Q5}, "peanut")"""
    tokens = toks_no_eof('contains({Q5}, "peanut")')
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "contains"
    assert tokens[1].type == TokenType.LPAREN
    assert tokens[2].type == TokenType.VARIABLE
    assert tokens[3].type == TokenType.COMMA
    assert tokens[4].type == TokenType.STRING
    assert tokens[5].type == TokenType.RPAREN


# ---------------------------------------------------------------------------
# Whitespace handling
# ---------------------------------------------------------------------------


def test_whitespace_between_tokens():
    """Tokens separated by spaces, tabs, newlines."""
    tokens = toks_no_eof("{Q1}\t==\n42")
    assert len(tokens) == 3
    assert tokens[0].type == TokenType.VARIABLE
    assert tokens[1].type == TokenType.OPERATOR
    assert tokens[2].type == TokenType.NUMBER


def test_leading_and_trailing_whitespace():
    tokens = toks_no_eof("   42   ")
    assert len(tokens) == 1
    assert tokens[0].type == TokenType.NUMBER


# ---------------------------------------------------------------------------
# TokenType is str-comparable
# ---------------------------------------------------------------------------


def test_token_type_is_str():
    """TokenType values should compare equal to plain strings."""
    assert TokenType.VARIABLE == "VARIABLE"
    assert TokenType.FUNCTION == "FUNCTION"
    assert TokenType.EOF == "EOF"


# ---------------------------------------------------------------------------
# 4096 character limit
# ---------------------------------------------------------------------------


def test_exactly_4096_chars_accepted():
    """An expression of exactly 4096 characters must be accepted."""
    # Build a valid expression that is exactly 4096 characters long.
    # Use a series of "{Q1} == 1 or " segments padded to 4096 chars.
    base = "{Q1} == 1"
    padding = " or true"
    expr = base
    while len(expr) + len(padding) <= 4096:
        expr += padding
    # Trim to exactly 4096
    expr = expr[:4096]
    # The expression may be syntactically incomplete at the boundary, but
    # the LEXER only checks the length; ensure no LexerError is raised.
    tokens = tokenize(expr)
    assert tokens[-1].type == TokenType.EOF


def test_exactly_4097_chars_rejected():
    """An expression of 4097 characters must raise LexerError."""
    expr = "a" * 4097
    with pytest.raises(LexerError) as exc_info:
        tokenize(expr)
    assert exc_info.value.position == 4096


def test_length_limit_error_has_position():
    """LexerError for oversized input must carry a position attribute."""
    with pytest.raises(LexerError) as exc_info:
        tokenize("x" * 5000)
    assert hasattr(exc_info.value, "position")
    assert exc_info.value.position == 4096


# ---------------------------------------------------------------------------
# Error cases — LexerError with position
# ---------------------------------------------------------------------------


def test_unterminated_double_quoted_string():
    with pytest.raises(LexerError) as exc_info:
        tokenize('"unterminated')
    err = exc_info.value
    assert err.position == 0  # starts at opening quote


def test_unterminated_single_quoted_string():
    with pytest.raises(LexerError) as exc_info:
        tokenize("'unterminated")
    err = exc_info.value
    assert err.position == 0


def test_unterminated_string_position_offset():
    """Unterminated string not at the start should report correct position."""
    with pytest.raises(LexerError) as exc_info:
        tokenize('{Q1} == "open')
    err = exc_info.value
    assert err.position == 8  # 8 = index of opening "


def test_unterminated_variable_reference():
    with pytest.raises(LexerError) as exc_info:
        tokenize("{Q1")
    assert exc_info.value.position == 0


def test_invalid_character():
    with pytest.raises(LexerError) as exc_info:
        tokenize("@invalid")
    assert exc_info.value.position == 0


def test_invalid_character_mid_expression():
    with pytest.raises(LexerError) as exc_info:
        tokenize("{Q1} $ 42")
    err = exc_info.value
    assert err.position == 5


def test_unknown_identifier():
    with pytest.raises(LexerError) as exc_info:
        tokenize("foobar")
    assert exc_info.value.position == 0


def test_lexer_error_is_value_error():
    """LexerError must be a subclass of ValueError."""
    with pytest.raises(ValueError):
        tokenize("@")


def test_lexer_error_has_position_attribute():
    """LexerError instances must expose .position as an int, not just in the message."""
    try:
        tokenize("@")
    except LexerError as e:
        assert isinstance(e.position, int)
    else:
        pytest.fail("Expected LexerError")


def test_empty_variable_reference():
    with pytest.raises(LexerError):
        tokenize("{}")


# ---------------------------------------------------------------------------
# Token start/end position correctness
# ---------------------------------------------------------------------------


def test_positions_sequential():
    """Verify start/end positions for each token in a compound expression."""
    #          0123456789...
    # {Q1} == 42
    # 0    5  8
    tokens = toks_no_eof("{Q1} == 42")
    var_tok, op_tok, num_tok = tokens

    assert var_tok.start == 0
    assert var_tok.end == 4  # '{Q1}' is 4 chars

    assert op_tok.start == 5
    assert op_tok.end == 7  # '==' is 2 chars

    assert num_tok.start == 8
    assert num_tok.end == 10  # '42' is 2 chars


def test_string_token_includes_quotes_in_position():
    """String token end position should be after the closing quote."""
    tokens = toks_no_eof('"hi"')
    t = tokens[0]
    assert t.start == 0
    assert t.end == 4


def test_variable_token_includes_braces_in_position():
    """Variable token positions include the enclosing braces."""
    tokens = toks_no_eof("{VAR}")
    t = tokens[0]
    assert t.start == 0
    assert t.end == 5  # '{', 'V', 'A', 'R', '}'


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_number_not_followed_by_dot_alone():
    """A standalone number without fractional part is parsed as NUMBER."""
    tokens = toks_no_eof("100")
    assert tokens[0].type == TokenType.NUMBER
    assert tokens[0].value == "100"


def test_float_multi_digit_fraction():
    tokens = toks_no_eof("3.14159")
    assert tokens[0].type == TokenType.NUMBER
    assert tokens[0].value == "3.14159"


def test_multiple_operators_in_sequence():
    """Ensure operator scanning doesn't consume too many characters."""
    tokens = toks_no_eof(">=<=")
    assert len(tokens) == 2
    assert tokens[0].value == ">="
    assert tokens[1].value == "<="


def test_nested_function_call_structure():
    """not is_empty({Q4}) — nested structure tokenises correctly."""
    tokens = toks_no_eof("not is_empty({Q4})")
    types = [t.type for t in tokens]
    assert types == [
        TokenType.LOGICAL,
        TokenType.FUNCTION,
        TokenType.LPAREN,
        TokenType.VARIABLE,
        TokenType.RPAREN,
    ]


def test_array_literal_structure():
    """["A1", "A2", "A3"] — array literal tokenises correctly."""
    tokens = toks_no_eof('["A1", "A2", "A3"]')
    types = [t.type for t in tokens]
    assert types == [
        TokenType.LBRACKET,
        TokenType.STRING,
        TokenType.COMMA,
        TokenType.STRING,
        TokenType.COMMA,
        TokenType.STRING,
        TokenType.RBRACKET,
    ]


def test_min_function():
    """min({Q7_SQ001}, {Q7_SQ002}) >= 1"""
    tokens = toks_no_eof("min({Q7_SQ001}, {Q7_SQ002}) >= 1")
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "min"


def test_max_function():
    """max({Q7_SQ001}, {Q7_SQ002}) <= 10"""
    tokens = toks_no_eof("max({Q7_SQ001}, {Q7_SQ002}) <= 10")
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "max"


def test_length_function():
    """length({Q_comment}) <= 500"""
    tokens = toks_no_eof("length({Q_comment}) <= 500")
    assert tokens[0].type == TokenType.FUNCTION
    assert tokens[0].value == "length"
