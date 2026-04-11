"""Built-in functions for the expression language evaluator.

Each function performs type coercion and raises EvaluationError for type
mismatches. All functions are designed to be called from the evaluator's
_eval_function dispatcher without any re-wrapping of exceptions.

Built-in functions:
    is_empty(value)            - True if value is null, empty string, or empty list
    contains(collection, item) - True if collection contains item
    count(value)               - Number of elements in a list/string, or 1 for scalars
    sum(values...)             - Numeric sum of all arguments
    min(values...)             - Minimum numeric value among arguments
    max(values...)             - Maximum numeric value among arguments
    length(value)              - Character length of a string value
    regex_match(pattern, str)  - True if string matches the regex pattern
"""

from __future__ import annotations

import re
from typing import Any

from app.services.validators.regex_utils import safe_regex_search as _safe_regex_search

__all__ = [
    "is_empty",
    "contains",
    "count",
    "fn_sum",
    "fn_min",
    "fn_max",
    "length",
    "regex_match",
    "BUILTIN_FUNCTIONS",
]

# EvaluationError is imported lazily to avoid circular imports.
# It is defined in evaluator.py which imports this module.
# We use a deferred import pattern: functions receive the error class via
# the BUILTIN_FUNCTIONS dispatcher which is populated by evaluator.py.

_EvaluationError = None  # populated by evaluator.py at import time


def _error(message: str, position: int = 0) -> Exception:
    """Create an EvaluationError. Uses the globally registered error class."""
    if _EvaluationError is None:
        raise RuntimeError(
            "functions.py: EvaluationError not yet registered. "
            "Import evaluator.py first."
        )
    return _EvaluationError(message, position)


def _register_error_class(cls: type) -> None:
    """Register the EvaluationError class. Called by evaluator.py on import."""
    global _EvaluationError
    _EvaluationError = cls


def _to_number(value: Any, func_name: str, position: int = 0) -> float | int:
    """Coerce value to a number or raise EvaluationError."""
    if isinstance(value, bool):
        raise _error(
            f"{func_name}(): boolean cannot be used as a number",
            position,
        )
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value) if "." in value else int(value)
        except (ValueError, TypeError):
            raise _error(
                f"{func_name}(): cannot coerce string {value!r} to a number",
                position,
            )
    raise _error(
        f"{func_name}(): expected a number, got {type(value).__name__}",
        position,
    )


# ---------------------------------------------------------------------------
# is_empty(value) -> bool
# ---------------------------------------------------------------------------


def is_empty(value: Any, position: int = 0) -> bool:
    """Return True if value is null (None), empty string, or empty list."""
    if value is None:
        return True
    if isinstance(value, str):
        return value == ""
    if isinstance(value, list):
        return len(value) == 0
    # Non-null scalar values are never considered empty
    return False


# ---------------------------------------------------------------------------
# contains(collection, item) -> bool
# ---------------------------------------------------------------------------


def contains(collection: Any, item: Any, position: int = 0) -> bool:
    """Return True if collection contains item.

    - If collection is a string, performs substring search (item must be str).
    - If collection is a list, checks membership.
    - Otherwise raises EvaluationError.
    """
    if isinstance(collection, str):
        if not isinstance(item, str):
            raise _error(
                f"contains(): substring search requires a string item, "
                f"got {type(item).__name__}",
                position,
            )
        return item in collection
    if isinstance(collection, list):
        return item in collection
    raise _error(
        f"contains(): first argument must be a string or list, "
        f"got {type(collection).__name__}",
        position,
    )


# ---------------------------------------------------------------------------
# count(value) -> int
# ---------------------------------------------------------------------------


def count(value: Any, position: int = 0) -> int:
    """Return the number of elements in value.

    - list: number of elements
    - str: number of characters
    - None: 0
    - scalar (number, bool): 1
    """
    if value is None:
        return 0
    if isinstance(value, list):
        return len(value)
    if isinstance(value, str):
        return len(value)
    # scalar (number, bool) counts as 1
    return 1


# ---------------------------------------------------------------------------
# sum(*values) -> number
# ---------------------------------------------------------------------------


