"""Unit tests for matrix question type validators."""

import pytest
from unittest.mock import MagicMock

from app.services.validators.matrix_validators import (
    validate_matrix_settings,
    validate_matrix_multiple_settings,
    validate_matrix_dropdown_settings,
    validate_matrix_dynamic_settings,
    validate_matrix_answer,
    validate_matrix_multiple_answer,
    validate_matrix_dropdown_answer,
    validate_matrix_dynamic_answer,
)
from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_option(code: str):
    opt = MagicMock()
    opt.code = code
    return opt


def make_subquestion(code: str):
    sq = MagicMock()
    sq.code = code
    return sq


def make_question(is_required: bool = False, settings: dict | None = None):
    q = MagicMock()
    q.is_required = is_required
    q.settings = settings
    return q


# ---------------------------------------------------------------------------
# validate_matrix_settings
# ---------------------------------------------------------------------------


def test_matrix_settings_valid_with_subquestions_and_options():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    validate_matrix_settings(None, opts, sqs)  # no exception


def test_matrix_settings_no_subquestions_raises():
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="at least one subquestion"):
        validate_matrix_settings(None, opts, [])


def test_matrix_settings_no_options_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    with pytest.raises(UnprocessableError, match="at least one answer option"):
        validate_matrix_settings(None, [], sqs)


def test_matrix_settings_valid_all_optional_fields():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1"), make_option("A2")]
    settings = {
        "alternate_rows": True,
        "is_all_rows_required": False,
        "randomize_rows": True,
    }
    validate_matrix_settings(settings, opts, sqs)


def test_matrix_settings_invalid_alternate_rows():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="alternate_rows must be a boolean"):
        validate_matrix_settings({"alternate_rows": "yes"}, opts, sqs)


def test_matrix_settings_invalid_is_all_rows_required():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="is_all_rows_required must be a boolean"):
        validate_matrix_settings({"is_all_rows_required": 1}, opts, sqs)


def test_matrix_settings_invalid_randomize_rows():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="randomize_rows must be a boolean"):
        validate_matrix_settings({"randomize_rows": "true"}, opts, sqs)


# ---------------------------------------------------------------------------
# validate_matrix_dropdown_settings
# ---------------------------------------------------------------------------


def test_matrix_dropdown_settings_valid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    validate_matrix_dropdown_settings(None, opts, sqs)


def test_matrix_dropdown_settings_no_subquestions_raises():
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="at least one subquestion"):
        validate_matrix_dropdown_settings(None, opts, [])


def test_matrix_dropdown_settings_no_options_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    with pytest.raises(UnprocessableError, match="at least one answer option"):
        validate_matrix_dropdown_settings(None, [], sqs)


def test_matrix_dropdown_settings_valid_column_types():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    settings = {"column_types": {"A1": "text", "A2": "dropdown"}}
    validate_matrix_dropdown_settings(settings, opts, sqs)


def test_matrix_dropdown_settings_column_types_not_dict_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="column_types must be a dict"):
        validate_matrix_dropdown_settings({"column_types": ["text"]}, opts, sqs)


def test_matrix_dropdown_settings_column_types_value_not_string_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="must be a string"):
        validate_matrix_dropdown_settings({"column_types": {"A1": 42}}, opts, sqs)


def test_matrix_dropdown_settings_inherits_common_validations():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="alternate_rows must be a boolean"):
        validate_matrix_dropdown_settings({"alternate_rows": "yes"}, opts, sqs)


# ---------------------------------------------------------------------------
# validate_matrix_dynamic_settings
# ---------------------------------------------------------------------------


def test_matrix_dynamic_settings_valid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    validate_matrix_dynamic_settings(None, opts, sqs)


def test_matrix_dynamic_settings_no_subquestions_raises():
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="at least one subquestion"):
        validate_matrix_dynamic_settings(None, opts, [])


def test_matrix_dynamic_settings_no_options_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    with pytest.raises(UnprocessableError, match="at least one answer option"):
        validate_matrix_dynamic_settings(None, [], sqs)


