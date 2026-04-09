"""AST node definitions for the expression language parser.

Each node corresponds to a grammatical construct in the expression language.
All nodes carry source-position information (start, end) as zero-based character
indices matching the Token.start / Token.end convention used by the lexer.

Node hierarchy:
    ASTNode          - abstract base
    ├── BinaryOp     - left op right  (==, !=, >, <, >=, <=, and, or,
    │                                  contains, starts_with, ends_with, in)
    ├── UnaryOp      - op operand     (not)
    ├── Variable     - {NAME}
    ├── Literal      - string / number / boolean / null literal
    ├── FunctionCall - name(arg, ...)
    └── ArrayLiteral - [elem, ...]
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List

__all__ = [
    "ASTNode",
    "BinaryOp",
    "UnaryOp",
    "Variable",
    "Literal",
    "FunctionCall",
    "ArrayLiteral",
    "ParserError",
]


# ---------------------------------------------------------------------------
# Base node
# ---------------------------------------------------------------------------


@dataclass
class ASTNode:
    """Abstract base class for all AST nodes.

    Attributes:
        start: Zero-based index of the first character of this construct
               in the source expression string.
        end:   Zero-based index one past the last character (exclusive).
    """

    start: int
    end: int


# ---------------------------------------------------------------------------
# Concrete node types
# ---------------------------------------------------------------------------


@dataclass
class BinaryOp(ASTNode):
    """A binary infix operation.

    Attributes:
        op:    The operator string (e.g. '==', '!=', '>', '<', '>=', '<=',
               'and', 'or', 'contains', 'starts_with', 'ends_with', 'in').
        left:  The left-hand operand.
        right: The right-hand operand.
    """

    op: str
    left: ASTNode
    right: ASTNode


@dataclass
class UnaryOp(ASTNode):
    """A unary prefix operation.

    Attributes:
        op:      The operator string ('not').
        operand: The operand expression.
    """

    op: str
    operand: ASTNode


@dataclass
class Variable(ASTNode):
    """A variable reference (e.g. {Q1}, {RESPONDENT.language}).

    Attributes:
        name: The variable name without braces.
    """

    name: str


@dataclass
class Literal(ASTNode):
    """A literal value (string, number, boolean, or null).

    Attributes:
        value: The Python value:
               - str   for STRING tokens
               - int or float for NUMBER tokens (parsed from string)
               - bool  for BOOLEAN tokens
               - None  for NULL tokens
        kind:  One of 'string', 'number', 'boolean', 'null'.
    """

    value: Any
    kind: str


@dataclass
class FunctionCall(ASTNode):
    """A function invocation (e.g. count({Q1}), sum({A}, {B})).

    Attributes:
        name: The function name string.
        args: The ordered list of argument AST nodes.
    """

    name: str
    args: List[ASTNode] = field(default_factory=list)


@dataclass
class ArrayLiteral(ASTNode):
    """An array literal (e.g. ["A1", "A2", "A3"]).

    Attributes:
        elements: The ordered list of element AST nodes.
    """

    elements: List[ASTNode] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Parser error
# ---------------------------------------------------------------------------


class ParserError(ValueError):
    """Raised when the parser encounters invalid token input.

    Attributes:
        message:  Human-readable description of the error.
        position: Zero-based character index in the source where the error
                  was detected.  Matches the Token.start convention.
    """

    def __init__(self, message: str, position: int) -> None:
        super().__init__(message)
        self.position = position

    def __str__(self) -> str:
        return f"{super().__str__()} (position {self.position})"