def fn_sum(*args: Any, position: int = 0) -> int | float:
    """Return the numeric sum of all arguments.

    Each argument is coerced to a number. Raises EvaluationError if any
    argument cannot be coerced, or if no arguments are provided.
    """
    if not args:
        raise _error("sum(): requires at least one argument", position)
    # Flatten lists in args
    flat: list[Any] = []
    for arg in args:
        if isinstance(arg, list):
            flat.extend(arg)
        else:
            flat.append(arg)
    if not flat:
        raise _error("sum(): requires at least one numeric value", position)
    total: int | float = 0
    for v in flat:
        total += _to_number(v, "sum", position)
    return total


# ---------------------------------------------------------------------------
# min(*values) -> number
# ---------------------------------------------------------------------------


def fn_min(*args: Any, position: int = 0) -> int | float:
    """Return the minimum numeric value among all arguments.

    Lists in arguments are flattened. Raises EvaluationError if no values
    are provided or if any value cannot be coerced to a number.
    """
    if not args:
        raise _error("min(): requires at least one argument", position)
    flat: list[Any] = []
    for arg in args:
        if isinstance(arg, list):
            flat.extend(arg)
        else:
            flat.append(arg)
    if not flat:
        raise _error("min(): requires at least one numeric value", position)
    numbers = [_to_number(v, "min", position) for v in flat]
    result = numbers[0]
    for n in numbers[1:]:
        if n < result:
            result = n
    return result


# ---------------------------------------------------------------------------
# max(*values) -> number
# ---------------------------------------------------------------------------


def fn_max(*args: Any, position: int = 0) -> int | float:
    """Return the maximum numeric value among all arguments.

    Lists in arguments are flattened. Raises EvaluationError if no values
    are provided or if any value cannot be coerced to a number.
    """
    if not args:
        raise _error("max(): requires at least one argument", position)
    flat: list[Any] = []
    for arg in args:
        if isinstance(arg, list):
            flat.extend(arg)
        else:
            flat.append(arg)
    if not flat:
        raise _error("max(): requires at least one numeric value", position)
    numbers = [_to_number(v, "max", position) for v in flat]
    result = numbers[0]
    for n in numbers[1:]:
        if n > result:
            result = n
    return result


# ---------------------------------------------------------------------------
# length(value) -> int
# ---------------------------------------------------------------------------


def length(value: Any, position: int = 0) -> int:
    """Return the character length of a string value.

    Raises EvaluationError if value is not a string.
    """
    if isinstance(value, str):
        return len(value)
    raise _error(
        f"length(): expected a string, got {type(value).__name__}",
        position,
    )


# ---------------------------------------------------------------------------
# regex_match(pattern, string) -> bool
# ---------------------------------------------------------------------------


def regex_match(string: Any, pattern: Any, position: int = 0) -> bool:
    """Return True if string matches the regex pattern.

    Args:
        string:  The string to test against the pattern (first argument).
        pattern: A string containing a regular expression pattern (second argument).

    Raises:
        EvaluationError: If either argument is not a string, or if pattern
                         is not a valid regex.
    """
    if not isinstance(string, str):
        raise _error(
            f"regex_match(): first argument must be a string, "
            f"got {type(string).__name__}",
            position,
        )
    if not isinstance(pattern, str):
        raise _error(
            f"regex_match(): pattern must be a string, got {type(pattern).__name__}",
            position,
        )
    try:
        return bool(_safe_regex_search(pattern, string))
    except re.error as exc:
        raise _error(
            f"regex_match(): invalid regex pattern {pattern!r}: {exc}",
            position,
        ) from exc
    except TimeoutError:
        raise _error(
            f"regex_match(): pattern {pattern!r} timed out — too complex to evaluate safely",
            position,
        )


# ---------------------------------------------------------------------------
# Function dispatch table
# ---------------------------------------------------------------------------

# Maps function name -> callable.  The evaluator looks up the function here
# and passes evaluated argument values.  Each callable accepts positional args
# followed by an optional keyword argument `position` (int) for error reporting.

BUILTIN_FUNCTIONS: dict[str, Any] = {
    "is_empty": is_empty,
    "contains": contains,
    "count": count,
    "sum": fn_sum,
    "min": fn_min,
    "max": fn_max,
    "length": length,
    "regex_match": regex_match,
}