def test_matrix_dynamic_settings_valid_all_fields():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    settings = {
        "min_rows": 1,
        "max_rows": 5,
        "default_row_count": 3,
        "add_row_text": "Add row",
        "remove_row_text": "Remove row",
    }
    validate_matrix_dynamic_settings(settings, opts, sqs)


def test_matrix_dynamic_settings_min_rows_zero_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="min_rows must be an integer >= 1"):
        validate_matrix_dynamic_settings({"min_rows": 0}, opts, sqs)


def test_matrix_dynamic_settings_min_rows_negative_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="min_rows must be an integer >= 1"):
        validate_matrix_dynamic_settings({"min_rows": -1}, opts, sqs)


def test_matrix_dynamic_settings_max_rows_less_than_min_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="max_rows must be >= settings.min_rows"):
        validate_matrix_dynamic_settings({"min_rows": 3, "max_rows": 2}, opts, sqs)


def test_matrix_dynamic_settings_max_rows_equal_min_valid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    validate_matrix_dynamic_settings({"min_rows": 3, "max_rows": 3}, opts, sqs)


def test_matrix_dynamic_settings_default_row_count_below_min_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="default_row_count.*must be >= min_rows"):
        validate_matrix_dynamic_settings(
            {"min_rows": 3, "max_rows": 5, "default_row_count": 2}, opts, sqs
        )


def test_matrix_dynamic_settings_default_row_count_above_max_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="default_row_count.*must be <= max_rows"):
        validate_matrix_dynamic_settings(
            {"min_rows": 1, "max_rows": 3, "default_row_count": 4}, opts, sqs
        )


def test_matrix_dynamic_settings_default_row_count_within_range_valid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    validate_matrix_dynamic_settings(
        {"min_rows": 1, "max_rows": 5, "default_row_count": 3}, opts, sqs
    )


def test_matrix_dynamic_settings_invalid_add_row_text():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="add_row_text must be a string"):
        validate_matrix_dynamic_settings({"add_row_text": 42}, opts, sqs)


def test_matrix_dynamic_settings_invalid_remove_row_text():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="remove_row_text must be a string"):
        validate_matrix_dynamic_settings({"remove_row_text": []}, opts, sqs)


def test_matrix_dynamic_settings_default_without_max_valid():
    """default_row_count with no max_rows set should only check against min_rows."""
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    validate_matrix_dynamic_settings({"min_rows": 2, "default_row_count": 10}, opts, sqs)


# ---------------------------------------------------------------------------
# validate_matrix_answer
# ---------------------------------------------------------------------------


def test_matrix_answer_valid():
    sqs = [make_subquestion("Q1_SQ001"), make_subquestion("Q1_SQ002")]
    opts = [make_option("A1"), make_option("A2")]
    q = make_question(is_required=False, settings={})
    validate_matrix_answer({"value": {"Q1_SQ001": "A1", "Q1_SQ002": "A2"}}, q, opts, sqs)


def test_matrix_answer_empty_not_required():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    validate_matrix_answer({"value": {}}, q, opts, sqs)


def test_matrix_answer_empty_required_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_matrix_answer({"value": {}}, q, opts, sqs)


def test_matrix_answer_invalid_subquestion_code():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid subquestion code"):
        validate_matrix_answer({"value": {"INVALID_SQ": "A1"}}, q, opts, sqs)


def test_matrix_answer_invalid_option_code():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid answer option code"):
        validate_matrix_answer({"value": {"Q1_SQ001": "INVALID"}}, q, opts, sqs)


def test_matrix_answer_not_dict_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a dict"):
        validate_matrix_answer({"value": "A1"}, q, opts, sqs)


def test_matrix_answer_is_all_rows_required_enforced():
    sqs = [make_subquestion("Q1_SQ001"), make_subquestion("Q1_SQ002")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={"is_all_rows_required": True})
    with pytest.raises(UnprocessableError, match="All rows are required"):
        # Only one of two subquestions answered
        validate_matrix_answer({"value": {"Q1_SQ001": "A1"}}, q, opts, sqs)


