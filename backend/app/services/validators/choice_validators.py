"""Validators for choice-based question types: single_choice (radio), dropdown, multiple_choice (checkbox)."""

from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Settings validators
# ---------------------------------------------------------------------------


def validate_radio_settings(settings: dict | None, answer_options: list) -> None:
    """Validate settings for single_choice (radio) questions.

    Requires at least one answer_option.
    Optional fields: has_other (bool), other_text (str), randomize (bool), columns (int 1-4).
    """
    if not answer_options:
        raise UnprocessableError("single_choice question requires at least one answer option")

    if settings is None:
        return

    if "has_other" in settings and not isinstance(settings["has_other"], bool):
        raise UnprocessableError("settings.has_other must be a boolean")

    if "other_text" in settings and not isinstance(settings["other_text"], str):
        raise UnprocessableError("settings.other_text must be a string")

    if "randomize" in settings and not isinstance(settings["randomize"], bool):
        raise UnprocessableError("settings.randomize must be a boolean")

    if "columns" in settings:
        columns = settings["columns"]
        if not isinstance(columns, int) or not (1 <= columns <= 4):
            raise UnprocessableError("settings.columns must be an integer between 1 and 4")


def validate_dropdown_settings(settings: dict | None, answer_options: list) -> None:
    """Validate settings for dropdown questions.

    Requires at least one answer_option.
    Optional fields: placeholder (str), searchable (bool), has_other (bool), other_text (str).
    """
    if not answer_options:
        raise UnprocessableError("dropdown question requires at least one answer option")

    if settings is None:
        return

    if "placeholder" in settings and not isinstance(settings["placeholder"], str):
        raise UnprocessableError("settings.placeholder must be a string")

    if "searchable" in settings and not isinstance(settings["searchable"], bool):
        raise UnprocessableError("settings.searchable must be a boolean")

    if "has_other" in settings and not isinstance(settings["has_other"], bool):
        raise UnprocessableError("settings.has_other must be a boolean")

    if "other_text" in settings and not isinstance(settings["other_text"], str):
        raise UnprocessableError("settings.other_text must be a string")


def validate_checkbox_settings(settings: dict | None, answer_options: list) -> None:
    """Validate settings for multiple_choice (checkbox) questions.

    Requires at least one answer_option.
    Optional fields: has_other (bool), other_text (str), randomize (bool), columns (int 1-4),
    select_all (bool), select_all_text (str), min_choices (int >= 1), max_choices (int >= min_choices).
    min_choices must not exceed the number of answer_options.
    """
    if not answer_options:
        raise UnprocessableError("multiple_choice question requires at least one answer option")

    if settings is None:
        return

    if "has_other" in settings and not isinstance(settings["has_other"], bool):
        raise UnprocessableError("settings.has_other must be a boolean")

    if "other_text" in settings and not isinstance(settings["other_text"], str):
        raise UnprocessableError("settings.other_text must be a string")

    if "randomize" in settings and not isinstance(settings["randomize"], bool):
        raise UnprocessableError("settings.randomize must be a boolean")

    if "columns" in settings:
        columns = settings["columns"]
        if not isinstance(columns, int) or not (1 <= columns <= 4):
            raise UnprocessableError("settings.columns must be an integer between 1 and 4")

    if "select_all" in settings and not isinstance(settings["select_all"], bool):
        raise UnprocessableError("settings.select_all must be a boolean")

    if "select_all_text" in settings and not isinstance(settings["select_all_text"], str):
        raise UnprocessableError("settings.select_all_text must be a string")

    min_choices = settings.get("min_choices")
    max_choices = settings.get("max_choices")

    if min_choices is not None:
        if not isinstance(min_choices, int) or min_choices < 1:
            raise UnprocessableError("settings.min_choices must be an integer >= 1")
        if min_choices > len(answer_options):
            raise UnprocessableError(
                f"settings.min_choices ({min_choices}) exceeds the number of answer options ({len(answer_options)})"
            )

    if max_choices is not None:
        if not isinstance(max_choices, int) or max_choices < 1:
            raise UnprocessableError("settings.max_choices must be an integer >= 1")
        if min_choices is not None and max_choices < min_choices:
            raise UnprocessableError(
                "settings.max_choices must be >= settings.min_choices"
            )


# ---------------------------------------------------------------------------
# Answer validators
# ---------------------------------------------------------------------------


def validate_radio_answer(answer: dict, question, answer_options: list) -> None:
    """Validate a submitted answer for a single_choice (radio) question.

    answer: dict with keys 'value' (str|None) and optionally 'other_value' (str).
    """
    settings = question.settings or {}
    has_other = settings.get("has_other", False)
    option_codes = {opt.code for opt in answer_options}

    value = answer.get("value")

    if question.is_required and not value:
        raise UnprocessableError("An answer is required for this question")

    if value is None:
        return

    if value == "other":
        if not has_other:
            raise UnprocessableError("'other' is not a valid option for this question")
        other_value = answer.get("other_value", "")
        if not other_value or not other_value.strip():
            raise UnprocessableError("other_value is required when selecting 'other'")
    elif value not in option_codes:
        raise UnprocessableError(f"'{value}' is not a valid answer option code")


def validate_dropdown_answer(answer: dict, question, answer_options: list) -> None:
    """Validate a submitted answer for a dropdown question.

    Follows the same logic as validate_radio_answer.
    """
    validate_radio_answer(answer, question, answer_options)


def validate_checkbox_answer(answer: dict, question, answer_options: list) -> None:
    """Validate a submitted answer for a multiple_choice (checkbox) question.

    answer: dict with key 'values' (list of str) and optionally 'other_value' (str).
    """
    settings = question.settings or {}
    has_other = settings.get("has_other", False)
    min_choices = settings.get("min_choices")
    max_choices = settings.get("max_choices")
    option_codes = {opt.code for opt in answer_options}

    values = answer.get("values", [])
    if not isinstance(values, list):
        raise UnprocessableError("Answer values must be a list")

    if question.is_required and not values:
        raise UnprocessableError("At least one answer is required for this question")

    for val in values:
        if val == "other":
            if not has_other:
                raise UnprocessableError("'other' is not a valid option for this question")
            other_value = answer.get("other_value", "")
            if not other_value or not other_value.strip():
                raise UnprocessableError("other_value is required when selecting 'other'")
        elif val not in option_codes:
            raise UnprocessableError(f"'{val}' is not a valid answer option code")

    # Count non-other selections for min/max enforcement
    non_other_count = len([v for v in values if v != "other"])
    total_count = len(values)

    if min_choices is not None and total_count < min_choices:
        raise UnprocessableError(
            f"At least {min_choices} answer(s) must be selected"
        )

    if max_choices is not None and total_count > max_choices:
        raise UnprocessableError(
            f"No more than {max_choices} answer(s) can be selected"
        )
