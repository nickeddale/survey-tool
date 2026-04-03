"""Recursive descent parser for the survey expression language.

Converts a token list produced by the lexer into an Abstract Syntax Tree (AST).

Operator precedence (highest to lowest):
    1. Primary        - literals, variables, parenthesised exprs, function calls,
                        array literals
    2. not            - unary prefix logical negation
    3. Comparison /   - ==, !=, >, <, >=, <= (OPERATOR tokens)
       String ops     - contains, starts_with, ends_with (STRING_OP tokens)
       Membership     - in (MEMBERSHIP token)
    4. and            - logical conjunction
    5. or             - logical disjunction  (lowest precedence binary op)

Usage:
    from app.services.expressions.parser import parse
    from app.services.expressions.lexer import tokenize

    tokens = tokenize("{Q1} == 'Yes' and {Q2} > 18")
    ast = parse(tokens)
"""

from __future__ import annotations

from typing import List

from app.services.expressions.ast_nodes import (
    ASTNode,
    ArrayLiteral,
    BinaryOp,
    FunctionCall,
    Literal,
    ParserError,
    UnaryOp,
    Variable,
)
from app.services.expressions.lexer import Token, TokenType

__all__ = ["parse", "ParserError"]


class _Parser:
    """Internal recursive-descent parser state machine."""

    def __init__(self, tokens: List[Token]) -> None:
        self._tokens = tokens
        self._pos = 0

    # ------------------------------------------------------------------
    # Token navigation helpers
    # ------------------------------------------------------------------

    def _current(self) -> Token:
        """Return the current token without consuming it."""
        return self._tokens[self._pos]

    def _peek_type(self) -> TokenType:
        """Return the type of the current token."""
        return self._tokens[self._pos].type

    def _peek_value(self) -> str:
        """Return the value of the current token."""
        return self._tokens[self._pos].value

    def _advance(self) -> Token:
        """Consume and return the current token, then advance position."""
        tok = self._tokens[self._pos]
        if tok.type != TokenType.EOF:
            self._pos += 1
        return tok

    def _expect(self, token_type: TokenType, *, description: str = "") -> Token:
        """Consume a token of the expected type or raise ParserError."""
        tok = self._current()
        if tok.type != token_type:
            label = description or token_type.value
            raise ParserError(
                f"Expected {label}, got {tok.value!r} ({tok.type.value})",
                position=tok.start,
            )
        return self._advance()

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def parse(self) -> ASTNode:
        """Parse the token list into an AST.

        Raises:
            ParserError: If the token list is empty (only EOF), or if the
                         expression is syntactically invalid, or if tokens
                         remain after a complete expression.
        """
        if self._peek_type() == TokenType.EOF:
            tok = self._current()
            raise ParserError(
                "Empty expression: expected an expression",
                position=tok.start,
            )

        node = self._parse_or()

        # After parsing a complete expression the only acceptable token is EOF.
        if self._peek_type() != TokenType.EOF:
            tok = self._current()
            raise ParserError(
                f"Unexpected token {tok.value!r} after expression",
                position=tok.start,
            )

        return node

    # ------------------------------------------------------------------
    # Grammar rules (lowest precedence first)
    # ------------------------------------------------------------------

    def _parse_or(self) -> ASTNode:
        """or-expression: and_expr ('or' and_expr)*"""
        left = self._parse_and()

        while (
            self._peek_type() == TokenType.LOGICAL
            and self._peek_value() == "or"
        ):
            op_tok = self._advance()  # consume 'or'
            right = self._parse_and()
            left = BinaryOp(
                start=left.start,
                end=right.end,
                op="or",
                left=left,
                right=right,
            )

        return left

    def _parse_and(self) -> ASTNode:
        """and-expression: not_expr ('and' not_expr)*"""
        left = self._parse_not()

        while (
            self._peek_type() == TokenType.LOGICAL
            and self._peek_value() == "and"
        ):
            op_tok = self._advance()  # consume 'and'
            right = self._parse_not()
            left = BinaryOp(
                start=left.start,
                end=right.end,
                op="and",
                left=left,
                right=right,
            )

        return left

    def _parse_not(self) -> ASTNode:
        """not-expression: 'not' not_expr | comparison_expr"""
        if self._peek_type() == TokenType.LOGICAL and self._peek_value() == "not":
            op_tok = self._advance()  # consume 'not'
            operand = self._parse_not()  # right-associative
            return UnaryOp(
                start=op_tok.start,
                end=operand.end,
                op="not",
                operand=operand,
            )
        return self._parse_comparison()

    def _parse_comparison(self) -> ASTNode:
        """comparison-expression: primary (comparison_op primary)?

        Comparison operators are non-associative: only a single comparison
        per expression is permitted at this level (a < b < c is a syntax error).
        """
        left = self._parse_primary()

        tok = self._current()

        # OPERATOR: ==, !=, >, <, >=, <=
        if tok.type == TokenType.OPERATOR:
            op_tok = self._advance()
            right = self._parse_primary()
            return BinaryOp(
                start=left.start,
                end=right.end,
                op=op_tok.value,
                left=left,
                right=right,
            )

        # STRING_OP: contains, starts_with, ends_with
        if tok.type == TokenType.STRING_OP:
            op_tok = self._advance()
            right = self._parse_primary()
            return BinaryOp(
                start=left.start,
                end=right.end,
                op=op_tok.value,
                left=left,
                right=right,
            )

        # MEMBERSHIP: in
        if tok.type == TokenType.MEMBERSHIP:
            op_tok = self._advance()
            right = self._parse_primary()
            return BinaryOp(
                start=left.start,
                end=right.end,
                op="in",
                left=left,
                right=right,
            )

        return left

    def _parse_primary(self) -> ASTNode:
        """primary: literal | variable | paren_expr | function_call | array_literal"""
        tok = self._current()

        # Parenthesised expression
        if tok.type == TokenType.LPAREN:
            return self._parse_paren()

        # Array literal
        if tok.type == TokenType.LBRACKET:
            return self._parse_array()

        # Function call
        if tok.type == TokenType.FUNCTION:
            return self._parse_function_call()

        # Variable reference
        if tok.type == TokenType.VARIABLE:
            self._advance()
            return Variable(start=tok.start, end=tok.end, name=tok.value)

        # String literal
        if tok.type == TokenType.STRING:
            self._advance()
            return Literal(start=tok.start, end=tok.end, value=tok.value, kind="string")

        # Number literal
        if tok.type == TokenType.NUMBER:
            self._advance()
            raw = tok.value
            value: int | float = float(raw) if "." in raw else int(raw)
            return Literal(start=tok.start, end=tok.end, value=value, kind="number")

        # Boolean literal
        if tok.type == TokenType.BOOLEAN:
            self._advance()
            return Literal(
                start=tok.start,
                end=tok.end,
                value=(tok.value == "true"),
                kind="boolean",
            )

        # Null literal
        if tok.type == TokenType.NULL:
            self._advance()
            return Literal(start=tok.start, end=tok.end, value=None, kind="null")

        # Unexpected token
        if tok.type == TokenType.EOF:
            raise ParserError(
                "Unexpected end of expression: expected a value or sub-expression",
                position=tok.start,
            )

        raise ParserError(
            f"Unexpected token {tok.value!r} ({tok.type.value}): expected a value or sub-expression",
            position=tok.start,
        )

    def _parse_paren(self) -> ASTNode:
        """paren_expr: '(' expression ')'"""
        open_tok = self._advance()  # consume '('

        if self._peek_type() == TokenType.RPAREN:
            raise ParserError(
                "Empty parenthesised expression",
                position=open_tok.start,
            )

        inner = self._parse_or()

        close_tok = self._expect(
            TokenType.RPAREN,
            description="closing ')'",
        )
        # Return inner node but extend its position to include the parens.
        inner.start = open_tok.start
        inner.end = close_tok.end
        return inner

    def _parse_function_call(self) -> ASTNode:
        """function_call: FUNCTION '(' arg_list ')'"""
        name_tok = self._advance()  # consume function name

        self._expect(TokenType.LPAREN, description=f"'(' after function '{name_tok.value}'")

        args: List[ASTNode] = []

        if self._peek_type() != TokenType.RPAREN:
            args.append(self._parse_or())
            while self._peek_type() == TokenType.COMMA:
                self._advance()  # consume ','
                args.append(self._parse_or())

        close_tok = self._expect(
            TokenType.RPAREN,
            description=f"closing ')' for function '{name_tok.value}'",
        )

        return FunctionCall(
            start=name_tok.start,
            end=close_tok.end,
            name=name_tok.value,
            args=args,
        )

    def _parse_array(self) -> ASTNode:
        """array_literal: '[' (expression (',' expression)*)? ']'"""
        open_tok = self._advance()  # consume '['

        elements: List[ASTNode] = []

        if self._peek_type() != TokenType.RBRACKET:
            elements.append(self._parse_or())
            while self._peek_type() == TokenType.COMMA:
                self._advance()  # consume ','
                elements.append(self._parse_or())

        close_tok = self._expect(
            TokenType.RBRACKET,
            description="closing ']' for array literal",
        )

        return ArrayLiteral(
            start=open_tok.start,
            end=close_tok.end,
            elements=elements,
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse(tokens: List[Token]) -> ASTNode:
    """Parse a token list into an AST.

    Args:
        tokens: A list of Token objects as returned by :func:`tokenize`.
                Must include the trailing EOF token.

    Returns:
        The root AST node of the parsed expression.

    Raises:
        ParserError: If the token list does not represent a valid expression.
                     The exception carries a ``position`` attribute (int) with
                     the zero-based character offset of the error in the original
                     source string.
    """
    return _Parser(tokens).parse()
