"""Validators for matrix question types: matrix, matrix_dropdown, matrix_dynamic."""

from typing import Any

from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Settings validators
# ---------------------------------------------------------------------------


def _validate_common_matrix_settings(settings: dict[str, Any]) -> None:
    """Validate settings shared by matrix and matrix_dropdown types."""
    if "alternate_rows" in settings and not isinstance(settings["alternate_rows"], bool):
        raise UnprocessableError("settings.alternate_rows must be a boolean")

    if "is_all_rows_required" in settings and not isinstance(
        settings["is_all_rows_required"], bool
    ):
        raise UnprocessableError("settings.is_all_rows_required must be a boolean")

    if "randomize_rows" in settings and not isinstance(settings["randomize_rows"], bool):
        raise UnprocessableError("settings.randomize_rows must be a boolean")


def validate_matrix_settings(
    settings: dict[str, Any] | None,
    answer_options: list[Any],
    subquestions: list[Any],
) -> None:
    """Validate settings for matrix questions.

    Requires at least one subquestion (row) and one answer_option (column).
    Optional fields: alternate_rows (bool), is_all_rows_required (bool), randomize_rows (bool).
    """
    if not subquestions:
        raise UnprocessableError("matrix question requires at least one subquestion (row)")

    if not answer_options:
        raise UnprocessableError("matrix question requires at least one answer option (column)")

    if settings is None:
        return

    _validate_common_matrix_settings(settings)


def validate_matrix_dropdown_settings(
    settings: dict[str, Any] | None,
    answer_options: list[Any],
    subquestions: list[Any],
) -> None:
    """Validate settings for matrix_dropdown questions.

    Requires at least one subquestion (row) and one answer_option (column).
    Optional fields: alternate_rows (bool), is_all_rows_required (bool), randomize_rows (bool),
    column_types (dict mapping column code to type string).
    """
    if not subquestions:
        raise UnprocessableError(
            "matrix_dropdown question requires at least one subquestion (row)"
        )

    if not answer_options:
        raise UnprocessableError(
            "matrix_dropdown question requires at least one answer option (column)"
        )

    if settings is None:
        return

    _validate_common_matrix_settings(settings)

    if "column_types" in settings:
        column_types = settings["column_types"]
        if not isinstance(column_types, dict):
            raise UnprocessableError("settings.column_types must be a dict (column code -> type)")
        for col_code, col_type in column_types.items():
            if not isinstance(col_code, str):
                raise UnprocessableError(
                    "settings.column_types keys must be strings (column codes)"
                )
            if not isinstance(col_type, str):
                raise UnprocessableError(
                    f"settings.column_types['{col_code}'] must be a string (type name)"
                )


def validate_matrix_dynamic_settings(
    settings: dict[str, Any] | None,
    answer_options: list[Any],
    subquestions: list[Any],
) -> None:
    """Validate settings for matrix_dynamic questions.

    Requires at least one subquestion (row template) and one answer_option (column).
    Optional fields: min_rows (int >= 1), max_rows (int >= min_rows),
    add_row_text (str), remove_row_text (str),
    default_row_count (int within [min_rows, max_rows]).
    """
    if not subquestions:
        raise UnprocessableError(
            "matrix_dynamic question requires at least one subquestion (row)"
        )

    if not answer_options:
        raise UnprocessableError(
            "matrix_dynamic question requires at least one answer option (column)"
        )

    if settings is None:
        return

    min_rows = settings.get("min_rows")
    max_rows = settings.get("max_rows")
    default_row_count = settings.get("default_row_count")

    if min_rows is not None:
        if not isinstance(min_rows, int) or min_rows < 1:
            raise UnprocessableError("settings.min_rows must be an integer >= 1")

    if max_rows is not None:
        if not isinstance(max_rows, int) or max_rows < 1:
            raise UnprocessableError("settings.max_rows must be an integer >= 1")
        effective_min = min_rows if min_rows is not None else 1
        if max_rows < effective_min:
            raise UnprocessableError("settings.max_rows must be >= settings.min_rows")

    if default_row_count is not None:
        if not isinstance(default_row_count, int) or default_row_count < 1:
            raise UnprocessableError("settings.default_row_count must be an integer >= 1")
        effective_min = min_rows if min_rows is not None else 1
        effective_max = max_rows  # may be None (unbounded)
        if default_row_count < effective_min:
            raise UnprocessableError(
                f"settings.default_row_count ({default_row_count}) must be >= min_rows ({effective_min})"
            )
        if effective_max is not None and default_row_count > effective_max:
            raise UnprocessableError(
                f"settings.default_row_count ({default_row_count}) must be <= max_rows ({effective_max})"
            )

    if "add_row_text" in settings and not isinstance(settings["add_row_text"], str):
        raise UnprocessableError("settings.add_row_text must be a string")

    if "remove_row_text" in settings and not isinstance(settings["remove_row_text"], str):
        raise UnprocessableError("settings.remove_row_text must be a string")


