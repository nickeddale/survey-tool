"""AST-walking expression evaluator for the survey expression language.

Traverses AST nodes produced by the parser (ISS-072) and evaluates them
against a variable context dictionary.

Features:
    - Variable resolution with 10 000-character value truncation
    - Literal value passthrough
    - Binary operations: ==, !=, >, <, >=, <=, and, or, contains,
      starts_with, ends_with, in
    - Unary operation: not
    - Short-circuit evaluation for 'and' / 'or'
    - Function calls dispatched to functions.py built-ins
    - Array literals
    - 100 ms execution timeout (configurable for testing)
    - EvaluationError with position attribute matching AST node positions

Usage:
    from app.services.expressions.evaluator import evaluate, EvaluationError

    result = evaluate(ast_node, context={"Q1": "Yes", "Q2": 25})
"""

from __future__ import annotations

import concurrent.futures
import signal
import threading
from typing import Any, Dict, Optional

from app.services.expressions.ast_nodes import (
    ASTNode,
    ArrayLiteral,
    BinaryOp,
    FunctionCall,
    Literal,
    UnaryOp,
    Variable,
)
from app.services.expressions import functions as _functions_module
from app.services.expressions.functions import BUILTIN_FUNCTIONS

__all__ = ["evaluate", "Evaluator", "EvaluationError"]

# Maximum character length for resolved variable string representations.
_MAX_VALUE_LENGTH = 10_000

# Default evaluation timeout in seconds.
_DEFAULT_TIMEOUT = 0.1  # 100 ms


# ---------------------------------------------------------------------------
# EvaluationError
# ---------------------------------------------------------------------------


class EvaluationError(ValueError):
    """Raised when the evaluator encounters a runtime error.

    Attributes:
        message:  Human-readable description of the error.
        position: Zero-based character index in the source expression where
                  the error was detected.  Matches the AST node convention.
    """

    def __init__(self, message: str, position: int = 0) -> None:
        super().__init__(message)
        self.position = position

    def __str__(self) -> str:
        return f"{super().__str__()} (position {self.position})"


# Register EvaluationError with the functions module so built-in functions
# can raise it directly without a circular import.
_functions_module._register_error_class(EvaluationError)


# ---------------------------------------------------------------------------
# Evaluator
# ---------------------------------------------------------------------------


