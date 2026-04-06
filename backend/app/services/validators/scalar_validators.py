"""Validators for scalar question types: numeric, rating, boolean, date."""

from datetime import datetime
from typing import Any

from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Settings validators
# ---------------------------------------------------------------------------


def validate_numeric_settings(settings: dict[str, Any] | None) -> None:
    """Validate settings for numeric questions.

    Optional fields: min_value (number), max_value (number), step (number > 0),
    prefix (str), suffix (str), placeholder (str).
    min_value must be <= max_value when both are provided.
    """
    if settings is None:
        return

    min_value = settings.get("min_value")
    max_value = settings.get("max_value")
    step = settings.get("step")

    if min_value is not None and not isinstance(min_value, (int, float)):
        raise UnprocessableError("settings.min_value must be a number")

    if max_value is not None and not isinstance(max_value, (int, float)):
        raise UnprocessableError("settings.max_value must be a number")

    if min_value is not None and max_value is not None and min_value > max_value:
        raise UnprocessableError("settings.min_value must be <= settings.max_value")

    if step is not None:
        if not isinstance(step, (int, float)) or step <= 0:
            raise UnprocessableError("settings.step must be a number > 0")

    if "prefix" in settings and not isinstance(settings["prefix"], str):
        raise UnprocessableError("settings.prefix must be a string")

    if "suffix" in settings and not isinstance(settings["suffix"], str):
        raise UnprocessableError("settings.suffix must be a string")

    if "placeholder" in settings and not isinstance(settings["placeholder"], str):
        raise UnprocessableError("settings.placeholder must be a string")


def validate_rating_settings(settings: dict[str, Any] | None) -> None:
    """Validate settings for rating questions.

    Optional fields: min_rating (int, default 1), max_rating (int, default 5),
    step (int, default 1), icon (str in [star, heart, thumb]).
    """
    if settings is None:
        return

    min_rating = settings.get("min_rating")
    max_rating = settings.get("max_rating")
    step = settings.get("step")

    if min_rating is not None and not isinstance(min_rating, int):
        raise UnprocessableError("settings.min_rating must be an integer")

    if max_rating is not None and not isinstance(max_rating, int):
        raise UnprocessableError("settings.max_rating must be an integer")

    if min_rating is not None and max_rating is not None and min_rating > max_rating:
        raise UnprocessableError("settings.min_rating must be <= settings.max_rating")

    if step is not None:
        if not isinstance(step, int) or step <= 0:
            raise UnprocessableError("settings.step must be an integer > 0")

    if "icon" in settings:
        icon = settings["icon"]
        valid_icons = {"star", "heart", "thumb"}
        if icon not in valid_icons:
            raise UnprocessableError(
                f"settings.icon must be one of: {', '.join(sorted(valid_icons))}"
            )


def validate_boolean_settings(settings: dict[str, Any] | None) -> None:
    """Validate settings for boolean questions.

    Optional fields: label_true (str, default 'Yes'), label_false (str, default 'No'),
    display (str in [toggle, radio]).
    """
    if settings is None:
        return

    if "label_true" in settings and not isinstance(settings["label_true"], str):
        raise UnprocessableError("settings.label_true must be a string")

    if "label_false" in settings and not isinstance(settings["label_false"], str):
        raise UnprocessableError("settings.label_false must be a string")

    if "display" in settings:
        display = settings["display"]
        valid_displays = {"toggle", "radio"}
        if display not in valid_displays:
            raise UnprocessableError(
                f"settings.display must be one of: {', '.join(sorted(valid_displays))}"
            )


def validate_date_settings(settings: dict[str, Any] | None) -> None:
    """Validate settings for date questions.

    Optional fields: min_date (str), max_date (str),
    date_format (str, default 'YYYY-MM-DD'), include_time (bool).
    min_date must be <= max_date when both are provided.
    """
    if settings is None:
        return

    date_format = settings.get("date_format", "YYYY-MM-DD")
    if not isinstance(date_format, str):
        raise UnprocessableError("settings.date_format must be a string")

    python_format = _date_format_to_python(date_format)

    min_date = settings.get("min_date")
    max_date = settings.get("max_date")

    if min_date is not None:
        if not isinstance(min_date, str):
            raise UnprocessableError("settings.min_date must be a string")
        if not _parse_date(min_date, python_format):
            raise UnprocessableError(
                f"settings.min_date '{min_date}' does not match date_format '{date_format}'"
            )

    if max_date is not None:
        if not isinstance(max_date, str):
            raise UnprocessableError("settings.max_date must be a string")
        if not _parse_date(max_date, python_format):
            raise UnprocessableError(
                f"settings.max_date '{max_date}' does not match date_format '{date_format}'"
            )

    if min_date is not None and max_date is not None:
        min_dt = _parse_date(min_date, python_format)
        max_dt = _parse_date(max_date, python_format)
        if min_dt is not None and max_dt is not None and min_dt > max_dt:
            raise UnprocessableError("settings.min_date must be <= settings.max_date")

    if "include_time" in settings and not isinstance(settings["include_time"], bool):
        raise UnprocessableError("settings.include_time must be a boolean")


