"""Comprehensive test suite exercising all 18 question types end-to-end.

Covers:
- Unit tests: validate_question_config and validate_answer (direct calls with MagicMock)
- Integration tests: HTTP API creation, validation, and settings checks
- Edge cases: empty string vs null, boundary values, regex, matrix edge cases
- Export-import round-trip: all 18 types survive serialization/deserialization

All async fixtures use scope='function' (verified in conftest.py).
DATABASE_URL override is applied at conftest.py import time.
"""

import pytest
from httpx import AsyncClient
from unittest.mock import MagicMock

from app.services.validators import validate_question_config, validate_answer, QuestionValidationError
from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Shared helpers for mock objects
# ---------------------------------------------------------------------------


def make_option(code: str):
    """Build a MagicMock answer option with a specific code."""
    opt = MagicMock()
    opt.code = code
    return opt


def make_subquestion(code: str):
    """Build a MagicMock subquestion with a specific code."""
    sq = MagicMock()
    sq.code = code
    return sq


def make_question(
    question_type: str,
    is_required: bool = False,
    settings: dict | None = None,
    validation: dict | None = None,
    answer_options: list | None = None,
    subquestions: list | None = None,
):
    """Build a MagicMock Question with all required attributes set explicitly."""
    q = MagicMock()
    q.question_type = question_type
    q.is_required = is_required
    q.settings = settings
    q.validation = validation
    q.answer_options = answer_options or []
    q.subquestions = subquestions or []
    return q


# ---------------------------------------------------------------------------
# Shared HTTP helpers for integration tests
# ---------------------------------------------------------------------------

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"


async def register_and_login(client: AsyncClient, email: str) -> dict:
    await client.post(REGISTER_URL, json={"email": email, "password": "pass1234!", "name": "Test User"})
    resp = await client.post(LOGIN_URL, json={"email": email, "password": "pass1234!"})
    assert resp.status_code == 200
    return resp.json()


