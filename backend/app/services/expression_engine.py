"""Expression validation engine — semantic analysis facade.

Orchestrates the lexer → parser pipeline and then performs semantic analysis
on the resulting AST, checking:

  - Syntax errors (LexerError / ParserError)
  - Unknown variable references (UNKNOWN_VARIABLE)
  - Forward references — a variable whose sort_order is >= the current
    question's sort_order (FORWARD_REFERENCE)
  - Unsupported function names (UNSUPPORTED_FUNCTION)

Usage::

    from app.services.expression_engine import validate_expression, ValidationResult

    result = validate_expression(
        expression="{Q1} == 'Yes' and {Q2} > 18",
        known_variables=["Q1", "Q2", "Q3"],
        question_sort_orders={"Q1": 1, "Q2": 2, "Q3": 3},
        current_sort_order=3,
    )
    # result.errors  — list of ExpressionError
    # result.warnings — list of ExpressionWarning
    # result.parsed_variables — list of variable names found in the expression
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.services.expressions.ast_nodes import (
    ASTNode,
    ArrayLiteral,
    BinaryOp,
    FunctionCall,
    Literal as ASTLiteral,
    UnaryOp,
    Variable,
)
from app.services.expressions.functions import BUILTIN_FUNCTIONS
from app.services.expressions.lexer import LexerError, tokenize
from app.services.expressions.parser import ParserError, parse

__all__ = [
    "validate_expression",
    "ValidationResult",
    "ExpressionError",
    "ExpressionWarning",
]

ErrorCode = Literal[
    "SYNTAX_ERROR",
    "UNKNOWN_VARIABLE",
    "TYPE_MISMATCH",
    "UNSUPPORTED_FUNCTION",
    "FORWARD_REFERENCE",
]


@dataclass
class ExpressionError:
    """A validation error found in an expression.

    Attributes:
        message:  Human-readable description.
        position: Zero-based character offset in the source string.
        code:     Machine-readable error category.
    """

    message: str
    position: int
    code: ErrorCode


@dataclass
class ExpressionWarning:
    """A non-fatal advisory about an expression.

    Attributes:
        message:  Human-readable description.
        position: Zero-based character offset in the source string.
        code:     Machine-readable warning category (same set as errors).
    """

    message: str
    position: int
    code: str


@dataclass
class ValidationResult:
    """The result of validating an expression.

    Attributes:
        parsed_variables: List of distinct variable names referenced in the
                          expression (in order of first occurrence).
        errors:           List of ExpressionError instances (syntax, semantic).
        warnings:         List of ExpressionWarning instances (advisory only).
    """

    parsed_variables: list[str] = field(default_factory=list)
    errors: list[ExpressionError] = field(default_factory=list)
    warnings: list[ExpressionWarning] = field(default_factory=list)


# ---------------------------------------------------------------------------
# AST walker helpers
# ---------------------------------------------------------------------------


def _collect_nodes(node: ASTNode) -> list[ASTNode]:
    """Return a flat list of all nodes in the AST (depth-first)."""
    result: list[ASTNode] = [node]
    if isinstance(node, BinaryOp):
        result.extend(_collect_nodes(node.left))
        result.extend(_collect_nodes(node.right))
    elif isinstance(node, UnaryOp):
        result.extend(_collect_nodes(node.operand))
    elif isinstance(node, FunctionCall):
        for arg in node.args:
            result.extend(_collect_nodes(arg))
    elif isinstance(node, ArrayLiteral):
        for elem in node.elements:
            result.extend(_collect_nodes(elem))
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_expression(
    expression: str,
    known_variables: list[str],
    question_sort_orders: dict[str, int] | None = None,
    current_sort_order: int | None = None,
) -> ValidationResult:
    """Validate an expression string against a set of known variable names.

    Steps:
      1. Lex + parse the expression, capturing syntax errors.
      2. Walk the AST to collect Variable nodes and FunctionCall nodes.
      3. For each Variable:
         - If the name is not in *known_variables*, emit UNKNOWN_VARIABLE.
         - If *question_sort_orders* and *current_sort_order* are provided,
           and the variable's sort_order >= current_sort_order, emit
           FORWARD_REFERENCE.
      4. For each FunctionCall whose name is not in BUILTIN_FUNCTIONS, emit
         UNSUPPORTED_FUNCTION.

    Args:
        expression:            The expression string to validate.
        known_variables:       List of question codes that are valid variable
                               names in this survey.
        question_sort_orders:  Optional mapping of question code → sort_order.
                               Used for forward-reference detection.
        current_sort_order:    The sort_order of the question whose expression
                               is being validated.  Forward references are
                               variables whose sort_order >= this value.

    Returns:
        A ValidationResult with parsed_variables, errors, and warnings.
    """
    result = ValidationResult()

    # ------------------------------------------------------------------
    # Step 1: Lex + parse
    # ------------------------------------------------------------------
    ast_root: ASTNode | None = None
    try:
        tokens = tokenize(expression)
        ast_root = parse(tokens)
    except LexerError as exc:
        result.errors.append(
            ExpressionError(
                message=str(exc.args[0]),
                position=exc.position,
                code="SYNTAX_ERROR",
            )
        )
        return result
    except ParserError as exc:
        result.errors.append(
            ExpressionError(
                message=str(exc.args[0]),
                position=exc.position,
                code="SYNTAX_ERROR",
            )
        )
        return result

    # ------------------------------------------------------------------
    # Step 2: Collect all nodes
    # ------------------------------------------------------------------
    all_nodes = _collect_nodes(ast_root)

    # ------------------------------------------------------------------
    # Step 3: Variable checks
    # ------------------------------------------------------------------
    known_set = set(known_variables)
    seen_variables: list[str] = []
    seen_variable_set: set[str] = set()

    for node in all_nodes:
        if not isinstance(node, Variable):
            continue
        name = node.name
        # Track unique variables in order of first occurrence
        if name not in seen_variable_set:
            seen_variables.append(name)
            seen_variable_set.add(name)

        if name not in known_set:
            result.errors.append(
                ExpressionError(
                    message=f"Unknown variable '{{{name}}}': no question with this code exists in the survey",
                    position=node.start,
                    code="UNKNOWN_VARIABLE",
                )
            )
        elif (
            question_sort_orders is not None
            and current_sort_order is not None
            and name in question_sort_orders
            and question_sort_orders[name] >= current_sort_order
        ):
            result.errors.append(
                ExpressionError(
                    message=(
                        f"Forward reference to '{{{name}}}': this question appears at or after "
                        f"the current question in the survey (sort_order "
                        f"{question_sort_orders[name]} >= {current_sort_order})"
                    ),
                    position=node.start,
                    code="FORWARD_REFERENCE",
                )
            )

    result.parsed_variables = seen_variables

    # ------------------------------------------------------------------
    # Step 4: Unsupported function checks
    # ------------------------------------------------------------------
    for node in all_nodes:
        if not isinstance(node, FunctionCall):
            continue
        if node.name not in BUILTIN_FUNCTIONS:
            result.errors.append(
                ExpressionError(
                    message=f"Unsupported function '{node.name}': not available in the expression language",
                    position=node.start,
                    code="UNSUPPORTED_FUNCTION",
                )
            )

    return result
