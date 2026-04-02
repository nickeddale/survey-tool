"""Answer validators for text-based question types.

Types covered: short_text, long_text, email, phone, url.

Each validator:
- Enforces is_required.
- Applies validation JSONB rules (min_length, max_length, regex) where relevant.
- Returns None on success; raises UnprocessableError on failure.
"""

import re

from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _validate_text_value(answer: dict, question, label: str = "Answer") -> str | None:
    """Extract and type-check the text value from the answer dict.

    Returns the string value (possibly empty/None after required check).
    Raises UnprocessableError if required and missing, or if value is not a string.
    """
    value = answer.get("value")

    if question.is_required and not value:
        raise UnprocessableError(f"An answer is required for this question")

    if value is None:
        return None

    if not isinstance(value, str):
        raise UnprocessableError(f"{label} value must be a string")

    return value


def _apply_text_validation_rules(value: str, validation: dict | None) -> None:
    """Apply min_length, max_length, and regex rules from the validation JSONB."""
    if validation is None:
        return

    min_length = validation.get("min_length")
    max_length = validation.get("max_length")
    regex = validation.get("regex")

    if min_length is not None and len(value) < min_length:
        raise UnprocessableError(
            f"Answer must be at least {min_length} character(s) long"
        )

    if max_length is not None and len(value) > max_length:
        raise UnprocessableError(
            f"Answer must be at most {max_length} character(s) long"
        )

    if regex is not None:
        try:
            if not re.search(regex, value):
                raise UnprocessableError(
                    f"Answer does not match the required pattern"
                )
        except re.error:
            # Invalid regex was stored — skip pattern check gracefully.
            pass


# ---------------------------------------------------------------------------
# Public validators
# ---------------------------------------------------------------------------


def validate_short_text_answer(answer: dict, question) -> None:
    """Validate a submitted answer for a short_text question.

    answer: {"value": str | None}
    Applies min_length, max_length, regex from question.validation.
    """
    value = _validate_text_value(answer, question)
    if value is None:
        return
    _apply_text_validation_rules(value, question.validation)


def validate_long_text_answer(answer: dict, question) -> None:
    """Validate a submitted answer for a long_text question.

    answer: {"value": str | None}
    Applies min_length, max_length, regex from question.validation.
    """
    value = _validate_text_value(answer, question)
    if value is None:
        return
    _apply_text_validation_rules(value, question.validation)


def validate_email_answer(answer: dict, question) -> None:
    """Validate a submitted answer for an email question.

    answer: {"value": str | None}
    Basic email format check (must contain @ with non-empty parts on both sides).
    Also applies min_length, max_length, regex from question.validation if set.
    """
    value = _validate_text_value(answer, question, label="Email")
    if value is None:
        return

    # Basic structural check
    if "@" not in value or value.startswith("@") or value.endswith("@"):
        raise UnprocessableError("Answer must be a valid email address")

    local, _, domain = value.partition("@")
    if not local or not domain or "." not in domain:
        raise UnprocessableError("Answer must be a valid email address")

    _apply_text_validation_rules(value, question.validation)


def validate_phone_answer(answer: dict, question) -> None:
    """Validate a submitted answer for a phone question.

    answer: {"value": str | None}
    Accepts strings of digits, spaces, hyphens, parentheses, and leading +.
    Also applies min_length, max_length, regex from question.validation if set.
    """
    value = _validate_text_value(answer, question, label="Phone")
    if value is None:
        return

    # Allow: digits, spaces, hyphens, dots, parentheses, leading +
    if not re.match(r"^\+?[\d\s\-\.\(\)]{3,}$", value):
        raise UnprocessableError(
            "Answer must be a valid phone number"
        )

    _apply_text_validation_rules(value, question.validation)


def validate_url_answer(answer: dict, question) -> None:
    """Validate a submitted answer for a url question.

    answer: {"value": str | None}
    Requires http:// or https:// prefix followed by a non-empty host.
    Also applies min_length, max_length, regex from question.validation if set.
    """
    value = _validate_text_value(answer, question, label="URL")
    if value is None:
        return

    if not re.match(r"^https?://.+", value):
        raise UnprocessableError(
            "Answer must be a valid URL starting with http:// or https://"
        )

    _apply_text_validation_rules(value, question.validation)
