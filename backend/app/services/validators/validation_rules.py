"""Validator for the `validation` JSONB field common to all question types.

Validates the structure and types of the {min, max, regex, min_length,
max_length, custom_expression} rules dict stored in Question.validation.
"""

from typing import Any

from app.services.validators._types import QuestionValidationError
from app.services.validators.regex_utils import validate_regex_complexity

# Keys allowed in the validation JSONB field.
_ALLOWED_KEYS = frozenset(
    {"min", "max", "regex", "min_length", "max_length", "custom_expression"}
)


def validate_validation_rules(
    validation: dict[str, Any] | None,
    question_type: str,  # reserved for future per-type constraints
) -> list[QuestionValidationError]:
    """Validate the `validation` JSONB dict.

    Rules:
    - Only keys in _ALLOWED_KEYS are permitted.
    - min / max must be int or float.
    - min_length / max_length must be int >= 0.
    - regex must be a string and must compile as a valid regular expression.
    - custom_expression must be a string and must be syntactically parseable
      by Python's ast.parse (semantic evaluation is deferred to M5).
    - min <= max when both are present.
    - min_length <= max_length when both are present.
    """
    if validation is None:
        return []

    if not isinstance(validation, dict):
        return [
            QuestionValidationError(
                field="validation",
                message="validation must be a JSON object (dict)",
            )
        ]

    errors: list[QuestionValidationError] = []

    # --- Unknown keys ---
    unknown = set(validation.keys()) - _ALLOWED_KEYS
    for key in sorted(unknown):
        errors.append(
            QuestionValidationError(
                field=f"validation.{key}",
                message=f"'{key}' is not a recognised validation rule key",
            )
        )

    # --- min ---
    min_val = validation.get("min")
    if min_val is not None:
        if not isinstance(min_val, (int, float)) or isinstance(min_val, bool):
            errors.append(
                QuestionValidationError(
                    field="validation.min",
                    message="validation.min must be a number",
                )
            )
            min_val = None  # prevent further comparisons with bad value

    # --- max ---
    max_val = validation.get("max")
    if max_val is not None:
        if not isinstance(max_val, (int, float)) or isinstance(max_val, bool):
            errors.append(
                QuestionValidationError(
                    field="validation.max",
                    message="validation.max must be a number",
                )
            )
            max_val = None

    # --- min <= max ---
    if min_val is not None and max_val is not None and min_val > max_val:
        errors.append(
            QuestionValidationError(
                field="validation.min",
                message=f"validation.min ({min_val}) must be <= validation.max ({max_val})",
            )
        )

    # --- min_length ---
    min_length = validation.get("min_length")
    if min_length is not None:
        if not isinstance(min_length, int) or isinstance(min_length, bool) or min_length < 0:
            errors.append(
                QuestionValidationError(
                    field="validation.min_length",
                    message="validation.min_length must be an integer >= 0",
                )
            )
            min_length = None

    # --- max_length ---
    max_length = validation.get("max_length")
    if max_length is not None:
        if not isinstance(max_length, int) or isinstance(max_length, bool) or max_length < 0:
            errors.append(
                QuestionValidationError(
                    field="validation.max_length",
                    message="validation.max_length must be an integer >= 0",
                )
            )
            max_length = None

    # --- min_length <= max_length ---
    if min_length is not None and max_length is not None and min_length > max_length:
        errors.append(
            QuestionValidationError(
                field="validation.min_length",
                message=(
                    f"validation.min_length ({min_length}) must be <= "
                    f"validation.max_length ({max_length})"
                ),
            )
        )

    # --- regex ---
    regex_val = validation.get("regex")
    if regex_val is not None:
        if not isinstance(regex_val, str):
            errors.append(
                QuestionValidationError(
                    field="validation.regex",
                    message="validation.regex must be a string",
                )
            )
        else:
            # Validate syntax and reject known-dangerous patterns (ReDoS protection).
            errors.extend(validate_regex_complexity(regex_val))

    # --- custom_expression ---
    expr_val = validation.get("custom_expression")
    if expr_val is not None:
        if not isinstance(expr_val, str):
            errors.append(
                QuestionValidationError(
                    field="validation.custom_expression",
                    message="validation.custom_expression must be a string",
                )
            )
        else:
            try:
                import ast
                ast.parse(expr_val, mode="eval")
            except SyntaxError as exc:
                errors.append(
                    QuestionValidationError(
                        field="validation.custom_expression",
                        message=(
                            f"validation.custom_expression has invalid syntax: {exc}"
                        ),
                    )
                )

    return errors