def test_matrix_answer_is_all_rows_required_satisfied():
    sqs = [make_subquestion("Q1_SQ001"), make_subquestion("Q1_SQ002")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={"is_all_rows_required": True})
    validate_matrix_answer(
        {"value": {"Q1_SQ001": "A1", "Q1_SQ002": "A1"}}, q, opts, sqs
    )


# ---------------------------------------------------------------------------
# validate_matrix_dropdown_answer
# ---------------------------------------------------------------------------


def test_matrix_dropdown_answer_valid():
    # Updated to use nested response shape: {sq_code: {col_code: cell_value}}
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1"), make_option("A2")]
    q = make_question(is_required=False, settings={})
    validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"A1": "some_val"}}}, q, opts, sqs)


def test_matrix_dropdown_answer_invalid_sq_code():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid subquestion code"):
        validate_matrix_dropdown_answer({"value": {"BAD_SQ": {"A1": "val"}}}, q, opts, sqs)


def test_matrix_dropdown_answer_invalid_option_code():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid column code"):
        validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"BAD_OPT": "val"}}}, q, opts, sqs)


def test_matrix_dropdown_answer_all_rows_required():
    sqs = [make_subquestion("Q1_SQ001"), make_subquestion("Q1_SQ002")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={"is_all_rows_required": True})
    with pytest.raises(UnprocessableError, match="All rows are required"):
        validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"A1": "val"}}}, q, opts, sqs)


def test_matrix_dropdown_answer_not_dict_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a dict"):
        validate_matrix_dropdown_answer({"value": [{"Q1_SQ001": "A1"}]}, q, opts, sqs)


# ---------------------------------------------------------------------------
# validate_matrix_dynamic_answer
# ---------------------------------------------------------------------------


def test_matrix_dynamic_answer_valid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1"), make_option("col2")]
    q = make_question(is_required=False, settings={})
    validate_matrix_dynamic_answer(
        {"values": [{"col1": "val1", "col2": "val2"}]}, q, opts, sqs
    )


def test_matrix_dynamic_answer_empty_not_required():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={})
    validate_matrix_dynamic_answer({"values": []}, q, opts, sqs)


def test_matrix_dynamic_answer_empty_required_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_matrix_dynamic_answer({"values": []}, q, opts, sqs)


def test_matrix_dynamic_answer_not_list_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a list"):
        validate_matrix_dynamic_answer({"values": {"col1": "val1"}}, q, opts, sqs)


def test_matrix_dynamic_answer_row_not_dict_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a dict"):
        validate_matrix_dynamic_answer({"values": ["not_a_dict"]}, q, opts, sqs)


def test_matrix_dynamic_answer_below_min_rows_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"min_rows": 3})
    with pytest.raises(UnprocessableError, match="At least 3 row"):
        validate_matrix_dynamic_answer({"values": [{"col1": "v"}]}, q, opts, sqs)


def test_matrix_dynamic_answer_above_max_rows_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"max_rows": 2})
    with pytest.raises(UnprocessableError, match="No more than 2 row"):
        validate_matrix_dynamic_answer(
            {"values": [{"col1": "v"}, {"col1": "v"}, {"col1": "v"}]}, q, opts, sqs
        )


def test_matrix_dynamic_answer_within_range_valid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"min_rows": 1, "max_rows": 5})
    validate_matrix_dynamic_answer(
        {"values": [{"col1": "v1"}, {"col1": "v2"}]}, q, opts, sqs
    )


# ---------------------------------------------------------------------------
# validate_matrix_multiple_settings
# ---------------------------------------------------------------------------


def test_matrix_multiple_settings_valid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    validate_matrix_multiple_settings(None, opts, sqs)  # no exception


def test_matrix_multiple_settings_no_subquestions_raises():
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="at least one subquestion"):
        validate_matrix_multiple_settings(None, opts, [])


