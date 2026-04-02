"""Unified question validation engine.

Provides:
- QuestionValidationError: lightweight dataclass for field-level errors
- validate_question_config: dispatches to per-type settings validators
- validate_answer: dispatches to per-type answer validators
- VALIDATOR_REGISTRY: maps question_type -> (config_validator, answer_validator) callables
"""

from typing import Callable

from app.services.validators._types import QuestionValidationError
from app.services.validators.choice_validators import (
    validate_checkbox_settings,
    validate_dropdown_settings,
    validate_radio_settings,
    validate_checkbox_answer,
    validate_dropdown_answer,
    validate_radio_answer,
)
from app.services.validators.matrix_validators import (
    validate_matrix_settings,
    validate_matrix_dropdown_settings,
    validate_matrix_dynamic_settings,
    validate_matrix_answer,
    validate_matrix_dropdown_answer,
    validate_matrix_dynamic_answer,
)
from app.services.validators.scalar_validators import (
    validate_boolean_settings,
    validate_date_settings,
    validate_numeric_settings,
    validate_rating_settings,
    validate_boolean_answer,
    validate_date_answer,
    validate_numeric_answer,
    validate_rating_answer,
)
from app.services.validators.text_validators import (
    validate_short_text_answer,
    validate_long_text_answer,
    validate_email_answer,
    validate_phone_answer,
    validate_url_answer,
)
from app.services.validators.misc_validators import (
    validate_scale_answer,
    validate_yes_no_answer,
    validate_time_answer,
    validate_datetime_answer,
    validate_file_upload_answer,
    validate_number_answer,
)
from app.services.validators.special_validators import (
    validate_ranking_settings,
    validate_ranking_answer,
    validate_image_picker_settings,
    validate_image_picker_answer,
    validate_file_upload_settings,
    validate_expression_settings,
    validate_html_settings,
)
from app.services.validators.validation_rules import validate_validation_rules


# Re-export so callers can do: from app.services.validators import QuestionValidationError
__all__ = [
    "QuestionValidationError",
    "validate_question_config",
    "validate_answer",
]


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
# Each entry maps question_type -> dict with optional keys:
#   "config":  callable(settings, answer_options, subquestions) -> None  (raises UnprocessableError)
#   "answer":  callable(answer, question, ...) -> None  (raises UnprocessableError)
#
# Config validators have heterogeneous signatures (choice needs answer_options,
# matrix needs both, scalar needs neither), so the dispatcher normalises the call.

_CHOICE_TYPES = frozenset({"single_choice", "dropdown", "multiple_choice"})
_MATRIX_TYPES = frozenset({"matrix", "matrix_dropdown", "matrix_dynamic"})
_SCALAR_TYPES = frozenset({"numeric", "rating", "boolean", "date"})
_TEXT_TYPES = frozenset({"short_text", "long_text", "email", "phone", "url"})
_MISC_TYPES = frozenset({"scale", "yes_no", "time", "datetime", "file_upload", "number"})
# Special types that require answer_options in their config/answer validators
_SPECIAL_CHOICE_TYPES = frozenset({"ranking", "image_picker"})

# Config validators: keyed by type, value is the settings-validator callable.
# Choice: (settings, answer_options) -> None
# Matrix: (settings, answer_options, subquestions) -> None
# Scalar: (settings) -> None
# Text/Misc: no settings validator defined; skipped.
_CONFIG_VALIDATORS: dict[str, Callable] = {
    # choice
    "single_choice": validate_radio_settings,
    "dropdown": validate_dropdown_settings,
    "multiple_choice": validate_checkbox_settings,
    # matrix
    "matrix": validate_matrix_settings,
    "matrix_dropdown": validate_matrix_dropdown_settings,
    "matrix_dynamic": validate_matrix_dynamic_settings,
    # scalar
    "numeric": validate_numeric_settings,
    "rating": validate_rating_settings,
    "boolean": validate_boolean_settings,
    "date": validate_date_settings,
    # special (choice-like: require answer_options)
    "ranking": validate_ranking_settings,
    "image_picker": validate_image_picker_settings,
    # special (scalar-like: no answer_options needed)
    "file_upload": validate_file_upload_settings,
    "expression": validate_expression_settings,
    "html": validate_html_settings,
}

