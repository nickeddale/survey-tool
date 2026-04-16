"""Validators for matrix question types: matrix, matrix_single, matrix_multiple, matrix_dropdown, matrix_dynamic."""

from typing import Any

from app.utils.errors import UnprocessableError


# Valid cell types for matrix_dropdown column_types
_VALID_CELL_TYPES = frozenset({"text", "number", "boolean", "dropdown", "checkbox", "rating", "radio"})


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

    if "transpose" in settings and not isinstance(settings["transpose"], bool):
        raise UnprocessableError("settings.transpose must be a boolean")


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


def validate_matrix_multiple_settings(
    settings: dict[str, Any] | None,
    answer_options: list[Any],
    subquestions: list[Any],
) -> None:
    """Validate settings for matrix_multiple questions.

    Requires at least one subquestion (row) and one answer_option (column).
    Optional fields: alternate_rows (bool), is_all_rows_required (bool),
    randomize_rows (bool), transpose (bool).
    """
    if not subquestions:
        raise UnprocessableError(
            "matrix_multiple question requires at least one subquestion (row)"
        )

    if not answer_options:
        raise UnprocessableError(
            "matrix_multiple question requires at least one answer option (column)"
        )

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
            if col_type not in _VALID_CELL_TYPES:
                raise UnprocessableError(
                    f"settings.column_types['{col_code}'] value '{col_type}' is not a valid cell type; "
                    f"valid types: {', '.join(sorted(_VALID_CELL_TYPES))}"
                )


def validate_matrix_dynamic_settings(
    settings: dict[str, Any] | None,
    answer_options: list[Any],
    subquestions: list[Any],
) -> None:
    """Validate settings for matrix_dynamic questions.

    Requires at least one answer_option (column). Subquestions are not used —
    rows are added dynamically by respondents at response time.
    Optional fields: min_rows (int >= 1), max_rows (int >= min_rows),
    add_row_text (str), remove_row_text (str),
    default_row_count (int within [min_rows, max_rows]).
    """
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


def _validate_cell_value(sq_code: str, col_code: str, cell_type: str, cell_value: Any) -> None:
    """Validate a single cell value against its declared column type."""
    location = f"subquestion '{sq_code}', column '{col_code}'"
    if cell_type == "text":
        if not isinstance(cell_value, str):
            raise UnprocessableError(f"Cell value for {location} must be a string (cell_type=text)")
    elif cell_type == "number":
        if not isinstance(cell_value, (int, float)) or isinstance(cell_value, bool):
            raise UnprocessableError(
                f"Cell value for {location} must be a number (cell_type=number)"
            )
    elif cell_type == "boolean":
        if not isinstance(cell_value, bool):
            raise UnprocessableError(
                f"Cell value for {location} must be a boolean (cell_type=boolean)"
            )
    elif cell_type in ("dropdown", "radio"):
        if not isinstance(cell_value, str):
            raise UnprocessableError(
                f"Cell value for {location} must be a string option code (cell_type={cell_type})"
            )
    elif cell_type == "checkbox":
        if not isinstance(cell_value, list) or not all(isinstance(v, str) for v in cell_value):
            raise UnprocessableError(
                f"Cell value for {location} must be a list of strings (cell_type=checkbox)"
            )
    elif cell_type == "rating":
        if isinstance(cell_value, bool):
            raise UnprocessableError(
                f"Cell value for {location} must be a number (cell_type=rating)"
            )
        if isinstance(cell_value, str):
            try:
                float(cell_value)
            except ValueError:
                raise UnprocessableError(
                    f"Cell value for {location} must be a number (cell_type=rating)"
                )
        elif not isinstance(cell_value, (int, float)):
            raise UnprocessableError(
                f"Cell value for {location} must be a number (cell_type=rating)"
            )


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


def validate_matrix_multiple_answer(
    answer: dict[str, Any], question: Any, answer_options: list[Any], subquestions: list[Any]
) -> None:
    """Validate a submitted answer for a matrix_multiple question.

    answer: {"value": {"SQ001": ["A1", "A2"], "SQ002": ["A3"]}}
    Each key is a subquestion code; each value is a list of answer option codes.
    is_all_rows_required enforces that every subquestion has at least one selection.
    """
    settings = question.settings or {}
    is_all_rows_required = settings.get("is_all_rows_required", False)

    value = answer.get("value")
    if not isinstance(value, dict):
        raise UnprocessableError(
            "matrix_multiple answer 'value' must be a dict mapping subquestion codes to lists of option codes"
        )

    subquestion_codes = {sq.code for sq in subquestions}
    option_codes = {opt.code for opt in answer_options}

    for sq_code, selections in value.items():
        if sq_code not in subquestion_codes:
            raise UnprocessableError(f"'{sq_code}' is not a valid subquestion code")
        if not isinstance(selections, list):
            raise UnprocessableError(
                f"matrix_multiple answer value for subquestion '{sq_code}' must be a list of option codes"
            )
        for opt_code in selections:
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

    answer: {"value": {"SQ001": {"col1": "val1", "col2": "val2"}, ...}}
    Each key is a subquestion code (row); each value is a dict mapping column codes to cell values.
    Cell values are validated against column_types from settings when declared.
    is_all_rows_required enforces that every subquestion has an answer.
    """
    settings = question.settings or {}
    is_all_rows_required = settings.get("is_all_rows_required", False)
    column_types: dict[str, str] = settings.get("column_types") or {}

    value = answer.get("value")
    if not isinstance(value, dict):
        raise UnprocessableError(
            "matrix_dropdown answer 'value' must be a dict mapping subquestion codes to column value dicts"
        )

    subquestion_codes = {sq.code for sq in subquestions}
    option_codes = {opt.code for opt in answer_options}

    for sq_code, col_values in value.items():
        if sq_code not in subquestion_codes:
            raise UnprocessableError(f"'{sq_code}' is not a valid subquestion code")
        if not isinstance(col_values, dict):
            raise UnprocessableError(
                f"matrix_dropdown answer value for subquestion '{sq_code}' must be a dict mapping column codes to cell values"
            )
        for col_code, cell_value in col_values.items():
            if col_code not in option_codes:
                raise UnprocessableError(
                    f"'{col_code}' is not a valid column code for subquestion '{sq_code}'"
                )
            # Cell-level type validation against declared column_types
            cell_type = column_types.get(col_code)
            if cell_type is not None:
                _validate_cell_value(sq_code, col_code, cell_type, cell_value)

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

    answer: {"values": [{"col1": "val1", "col2": "val2"}, ...]}
    Each element is a row; each key is a column code (answer_option code), each value is a cell value.
    settings.min_rows <= len(values) <= settings.max_rows.
    """
    settings = question.settings or {}
    min_rows = settings.get("min_rows", 0)
    max_rows = settings.get("max_rows")

    values = answer.get("values")
    if not isinstance(values, list):
        raise UnprocessableError("matrix_dynamic answer 'values' must be a list of row objects")

    for i, row in enumerate(values):
        if not isinstance(row, dict):
            raise UnprocessableError(f"matrix_dynamic answer 'values[{i}]' must be a dict")

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