def test_matrix_multiple_settings_no_options_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    with pytest.raises(UnprocessableError, match="at least one answer option"):
        validate_matrix_multiple_settings(None, [], sqs)


def test_matrix_multiple_settings_valid_all_fields():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1"), make_option("A2")]
    settings = {
        "alternate_rows": True,
        "is_all_rows_required": False,
        "randomize_rows": True,
        "transpose": False,
    }
    validate_matrix_multiple_settings(settings, opts, sqs)


def test_matrix_multiple_settings_invalid_transpose():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="transpose must be a boolean"):
        validate_matrix_multiple_settings({"transpose": "yes"}, opts, sqs)


# ---------------------------------------------------------------------------
# validate_matrix_multiple_answer
# ---------------------------------------------------------------------------


def test_matrix_multiple_answer_valid():
    sqs = [make_subquestion("Q1_SQ001"), make_subquestion("Q1_SQ002")]
    opts = [make_option("A1"), make_option("A2")]
    q = make_question(is_required=False, settings={})
    validate_matrix_multiple_answer(
        {"value": {"Q1_SQ001": ["A1", "A2"], "Q1_SQ002": ["A1"]}}, q, opts, sqs
    )


def test_matrix_multiple_answer_empty_not_required():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    validate_matrix_multiple_answer({"value": {}}, q, opts, sqs)


def test_matrix_multiple_answer_empty_required_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_matrix_multiple_answer({"value": {}}, q, opts, sqs)


def test_matrix_multiple_answer_not_dict_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a dict"):
        validate_matrix_multiple_answer({"value": "A1"}, q, opts, sqs)


def test_matrix_multiple_answer_value_not_list_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a list of option codes"):
        validate_matrix_multiple_answer({"value": {"Q1_SQ001": "A1"}}, q, opts, sqs)


def test_matrix_multiple_answer_invalid_subquestion_code():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid subquestion code"):
        validate_matrix_multiple_answer({"value": {"INVALID_SQ": ["A1"]}}, q, opts, sqs)


def test_matrix_multiple_answer_invalid_option_code():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid answer option code"):
        validate_matrix_multiple_answer({"value": {"Q1_SQ001": ["INVALID"]}}, q, opts, sqs)


def test_matrix_multiple_answer_all_rows_required_enforced():
    sqs = [make_subquestion("Q1_SQ001"), make_subquestion("Q1_SQ002")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={"is_all_rows_required": True})
    with pytest.raises(UnprocessableError, match="All rows are required"):
        # Only one of two subquestions answered
        validate_matrix_multiple_answer({"value": {"Q1_SQ001": ["A1"]}}, q, opts, sqs)


def test_matrix_multiple_answer_all_rows_required_satisfied():
    sqs = [make_subquestion("Q1_SQ001"), make_subquestion("Q1_SQ002")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={"is_all_rows_required": True})
    validate_matrix_multiple_answer(
        {"value": {"Q1_SQ001": ["A1"], "Q1_SQ002": ["A1"]}}, q, opts, sqs
    )


def test_matrix_multiple_answer_empty_list_fails_all_rows_required():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    q = make_question(is_required=False, settings={"is_all_rows_required": True})
    with pytest.raises(UnprocessableError, match="All rows are required"):
        validate_matrix_multiple_answer({"value": {"Q1_SQ001": []}}, q, opts, sqs)


# ---------------------------------------------------------------------------
# validate_matrix_dropdown_answer — updated nested shape
# ---------------------------------------------------------------------------


def test_matrix_dropdown_answer_nested_valid():
    sqs = [make_subquestion("Q1_SQ001"), make_subquestion("Q1_SQ002")]
    opts = [make_option("col1"), make_option("col2")]
    q = make_question(is_required=False, settings={})
    validate_matrix_dropdown_answer(
        {"value": {"Q1_SQ001": {"col1": "text_val", "col2": "other_val"}}}, q, opts, sqs
    )


def test_matrix_dropdown_answer_not_dict_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a dict"):
        validate_matrix_dropdown_answer({"value": "not_a_dict"}, q, opts, sqs)