class Evaluator:
    """AST-walking evaluator.

    Args:
        context: Mapping of variable names to their values.  Values may be
                 strings, numbers, booleans, None, or lists.
    """

    def __init__(self, context: Optional[Dict[str, Any]] = None) -> None:
        self._context: Dict[str, Any] = context if context is not None else {}

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def evaluate(self, node: ASTNode) -> Any:
        """Evaluate an AST node and return the resulting Python value."""
        return self._eval(node)

    # ------------------------------------------------------------------
    # Dispatcher
    # ------------------------------------------------------------------

    def _eval(self, node: ASTNode) -> Any:
        if isinstance(node, Literal):
            return self._eval_literal(node)
        if isinstance(node, Variable):
            return self._eval_variable(node)
        if isinstance(node, UnaryOp):
            return self._eval_unary(node)
        if isinstance(node, BinaryOp):
            return self._eval_binary(node)
        if isinstance(node, FunctionCall):
            return self._eval_function(node)
        if isinstance(node, ArrayLiteral):
            return self._eval_array(node)
        raise EvaluationError(
            f"Unknown AST node type: {type(node).__name__}",
            position=getattr(node, "start", 0),
        )

    # ------------------------------------------------------------------
    # Node handlers
    # ------------------------------------------------------------------

    def _eval_literal(self, node: Literal) -> Any:
        """Return the literal's Python value directly."""
        return node.value

    def _eval_variable(self, node: Variable) -> Any:
        """Resolve a variable from context, applying 10 000-char truncation.

        If the variable is not in context, returns None (missing variables
        are treated as null/absent, not as an error, which mirrors survey
        runtime behaviour where unanswered questions are null).
        """
        value = self._context.get(node.name, None)
        if value is None:
            return None
        # Apply truncation after type coercion to string representation.
        str_repr = str(value)
        if len(str_repr) > _MAX_VALUE_LENGTH:
            value = str_repr[:_MAX_VALUE_LENGTH]
        return value

    def _eval_unary(self, node: UnaryOp) -> Any:
        """Evaluate a unary operation ('not')."""
        if node.op == "not":
            operand = self._eval(node.operand)
            return not self._to_bool(operand)
        raise EvaluationError(
            f"Unsupported unary operator: {node.op!r}",
            position=node.start,
        )

    def _eval_binary(self, node: BinaryOp) -> Any:
        """Evaluate a binary operation with short-circuit for 'and'/'or'."""
        op = node.op

        # Short-circuit logical operators
        if op == "and":
            left = self._eval(node.left)
            if not self._to_bool(left):
                return False
            right = self._eval(node.right)
            return self._to_bool(right)

        if op == "or":
            left = self._eval(node.left)
            if self._to_bool(left):
                return True
            right = self._eval(node.right)
            return self._to_bool(right)

        # For all other operators, evaluate both sides eagerly.
        left = self._eval(node.left)
        right = self._eval(node.right)

        if op == "==":
            return self._coerce_equal(left, right)
        if op == "!=":
            return not self._coerce_equal(left, right)
        if op == ">":
            if left is None or right is None:
                return False
            return self._coerce_compare(left, right, node.start) > 0
        if op == "<":
            if left is None or right is None:
                return False
            return self._coerce_compare(left, right, node.start) < 0
        if op == ">=":
            if left is None or right is None:
                return False
            return self._coerce_compare(left, right, node.start) >= 0
        if op == "<=":
            if left is None or right is None:
                return False
            return self._coerce_compare(left, right, node.start) <= 0
        if op == "contains":
            return self._eval_contains(left, right, node.start)
        if op == "starts_with":
            return self._eval_starts_with(left, right, node.start)
        if op == "ends_with":
            return self._eval_ends_with(left, right, node.start)
        if op == "in":
            return self._eval_in(left, right, node.start)

        raise EvaluationError(
            f"Unsupported binary operator: {op!r}",
            position=node.start,
        )

    def _eval_function(self, node: FunctionCall) -> Any:
        """Dispatch a function call to the built-in functions module."""
        name = node.name
        fn = BUILTIN_FUNCTIONS.get(name)
        if fn is None:
            raise EvaluationError(
                f"Unknown function: {name!r}",
                position=node.start,
            )
        args = [self._eval(arg) for arg in node.args]
        try:
            return fn(*args, position=node.start)
        except EvaluationError:
            raise
        except TypeError as exc:
            raise EvaluationError(
                f"{name}(): wrong number of arguments — {exc}",
                position=node.start,
            ) from exc

    def _eval_array(self, node: ArrayLiteral) -> list:
        """Evaluate each element and return a Python list."""
        return [self._eval(elem) for elem in node.elements]

    # ------------------------------------------------------------------
    # Type coercion helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _to_bool(value: Any) -> bool:
        """Coerce a value to boolean.

        - None / empty string / empty list → False
        - Non-zero number → True; 0 → False
        - bool → as-is
        - Non-empty string / non-empty list → True
        """
        if value is None:
            return False
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            return value != ""
        if isinstance(value, list):
            return len(value) > 0
        return bool(value)

    @staticmethod
    def _coerce_equal(left: Any, right: Any) -> bool:
        """Type-coerced equality comparison.

        Handles mixed numeric types and null comparisons gracefully.
        """
        # Identical values (same type and value)
        if left == right:
            return True
        # None is only equal to None (handled above)
        if left is None or right is None:
            return False
        # Both are numbers (int/float, excluding bool which is a subclass)
        if (
            isinstance(left, (int, float))
            and isinstance(right, (int, float))
            and not isinstance(left, bool)
            and not isinstance(right, bool)
        ):
            return left == right
        # Cross-type numeric/string coercion: try string-to-number
        if isinstance(left, str) and isinstance(right, (int, float)) and not isinstance(right, bool):
            try:
                left_num = float(left) if "." in left else int(left)
                return left_num == right
            except (ValueError, TypeError):
                pass
        if isinstance(right, str) and isinstance(left, (int, float)) and not isinstance(left, bool):
            try:
                right_num = float(right) if "." in right else int(right)
                return left == right_num
            except (ValueError, TypeError):
                pass
        return False

    @staticmethod
    def _coerce_compare(left: Any, right: Any, position: int = 0) -> int:
        """Type-coerced ordering comparison.

        Returns:
            Negative if left < right, 0 if equal, positive if left > right.

        Raises:
            EvaluationError: If the values cannot be compared.
        """
        # Both are numbers (int/float, excluding bool)
        if (
            isinstance(left, (int, float))
            and isinstance(right, (int, float))
            and not isinstance(left, bool)
            and not isinstance(right, bool)
        ):
            if left < right:
                return -1
            if left > right:
                return 1
            return 0

        # Both are strings
        if isinstance(left, str) and isinstance(right, str):
            if left < right:
                return -1
            if left > right:
                return 1
            return 0

        # Cross-type: try to coerce string to number
        try:
            if isinstance(left, str) and isinstance(right, (int, float)) and not isinstance(right, bool):
                left_num = float(left) if "." in left else int(left)
                if left_num < right:
                    return -1
                if left_num > right:
                    return 1
                return 0
            if isinstance(right, str) and isinstance(left, (int, float)) and not isinstance(left, bool):
                right_num = float(right) if "." in right else int(right)
                if left < right_num:
                    return -1
                if left > right_num:
                    return 1
                return 0
        except (ValueError, TypeError):
            pass

        raise EvaluationError(
            f"Cannot compare {type(left).__name__} and {type(right).__name__}",
            position=position,
        )

    # ------------------------------------------------------------------
    # String / membership helpers
    # ------------------------------------------------------------------

    def _eval_contains(self, left: Any, right: Any, position: int) -> bool:
        """Evaluate the 'contains' infix operator (left contains right)."""
        if isinstance(left, str):
            if not isinstance(right, str):
                raise EvaluationError(
                    f"'contains' requires a string on the right, got {type(right).__name__}",
                    position=position,
                )
            return right in left
        if isinstance(left, list):
            return right in left
        raise EvaluationError(
            f"'contains' requires a string or list on the left, got {type(left).__name__}",
            position=position,
        )

    def _eval_starts_with(self, left: Any, right: Any, position: int) -> bool:
        """Evaluate the 'starts_with' infix operator."""
        if not isinstance(left, str):
            raise EvaluationError(
                f"'starts_with' requires a string on the left, got {type(left).__name__}",
                position=position,
            )
        if not isinstance(right, str):
            raise EvaluationError(
                f"'starts_with' requires a string on the right, got {type(right).__name__}",
                position=position,
            )
        return left.startswith(right)

    def _eval_ends_with(self, left: Any, right: Any, position: int) -> bool:
        """Evaluate the 'ends_with' infix operator."""
        if not isinstance(left, str):
            raise EvaluationError(
                f"'ends_with' requires a string on the left, got {type(left).__name__}",
                position=position,
            )
        if not isinstance(right, str):
            raise EvaluationError(
                f"'ends_with' requires a string on the right, got {type(right).__name__}",
                position=position,
            )
        return left.endswith(right)

    def _eval_in(self, left: Any, right: Any, position: int) -> bool:
        """Evaluate the 'in' membership operator (left in right)."""
        if isinstance(right, list):
            return left in right
        if isinstance(right, str):
            if not isinstance(left, str):
                raise EvaluationError(
                    f"'in' requires a string on the left for substring search, "
                    f"got {type(left).__name__}",
                    position=position,
                )
            return left in right
        raise EvaluationError(
            f"'in' requires a list or string on the right, got {type(right).__name__}",
            position=position,
        )


