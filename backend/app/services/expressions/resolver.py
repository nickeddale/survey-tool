"""Variable resolver for the survey expression language.

Builds a flat expression context dictionary from survey response data.
The context dict is consumed directly by evaluator.evaluate().

Variable naming conventions:
    {Q1}            - Direct answer to question with code "Q1"
    {Q1_SQ001}      - Subquestion/matrix answer; the subquestion has code "SQ001"
                      and its parent has code "Q1"
    {Q1_other}      - Free-text entered in the "other" option of question Q1
    {Q1_comment}    - Comment text attached to question Q1
    {RESPONDENT.x}  - Participant attribute "x" from the participant's attributes JSONB

Type conversion rules (applied when populating the context dict):
    multiple_choice / checkbox / ranking  -> Python list
    rating / scale / number / numeric     -> int or float (float if fractional)
    yes_no / boolean                      -> Python bool
    unanswered string-type questions      -> '' (empty string, ISS-208)
    unanswered numeric/boolean/list       -> Python None
    all other types                       -> str

Usage::

    from app.services.expressions.resolver import build_expression_context
    from app.services.expressions import evaluate, parse
    from app.services.expressions.lexer import tokenize

    ctx = build_expression_context(response, participant=participant)
    result = evaluate(parse(tokenize("{Q1} == 'Yes'")), context=ctx)
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.models.response import Response
from app.models.participant import Participant
from app.models.response_answer import (
    ANSWER_TYPE_ANSWER,
    ANSWER_TYPE_OTHER,
    ANSWER_TYPE_COMMENT,
)

__all__ = ["build_expression_context", "ResolverError"]

# Question types whose primary answers are stored as Python lists.
_LIST_QUESTION_TYPES = frozenset(
    {
        "multiple_choice",
        "checkbox",
        "ranking",
        "image_picker",
    }
)

# Question types whose primary answers should be coerced to numeric values.
_NUMERIC_QUESTION_TYPES = frozenset(
    {
        "rating",
        "scale",
        "numeric",
    }
)

# Question types whose primary answers are boolean.
_BOOLEAN_QUESTION_TYPES = frozenset(
    {
        "yes_no",
        "boolean",
    }
)

# Question types whose unanswered (None) values should normalise to empty
# string rather than None.  This matches user expectations: {Q1} == '' is
# True for an unanswered text question.  Numeric and boolean types are
# intentionally excluded so that null-checks ({Q1} == null) still work for
# those types.
_STRING_QUESTION_TYPES = frozenset(
    {
        "short_text",
        "long_text",
        "text",
        "dropdown",
        "radio",
        "single_choice",
        "date",
        "time",
        "datetime",
        "email",
        "url",
        "phone",
    }
)


class ResolverError(ValueError):
    """Raised when the resolver encounters an unrecoverable error."""


# ---------------------------------------------------------------------------
# Type conversion helpers
# ---------------------------------------------------------------------------


def _coerce_value(raw_value: Any, question_type: str) -> Any:
    """Convert a raw JSONB value to the appropriate Python type.

    Args:
        raw_value:     The value stored in ResponseAnswer.value (may be any
                       JSON-compatible type, or None for unanswered questions).
        question_type: The question_type string from the Question model.

    Returns:
        The coerced Python value: list, int/float, bool, None, or str.
    """
    if raw_value is None:
        # String-type questions normalise to empty string so that relevance
        # expressions like {Q1} == '' evaluate to True for unanswered
        # questions (Scenario 7.2 / ISS-208).  Non-string types (numeric,
        # boolean, list) remain None so null-checks keep working.
        if question_type in _STRING_QUESTION_TYPES:
            return ""
        return None

    if question_type in _LIST_QUESTION_TYPES:
        if isinstance(raw_value, list):
            return raw_value
        # Scalar stored for a list-type question — wrap it.
        return [raw_value] if raw_value != "" else []

    if question_type in _NUMERIC_QUESTION_TYPES:
        return _to_number(raw_value)

    if question_type in _BOOLEAN_QUESTION_TYPES:
        return _to_bool(raw_value)

    # All other types → string (but preserve existing str/None).
    if isinstance(raw_value, str):
        return raw_value
    return str(raw_value)


def _to_number(value: Any) -> Any:
    """Coerce a value to int or float, returning None on failure."""
    if isinstance(value, bool):
        # bool is a subclass of int; treat as a non-numeric value.
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        # Return int when the float is a whole number.
        return int(value) if value == int(value) else value
    if isinstance(value, str):
        try:
            f = float(value)
            return int(f) if f == int(f) else f
        except (ValueError, TypeError):
            return None
    return None


def _to_bool(value: Any) -> Any:
    """Coerce a value to bool, returning None on failure."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return bool(value)
    if isinstance(value, str):
        lower = value.lower()
        if lower in ("true", "yes", "1", "y"):
            return True
        if lower in ("false", "no", "0", "n"):
            return False
    return None