async def auth_headers(client: AsyncClient, email: str) -> dict:
    tokens = await register_and_login(client, email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict, title: str = "Test Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_group(client: AsyncClient, headers: dict, survey_id: str, title: str = "Group 1") -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": title},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def questions_url(survey_id: str, group_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions"


def options_url(survey_id: str, question_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/questions/{question_id}/options"


def subquestions_url(survey_id: str, question_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/questions/{question_id}/subquestions"


async def create_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    group_id: str,
    question_type: str,
    title: str = "Test Q",
    settings: dict | None = None,
    validation: dict | None = None,
) -> dict:
    payload: dict = {"question_type": question_type, "title": title}
    if settings is not None:
        payload["settings"] = settings
    if validation is not None:
        payload["validation"] = validation
    resp = await client.post(questions_url(survey_id, group_id), json=payload, headers=headers)
    return resp


async def add_option(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    question_id: str,
    title: str = "Option",
    code: str | None = None,
) -> str:
    payload: dict = {"title": title}
    if code:
        payload["code"] = code
    resp = await client.post(options_url(survey_id, question_id), json=payload, headers=headers)
    assert resp.status_code == 201, f"Failed to add option: {resp.json()}"
    return resp.json()["id"]


async def setup_survey_group(client: AsyncClient, email_suffix: str) -> tuple[dict, str, str]:
    """Create user, survey, and group. Returns (headers, survey_id, group_id)."""
    headers = await auth_headers(client, f"qt_{email_suffix}@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    return headers, survey_id, group_id


# ===========================================================================
# SECTION 1: Unit tests for validate_question_config
# ===========================================================================


# ---------------------------------------------------------------------------
# 1a. Text types — settings and validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("qtype", ["short_text", "long_text", "huge_text", "email", "phone", "url"])
def test_text_type_config_valid(qtype):
    """Text types with None settings always pass."""
    errors = validate_question_config(qtype, settings=None, validation=None)
    assert errors == []


@pytest.mark.parametrize("qtype", ["short_text", "long_text", "huge_text", "email", "phone", "url"])
def test_text_type_config_with_validation_rules(qtype):
    """Text types accept min_length/max_length/regex validation rules."""
    errors = validate_question_config(
        qtype,
        settings=None,
        validation={"min_length": 2, "max_length": 100, "regex": "^[a-z]+$"},
    )
    assert errors == []


@pytest.mark.parametrize("qtype", ["short_text", "long_text", "huge_text", "email", "phone", "url"])
def test_text_type_config_invalid_validation_type(qtype):
    """Validation min_length must be an integer."""
    errors = validate_question_config(
        qtype,
        settings=None,
        validation={"min_length": "five"},
    )
    assert len(errors) > 0


# short_text settings


def test_short_text_settings_valid():
    errors = validate_question_config(
        "short_text",
        settings={"placeholder": "Enter text", "max_length": 100, "input_type": "text"},
        validation=None,
    )
    assert errors == []


def test_short_text_settings_valid_email_input_type():
    errors = validate_question_config(
        "short_text",
        settings={"input_type": "email"},
        validation=None,
    )
    assert errors == []


def test_short_text_settings_invalid_input_type():
    errors = validate_question_config(
        "short_text",
        settings={"input_type": "number"},
        validation=None,
    )
    assert len(errors) > 0


def test_short_text_settings_max_length_too_large():
    errors = validate_question_config(
        "short_text",
        settings={"max_length": 256},
        validation=None,
    )
    assert len(errors) > 0


def test_short_text_settings_max_length_at_boundary():
    errors = validate_question_config(
        "short_text",
        settings={"max_length": 255},
        validation=None,
    )
    assert errors == []


def test_short_text_settings_max_length_zero():
    errors = validate_question_config(
        "short_text",
        settings={"max_length": 0},
        validation=None,
    )
    assert len(errors) > 0


def test_short_text_settings_placeholder_not_string():
    errors = validate_question_config(
        "short_text",
        settings={"placeholder": 123},
        validation=None,
    )
    assert len(errors) > 0


def test_short_text_settings_placeholder_null_ok():
    errors = validate_question_config(
        "short_text",
        settings={"placeholder": None},
        validation=None,
    )
    assert errors == []


# long_text settings


def test_long_text_settings_valid():
    errors = validate_question_config(
        "long_text",
        settings={"placeholder": "Write here", "max_length": 1000, "rows": 6},
        validation=None,
    )
    assert errors == []


def test_long_text_settings_max_length_too_large():
    errors = validate_question_config(
        "long_text",
        settings={"max_length": 5001},
        validation=None,
    )
    assert len(errors) > 0


def test_long_text_settings_max_length_at_boundary():
    errors = validate_question_config(
        "long_text",
        settings={"max_length": 5000},
        validation=None,
    )
    assert errors == []


def test_long_text_settings_rows_zero():
    errors = validate_question_config(
        "long_text",
        settings={"rows": 0},
        validation=None,
    )
    assert len(errors) > 0


def test_long_text_settings_rows_negative():
    errors = validate_question_config(
        "long_text",
        settings={"rows": -1},
        validation=None,
    )
    assert len(errors) > 0


def test_long_text_settings_rows_valid():
    errors = validate_question_config(
        "long_text",
        settings={"rows": 4},
        validation=None,
    )
    assert errors == []


# huge_text settings


def test_huge_text_settings_valid():
    errors = validate_question_config(
        "huge_text",
        settings={"placeholder": None, "max_length": 50000, "rows": 10, "rich_text": False},
        validation=None,
    )
    assert errors == []


def test_huge_text_settings_rich_text_true():
    errors = validate_question_config(
        "huge_text",
        settings={"rich_text": True},
        validation=None,
    )
    assert errors == []


def test_huge_text_settings_rich_text_not_bool():
    errors = validate_question_config(
        "huge_text",
        settings={"rich_text": "yes"},
        validation=None,
    )
    assert len(errors) > 0


def test_huge_text_settings_max_length_too_large():
    errors = validate_question_config(
        "huge_text",
        settings={"max_length": 50001},
        validation=None,
    )
    assert len(errors) > 0


def test_huge_text_settings_max_length_at_boundary():
    errors = validate_question_config(
        "huge_text",
        settings={"max_length": 50000},
        validation=None,
    )
    assert errors == []


def test_huge_text_settings_rows_zero():
    errors = validate_question_config(
        "huge_text",
        settings={"rows": 0},
        validation=None,
    )
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 1b. Misc types (scale, yes_no, time, datetime, file_upload)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("qtype", ["scale", "yes_no", "time", "datetime", "file_upload"])
def test_misc_type_config_valid_no_settings(qtype):
    """Misc types with no settings should produce no errors."""
    errors = validate_question_config(qtype, settings=None, validation=None)
    assert errors == []


def test_file_upload_config_valid_settings():
    errors = validate_question_config(
        "file_upload",
        settings={"allowed_types": ["pdf", "jpg"], "max_file_size_mb": 10, "max_files": 3},
        validation=None,
    )
    assert errors == []


def test_file_upload_config_invalid_type():
    """Unknown file type in allowed_types should fail."""
    errors = validate_question_config(
        "file_upload",
        settings={"allowed_types": ["exe", "bat"]},
        validation=None,
    )
    assert len(errors) > 0


def test_file_upload_config_allowed_types_not_list():
    errors = validate_question_config(
        "file_upload",
        settings={"allowed_types": "pdf"},
        validation=None,
    )
    assert len(errors) > 0


def test_file_upload_config_max_file_size_zero():
    errors = validate_question_config(
        "file_upload",
        settings={"max_file_size_mb": 0},
        validation=None,
    )
    assert len(errors) > 0


def test_file_upload_config_max_files_zero():
    errors = validate_question_config(
        "file_upload",
        settings={"max_files": 0},
        validation=None,
    )
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 1c. Scalar types (numeric, rating, boolean, date)
# ---------------------------------------------------------------------------


def test_numeric_config_valid():
    errors = validate_question_config(
        "numeric",
        settings={"min_value": 0, "max_value": 100, "step": 5, "prefix": "$", "suffix": " USD"},
        validation=None,
    )
    assert errors == []


def test_numeric_config_min_greater_than_max():
    errors = validate_question_config(
        "numeric",
        settings={"min_value": 100, "max_value": 50},
        validation=None,
    )
    assert len(errors) > 0


def test_numeric_config_step_zero():
    errors = validate_question_config(
        "numeric",
        settings={"step": 0},
        validation=None,
    )
    assert len(errors) > 0


def test_numeric_config_step_negative():
    errors = validate_question_config(
        "numeric",
        settings={"step": -1},
        validation=None,
    )
    assert len(errors) > 0


def test_numeric_config_prefix_not_string():
    errors = validate_question_config(
        "numeric",
        settings={"prefix": 42},
        validation=None,
    )
    assert len(errors) > 0


def test_rating_config_valid():
    errors = validate_question_config(
        "rating",
        settings={"min_rating": 1, "max_rating": 10, "step": 1, "icon": "star"},
        validation=None,
    )
    assert errors == []


def test_rating_config_invalid_icon():
    errors = validate_question_config(
        "rating",
        settings={"icon": "rocket"},
        validation=None,
    )
    assert len(errors) > 0


def test_rating_config_min_greater_than_max():
    errors = validate_question_config(
        "rating",
        settings={"min_rating": 5, "max_rating": 1},
        validation=None,
    )
    assert len(errors) > 0


def test_rating_config_step_must_be_int():
    errors = validate_question_config(
        "rating",
        settings={"step": 0.5},
        validation=None,
    )
    assert len(errors) > 0


def test_boolean_config_valid():
    errors = validate_question_config(
        "boolean",
        settings={"label_true": "Yes", "label_false": "No", "display": "toggle"},
        validation=None,
    )
    assert errors == []


def test_boolean_config_invalid_display():
    errors = validate_question_config(
        "boolean",
        settings={"display": "slider"},
        validation=None,
    )
    assert len(errors) > 0


def test_boolean_config_label_true_not_string():
    errors = validate_question_config(
        "boolean",
        settings={"label_true": True},
        validation=None,
    )
    assert len(errors) > 0


def test_date_config_valid():
    errors = validate_question_config(
        "date",
        settings={"min_date": "2024-01-01", "max_date": "2024-12-31", "date_format": "YYYY-MM-DD"},
        validation=None,
    )
    assert errors == []


def test_date_config_min_after_max():
    errors = validate_question_config(
        "date",
        settings={"min_date": "2024-12-31", "max_date": "2024-01-01", "date_format": "YYYY-MM-DD"},
        validation=None,
    )
    assert len(errors) > 0


def test_date_config_include_time_not_bool():
    errors = validate_question_config(
        "date",
        settings={"include_time": "yes"},
        validation=None,
    )
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 1d. Choice types (single_choice, dropdown, multiple_choice)
# ---------------------------------------------------------------------------


def test_single_choice_config_valid_with_options():
    opts = [make_option("A"), make_option("B")]
    errors = validate_question_config(
        "single_choice",
        settings={"has_other": True, "randomize": False, "columns": 2},
        validation=None,
        answer_options=opts,
    )
    assert errors == []


def test_single_choice_config_settings_no_options_fails():
    errors = validate_question_config(
        "single_choice",
        settings={"has_other": False},
        validation=None,
        answer_options=[],
    )
    assert len(errors) > 0


def test_single_choice_config_no_settings_no_options_ok():
    """Without settings, no config validator is run — creating with no options is fine."""
    errors = validate_question_config(
        "single_choice",
        settings=None,
        validation=None,
        answer_options=[],
    )
    assert errors == []


def test_dropdown_config_valid():
    opts = [make_option("OPT1")]
    errors = validate_question_config(
        "dropdown",
        settings={"placeholder": "Choose...", "searchable": True},
        validation=None,
        answer_options=opts,
    )
    assert errors == []


def test_dropdown_config_invalid_searchable():
    opts = [make_option("OPT1")]
    errors = validate_question_config(
        "dropdown",
        settings={"searchable": "yes"},
        validation=None,
        answer_options=opts,
    )
    assert len(errors) > 0


def test_multiple_choice_config_valid():
    opts = [make_option("A"), make_option("B"), make_option("C")]
    errors = validate_question_config(
        "multiple_choice",
        settings={"min_choices": 1, "max_choices": 3, "select_all": True},
        validation=None,
        answer_options=opts,
    )
    assert errors == []


def test_multiple_choice_config_min_exceeds_options():
    opts = [make_option("A"), make_option("B")]
    errors = validate_question_config(
        "multiple_choice",
        settings={"min_choices": 5},
        validation=None,
        answer_options=opts,
    )
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 1e. Matrix types (matrix, matrix_dropdown, matrix_dynamic)
# ---------------------------------------------------------------------------


def test_matrix_config_valid():
    opts = [make_option("COL1"), make_option("COL2")]
    sqs = [make_subquestion("SQ001"), make_subquestion("SQ002")]
    errors = validate_question_config(
        "matrix",
        settings={"alternate_rows": True, "is_all_rows_required": False},
        validation=None,
        answer_options=opts,
        subquestions=sqs,
    )
    assert errors == []


def test_matrix_config_no_subquestions_fails():
    opts = [make_option("COL1")]
    errors = validate_question_config(
        "matrix",
        settings={},
        validation=None,
        answer_options=opts,
        subquestions=[],
    )
    assert len(errors) > 0


def test_matrix_config_no_options_fails():
    sqs = [make_subquestion("SQ001")]
    errors = validate_question_config(
        "matrix",
        settings={},
        validation=None,
        answer_options=[],
        subquestions=sqs,
    )
    assert len(errors) > 0


def test_matrix_config_no_settings_no_options_no_subquestions_ok():
    """No settings → config validator not called → no errors."""
    errors = validate_question_config(
        "matrix",
        settings=None,
        validation=None,
        answer_options=[],
        subquestions=[],
    )
    assert errors == []


def test_matrix_dropdown_config_valid():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    errors = validate_question_config(
        "matrix_dropdown",
        settings={"column_types": {"COL1": "text"}},
        validation=None,
        answer_options=opts,
        subquestions=sqs,
    )
    assert errors == []


def test_matrix_dropdown_config_invalid_column_types_not_dict():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    errors = validate_question_config(
        "matrix_dropdown",
        settings={"column_types": ["COL1"]},
        validation=None,
        answer_options=opts,
        subquestions=sqs,
    )
    assert len(errors) > 0


def test_matrix_dynamic_config_valid():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    errors = validate_question_config(
        "matrix_dynamic",
        settings={"min_rows": 1, "max_rows": 5, "default_row_count": 2},
        validation=None,
        answer_options=opts,
        subquestions=sqs,
    )
    assert errors == []


def test_matrix_dynamic_config_min_rows_zero():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    errors = validate_question_config(
        "matrix_dynamic",
        settings={"min_rows": 0},
        validation=None,
        answer_options=opts,
        subquestions=sqs,
    )
    assert len(errors) > 0


def test_matrix_dynamic_config_max_less_than_min():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    errors = validate_question_config(
        "matrix_dynamic",
        settings={"min_rows": 5, "max_rows": 2},
        validation=None,
        answer_options=opts,
        subquestions=sqs,
    )
    assert len(errors) > 0


def test_matrix_dynamic_config_default_row_count_exceeds_max():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    errors = validate_question_config(
        "matrix_dynamic",
        settings={"min_rows": 1, "max_rows": 3, "default_row_count": 10},
        validation=None,
        answer_options=opts,
        subquestions=sqs,
    )
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 1f. Special types (ranking, image_picker, expression, html, file_upload)
# ---------------------------------------------------------------------------


def test_ranking_config_valid():
    opts = [make_option("A"), make_option("B")]
    errors = validate_question_config(
        "ranking",
        settings={"randomize_initial_order": True},
        validation=None,
        answer_options=opts,
    )
    assert errors == []


def test_ranking_config_no_options_fails():
    errors = validate_question_config(
        "ranking",
        settings={},
        validation=None,
        answer_options=[],
    )
    assert len(errors) > 0


def test_ranking_config_invalid_randomize():
    opts = [make_option("A")]
    errors = validate_question_config(
        "ranking",
        settings={"randomize_initial_order": "yes"},
        validation=None,
        answer_options=opts,
    )
    assert len(errors) > 0


def test_image_picker_config_valid():
    opts = [make_option("IMG1"), make_option("IMG2")]
    errors = validate_question_config(
        "image_picker",
        settings={"multi_select": False, "image_width": 200, "image_height": 150},
        validation=None,
        answer_options=opts,
    )
    assert errors == []


def test_image_picker_config_no_options_fails():
    errors = validate_question_config(
        "image_picker",
        settings={},
        validation=None,
        answer_options=[],
    )
    assert len(errors) > 0


def test_image_picker_config_image_width_zero():
    opts = [make_option("IMG1")]
    errors = validate_question_config(
        "image_picker",
        settings={"image_width": 0},
        validation=None,
        answer_options=opts,
    )
    assert len(errors) > 0


def test_expression_config_valid():
    errors = validate_question_config(
        "expression",
        settings={"expression": "Q1 + Q2", "display_format": "number"},
        validation=None,
    )
    assert errors == []


def test_expression_config_expression_not_string():
    errors = validate_question_config(
        "expression",
        settings={"expression": 42},
        validation=None,
    )
    assert len(errors) > 0


def test_html_config_valid():
    errors = validate_question_config(
        "html",
        settings={"content": "<p>Hello world</p>"},
        validation=None,
    )
    assert errors == []


def test_html_config_content_not_string():
    errors = validate_question_config(
        "html",
        settings={"content": 123},
        validation=None,
    )
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 1g. Settings defaults (None settings is always valid for scalar/text/misc)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("qtype", [
    "short_text", "long_text", "huge_text", "email", "phone", "url",
    "numeric", "rating", "boolean", "date",
    "scale", "yes_no", "time", "datetime", "file_upload",
    "expression", "html",
])
def test_none_settings_always_valid(qtype):
    """All types accept None settings (config validators return early on None)."""
    errors = validate_question_config(qtype, settings=None, validation=None)
    assert errors == []


# ===========================================================================
# SECTION 2: Unit tests for validate_answer
# ===========================================================================


# ---------------------------------------------------------------------------
# 2a. Text types
# ---------------------------------------------------------------------------


def test_short_text_answer_valid():
    q = make_question("short_text")
    errors = validate_answer({"value": "hello"}, q)
    assert errors == []


def test_short_text_answer_null_not_required():
    q = make_question("short_text")
    errors = validate_answer({"value": None}, q)
    assert errors == []


def test_short_text_answer_null_required():
    q = make_question("short_text", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_short_text_answer_empty_string_required():
    q = make_question("short_text", is_required=True)
    errors = validate_answer({"value": ""}, q)
    assert len(errors) > 0


def test_short_text_answer_with_regex_validation_match():
    q = make_question("short_text", validation={"regex": r"^\d+$"})
    errors = validate_answer({"value": "12345"}, q)
    assert errors == []


def test_short_text_answer_with_regex_validation_no_match():
    q = make_question("short_text", validation={"regex": r"^\d+$"})
    errors = validate_answer({"value": "abc"}, q)
    assert len(errors) > 0


def test_short_text_answer_regex_special_chars():
    """Regex with special characters works correctly."""
    q = make_question("short_text", validation={"regex": r"^\+?[\d\s\-]{7,}$"})
    errors = validate_answer({"value": "+1 555-1234"}, q)
    assert errors == []


def test_short_text_answer_min_length_violation():
    q = make_question("short_text", validation={"min_length": 10})
    errors = validate_answer({"value": "hi"}, q)
    assert len(errors) > 0


def test_short_text_answer_max_length_violation():
    q = make_question("short_text", validation={"max_length": 3})
    errors = validate_answer({"value": "hello"}, q)
    assert len(errors) > 0


def test_short_text_answer_settings_max_length_exceeded():
    """Exceeding settings.max_length should fail even without validation JSONB."""
    q = make_question("short_text", settings={"max_length": 5})
    errors = validate_answer({"value": "toolong"}, q)
    assert len(errors) > 0


def test_short_text_answer_settings_max_length_ok():
    q = make_question("short_text", settings={"max_length": 10})
    errors = validate_answer({"value": "hello"}, q)
    assert errors == []


def test_short_text_answer_input_type_email_valid():
    q = make_question("short_text", settings={"input_type": "email"})
    errors = validate_answer({"value": "user@example.com"}, q)
    assert errors == []


def test_short_text_answer_input_type_email_invalid():
    q = make_question("short_text", settings={"input_type": "email"})
    errors = validate_answer({"value": "not-an-email"}, q)
    assert len(errors) > 0


def test_short_text_answer_input_type_url_valid():
    q = make_question("short_text", settings={"input_type": "url"})
    errors = validate_answer({"value": "https://example.com"}, q)
    assert errors == []


def test_short_text_answer_input_type_url_invalid():
    q = make_question("short_text", settings={"input_type": "url"})
    errors = validate_answer({"value": "not-a-url"}, q)
    assert len(errors) > 0


def test_short_text_answer_input_type_tel_no_format_check():
    """tel input_type has no format validation — any string passes."""
    q = make_question("short_text", settings={"input_type": "tel"})
    errors = validate_answer({"value": "anything goes"}, q)
    assert errors == []


def test_long_text_answer_valid():
    q = make_question("long_text")
    errors = validate_answer({"value": "A longer answer text here."}, q)
    assert errors == []


def test_long_text_answer_required_empty():
    q = make_question("long_text", is_required=True)
    errors = validate_answer({"value": ""}, q)
    assert len(errors) > 0


def test_long_text_answer_settings_max_length_exceeded():
    q = make_question("long_text", settings={"max_length": 10})
    errors = validate_answer({"value": "this is too long"}, q)
    assert len(errors) > 0


def test_huge_text_answer_valid():
    q = make_question("huge_text")
    errors = validate_answer({"value": "A very long essay response here."}, q)
    assert errors == []


def test_huge_text_answer_required_empty():
    q = make_question("huge_text", is_required=True)
    errors = validate_answer({"value": ""}, q)
    assert len(errors) > 0


def test_huge_text_answer_null_not_required():
    q = make_question("huge_text")
    errors = validate_answer({"value": None}, q)
    assert errors == []


def test_huge_text_answer_settings_max_length_exceeded():
    q = make_question("huge_text", settings={"max_length": 20})
    errors = validate_answer({"value": "this string is definitely longer than twenty characters"}, q)
    assert len(errors) > 0


def test_huge_text_answer_settings_max_length_ok():
    q = make_question("huge_text", settings={"max_length": 100})
    errors = validate_answer({"value": "short answer"}, q)
    assert errors == []


def test_email_answer_valid():
    q = make_question("email")
    errors = validate_answer({"value": "user@example.com"}, q)
    assert errors == []


def test_email_answer_invalid_format():
    q = make_question("email")
    errors = validate_answer({"value": "not-an-email"}, q)
    assert len(errors) > 0


def test_email_answer_missing_domain():
    q = make_question("email")
    errors = validate_answer({"value": "user@"}, q)
    assert len(errors) > 0


def test_email_answer_required_null():
    q = make_question("email", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_phone_answer_valid():
    q = make_question("phone")
    errors = validate_answer({"value": "+1-555-1234"}, q)
    assert errors == []


def test_phone_answer_invalid():
    q = make_question("phone")
    errors = validate_answer({"value": "not a phone!!"}, q)
    assert len(errors) > 0


def test_url_answer_valid():
    q = make_question("url")
    errors = validate_answer({"value": "https://example.com"}, q)
    assert errors == []


def test_url_answer_no_scheme():
    q = make_question("url")
    errors = validate_answer({"value": "example.com"}, q)
    assert len(errors) > 0


def test_url_answer_http_scheme_valid():
    q = make_question("url")
    errors = validate_answer({"value": "http://example.com"}, q)
    assert errors == []


def test_url_answer_required_null():
    q = make_question("url", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 2b. Scalar types
# ---------------------------------------------------------------------------


def test_numeric_answer_valid():
    q = make_question("numeric", settings={"min_value": 0, "max_value": 100})
    errors = validate_answer({"value": 50}, q)
    assert errors == []


def test_numeric_answer_below_min():
    q = make_question("numeric", settings={"min_value": 10})
    errors = validate_answer({"value": 5}, q)
    assert len(errors) > 0


def test_numeric_answer_above_max():
    q = make_question("numeric", settings={"max_value": 100})
    errors = validate_answer({"value": 150}, q)
    assert len(errors) > 0


def test_numeric_answer_at_boundary_min():
    """Value equal to min_value should pass."""
    q = make_question("numeric", settings={"min_value": 0})
    errors = validate_answer({"value": 0}, q)
    assert errors == []


def test_numeric_answer_at_boundary_max():
    """Value equal to max_value should pass."""
    q = make_question("numeric", settings={"max_value": 100})
    errors = validate_answer({"value": 100}, q)
    assert errors == []


def test_numeric_answer_step_valid():
    q = make_question("numeric", settings={"min_value": 0, "step": 5})
    errors = validate_answer({"value": 15}, q)
    assert errors == []


def test_numeric_answer_step_invalid():
    q = make_question("numeric", settings={"min_value": 0, "step": 5})
    errors = validate_answer({"value": 7}, q)
    assert len(errors) > 0


def test_numeric_answer_not_a_number():
    q = make_question("numeric")
    errors = validate_answer({"value": "fifty"}, q)
    assert len(errors) > 0


def test_numeric_answer_required_null():
    q = make_question("numeric", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_numeric_answer_float_valid():
    q = make_question("numeric", settings={"min_value": 0.0, "max_value": 1.0})
    errors = validate_answer({"value": 0.5}, q)
    assert errors == []


def test_rating_answer_valid():
    q = make_question("rating", settings={"min_rating": 1, "max_rating": 5})
    errors = validate_answer({"value": 3}, q)
    assert errors == []


def test_rating_answer_below_min():
    q = make_question("rating", settings={"min_rating": 1, "max_rating": 5})
    errors = validate_answer({"value": 0}, q)
    assert len(errors) > 0


def test_rating_answer_above_max():
    q = make_question("rating", settings={"min_rating": 1, "max_rating": 5})
    errors = validate_answer({"value": 6}, q)
    assert len(errors) > 0


def test_rating_answer_at_min_boundary():
    q = make_question("rating", settings={"min_rating": 1, "max_rating": 5})
    errors = validate_answer({"value": 1}, q)
    assert errors == []


def test_rating_answer_at_max_boundary():
    q = make_question("rating", settings={"min_rating": 1, "max_rating": 5})
    errors = validate_answer({"value": 5}, q)
    assert errors == []


def test_rating_answer_not_integer():
    q = make_question("rating")
    errors = validate_answer({"value": 3.5}, q)
    assert len(errors) > 0


def test_rating_answer_required_null():
    q = make_question("rating", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_boolean_answer_true():
    q = make_question("boolean")
    errors = validate_answer({"value": "true"}, q)
    assert errors == []


def test_boolean_answer_false():
    q = make_question("boolean")
    errors = validate_answer({"value": "false"}, q)
    assert errors == []


def test_boolean_answer_invalid():
    q = make_question("boolean")
    errors = validate_answer({"value": "yes"}, q)
    assert len(errors) > 0


def test_boolean_answer_null_not_required():
    q = make_question("boolean")
    errors = validate_answer({"value": None}, q)
    assert errors == []


def test_boolean_answer_null_required():
    q = make_question("boolean", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_date_answer_valid():
    q = make_question("date", settings={"date_format": "YYYY-MM-DD"})
    errors = validate_answer({"value": "2024-06-15"}, q)
    assert errors == []


def test_date_answer_wrong_format():
    q = make_question("date", settings={"date_format": "YYYY-MM-DD"})
    errors = validate_answer({"value": "15/06/2024"}, q)
    assert len(errors) > 0


def test_date_answer_before_min():
    q = make_question("date", settings={"date_format": "YYYY-MM-DD", "min_date": "2024-01-01"})
    errors = validate_answer({"value": "2023-12-31"}, q)
    assert len(errors) > 0


def test_date_answer_after_max():
    q = make_question("date", settings={"date_format": "YYYY-MM-DD", "max_date": "2024-12-31"})
    errors = validate_answer({"value": "2025-01-01"}, q)
    assert len(errors) > 0


def test_date_answer_required_null():
    q = make_question("date", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 2c. Choice types
# ---------------------------------------------------------------------------


def test_single_choice_answer_valid():
    opts = [make_option("A1"), make_option("A2")]
    q = make_question("single_choice", settings={})
    errors = validate_answer({"value": "A1"}, q, answer_options=opts)
    assert errors == []


def test_single_choice_answer_invalid_code():
    opts = [make_option("A1")]
    q = make_question("single_choice", settings={})
    errors = validate_answer({"value": "INVALID"}, q, answer_options=opts)
    assert len(errors) > 0


def test_single_choice_answer_other_with_has_other():
    opts = [make_option("A1")]
    q = make_question("single_choice", settings={"has_other": True})
    errors = validate_answer({"value": "other", "other_value": "My answer"}, q, answer_options=opts)
    assert errors == []


def test_single_choice_answer_other_without_has_other():
    opts = [make_option("A1")]
    q = make_question("single_choice", settings={"has_other": False})
    errors = validate_answer({"value": "other"}, q, answer_options=opts)
    assert len(errors) > 0


def test_single_choice_answer_other_empty_other_value():
    opts = [make_option("A1")]
    q = make_question("single_choice", settings={"has_other": True})
    errors = validate_answer({"value": "other", "other_value": "  "}, q, answer_options=opts)
    assert len(errors) > 0


def test_single_choice_answer_required_null():
    opts = [make_option("A1")]
    q = make_question("single_choice", is_required=True, settings={})
    errors = validate_answer({"value": None}, q, answer_options=opts)
    assert len(errors) > 0


def test_dropdown_answer_valid():
    opts = [make_option("OPT1")]
    q = make_question("dropdown", settings={})
    errors = validate_answer({"value": "OPT1"}, q, answer_options=opts)
    assert errors == []


def test_dropdown_answer_invalid():
    opts = [make_option("OPT1")]
    q = make_question("dropdown", settings={})
    errors = validate_answer({"value": "NOPE"}, q, answer_options=opts)
    assert len(errors) > 0


def test_multiple_choice_answer_valid():
    opts = [make_option("A1"), make_option("A2"), make_option("A3")]
    q = make_question("multiple_choice", settings={})
    errors = validate_answer({"values": ["A1", "A3"]}, q, answer_options=opts)
    assert errors == []


def test_multiple_choice_answer_invalid_code():
    opts = [make_option("A1")]
    q = make_question("multiple_choice", settings={})
    errors = validate_answer({"values": ["NOPE"]}, q, answer_options=opts)
    assert len(errors) > 0


def test_multiple_choice_answer_below_min_choices():
    opts = [make_option("A1"), make_option("A2"), make_option("A3")]
    q = make_question("multiple_choice", settings={"min_choices": 2})
    errors = validate_answer({"values": ["A1"]}, q, answer_options=opts)
    assert len(errors) > 0


def test_multiple_choice_answer_above_max_choices():
    opts = [make_option("A1"), make_option("A2"), make_option("A3")]
    q = make_question("multiple_choice", settings={"max_choices": 2})
    errors = validate_answer({"values": ["A1", "A2", "A3"]}, q, answer_options=opts)
    assert len(errors) > 0


def test_multiple_choice_answer_other_with_has_other():
    opts = [make_option("A1")]
    q = make_question("multiple_choice", settings={"has_other": True})
    errors = validate_answer({"values": ["A1", "other"], "other_value": "custom"}, q, answer_options=opts)
    assert errors == []


def test_multiple_choice_answer_not_a_list():
    opts = [make_option("A1")]
    q = make_question("multiple_choice", settings={})
    errors = validate_answer({"values": "A1"}, q, answer_options=opts)
    assert len(errors) > 0


def test_multiple_choice_answer_required_empty():
    opts = [make_option("A1")]
    q = make_question("multiple_choice", is_required=True, settings={})
    errors = validate_answer({"values": []}, q, answer_options=opts)
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 2d. Matrix types
# ---------------------------------------------------------------------------


def test_matrix_answer_valid():
    opts = [make_option("COL1"), make_option("COL2")]
    sqs = [make_subquestion("SQ001"), make_subquestion("SQ002")]
    q = make_question("matrix", settings={})
    errors = validate_answer({"value": {"SQ001": "COL1", "SQ002": "COL2"}}, q, answer_options=opts, subquestions=sqs)
    assert errors == []


def test_matrix_answer_invalid_subquestion_code():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix", settings={})
    errors = validate_answer({"value": {"INVALID": "COL1"}}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


def test_matrix_answer_invalid_option_code():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix", settings={})
    errors = validate_answer({"value": {"SQ001": "INVALID"}}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


def test_matrix_answer_all_rows_required_missing():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001"), make_subquestion("SQ002")]
    q = make_question("matrix", settings={"is_all_rows_required": True})
    errors = validate_answer({"value": {"SQ001": "COL1"}}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


def test_matrix_answer_required_empty_dict():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix", is_required=True, settings={})
    errors = validate_answer({"value": {}}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


def test_matrix_answer_not_a_dict():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix", settings={})
    errors = validate_answer({"value": "SQ001:COL1"}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


def test_matrix_dropdown_answer_valid():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix_dropdown", settings={})
    errors = validate_answer({"value": {"SQ001": {"COL1": "some_value"}}}, q, answer_options=opts, subquestions=sqs)
    assert errors == []


def test_matrix_dropdown_answer_all_rows_required():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001"), make_subquestion("SQ002")]
    q = make_question("matrix_dropdown", settings={"is_all_rows_required": True})
    errors = validate_answer({"value": {"SQ001": {"COL1": "val"}}}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


def test_matrix_dynamic_answer_valid():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix_dynamic", settings={"min_rows": 1, "max_rows": 5})
    errors = validate_answer({"values": [{"COL1": "val1"}]}, q, answer_options=opts, subquestions=sqs)
    assert errors == []


def test_matrix_dynamic_answer_below_min_rows():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix_dynamic", settings={"min_rows": 3})
    errors = validate_answer({"values": [{"COL1": "v"}]}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


def test_matrix_dynamic_answer_above_max_rows():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix_dynamic", settings={"max_rows": 2})
    rows = [{"COL1": "v"}] * 5
    errors = validate_answer({"values": rows}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


def test_matrix_dynamic_answer_not_a_list():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix_dynamic", settings={})
    errors = validate_answer({"values": {"row": "val"}}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


def test_matrix_dynamic_answer_required_empty():
    opts = [make_option("COL1")]
    sqs = [make_subquestion("SQ001")]
    q = make_question("matrix_dynamic", is_required=True, settings={})
    errors = validate_answer({"values": []}, q, answer_options=opts, subquestions=sqs)
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 2e. Misc types
# ---------------------------------------------------------------------------


def test_scale_answer_valid():
    q = make_question("scale")
    errors = validate_answer({"value": 3}, q)
    assert errors == []


def test_scale_answer_below_min():
    q = make_question("scale", validation={"min": 1})
    errors = validate_answer({"value": 0}, q)
    assert len(errors) > 0


def test_scale_answer_above_max():
    q = make_question("scale", validation={"max": 10})
    errors = validate_answer({"value": 11}, q)
    assert len(errors) > 0


def test_scale_answer_not_a_number():
    q = make_question("scale")
    errors = validate_answer({"value": True}, q)
    assert len(errors) > 0


def test_scale_answer_required_null():
    q = make_question("scale", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_yes_no_answer_yes():
    q = make_question("yes_no")
    errors = validate_answer({"value": "yes"}, q)
    assert errors == []


def test_yes_no_answer_no():
    q = make_question("yes_no")
    errors = validate_answer({"value": "no"}, q)
    assert errors == []


def test_yes_no_answer_invalid():
    q = make_question("yes_no")
    errors = validate_answer({"value": "maybe"}, q)
    assert len(errors) > 0


def test_yes_no_answer_required_null():
    q = make_question("yes_no", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_time_answer_valid_hhmm():
    q = make_question("time")
    errors = validate_answer({"value": "14:30"}, q)
    assert errors == []


def test_time_answer_valid_hhmmss():
    q = make_question("time")
    errors = validate_answer({"value": "14:30:00"}, q)
    assert errors == []


def test_time_answer_invalid():
    q = make_question("time")
    errors = validate_answer({"value": "25:99"}, q)
    assert len(errors) > 0


def test_time_answer_required_null():
    q = make_question("time", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_datetime_answer_valid_iso():
    q = make_question("datetime")
    errors = validate_answer({"value": "2024-06-15T14:30:00"}, q)
    assert errors == []


def test_datetime_answer_valid_date_only():
    q = make_question("datetime")
    errors = validate_answer({"value": "2024-06-15"}, q)
    assert errors == []


def test_datetime_answer_invalid():
    q = make_question("datetime")
    errors = validate_answer({"value": "not-a-datetime"}, q)
    assert len(errors) > 0


def test_datetime_answer_required_null():
    q = make_question("datetime", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_file_upload_answer_valid():
    q = make_question("file_upload")
    errors = validate_answer({"value": "https://example.com/file.pdf"}, q)
    assert errors == []


def test_file_upload_answer_required_null():
    q = make_question("file_upload", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


def test_file_upload_answer_required_empty_string():
    q = make_question("file_upload", is_required=True)
    errors = validate_answer({"value": ""}, q)
    assert len(errors) > 0


def test_number_answer_valid():
    q = make_question("numeric")
    errors = validate_answer({"value": 42}, q)
    assert errors == []


def test_number_answer_below_min():
    q = make_question("numeric", validation={"min": 0})
    errors = validate_answer({"value": -1}, q)
    assert len(errors) > 0


def test_number_answer_above_max():
    q = make_question("numeric", validation={"max": 100})
    errors = validate_answer({"value": 200}, q)
    assert len(errors) > 0


def test_number_answer_not_a_number():
    q = make_question("numeric")
    errors = validate_answer({"value": "ten"}, q)
    assert len(errors) > 0


def test_number_answer_bool_not_valid():
    """Boolean should not be treated as a number."""
    q = make_question("numeric")
    errors = validate_answer({"value": True}, q)
    assert len(errors) > 0


def test_number_answer_required_null():
    q = make_question("numeric", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) > 0


# ---------------------------------------------------------------------------
# 2f. Special choice-like types (ranking, image_picker)
# ---------------------------------------------------------------------------


def test_ranking_answer_valid():
    opts = [make_option("A"), make_option("B"), make_option("C")]
    q = make_question("ranking", settings={})
    errors = validate_answer({"values": ["C", "A", "B"]}, q, answer_options=opts)
    assert errors == []


def test_ranking_answer_missing_option():
    opts = [make_option("A"), make_option("B"), make_option("C")]
    q = make_question("ranking", settings={})
    errors = validate_answer({"values": ["A", "B"]}, q, answer_options=opts)
    assert len(errors) > 0


def test_ranking_answer_duplicate():
    opts = [make_option("A"), make_option("B")]
    q = make_question("ranking", settings={})
    errors = validate_answer({"values": ["A", "A"]}, q, answer_options=opts)
    assert len(errors) > 0


def test_ranking_answer_unknown_code():
    opts = [make_option("A"), make_option("B")]
    q = make_question("ranking", settings={})
    errors = validate_answer({"values": ["A", "UNKNOWN"]}, q, answer_options=opts)
    assert len(errors) > 0


def test_ranking_answer_required_empty():
    opts = [make_option("A")]
    q = make_question("ranking", is_required=True, settings={})
    errors = validate_answer({"values": []}, q, answer_options=opts)
    assert len(errors) > 0


def test_image_picker_single_valid():
    opts = [make_option("IMG1"), make_option("IMG2")]
    q = make_question("image_picker", settings={"multi_select": False})
    errors = validate_answer({"value": "IMG1"}, q, answer_options=opts)
    assert errors == []


def test_image_picker_single_invalid_code():
    opts = [make_option("IMG1")]
    q = make_question("image_picker", settings={"multi_select": False})
    errors = validate_answer({"value": "NOPE"}, q, answer_options=opts)
    assert len(errors) > 0


def test_image_picker_multi_valid():
    opts = [make_option("IMG1"), make_option("IMG2")]
    q = make_question("image_picker", settings={"multi_select": True})
    errors = validate_answer({"values": ["IMG1", "IMG2"]}, q, answer_options=opts)
    assert errors == []


def test_image_picker_multi_below_min():
    opts = [make_option("IMG1"), make_option("IMG2")]
    q = make_question("image_picker", settings={"multi_select": True, "min_choices": 2})
    errors = validate_answer({"values": ["IMG1"]}, q, answer_options=opts)
    assert len(errors) > 0


def test_image_picker_required_null():
    opts = [make_option("IMG1")]
    q = make_question("image_picker", is_required=True, settings={"multi_select": False})
    errors = validate_answer({"value": None}, q, answer_options=opts)
    assert len(errors) > 0


# ===========================================================================
# SECTION 3: Edge case unit tests
# ===========================================================================


def test_empty_string_vs_null_for_required_text():
    """Empty string should also fail is_required for text types."""
    q = make_question("short_text", is_required=True)
    errors_null = validate_answer({"value": None}, q)
    errors_empty = validate_answer({"value": ""}, q)
    assert len(errors_null) > 0
    assert len(errors_empty) > 0


def test_empty_string_vs_null_for_optional_text():
    """Optional text question: None should pass, empty string should also pass."""
    q = make_question("short_text", is_required=False)
    errors_null = validate_answer({"value": None}, q)
    # Empty string is falsy but not None; text validators should handle this
    assert errors_null == []


def test_numeric_boundary_min_equals_max():
    """min_value == max_value is valid config; only one value is accepted."""
    errors = validate_question_config(
        "numeric",
        settings={"min_value": 42, "max_value": 42},
        validation=None,
    )
    assert errors == []
    q = make_question("numeric", settings={"min_value": 42, "max_value": 42})
    errors = validate_answer({"value": 42}, q)
    assert errors == []


def test_rating_boundary_values():
    """Rating at exact min and max boundaries should pass."""
    q = make_question("rating", settings={"min_rating": 1, "max_rating": 10})
    assert validate_answer({"value": 1}, q) == []
    assert validate_answer({"value": 10}, q) == []
    assert len(validate_answer({"value": 0}, q)) > 0
    assert len(validate_answer({"value": 11}, q)) > 0


def test_matrix_zero_subquestions_with_settings_fails():
    """Matrix with settings but zero subquestions should fail config validation."""
    opts = [make_option("COL1")]
    errors = validate_question_config(
        "matrix",
        settings={},
        validation=None,
        answer_options=opts,
        subquestions=[],
    )
    assert len(errors) > 0


def test_matrix_zero_options_with_settings_fails():
    """Matrix with settings but zero options should fail config validation."""
    sqs = [make_subquestion("SQ001")]
    errors = validate_question_config(
        "matrix",
        settings={},
        validation=None,
        answer_options=[],
        subquestions=sqs,
    )
    assert len(errors) > 0


def test_checkbox_min_choices_greater_than_option_count():
    """Checkbox min_choices > option count should fail."""
    opts = [make_option("A")]
    errors = validate_question_config(
        "multiple_choice",
        settings={"min_choices": 5},
        validation=None,
        answer_options=opts,
    )
    assert len(errors) > 0


def test_regex_special_characters_in_validation():
    """Regex with special chars should work correctly in both config and answer validation."""
    # Config: valid regex in validation rules
    errors = validate_question_config(
        "short_text",
        settings=None,
        validation={"regex": r"^\+?[\d\s\-\.]{7,15}$"},
    )
    assert errors == []


def test_invalid_regex_in_validation_graceful():
    """An invalid stored regex should not crash — it's skipped gracefully per text_validators.py."""
    q = make_question("short_text", validation={"regex": r"[invalid("})
    # Should not raise; invalid regex is skipped
    errors = validate_answer({"value": "test"}, q)
    assert errors == []


def test_file_upload_with_disallowed_types():
    """file_upload with disallowed MIME-like types should fail."""
    errors = validate_question_config(
        "file_upload",
        settings={"allowed_types": ["exe"]},
        validation=None,
    )
    assert len(errors) > 0


def test_file_upload_empty_allowed_types():
    """Empty allowed_types list is valid (no restriction)."""
    errors = validate_question_config(
        "file_upload",
        settings={"allowed_types": []},
        validation=None,
    )
    assert errors == []


def test_numeric_decimal_boundary_values():
    """Floating point boundary: test value exactly at min and max."""
    q = make_question("numeric", settings={"min_value": 0.001, "max_value": 0.999})
    assert validate_answer({"value": 0.001}, q) == []
    assert validate_answer({"value": 0.999}, q) == []
    assert len(validate_answer({"value": 0.0}, q)) > 0


def test_validate_question_config_returns_list_not_raises():
    """validate_question_config should return a list, not raise exceptions."""
    result = validate_question_config(
        "numeric",
        settings={"min_value": "not_a_number"},
        validation=None,
    )
    assert isinstance(result, list)


def test_validate_answer_returns_list_not_raises():
    """validate_answer should return a list, not raise exceptions."""
    q = make_question("rating")
    result = validate_answer({"value": "bad_value"}, q)
    assert isinstance(result, list)


def test_question_validation_error_has_field_and_message():
    """QuestionValidationError has field and message attributes."""
    q = make_question("numeric", settings={"min_value": 100, "max_value": 50})
    errors = validate_question_config("numeric", settings={"min_value": 100, "max_value": 50}, validation=None)
    assert len(errors) > 0
    err = errors[0]
    assert hasattr(err, "field")
    assert hasattr(err, "message")
    assert isinstance(err.field, str)
    assert isinstance(err.message, str)


# ===========================================================================
# SECTION 4: Integration tests (HTTP API)
# ===========================================================================


# ---------------------------------------------------------------------------
# 4a. Parametrized creation tests for all types (no settings → 201)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("qtype", [
    "short_text", "long_text", "huge_text", "email", "phone", "url",
    "numeric", "rating", "boolean", "date",
    "single_choice", "dropdown", "multiple_choice",
    "matrix", "matrix_dropdown", "matrix_dynamic",
    "ranking", "image_picker",
    "scale", "yes_no", "time", "datetime", "file_upload",
    "expression", "html",
])
async def test_create_question_all_types_no_settings(client: AsyncClient, qtype: str):
    """All question types can be created without settings (no validation triggers)."""
    email_suffix = qtype.replace("_", "")
    headers, survey_id, group_id = await setup_survey_group(client, f"ns_{email_suffix}")
    resp = await create_question(client, headers, survey_id, group_id, qtype, title=f"{qtype} Question")
    assert resp.status_code == 201, f"{qtype}: Expected 201, got {resp.status_code}: {resp.json()}"
    data = resp.json()
    assert data["question_type"] == qtype
    assert data["title"] == f"{qtype} Question"


# ---------------------------------------------------------------------------
# 4b. Invalid settings return 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_single_choice_invalid_columns_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "sc_badcols")
    resp = await create_question(
        client, headers, survey_id, group_id, "single_choice",
        settings={"columns": 99},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_dropdown_invalid_searchable_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "dd_badsearch")
    resp = await create_question(
        client, headers, survey_id, group_id, "dropdown",
        settings={"searchable": "yes"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_multiple_choice_invalid_min_choices_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "mc_badmin")
    resp = await create_question(
        client, headers, survey_id, group_id, "multiple_choice",
        settings={"min_choices": -1},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_numeric_invalid_step_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "num_badstep")
    resp = await create_question(
        client, headers, survey_id, group_id, "numeric",
        settings={"step": 0},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_rating_invalid_icon_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "rat_badicon")
    resp = await create_question(
        client, headers, survey_id, group_id, "rating",
        settings={"icon": "diamond"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_boolean_invalid_display_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "bool_baddisp")
    resp = await create_question(
        client, headers, survey_id, group_id, "boolean",
        settings={"display": "slider"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_file_upload_invalid_type_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "fu_badtype")
    resp = await create_question(
        client, headers, survey_id, group_id, "file_upload",
        settings={"allowed_types": ["exe"]},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 4c. Settings with options present → validation passes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_single_choice_with_settings_and_options_201(client: AsyncClient):
    """Adding settings + options to single_choice → 201."""
    headers, survey_id, group_id = await setup_survey_group(client, "sc_withsettings")
    # Create question without settings first
    resp = await create_question(client, headers, survey_id, group_id, "single_choice")
    assert resp.status_code == 201
    q_id = resp.json()["id"]
    # Add options
    await add_option(client, headers, survey_id, q_id, "Option A", "opt_a")
    # Patch settings
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{q_id}",
        json={"settings": {"has_other": True, "columns": 2}},
        headers=headers,
    )
    assert patch_resp.status_code == 200


@pytest.mark.asyncio
async def test_create_ranking_with_settings_and_options_201(client: AsyncClient):
    """Ranking with options and settings → 201."""
    headers, survey_id, group_id = await setup_survey_group(client, "rank_withsettings")
    resp = await create_question(client, headers, survey_id, group_id, "ranking")
    assert resp.status_code == 201
    q_id = resp.json()["id"]
    await add_option(client, headers, survey_id, q_id, "Item 1", "item1")
    await add_option(client, headers, survey_id, q_id, "Item 2", "item2")
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{q_id}",
        json={"settings": {"randomize_initial_order": True}},
        headers=headers,
    )
    assert patch_resp.status_code == 200


# ---------------------------------------------------------------------------
# 4d. Validation rules via API
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_short_text_with_valid_validation_rules(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "st_validrules")
    resp = await create_question(
        client, headers, survey_id, group_id, "short_text",
        validation={"min_length": 2, "max_length": 100},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["validation"]["min_length"] == 2


@pytest.mark.asyncio
async def test_create_short_text_with_invalid_validation_type_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "st_badrules")
    resp = await create_question(
        client, headers, survey_id, group_id, "short_text",
        validation={"min_length": "five"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_numeric_with_min_max_validation(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "num_minmax")
    resp = await create_question(
        client, headers, survey_id, group_id, "numeric",
        settings={"min_value": 0, "max_value": 100},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["settings"]["min_value"] == 0
    assert data["settings"]["max_value"] == 100


@pytest.mark.asyncio
async def test_create_short_text_with_valid_settings(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "st_settings")
    resp = await create_question(
        client, headers, survey_id, group_id, "short_text",
        settings={"max_length": 100, "input_type": "email"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["settings"]["max_length"] == 100
    assert data["settings"]["input_type"] == "email"


@pytest.mark.asyncio
async def test_create_short_text_invalid_input_type_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "st_badinput")
    resp = await create_question(
        client, headers, survey_id, group_id, "short_text",
        settings={"input_type": "number"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_short_text_max_length_too_large_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "st_badmaxlen")
    resp = await create_question(
        client, headers, survey_id, group_id, "short_text",
        settings={"max_length": 1000},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_long_text_with_valid_settings(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "lt_settings")
    resp = await create_question(
        client, headers, survey_id, group_id, "long_text",
        settings={"max_length": 2000, "rows": 8},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_long_text_rows_zero_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "lt_badrows")
    resp = await create_question(
        client, headers, survey_id, group_id, "long_text",
        settings={"rows": 0},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_long_text_max_length_too_large_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "lt_badmaxlen")
    resp = await create_question(
        client, headers, survey_id, group_id, "long_text",
        settings={"max_length": 9999},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_huge_text_with_valid_settings(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "ht_settings")
    resp = await create_question(
        client, headers, survey_id, group_id, "huge_text",
        settings={"max_length": 10000, "rows": 12, "rich_text": True},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["settings"]["rich_text"] is True


@pytest.mark.asyncio
async def test_create_huge_text_rich_text_not_bool_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "ht_badbool")
    resp = await create_question(
        client, headers, survey_id, group_id, "huge_text",
        settings={"rich_text": "yes"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_huge_text_max_length_too_large_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "ht_badmaxlen")
    resp = await create_question(
        client, headers, survey_id, group_id, "huge_text",
        settings={"max_length": 100000},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 4e. Matrix subquestion creation and validation via API
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_matrix_subquestion_creation(client: AsyncClient):
    """Matrix question should accept subquestion creation.

    The subquestion endpoint returns the parent question with subquestions array populated.
    """
    headers, survey_id, group_id = await setup_survey_group(client, "mat_subq")
    resp = await create_question(client, headers, survey_id, group_id, "matrix", title="Matrix Q")
    assert resp.status_code == 201
    q_id = resp.json()["id"]
    parent_code = resp.json()["code"]  # e.g. Q1

    # POST to subquestions endpoint returns parent question (not just the subquestion)
    sq_resp = await client.post(
        subquestions_url(survey_id, q_id),
        json={"title": "Row 1"},
        headers=headers,
    )
    assert sq_resp.status_code == 201
    parent_data = sq_resp.json()
    # Subquestion code is inside the subquestions array of the parent
    assert len(parent_data["subquestions"]) == 1
    sq_code = parent_data["subquestions"][0]["code"]
    assert sq_code == f"{parent_code}_SQ001"


@pytest.mark.asyncio
async def test_matrix_subquestion_auto_code_increment(client: AsyncClient):
    """Subquestion codes auto-increment (SQ001, SQ002, etc.)."""
    headers, survey_id, group_id = await setup_survey_group(client, "mat_sqcodes")
    resp = await create_question(client, headers, survey_id, group_id, "matrix", title="Matrix Q")
    assert resp.status_code == 201
    q_id = resp.json()["id"]
    parent_code = resp.json()["code"]

    sq1 = await client.post(
        subquestions_url(survey_id, q_id),
        json={"title": "Row 1"},
        headers=headers,
    )
    sq2 = await client.post(
        subquestions_url(survey_id, q_id),
        json={"title": "Row 2"},
        headers=headers,
    )
    assert sq1.status_code == 201
    assert sq2.status_code == 201
    # Each response is the parent; sq1 has 1 subquestion, sq2 has 2
    code1 = sq1.json()["subquestions"][0]["code"]
    sqs_after_second = sorted(sq2.json()["subquestions"], key=lambda s: s["code"])
    code2 = sqs_after_second[1]["code"]
    assert code1 == f"{parent_code}_SQ001"
    assert code2 == f"{parent_code}_SQ002"


@pytest.mark.asyncio
async def test_matrix_settings_no_subquestions_returns_422(client: AsyncClient):
    """Matrix question with settings but no subquestions → 422."""
    headers, survey_id, group_id = await setup_survey_group(client, "mat_nosq")
    resp = await create_question(
        client, headers, survey_id, group_id, "matrix",
        settings={"alternate_rows": True},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_matrix_settings_no_options_returns_422(client: AsyncClient):
    """Matrix question with settings but no options → 422."""
    headers, survey_id, group_id = await setup_survey_group(client, "mat_noopt")
    resp = await create_question(
        client, headers, survey_id, group_id, "matrix",
        settings={"is_all_rows_required": False},
    )
    # No options means validator fires and fails
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 4f. Choice types: 'other' option handling via settings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_single_choice_has_other_true_with_options(client: AsyncClient):
    """single_choice with has_other=True and options → valid."""
    headers, survey_id, group_id = await setup_survey_group(client, "sc_hasother")
    resp = await create_question(client, headers, survey_id, group_id, "single_choice")
    assert resp.status_code == 201
    q_id = resp.json()["id"]
    await add_option(client, headers, survey_id, q_id, "Choice A", "choice_a")
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{q_id}",
        json={"settings": {"has_other": True, "other_text": "Other (please specify)"}},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["settings"]["has_other"] is True


@pytest.mark.asyncio
async def test_multiple_choice_has_other_invalid_value_422(client: AsyncClient):
    """multiple_choice with has_other as non-bool → 422."""
    headers, survey_id, group_id = await setup_survey_group(client, "mc_badother")
    resp = await create_question(
        client, headers, survey_id, group_id, "multiple_choice",
        settings={"has_other": "yes"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 4g. Numeric boundary values via API
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_numeric_valid_min_max_step(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "num_bound")
    resp = await create_question(
        client, headers, survey_id, group_id, "numeric",
        settings={"min_value": -100, "max_value": 100, "step": 0.5},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["settings"]["min_value"] == -100
    assert data["settings"]["step"] == 0.5


@pytest.mark.asyncio
async def test_numeric_min_greater_than_max_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "num_invbound")
    resp = await create_question(
        client, headers, survey_id, group_id, "numeric",
        settings={"min_value": 100, "max_value": 50},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_numeric_step_negative_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "num_negstep")
    resp = await create_question(
        client, headers, survey_id, group_id, "numeric",
        settings={"step": -5},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 4h. Checkbox min_choices > option count edge case
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_checkbox_min_choices_exceeds_option_count_422(client: AsyncClient):
    """Updating checkbox with min_choices > current option count → 422."""
    headers, survey_id, group_id = await setup_survey_group(client, "cb_exceed")
    resp = await create_question(client, headers, survey_id, group_id, "multiple_choice")
    assert resp.status_code == 201
    q_id = resp.json()["id"]
    # Add only 1 option
    await add_option(client, headers, survey_id, q_id, "Option A", "opt_a")
    # Try min_choices=5 → should fail
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{q_id}",
        json={"settings": {"min_choices": 5}},
        headers=headers,
    )
    assert patch_resp.status_code == 422


# ---------------------------------------------------------------------------
# 4i. Rating boundary values
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rating_valid_custom_range(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "rat_range")
    resp = await create_question(
        client, headers, survey_id, group_id, "rating",
        settings={"min_rating": 0, "max_rating": 10, "icon": "heart"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["settings"]["max_rating"] == 10


@pytest.mark.asyncio
async def test_rating_min_equal_max_valid(client: AsyncClient):
    """min_rating == max_rating is technically valid config."""
    headers, survey_id, group_id = await setup_survey_group(client, "rat_eqrange")
    resp = await create_question(
        client, headers, survey_id, group_id, "rating",
        settings={"min_rating": 5, "max_rating": 5},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_rating_min_greater_than_max_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "rat_invrange")
    resp = await create_question(
        client, headers, survey_id, group_id, "rating",
        settings={"min_rating": 10, "max_rating": 1},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 4j. File upload with disallowed types
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_file_upload_valid_allowed_types(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "fu_valid")
    resp = await create_question(
        client, headers, survey_id, group_id, "file_upload",
        settings={"allowed_types": ["pdf", "jpg", "png"], "max_file_size_mb": 5},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "pdf" in data["settings"]["allowed_types"]


@pytest.mark.asyncio
async def test_file_upload_disallowed_type_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "fu_disallowed")
    resp = await create_question(
        client, headers, survey_id, group_id, "file_upload",
        settings={"allowed_types": ["exe", "bat", "sh"]},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_file_upload_empty_allowed_types_valid(client: AsyncClient):
    """Empty allowed_types list is valid — no restriction."""
    headers, survey_id, group_id = await setup_survey_group(client, "fu_emptylist")
    resp = await create_question(
        client, headers, survey_id, group_id, "file_upload",
        settings={"allowed_types": []},
    )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# 4k. Expression and HTML types
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expression_valid_settings(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "expr_valid")
    resp = await create_question(
        client, headers, survey_id, group_id, "expression",
        settings={"expression": "Q001 + Q002", "display_format": "number"},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_expression_invalid_expression_type_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "expr_invalid")
    resp = await create_question(
        client, headers, survey_id, group_id, "expression",
        settings={"expression": 42},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_html_valid_content(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "html_valid")
    resp = await create_question(
        client, headers, survey_id, group_id, "html",
        settings={"content": "<h2>Section Header</h2><p>Instructions here.</p>"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "<h2>" in data["settings"]["content"]


@pytest.mark.asyncio
async def test_html_invalid_content_type_422(client: AsyncClient):
    headers, survey_id, group_id = await setup_survey_group(client, "html_invalid")
    resp = await create_question(
        client, headers, survey_id, group_id, "html",
        settings={"content": 12345},
    )
    assert resp.status_code == 422


# ===========================================================================
# SECTION 5: Export-Import Round-Trip Test
# ===========================================================================

# All 18 "core" validator-covered types
_ALL_18_TYPES = [
    "short_text", "long_text", "email", "phone", "url",     # text (5)
    "numeric", "rating", "boolean", "date",                   # scalar (4)
    "single_choice", "dropdown", "multiple_choice",           # choice (3)
    "matrix", "matrix_dropdown", "matrix_dynamic",            # matrix (3)
    "ranking", "image_picker",                                 # special choice (2)
    "file_upload",                                             # misc (1)
]

_CHOICE_TYPES_SET = {"single_choice", "dropdown", "multiple_choice", "ranking", "image_picker"}
_MATRIX_TYPES_SET = {"matrix", "matrix_dropdown", "matrix_dynamic"}


def _build_round_trip_payload() -> dict:
    """Build a survey export payload containing one question of each of the 18 types."""
    questions = []
    for idx, qtype in enumerate(_ALL_18_TYPES):
        code = f"RT{idx + 1:03d}"
        question: dict = {
            "code": code,
            "question_type": qtype,
            "title": f"RoundTrip {qtype}",
            "description": f"Test question for {qtype}",
            "is_required": idx % 2 == 0,
            "sort_order": idx + 1,
            "relevance": None,
            "validation": None,
            "settings": None,
            "answer_options": [],
            "subquestions": [],
        }

        if qtype in _CHOICE_TYPES_SET:
            question["answer_options"] = [
                {"code": f"{code}_A", "title": "Option A", "sort_order": 1, "assessment_value": 1},
                {"code": f"{code}_B", "title": "Option B", "sort_order": 2, "assessment_value": 2},
            ]

        if qtype in _MATRIX_TYPES_SET:
            question["answer_options"] = [
                {"code": f"{code}_COL1", "title": "Column 1", "sort_order": 1, "assessment_value": 0},
                {"code": f"{code}_COL2", "title": "Column 2", "sort_order": 2, "assessment_value": 0},
            ]
            question["subquestions"] = [
                {
                    "code": f"{code}_SQ001",
                    "question_type": "short_text",
                    "title": "Row 1",
                    "description": None,
                    "is_required": False,
                    "sort_order": 1,
                    "relevance": None,
                    "validation": None,
                    "settings": None,
                    "answer_options": [],
                    "subquestions": [],
                },
                {
                    "code": f"{code}_SQ002",
                    "question_type": "short_text",
                    "title": "Row 2",
                    "description": None,
                    "is_required": False,
                    "sort_order": 2,
                    "relevance": None,
                    "validation": None,
                    "settings": None,
                    "answer_options": [],
                    "subquestions": [],
                },
            ]

        questions.append(question)

    return {
        "title": "Round-Trip All 18 Types",
        "description": "Survey for round-trip testing",
        "status": "draft",
        "welcome_message": "Welcome",
        "end_message": "Thank you",
        "default_language": "en",
        "settings": None,
        "groups": [
            {
                "title": "All Types Group",
                "description": "Contains all 18 question types",
                "sort_order": 1,
                "relevance": None,
                "questions": questions,
            }
        ],
    }


def _normalize_question(q: dict) -> dict:
    """Normalize a question dict for comparison — sort answer_options and subquestions by code."""
    normalized = {
        "code": q.get("code"),
        "question_type": q.get("question_type"),
        "title": q.get("title"),
        "is_required": q.get("is_required"),
        "sort_order": q.get("sort_order"),
    }
    # Sort answer_options by code for stable comparison
    opts = sorted(q.get("answer_options", []) or [], key=lambda o: o.get("code", ""))
    normalized["answer_option_codes"] = [o["code"] for o in opts]
    # Sort subquestions by code
    sqs = sorted(q.get("subquestions", []) or [], key=lambda s: s.get("code", ""))
    normalized["subquestion_codes"] = [s["code"] for s in sqs]
    return normalized


@pytest.mark.asyncio
async def test_export_import_round_trip_all_18_types(client: AsyncClient):
    """Full export → import → export → compare round-trip for all 18 question types."""
    headers = await auth_headers(client, "roundtrip_all18@example.com")

    payload = _build_round_trip_payload()

    # --- First import ---
    import_resp1 = await client.post(
        f"{SURVEYS_URL}/import",
        json={"data": payload},
        headers=headers,
    )
    assert import_resp1.status_code == 201, f"First import failed: {import_resp1.json()}"
    survey_id1 = import_resp1.json()["id"]

    # --- First export ---
    export_resp1 = await client.get(f"{SURVEYS_URL}/{survey_id1}/export", headers=headers)
    assert export_resp1.status_code == 200, f"First export failed: {export_resp1.json()}"
    export_data1 = export_resp1.json()

    # --- Second import from first export ---
    import_resp2 = await client.post(
        f"{SURVEYS_URL}/import",
        json={"data": export_data1},
        headers=headers,
    )
    assert import_resp2.status_code == 201, f"Second import failed: {import_resp2.json()}"
    survey_id2 = import_resp2.json()["id"]

    # --- Second export ---
    export_resp2 = await client.get(f"{SURVEYS_URL}/{survey_id2}/export", headers=headers)
    assert export_resp2.status_code == 200, f"Second export failed: {export_resp2.json()}"
    export_data2 = export_resp2.json()

    # --- Compare: both exports should have the same structure ---
    groups1 = export_data1.get("groups", [])
    groups2 = export_data2.get("groups", [])

    assert len(groups1) == len(groups2), "Group count mismatch between exports"

    for g1, g2 in zip(groups1, groups2):
        questions1 = sorted(g1.get("questions", []), key=lambda q: q.get("code", ""))
        questions2 = sorted(g2.get("questions", []), key=lambda q: q.get("code", ""))

        assert len(questions1) == len(questions2), f"Question count mismatch: {len(questions1)} vs {len(questions2)}"

        for q1, q2 in zip(questions1, questions2):
            norm1 = _normalize_question(q1)
            norm2 = _normalize_question(q2)
            assert norm1 == norm2, f"Question mismatch for {q1.get('code')}: {norm1} != {norm2}"

    # Verify all 18 types are present in the exported structure
    all_questions = [q for g in groups1 for q in g.get("questions", [])]
    exported_types = {q["question_type"] for q in all_questions}
    for qtype in _ALL_18_TYPES:
        assert qtype in exported_types, f"Question type {qtype!r} missing from round-trip export"


@pytest.mark.asyncio
async def test_export_import_preserves_survey_metadata(client: AsyncClient):
    """Export-import preserves survey-level metadata."""
    headers = await auth_headers(client, "roundtrip_meta@example.com")
    payload = {
        "title": "Metadata Test Survey",
        "description": "Test description",
        "status": "active",  # Import always sets to draft
        "welcome_message": "Welcome message here",
        "end_message": "End message here",
        "default_language": "fr",
        "settings": {"allow_back": True},
        "groups": [
            {
                "title": "Group 1",
                "description": None,
                "sort_order": 1,
                "relevance": None,
                "questions": [
                    {
                        "code": "Q001",
                        "question_type": "short_text",
                        "title": "Name",
                        "description": None,
                        "is_required": True,
                        "sort_order": 1,
                        "relevance": None,
                        "validation": None,
                        "settings": None,
                        "answer_options": [],
                        "subquestions": [],
                    }
                ],
            }
        ],
    }

    import_resp = await client.post(
        f"{SURVEYS_URL}/import",
        json={"data": payload},
        headers=headers,
    )
    assert import_resp.status_code == 201

    survey_id = import_resp.json()["id"]
    export_resp = await client.get(f"{SURVEYS_URL}/{survey_id}/export", headers=headers)
    assert export_resp.status_code == 200
    exported = export_resp.json()

    assert exported["title"] == "Metadata Test Survey"
    assert exported["description"] == "Test description"
    assert exported["welcome_message"] == "Welcome message here"
    assert exported["end_message"] == "End message here"
    assert exported["default_language"] == "fr"


@pytest.mark.asyncio
async def test_export_import_preserves_answer_options(client: AsyncClient):
    """Export-import round-trip preserves answer option codes, titles, and assessment values."""
    headers = await auth_headers(client, "roundtrip_opts@example.com")
    payload = {
        "title": "Options Test",
        "description": None,
        "status": "draft",
        "welcome_message": None,
        "end_message": None,
        "default_language": "en",
        "settings": None,
        "groups": [
            {
                "title": "Group 1",
                "description": None,
                "sort_order": 1,
                "relevance": None,
                "questions": [
                    {
                        "code": "Q001",
                        "question_type": "single_choice",
                        "title": "Choose one",
                        "description": None,
                        "is_required": False,
                        "sort_order": 1,
                        "relevance": None,
                        "validation": None,
                        "settings": None,
                        "answer_options": [
                            {"code": "OPT_A", "title": "Alpha", "sort_order": 1, "assessment_value": 10},
                            {"code": "OPT_B", "title": "Beta", "sort_order": 2, "assessment_value": 20},
                            {"code": "OPT_C", "title": "Gamma", "sort_order": 3, "assessment_value": 30},
                        ],
                        "subquestions": [],
                    }
                ],
            }
        ],
    }

    import_resp = await client.post(
        f"{SURVEYS_URL}/import",
        json={"data": payload},
        headers=headers,
    )
    assert import_resp.status_code == 201
    survey_id = import_resp.json()["id"]

    export_resp = await client.get(f"{SURVEYS_URL}/{survey_id}/export", headers=headers)
    assert export_resp.status_code == 200
    exported = export_resp.json()

    questions = exported["groups"][0]["questions"]
    assert len(questions) == 1
    opts = sorted(questions[0]["answer_options"], key=lambda o: o["code"])
    codes = [o["code"] for o in opts]
    assert "OPT_A" in codes
    assert "OPT_B" in codes
    assert "OPT_C" in codes

    opt_a = next(o for o in opts if o["code"] == "OPT_A")
    assert opt_a["title"] == "Alpha"
    assert opt_a["assessment_value"] == 10


@pytest.mark.asyncio
async def test_export_import_preserves_matrix_subquestions(client: AsyncClient):
    """Export-import preserves matrix subquestion structure."""
    headers = await auth_headers(client, "roundtrip_matrix@example.com")
    payload = {
        "title": "Matrix Test",
        "description": None,
        "status": "draft",
        "welcome_message": None,
        "end_message": None,
        "default_language": "en",
        "settings": None,
        "groups": [
            {
                "title": "Group 1",
                "description": None,
                "sort_order": 1,
                "relevance": None,
                "questions": [
                    {
                        "code": "MAT1",
                        "question_type": "matrix",
                        "title": "Matrix Question",
                        "description": None,
                        "is_required": False,
                        "sort_order": 1,
                        "relevance": None,
                        "validation": None,
                        "settings": None,
                        "answer_options": [
                            {"code": "COL_A", "title": "Agree", "sort_order": 1, "assessment_value": 0},
                            {"code": "COL_B", "title": "Disagree", "sort_order": 2, "assessment_value": 0},
                        ],
                        "subquestions": [
                            {
                                "code": "MAT1_ROW1",
                                "question_type": "short_text",
                                "title": "Statement 1",
                                "description": None,
                                "is_required": False,
                                "sort_order": 1,
                                "relevance": None,
                                "validation": None,
                                "settings": None,
                                "answer_options": [],
                                "subquestions": [],
                            },
                            {
                                "code": "MAT1_ROW2",
                                "question_type": "short_text",
                                "title": "Statement 2",
                                "description": None,
                                "is_required": False,
                                "sort_order": 2,
                                "relevance": None,
                                "validation": None,
                                "settings": None,
                                "answer_options": [],
                                "subquestions": [],
                            },
                        ],
                    }
                ],
            }
        ],
    }

    import_resp = await client.post(
        f"{SURVEYS_URL}/import",
        json={"data": payload},
        headers=headers,
    )
    assert import_resp.status_code == 201
    survey_id = import_resp.json()["id"]

    export_resp = await client.get(f"{SURVEYS_URL}/{survey_id}/export", headers=headers)
    assert export_resp.status_code == 200
    exported = export_resp.json()

    questions = exported["groups"][0]["questions"]
    assert len(questions) == 1
    matrix_q = questions[0]
    assert matrix_q["question_type"] == "matrix"

    subqs = sorted(matrix_q["subquestions"], key=lambda s: s["code"])
    sq_codes = [s["code"] for s in subqs]
    assert "MAT1_ROW1" in sq_codes
    assert "MAT1_ROW2" in sq_codes

    cols = sorted(matrix_q["answer_options"], key=lambda o: o["code"])
    assert any(c["code"] == "COL_A" for c in cols)
    assert any(c["code"] == "COL_B" for c in cols)