def test_matrix_dropdown_answer_row_value_not_dict_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a dict mapping column codes"):
        validate_matrix_dropdown_answer({"value": {"Q1_SQ001": "flat_val"}}, q, opts, sqs)


def test_matrix_dropdown_answer_invalid_subquestion_code_nested():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid subquestion code"):
        validate_matrix_dropdown_answer({"value": {"BAD_SQ": {"col1": "val"}}}, q, opts, sqs)


def test_matrix_dropdown_answer_invalid_column_code():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid column code"):
        validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"bad_col": "val"}}}, q, opts, sqs)


def test_matrix_dropdown_answer_cell_type_validation_text():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"column_types": {"col1": "text"}})
    with pytest.raises(UnprocessableError, match="must be a string"):
        validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"col1": 42}}}, q, opts, sqs)


def test_matrix_dropdown_answer_cell_type_validation_number_valid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"column_types": {"col1": "number"}})
    validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"col1": 3.14}}}, q, opts, sqs)


def test_matrix_dropdown_answer_cell_type_validation_number_invalid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"column_types": {"col1": "number"}})
    with pytest.raises(UnprocessableError, match="must be a number"):
        validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"col1": "not_a_number"}}}, q, opts, sqs)


def test_matrix_dropdown_answer_cell_type_boolean_invalid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"column_types": {"col1": "boolean"}})
    with pytest.raises(UnprocessableError, match="must be a boolean"):
        validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"col1": "yes"}}}, q, opts, sqs)


def test_matrix_dropdown_answer_cell_type_checkbox_invalid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"column_types": {"col1": "checkbox"}})
    with pytest.raises(UnprocessableError, match="must be a list of strings"):
        validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"col1": "single_val"}}}, q, opts, sqs)


def test_matrix_dropdown_answer_cell_type_checkbox_valid():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"column_types": {"col1": "checkbox"}})
    validate_matrix_dropdown_answer({"value": {"Q1_SQ001": {"col1": ["A", "B"]}}}, q, opts, sqs)


def test_matrix_dropdown_answer_all_rows_required_nested():
    sqs = [make_subquestion("Q1_SQ001"), make_subquestion("Q1_SQ002")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={"is_all_rows_required": True})
    with pytest.raises(UnprocessableError, match="All rows are required"):
        validate_matrix_dropdown_answer(
            {"value": {"Q1_SQ001": {"col1": "val"}}}, q, opts, sqs
        )


def test_matrix_dropdown_answer_empty_not_required():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=False, settings={})
    validate_matrix_dropdown_answer({"value": {}}, q, opts, sqs)


def test_matrix_dropdown_answer_empty_required_raises():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("col1")]
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_matrix_dropdown_answer({"value": {}}, q, opts, sqs)


# ---------------------------------------------------------------------------
# validate_matrix_dropdown_settings — column_types valid type check
# ---------------------------------------------------------------------------


def test_matrix_dropdown_settings_column_types_invalid_cell_type():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="not a valid cell type"):
        validate_matrix_dropdown_settings({"column_types": {"A1": "invalid_type"}}, opts, sqs)


def test_matrix_dropdown_settings_column_types_valid_all_types():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    for cell_type in ("text", "number", "boolean", "dropdown", "checkbox", "rating", "radio"):
        validate_matrix_dropdown_settings({"column_types": {"A1": cell_type}}, opts, sqs)


# ---------------------------------------------------------------------------
# validate_matrix_settings — transpose support
# ---------------------------------------------------------------------------


def test_matrix_settings_valid_with_transpose():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    validate_matrix_settings({"transpose": True}, opts, sqs)


def test_matrix_settings_invalid_transpose():
    sqs = [make_subquestion("Q1_SQ001")]
    opts = [make_option("A1")]
    with pytest.raises(UnprocessableError, match="transpose must be a boolean"):
        validate_matrix_settings({"transpose": "yes"}, opts, sqs)