# ---------------------------------------------------------------------------
# Answer validators
# ---------------------------------------------------------------------------


def validate_matrix_answer(answer: dict[str, Any], question: Any, answer_options: list[Any], subquestions: list[Any]) -> None:
    """Validate a submitted answer for a matrix question.

    answer: {"value": {"SQ001": "A1", "SQ002": "A3"}}
    Each key is a subquestion code; each value is an answer option code.
    is_all_rows_required enforces that every subquestion has a selection.
    """
    settings = question.settings or {}
    is_all_rows_required = settings.get("is_all_rows_required", False)

    value = answer.get("value")
    if not isinstance(value, dict):
        raise UnprocessableError("matrix answer 'value' must be a dict mapping subquestion codes to option codes")

    subquestion_codes = {sq.code for sq in subquestions}
    option_codes = {opt.code for opt in answer_options}

    for sq_code, opt_code in value.items():
        if sq_code not in subquestion_codes:
            raise UnprocessableError(f"'{sq_code}' is not a valid subquestion code")
        if opt_code not in option_codes:
            raise UnprocessableError(
                f"'{opt_code}' is not a valid answer option code for subquestion '{sq_code}'"
            )

    if is_all_rows_required:
        for sq_code in subquestion_codes:
            if sq_code not in value or not value[sq_code]:
                raise UnprocessableError(
                    f"All rows are required; subquestion '{sq_code}' has no selection"
                )

    if question.is_required and not value:
        raise UnprocessableError("An answer is required for this question")


def validate_matrix_dropdown_answer(
    answer: dict[str, Any], question: Any, answer_options: list[Any], subquestions: list[Any]
) -> None:
    """Validate a submitted answer for a matrix_dropdown question.

    Same structure as matrix: {"value": {"SQ001": "col_value", ...}}.
    Each column value is validated against the column_types from settings (if defined).
    """
    settings = question.settings or {}
    is_all_rows_required = settings.get("is_all_rows_required", False)

    value = answer.get("value")
    if not isinstance(value, dict):
        raise UnprocessableError(
            "matrix_dropdown answer 'value' must be a dict mapping subquestion codes to column values"
        )

    subquestion_codes = {sq.code for sq in subquestions}
    option_codes = {opt.code for opt in answer_options}

    for sq_code, col_value in value.items():
        if sq_code not in subquestion_codes:
            raise UnprocessableError(f"'{sq_code}' is not a valid subquestion code")
        if col_value not in option_codes:
            raise UnprocessableError(
                f"'{col_value}' is not a valid answer option code for subquestion '{sq_code}'"
            )

    if is_all_rows_required:
        for sq_code in subquestion_codes:
            if sq_code not in value or not value[sq_code]:
                raise UnprocessableError(
                    f"All rows are required; subquestion '{sq_code}' has no selection"
                )

    if question.is_required and not value:
        raise UnprocessableError("An answer is required for this question")


def validate_matrix_dynamic_answer(
    answer: dict[str, Any], question: Any, answer_options: list[Any], subquestions: list[Any]
) -> None:
    """Validate a submitted answer for a matrix_dynamic question.

    answer: {"value": [{"col1": "val1", "col2": "val2"}, ...]}
    Each element is a row; each key is a column code (answer_option code), each value is a cell value.
    settings.min_rows <= len(value) <= settings.max_rows.
    """
    settings = question.settings or {}
    min_rows = settings.get("min_rows", 0)
    max_rows = settings.get("max_rows")

    values = answer.get("value")
    if not isinstance(values, list):
        raise UnprocessableError("matrix_dynamic answer 'value' must be a list of row objects")

    for i, row in enumerate(values):
        if not isinstance(row, dict):
            raise UnprocessableError(f"matrix_dynamic answer 'value[{i}]' must be a dict")

    if question.is_required and not values:
        raise UnprocessableError("An answer is required for this question")

    if min_rows and len(values) < min_rows:
        raise UnprocessableError(
            f"At least {min_rows} row(s) are required; got {len(values)}"
        )

    if max_rows is not None and len(values) > max_rows:
        raise UnprocessableError(
            f"No more than {max_rows} row(s) are allowed; got {len(values)}"
        )