# ---------------------------------------------------------------------------
# Thread-safe timeout helper
# ---------------------------------------------------------------------------


def _run_with_thread_timeout(fn, timeout: float) -> Any:
    """Execute fn() in a thread pool with a timeout.

    This works in both main and non-main threads (unlike SIGALRM which is
    restricted to the main thread on Linux).

    Raises:
        EvaluationError: If execution exceeds the timeout.
    """
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(fn)
        try:
            return future.result(timeout=timeout)
        except concurrent.futures.TimeoutError as exc:
            raise EvaluationError(
                f"Expression evaluation timed out (limit: {int(timeout * 1000)}ms)",
                position=0,
            ) from exc
        except EvaluationError:
            raise
        except Exception as exc:
            raise EvaluationError(str(exc), position=0) from exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def evaluate(
    node: ASTNode,
    context: Optional[Dict[str, Any]] = None,
    timeout: Optional[float] = _DEFAULT_TIMEOUT,
) -> Any:
    """Evaluate an AST node against a variable context.

    Args:
        node:    The root AST node to evaluate (as returned by parse()).
        context: Optional mapping of variable names to values. Missing
                 variables resolve to None.
        timeout: Maximum evaluation time in seconds. Defaults to 0.1 (100ms).
                 Pass None to disable the timeout (useful for testing).

    Returns:
        The Python value produced by the expression: bool, int, float,
        str, None, or list.

    Raises:
        EvaluationError: On runtime errors (type mismatch, unknown function,
                         timeout, etc.).
    """
    evaluator = Evaluator(context)

    if timeout is None:
        return evaluator.evaluate(node)

    return _run_with_thread_timeout(lambda: evaluator.evaluate(node), timeout)
