"""Settings and answer validators for text-based question types.

Types covered: short_text, long_text, huge_text, email, phone, url.

Each settings validator:
- Validates type-specific settings fields.
- Raises UnprocessableError with a descriptive message on invalid settings.

Each answer validator:
- Enforces is_required.
- Applies settings constraints (max_length, input_type format checks).
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


def _check_email_format(value: str) -> None:
    """Raise UnprocessableError if value is not a valid email address."""
    if "@" not in value or value.startswith("@") or value.endswith("@"):
        raise UnprocessableError("Answer must be a valid email address")
    local, _, domain = value.partition("@")
    if not local or not domain or "." not in domain:
        raise UnprocessableError("Answer must be a valid email address")


def _check_url_format(value: str) -> None:
    """Raise UnprocessableError if value is not a valid URL."""
    if not re.match(r"^https?://.+", value):
        raise UnprocessableError(
            "Answer must be a valid URL starting with http:// or https://"
        )


# ---------------------------------------------------------------------------
# Settings (config) validators
# ---------------------------------------------------------------------------


_VALID_INPUT_TYPES = frozenset({"text", "email", "url", "tel"})


def validate_short_text_settings(settings: dict | None) -> None:
    """Validate settings for short_text questions.

    Optional fields:
    - placeholder: string or null
    - max_length: integer <= 255 (default 255)
    - input_type: one of text, email, url, tel (default text)
    """
    if settings is None:
        return

    if "placeholder" in settings and settings["placeholder"] is not None:
        if not isinstance(settings["placeholder"], str):
            raise UnprocessableError("settings.placeholder must be a string or null")

    if "max_length" in settings:
        max_length = settings["max_length"]
        if not isinstance(max_length, int) or isinstance(max_length, bool):
            raise UnprocessableError("settings.max_length must be an integer")
        if max_length <= 0:
            raise UnprocessableError("settings.max_length must be > 0")
        if max_length > 255:
            raise UnprocessableError("settings.max_length must be <= 255 for short_text")

    if "input_type" in settings:
        input_type = settings["input_type"]
        if input_type not in _VALID_INPUT_TYPES:
            raise UnprocessableError(
                f"settings.input_type must be one of: {', '.join(sorted(_VALID_INPUT_TYPES))}"
            )


def validate_long_text_settings(settings: dict | None) -> None:
    """Validate settings for long_text questions.

    Optional fields:
    - placeholder: string or null
    - max_length: integer <= 5000 (default 5000)
    - rows: integer > 0 (default 4)
    """
    if settings is None:
        return

    if "placeholder" in settings and settings["placeholder"] is not None:
        if not isinstance(settings["placeholder"], str):
            raise UnprocessableError("settings.placeholder must be a string or null")

    if "max_length" in settings:
        max_length = settings["max_length"]
        if not isinstance(max_length, int) or isinstance(max_length, bool):
            raise UnprocessableError("settings.max_length must be an integer")
        if max_length <= 0:
            raise UnprocessableError("settings.max_length must be > 0")
        if max_length > 5000:
            raise UnprocessableError("settings.max_length must be <= 5000 for long_text")

    if "rows" in settings:
        rows = settings["rows"]
        if not isinstance(rows, int) or isinstance(rows, bool):
            raise UnprocessableError("settings.rows must be an integer")
        if rows <= 0:
            raise UnprocessableError("settings.rows must be > 0")


def validate_huge_text_settings(settings: dict | None) -> None:
    """Validate settings for huge_text questions.

    Optional fields:
    - placeholder: string or null
    - max_length: integer <= 50000 (default 50000)
    - rows: integer > 0 (default 10)
    - rich_text: boolean (default false)
    """
    if settings is None:
        return

    if "placeholder" in settings and settings["placeholder"] is not None:
        if not isinstance(settings["placeholder"], str):
            raise UnprocessableError("settings.placeholder must be a string or null")

    if "max_length" in settings:
        max_length = settings["max_length"]
        if not isinstance(max_length, int) or isinstance(max_length, bool):
            raise UnprocessableError("settings.max_length must be an integer")
        if max_length <= 0:
            raise UnprocessableError("settings.max_length must be > 0")
        if max_length > 50000:
            raise UnprocessableError("settings.max_length must be <= 50000 for huge_text")

    if "rows" in settings:
        rows = settings["rows"]
        if not isinstance(rows, int) or isinstance(rows, bool):
            raise UnprocessableError("settings.rows must be an integer")
        if rows <= 0:
            raise UnprocessableError("settings.rows must be > 0")

    if "rich_text" in settings:
        if not isinstance(settings["rich_text"], bool):
            raise UnprocessableError("settings.rich_text must be a boolean")


# ---------------------------------------------------------------------------
# Public answer validators
# ---------------------------------------------------------------------------


def validate_short_text_answer(answer: dict, question) -> None:
    """Validate a submitted answer for a short_text question.

    answer: {"value": str | None}
    - Enforces max_length from settings (if set).
    - Validates email/url format when input_type setting specifies it.
    - Applies min_length, max_length, regex from question.validation.
    """
    value = _validate_text_value(answer, question)
    if value is None:
        return

    settings = question.settings or {}
    max_length = settings.get("max_length", 255)
    if len(value) > max_length:
        raise UnprocessableError(
            f"Answer must be at most {max_length} character(s) long"
        )

    input_type = settings.get("input_type", "text")
    if input_type == "email":
        _check_email_format(value)
    elif input_type == "url":
        _check_url_format(value)

    _apply_text_validation_rules(value, question.validation)


def validate_long_text_answer(answer: dict, question) -> None:
    """Validate a submitted answer for a long_text question.

    answer: {"value": str | None}
    - Enforces max_length from settings (if set).
    - Applies min_length, max_length, regex from question.validation.
    """
    value = _validate_text_value(answer, question)
    if value is None:
        return

    settings = question.settings or {}
    max_length = settings.get("max_length", 5000)
    if len(value) > max_length:
        raise UnprocessableError(
            f"Answer must be at most {max_length} character(s) long"
        )

    _apply_text_validation_rules(value, question.validation)


def validate_huge_text_answer(answer: dict, question) -> None:
    """Validate a submitted answer for a huge_text question.

    answer: {"value": str | None}
    - Enforces max_length from settings (if set).
    - Applies min_length, max_length, regex from question.validation.
    """
    value = _validate_text_value(answer, question)
    if value is None:
        return

    settings = question.settings or {}
    max_length = settings.get("max_length", 50000)
    if len(value) > max_length:
        raise UnprocessableError(
            f"Answer must be at most {max_length} character(s) long"
        )

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

    _check_email_format(value)
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

    _check_url_format(value)
    _apply_text_validation_rules(value, question.validation)