# Answer validators: keyed by type, value is the answer-validator callable.
# Signatures vary per family — the dispatcher handles calling conventions.
_ANSWER_VALIDATORS: dict[str, Callable] = {
    # choice (signature: answer, question, answer_options)
    "single_choice": validate_radio_answer,
    "dropdown": validate_dropdown_answer,
    "multiple_choice": validate_checkbox_answer,
    # matrix (signature: answer, question, answer_options, subquestions)
    "matrix": validate_matrix_answer,
    "matrix_dropdown": validate_matrix_dropdown_answer,
    "matrix_dynamic": validate_matrix_dynamic_answer,
    # scalar (signature: answer, question)
    "numeric": validate_numeric_answer,
    "rating": validate_rating_answer,
    "boolean": validate_boolean_answer,
    "date": validate_date_answer,
    # text (signature: answer, question)
    "short_text": validate_short_text_answer,
    "long_text": validate_long_text_answer,
    "email": validate_email_answer,
    "phone": validate_phone_answer,
    "url": validate_url_answer,
    # misc (signature: answer, question)
    "scale": validate_scale_answer,
    "yes_no": validate_yes_no_answer,
    "time": validate_time_answer,
    "datetime": validate_datetime_answer,
    "file_upload": validate_file_upload_answer,
    "number": validate_number_answer,
    # special choice-like (signature: answer, question, answer_options)
    "ranking": validate_ranking_answer,
    "image_picker": validate_image_picker_answer,
    # expression and html: no answer validator (computed/static — no user input)
}


# ---------------------------------------------------------------------------
# Public dispatchers
# ---------------------------------------------------------------------------


def validate_question_config(
    question_type: str,
    settings: dict | None,
    validation: dict | None,
    answer_options: list | None = None,
    subquestions: list | None = None,
) -> list[QuestionValidationError]:
    """Validate question config (settings + validation JSONB) for any question type.

    Returns a list of QuestionValidationError objects.  An empty list means valid.
    The caller is responsible for turning errors into UnprocessableError raises.
    """
    errors: list[QuestionValidationError] = []
    answer_options = answer_options or []
    subquestions = subquestions or []

    # --- Settings validation via per-type config validator ---
    # Only run when settings are explicitly provided, preserving the prior
    # behaviour that allowed creating a choice/matrix question without options
    # first (options are added in subsequent POST /options calls).
    config_fn = _CONFIG_VALIDATORS.get(question_type)
    if config_fn is not None and settings is not None:
        try:
            if question_type in _CHOICE_TYPES or question_type in _SPECIAL_CHOICE_TYPES:
                config_fn(settings, answer_options)
            elif question_type in _MATRIX_TYPES:
                config_fn(settings, answer_options, subquestions)
            else:
                # scalar / special scalar — no answer_options/subquestions needed
                config_fn(settings)
        except Exception as exc:
            errors.append(QuestionValidationError(field="settings", message=str(exc)))

    # --- Validation JSONB rules ---
    rule_errors = validate_validation_rules(validation, question_type)
    errors.extend(rule_errors)

    return errors


def validate_answer(
    answer: dict,
    question,
    answer_options: list | None = None,
    subquestions: list | None = None,
) -> list[QuestionValidationError]:
    """Validate a response answer against the question type, settings, and validation rules.

    Returns a list of QuestionValidationError objects.  An empty list means valid.
    """
    errors: list[QuestionValidationError] = []
    answer_options = answer_options or []
    subquestions = subquestions or []
    question_type = question.question_type

    answer_fn = _ANSWER_VALIDATORS.get(question_type)
    if answer_fn is None:
        # Unknown type — no validation possible; treat as valid.
        return errors

    try:
        if question_type in _CHOICE_TYPES or question_type in _SPECIAL_CHOICE_TYPES:
            answer_fn(answer, question, answer_options)
        elif question_type in _MATRIX_TYPES:
            answer_fn(answer, question, answer_options, subquestions)
        else:
            answer_fn(answer, question)
    except Exception as exc:
        errors.append(QuestionValidationError(field="answer", message=str(exc)))

    return errors