# ---------------------------------------------------------------------------
# RESPONDENT attribute resolver
# ---------------------------------------------------------------------------


def _resolve_respondent(participant: Optional[Participant]) -> Dict[str, Any]:
    """Build RESPONDENT.* entries from participant attributes.

    Args:
        participant: The Participant ORM object, or None if anonymous.

    Returns:
        A dict with keys like "RESPONDENT.language", "RESPONDENT.region", etc.
        Returns an empty dict when participant is None or has no attributes.
    """
    if participant is None:
        return {}
    attrs = participant.attributes
    if not attrs:
        return {}
    return {f"RESPONDENT.{key}": value for key, value in attrs.items()}


# ---------------------------------------------------------------------------
# Main public API
# ---------------------------------------------------------------------------


def build_expression_context(
    response: Response,
    participant: Optional[Participant] = None,
) -> Dict[str, Any]:
    """Build a flat expression context dictionary from a survey response.

    Iterates the ResponseAnswer rows attached to *response* (via the
    ``answers`` relationship) and maps each to one or more flat dict keys
    using the question code and answer_type.

    Key derivation:
        answer_type == "answer":
            - For a top-level question (parent_id is None):  key = question.code
            - For a subquestion (parent_id is not None):
              key = parent.code + "_" + question.code
        answer_type == "other":  key = question.code + "_other"
            (if it is a subquestion: parent.code + "_other")
        answer_type == "comment": key = question.code + "_comment"
            (if it is a subquestion: parent.code + "_comment")

    RESPONDENT attributes are injected as "RESPONDENT.<attr>" keys when a
    non-None *participant* is provided.

    Args:
        response:    The Response ORM object.  Its ``answers`` relationship
                     must already be loaded (not lazy-raised).  Each answer's
                     ``question`` relationship must also be loaded.
        participant: Optional Participant ORM object.  When provided its
                     ``attributes`` JSONB is flattened into RESPONDENT.* keys.

    Returns:
        A flat dict mapping variable names to Python values, ready to be
        passed as the ``context`` argument to ``evaluate()``.
    """
    context: Dict[str, Any] = {}

    for answer in response.answers:
        question = answer.question
        question_type = question.question_type
        raw_value = answer.value
        answer_type = answer.answer_type

        # Determine the base code for this answer.
        # Subquestions use "PARENTCODE_SUBCODE"; top-level use their own code.
        if question.parent_id is not None and question.parent is not None:
            base_code = f"{question.parent.code}_{question.code}"
        else:
            base_code = question.code

        if answer_type == ANSWER_TYPE_ANSWER:
            context[base_code] = _coerce_value(raw_value, question_type)

        elif answer_type == ANSWER_TYPE_OTHER:
            # Other-text key: always uses the parent code (or the question's
            # own code if top-level) suffixed with "_other".
            if question.parent_id is not None and question.parent is not None:
                other_key = f"{question.parent.code}_other"
            else:
                other_key = f"{question.code}_other"
            context[other_key] = raw_value if isinstance(raw_value, str) else (
                str(raw_value) if raw_value is not None else None
            )

        elif answer_type == ANSWER_TYPE_COMMENT:
            # Comment key: same base code as answer but suffixed with "_comment".
            if question.parent_id is not None and question.parent is not None:
                comment_key = f"{question.parent.code}_comment"
            else:
                comment_key = f"{question.code}_comment"
            context[comment_key] = raw_value if isinstance(raw_value, str) else (
                str(raw_value) if raw_value is not None else None
            )

    # Inject RESPONDENT.* attributes.
    context.update(_resolve_respondent(participant))

    return context