# ---------------------------------------------------------------------------
# Answer validators
# ---------------------------------------------------------------------------


def validate_numeric_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a numeric question.

    answer: {"value": number | None}
    Value must be within [min_value, max_value] and divisible by step
    ((value - min_value) % step == 0).
    """
    settings = question.settings or {}
    min_value = settings.get("min_value")
    max_value = settings.get("max_value")
    step = settings.get("step")

    value = answer.get("value")

    if question.is_required and value is None:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if not isinstance(value, (int, float)):
        raise UnprocessableError("Answer value must be a number")

    if min_value is not None and value < min_value:
        raise UnprocessableError(
            f"Answer value {value} is below the minimum allowed value {min_value}"
        )

    if max_value is not None and value > max_value:
        raise UnprocessableError(
            f"Answer value {value} exceeds the maximum allowed value {max_value}"
        )

    if step is not None and step > 0:
        base = min_value if min_value is not None else 0
        remainder = round((value - base) % step, 10)
        if remainder != 0 and round(remainder - step, 10) != 0:
            raise UnprocessableError(
                f"Answer value {value} is not divisible by step {step}"
            )


def validate_rating_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a rating question.

    answer: {"value": int | None}
    Value must be within [min_rating, max_rating].
    """
    settings = question.settings or {}
    min_rating = settings.get("min_rating", 1)
    max_rating = settings.get("max_rating", 5)

    value = answer.get("value")

    if question.is_required and value is None:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if not isinstance(value, int):
        raise UnprocessableError("Answer value must be an integer")

    if value < min_rating:
        raise UnprocessableError(
            f"Answer value {value} is below the minimum rating {min_rating}"
        )

    if value > max_rating:
        raise UnprocessableError(
            f"Answer value {value} exceeds the maximum rating {max_rating}"
        )


def validate_boolean_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a boolean question.

    answer: {"value": str | None}
    Value must be the string 'true' or 'false'.
    """
    value = answer.get("value")

    if question.is_required and value is None:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if value not in ("true", "false"):
        raise UnprocessableError("Answer value must be 'true' or 'false'")


def validate_date_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a date question.

    answer: {"value": str | None}
    Value must be a valid date string matching the configured date_format,
    and within [min_date, max_date] if configured.
    """
    settings = question.settings or {}
    date_format = settings.get("date_format", "YYYY-MM-DD")
    min_date = settings.get("min_date")
    max_date = settings.get("max_date")

    python_format = _date_format_to_python(date_format)

    value = answer.get("value")

    if question.is_required and value is None:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if not isinstance(value, str):
        raise UnprocessableError("Answer value must be a string")

    parsed = _parse_date(value, python_format)
    if parsed is None:
        raise UnprocessableError(
            f"Answer value '{value}' does not match date_format '{date_format}'"
        )

    if min_date is not None:
        min_dt = _parse_date(min_date, python_format)
        if min_dt is not None and parsed < min_dt:
            raise UnprocessableError(
                f"Answer date '{value}' is before the minimum date '{min_date}'"
            )

    if max_date is not None:
        max_dt = _parse_date(max_date, python_format)
        if max_dt is not None and parsed > max_dt:
            raise UnprocessableError(
                f"Answer date '{value}' is after the maximum date '{max_date}'"
            )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _date_format_to_python(date_format: str) -> str:
    """Convert a date format string (YYYY-MM-DD style) to Python strptime format."""
    return (
        date_format
        .replace("YYYY", "%Y")
        .replace("MM", "%m")
        .replace("DD", "%d")
        .replace("HH", "%H")
        .replace("mm", "%M")
        .replace("ss", "%S")
    )


def _parse_date(date_str: str, python_format: str) -> datetime | None:
    """Parse a date string using the given Python strptime format. Returns None on failure."""
    try:
        return datetime.strptime(date_str, python_format)
    except (ValueError, TypeError):
        return None
