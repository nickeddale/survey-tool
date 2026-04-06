"""Answer validators for miscellaneous question types.

Types covered: scale, yes_no, time, datetime, file_upload, number.

Each validator:
- Enforces is_required.
- Applies validation JSONB rules (min/max, regex, min_length/max_length) where relevant.
- Returns None on success; raises UnprocessableError on failure.
"""

import re
from datetime import datetime as dt
from typing import Any

from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# scale
# ---------------------------------------------------------------------------


def validate_scale_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a scale question.

    answer: {"value": int | None}
    Applies min/max from question.validation if set; defaults to settings
    min_rating/max_rating if available.
    """
    settings = question.settings or {}
    validation = question.validation or {}

    value = answer.get("value")

    if question.is_required and value is None:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise UnprocessableError("Scale answer value must be a number")

    min_val = validation.get("min", settings.get("min_value"))
    max_val = validation.get("max", settings.get("max_value"))

    if min_val is not None and value < min_val:
        raise UnprocessableError(
            f"Answer value {value} is below the minimum allowed value {min_val}"
        )

    if max_val is not None and value > max_val:
        raise UnprocessableError(
            f"Answer value {value} exceeds the maximum allowed value {max_val}"
        )


# ---------------------------------------------------------------------------
# yes_no
# ---------------------------------------------------------------------------


def validate_yes_no_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a yes_no question.

    answer: {"value": str | None}
    Value must be 'yes' or 'no'.
    """
    value = answer.get("value")

    if question.is_required and value is None:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if value not in ("yes", "no"):
        raise UnprocessableError("Answer value must be 'yes' or 'no'")


# ---------------------------------------------------------------------------
# time
# ---------------------------------------------------------------------------

_TIME_FORMAT = "%H:%M"
_TIME_FORMAT_WITH_SECONDS = "%H:%M:%S"


def validate_time_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a time question.

    answer: {"value": str | None}
    Value must be a valid HH:MM or HH:MM:SS string.
    """
    value = answer.get("value")

    if question.is_required and value is None:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if not isinstance(value, str):
        raise UnprocessableError("Time answer value must be a string")

    parsed = None
    for fmt in (_TIME_FORMAT_WITH_SECONDS, _TIME_FORMAT):
        try:
            parsed = dt.strptime(value, fmt)
            break
        except (ValueError, TypeError):
            pass

    if parsed is None:
        raise UnprocessableError(
            f"Answer value '{value}' is not a valid time (expected HH:MM or HH:MM:SS)"
        )


# ---------------------------------------------------------------------------
# datetime
# ---------------------------------------------------------------------------

_DATETIME_FORMATS = (
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
)


def validate_datetime_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a datetime question.

    answer: {"value": str | None}
    Value must be a parseable ISO-8601-like datetime string.
    """
    value = answer.get("value")

    if question.is_required and value is None:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if not isinstance(value, str):
        raise UnprocessableError("Datetime answer value must be a string")

    parsed = None
    for fmt in _DATETIME_FORMATS:
        try:
            parsed = dt.strptime(value, fmt)
            break
        except (ValueError, TypeError):
            pass

    if parsed is None:
        raise UnprocessableError(
            f"Answer value '{value}' is not a valid datetime "
            "(expected ISO-8601 format, e.g. YYYY-MM-DDTHH:MM:SS)"
        )

    validation = question.validation or {}
    min_val = validation.get("min")
    max_val = validation.get("max")

    if min_val is not None:
        for fmt in _DATETIME_FORMATS:
            try:
                min_dt = dt.strptime(str(min_val), fmt)
                if parsed < min_dt:
                    raise UnprocessableError(
                        f"Answer datetime '{value}' is before the minimum '{min_val}'"
                    )
                break
            except (ValueError, TypeError):
                pass

    if max_val is not None:
        for fmt in _DATETIME_FORMATS:
            try:
                max_dt = dt.strptime(str(max_val), fmt)
                if parsed > max_dt:
                    raise UnprocessableError(
                        f"Answer datetime '{value}' is after the maximum '{max_val}'"
                    )
                break
            except (ValueError, TypeError):
                pass


# ---------------------------------------------------------------------------
# file_upload
# ---------------------------------------------------------------------------


def validate_file_upload_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a file_upload question.

    answer: {"value": str | None}  (file URL or identifier)
    Just enforces is_required; actual file validation happens at upload time.
    """
    value = answer.get("value")

    if question.is_required and not value:
        raise UnprocessableError("A file upload is required for this question")


# ---------------------------------------------------------------------------
# number
# ---------------------------------------------------------------------------


def validate_number_answer(answer: dict[str, Any], question: Any) -> None:
    """Validate a submitted answer for a number question.

    answer: {"value": int | float | None}
    Applies min/max from question.validation if set.
    """
    validation = question.validation or {}
    settings = question.settings or {}

    value = answer.get("value")

    if question.is_required and value is None:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise UnprocessableError("Number answer value must be a number")

    min_val = validation.get("min", settings.get("min_value"))
    max_val = validation.get("max", settings.get("max_value"))

    if min_val is not None and value < min_val:
        raise UnprocessableError(
            f"Answer value {value} is below the minimum allowed value {min_val}"
        )

    if max_val is not None and value > max_val:
        raise UnprocessableError(
            f"Answer value {value} exceeds the maximum allowed value {max_val}"
        )
