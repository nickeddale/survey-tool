"""Tests for the unified Question Validation Engine (ISS-062).

Unit tests:
- QuestionValidationError dataclass
- validate_validation_rules for each allowed key (valid and invalid)
- min > max rejected
- min_length > max_length rejected
- regex syntax check
- custom_expression syntax check
- unknown key rejected
- validate_question_config dispatches correctly
- validate_answer required-field enforcement

Integration tests:
- POST question with invalid validation JSONB -> 422
- POST question with valid validation JSONB -> 201
- PATCH question to add invalid min > max -> 422
"""

import pytest
from unittest.mock import MagicMock
from httpx import AsyncClient

from app.services.validators import (
    QuestionValidationError,
    validate_question_config,
    validate_answer,
)
from app.services.validators.validation_rules import validate_validation_rules
from app.services.validators.text_validators import (
    validate_short_text_answer,
    validate_long_text_answer,
    validate_email_answer,
    validate_phone_answer,
    validate_url_answer,
)
from app.services.validators.misc_validators import (
    validate_yes_no_answer,
    validate_time_answer,
    validate_datetime_answer,
    validate_file_upload_answer,
    validate_number_answer,
    validate_scale_answer,
)
from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_question(
    question_type: str = "short_text",
    is_required: bool = False,
    settings: dict | None = None,
    validation: dict | None = None,
):
    q = MagicMock()
    q.question_type = question_type
    q.is_required = is_required
    q.settings = settings
    q.validation = validation
    q.answer_options = []
    q.subquestions = []
    return q


def make_option(code: str):
    opt = MagicMock()
    opt.code = code
    return opt


# ---------------------------------------------------------------------------
# QuestionValidationError dataclass
# ---------------------------------------------------------------------------


def test_question_validation_error_dataclass():
    err = QuestionValidationError(field="validation.min", message="must be a number")
    assert err.field == "validation.min"
    assert err.message == "must be a number"


def test_question_validation_error_equality():
    e1 = QuestionValidationError(field="f", message="m")
    e2 = QuestionValidationError(field="f", message="m")
    assert e1 == e2


# ---------------------------------------------------------------------------
# validate_validation_rules — allowed keys / types
# ---------------------------------------------------------------------------


def test_validation_rules_none_returns_empty():
    assert validate_validation_rules(None, "short_text") == []


def test_validation_rules_empty_dict_returns_empty():
    assert validate_validation_rules({}, "short_text") == []


def test_validation_rules_valid_min_max():
    errors = validate_validation_rules({"min": 1, "max": 10}, "numeric")
    assert errors == []


def test_validation_rules_valid_min_length_max_length():
    errors = validate_validation_rules({"min_length": 5, "max_length": 100}, "short_text")
    assert errors == []


def test_validation_rules_valid_regex():
    errors = validate_validation_rules({"regex": r"^\d+$"}, "short_text")
    assert errors == []


def test_validation_rules_valid_custom_expression():
    errors = validate_validation_rules({"custom_expression": "value > 0"}, "numeric")
    assert errors == []


def test_validation_rules_all_valid_keys():
    errors = validate_validation_rules(
        {
            "min": 0,
            "max": 100,
            "min_length": 1,
            "max_length": 50,
            "regex": r"\w+",
            "custom_expression": "len(value) > 0",
        },
        "short_text",
    )
    assert errors == []


# ---------------------------------------------------------------------------
# validate_validation_rules — unknown keys
# ---------------------------------------------------------------------------


def test_validation_rules_unknown_key():
    errors = validate_validation_rules({"unknown_key": 42}, "short_text")
    assert len(errors) == 1
    assert "unknown_key" in errors[0].field
    assert "not a recognised" in errors[0].message


def test_validation_rules_multiple_unknown_keys():
    errors = validate_validation_rules({"foo": 1, "bar": 2}, "short_text")
    fields = [e.field for e in errors]
    assert any("bar" in f for f in fields)
    assert any("foo" in f for f in fields)


# ---------------------------------------------------------------------------
# validate_validation_rules — type errors
# ---------------------------------------------------------------------------


def test_validation_rules_min_non_numeric():
    errors = validate_validation_rules({"min": "not_a_number"}, "numeric")
    assert any("min" in e.field for e in errors)
    assert any("number" in e.message for e in errors)


def test_validation_rules_max_non_numeric():
    errors = validate_validation_rules({"max": [1, 2]}, "numeric")
    assert any("max" in e.field for e in errors)


def test_validation_rules_min_bool_rejected():
    # bool is a subclass of int in Python, but we reject it explicitly
    errors = validate_validation_rules({"min": True}, "numeric")
    assert len(errors) >= 1


def test_validation_rules_min_length_non_int():
    errors = validate_validation_rules({"min_length": 1.5}, "short_text")
    assert any("min_length" in e.field for e in errors)


def test_validation_rules_min_length_negative():
    errors = validate_validation_rules({"min_length": -1}, "short_text")
    assert any("min_length" in e.field for e in errors)


def test_validation_rules_max_length_non_int():
    errors = validate_validation_rules({"max_length": "ten"}, "short_text")
    assert any("max_length" in e.field for e in errors)


def test_validation_rules_regex_non_string():
    errors = validate_validation_rules({"regex": 123}, "short_text")
    assert any("regex" in e.field for e in errors)


def test_validation_rules_custom_expression_non_string():
    errors = validate_validation_rules({"custom_expression": 99}, "short_text")
    assert any("custom_expression" in e.field for e in errors)


# ---------------------------------------------------------------------------
# validate_validation_rules — constraint violations
# ---------------------------------------------------------------------------


def test_validation_rules_min_greater_than_max():
    errors = validate_validation_rules({"min": 10, "max": 5}, "numeric")
    assert len(errors) == 1
    assert "min" in errors[0].field
    assert "max" in errors[0].message


def test_validation_rules_min_equals_max_ok():
    errors = validate_validation_rules({"min": 5, "max": 5}, "numeric")
    assert errors == []


def test_validation_rules_min_length_greater_than_max_length():
    errors = validate_validation_rules({"min_length": 20, "max_length": 5}, "short_text")
    assert len(errors) == 1
    assert "min_length" in errors[0].field


def test_validation_rules_min_length_equals_max_length_ok():
    errors = validate_validation_rules({"min_length": 10, "max_length": 10}, "short_text")
    assert errors == []


# ---------------------------------------------------------------------------
# validate_validation_rules — regex syntax
# ---------------------------------------------------------------------------


def test_validation_rules_invalid_regex():
    errors = validate_validation_rules({"regex": "[unclosed"}, "short_text")
    assert len(errors) == 1
    assert "regex" in errors[0].field
    assert "valid regular expression" in errors[0].message


def test_validation_rules_valid_complex_regex():
    errors = validate_validation_rules({"regex": r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$"}, "email")
    assert errors == []


# ---------------------------------------------------------------------------
# validate_validation_rules — custom_expression syntax
# ---------------------------------------------------------------------------


def test_validation_rules_invalid_custom_expression():
    errors = validate_validation_rules({"custom_expression": "def bad("}, "short_text")
    assert len(errors) == 1
    assert "custom_expression" in errors[0].field
    assert "syntax" in errors[0].message


def test_validation_rules_valid_custom_expression_arithmetic():
    errors = validate_validation_rules({"custom_expression": "value * 2 + 1"}, "numeric")
    assert errors == []


def test_validation_rules_not_a_dict():
    errors = validate_validation_rules("not_a_dict", "short_text")
    assert len(errors) == 1
    assert "validation" in errors[0].field


# ---------------------------------------------------------------------------
# validate_question_config — dispatching
# ---------------------------------------------------------------------------


def test_validate_question_config_scalar_valid():
    errors = validate_question_config(
        question_type="numeric",
        settings={"min_value": 0, "max_value": 100},
        validation={"min": 0, "max": 100},
    )
    assert errors == []


def test_validate_question_config_scalar_invalid_settings():
    errors = validate_question_config(
        question_type="numeric",
        settings={"min_value": 100, "max_value": 0},  # min > max in settings
        validation=None,
    )
    assert len(errors) >= 1
    assert any("settings" in e.field for e in errors)


def test_validate_question_config_invalid_validation_rules():
    errors = validate_question_config(
        question_type="short_text",
        settings=None,
        validation={"min": 10, "max": 5},
    )
    assert len(errors) >= 1
    assert any("validation" in e.field for e in errors)


def test_validate_question_config_choice_no_options_no_settings():
    # Without settings, structural check is skipped (allows creation before adding options)
    errors = validate_question_config(
        question_type="single_choice",
        settings=None,
        validation=None,
        answer_options=[],
    )
    assert errors == []


def test_validate_question_config_choice_settings_with_no_options_raises():
    # WITH settings, structural check fires and requires at least one option
    errors = validate_question_config(
        question_type="single_choice",
        settings={"randomize": True},
        validation=None,
        answer_options=[],
    )
    assert len(errors) >= 1
    assert any("settings" in e.field for e in errors)


def test_validate_question_config_choice_with_options():
    opt = make_option("A")
    errors = validate_question_config(
        question_type="single_choice",
        settings={"randomize": True},
        validation=None,
        answer_options=[opt],
    )
    assert errors == []


def test_validate_question_config_matrix_no_subquestions_no_settings():
    # Without settings, structural check is skipped
    opt = make_option("col1")
    errors = validate_question_config(
        question_type="matrix",
        settings=None,
        validation=None,
        answer_options=[opt],
        subquestions=[],
    )
    assert errors == []


def test_validate_question_config_matrix_settings_no_subquestions_raises():
    # WITH settings, structural check fires
    opt = make_option("col1")
    errors = validate_question_config(
        question_type="matrix",
        settings={"alternate_rows": True},
        validation=None,
        answer_options=[opt],
        subquestions=[],
    )
    assert len(errors) >= 1


def test_validate_question_config_unknown_type_no_errors():
    # Unknown types have no registered config validator; validation rules still apply
    errors = validate_question_config(
        question_type="custom_future_type",
        settings=None,
        validation=None,
    )
    assert errors == []


def test_validate_question_config_unknown_key_in_validation():
    errors = validate_question_config(
        question_type="short_text",
        settings=None,
        validation={"bad_key": 1},
    )
    assert len(errors) >= 1


# ---------------------------------------------------------------------------
# validate_answer — required field enforcement
# ---------------------------------------------------------------------------


def test_validate_answer_required_short_text_missing():
    q = make_question("short_text", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) >= 1
    assert "required" in errors[0].message.lower()


def test_validate_answer_not_required_short_text_missing_ok():
    q = make_question("short_text", is_required=False)
    errors = validate_answer({"value": None}, q)
    assert errors == []


def test_validate_answer_required_numeric_missing():
    q = make_question("numeric", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) >= 1


def test_validate_answer_required_boolean_missing():
    q = make_question("boolean", is_required=True)
    errors = validate_answer({"value": None}, q)
    assert len(errors) >= 1


def test_validate_answer_required_single_choice_missing():
    q = make_question("single_choice", is_required=True)
    errors = validate_answer({"value": None}, q, answer_options=[])
    assert len(errors) >= 1


def test_validate_answer_unknown_type_returns_empty():
    q = make_question("future_type", is_required=True)
    errors = validate_answer({"value": "anything"}, q)
    assert errors == []


# ---------------------------------------------------------------------------
# validate_answer — type-specific answer validation
# ---------------------------------------------------------------------------


def test_validate_answer_numeric_valid():
    q = make_question("numeric", settings={"min_value": 0, "max_value": 100})
    errors = validate_answer({"value": 50}, q)
    assert errors == []


def test_validate_answer_numeric_out_of_range():
    q = make_question("numeric", settings={"min_value": 0, "max_value": 10})
    errors = validate_answer({"value": 99}, q)
    assert len(errors) >= 1


def test_validate_answer_boolean_valid():
    q = make_question("boolean")
    errors = validate_answer({"value": "true"}, q)
    assert errors == []


def test_validate_answer_boolean_invalid():
    q = make_question("boolean")
    errors = validate_answer({"value": "maybe"}, q)
    assert len(errors) >= 1


def test_validate_answer_yes_no_valid():
    q = make_question("yes_no")
    errors = validate_answer({"value": "yes"}, q)
    assert errors == []


def test_validate_answer_yes_no_invalid():
    q = make_question("yes_no")
    errors = validate_answer({"value": "true"}, q)
    assert len(errors) >= 1


# ---------------------------------------------------------------------------
# text_validators unit tests
# ---------------------------------------------------------------------------


def test_short_text_required_empty_raises():
    q = make_question("short_text", is_required=True)
    with pytest.raises(UnprocessableError):
        validate_short_text_answer({"value": ""}, q)


def test_short_text_not_required_empty_ok():
    q = make_question("short_text", is_required=False)
    validate_short_text_answer({"value": None}, q)  # no exception


def test_short_text_min_length_enforcement():
    q = make_question("short_text", validation={"min_length": 5})
    with pytest.raises(UnprocessableError, match="at least 5"):
        validate_short_text_answer({"value": "hi"}, q)


def test_short_text_max_length_enforcement():
    q = make_question("short_text", validation={"max_length": 3})
    with pytest.raises(UnprocessableError, match="at most 3"):
        validate_short_text_answer({"value": "toolong"}, q)


def test_short_text_regex_match_ok():
    q = make_question("short_text", validation={"regex": r"^\d{4}$"})
    validate_short_text_answer({"value": "1234"}, q)  # no exception


def test_short_text_regex_no_match_raises():
    q = make_question("short_text", validation={"regex": r"^\d{4}$"})
    with pytest.raises(UnprocessableError, match="pattern"):
        validate_short_text_answer({"value": "abcd"}, q)


def test_email_valid():
    q = make_question("email")
    validate_email_answer({"value": "user@example.com"}, q)  # no exception


def test_email_missing_at_raises():
    q = make_question("email")
    with pytest.raises(UnprocessableError, match="email"):
        validate_email_answer({"value": "notanemail"}, q)


def test_email_missing_domain_raises():
    q = make_question("email")
    with pytest.raises(UnprocessableError, match="email"):
        validate_email_answer({"value": "user@"}, q)


def test_phone_valid():
    q = make_question("phone")
    validate_phone_answer({"value": "+1-800-555-0199"}, q)


def test_phone_invalid_raises():
    q = make_question("phone")
    with pytest.raises(UnprocessableError, match="phone"):
        validate_phone_answer({"value": "not a phone!!"}, q)


def test_url_valid():
    q = make_question("url")
    validate_url_answer({"value": "https://example.com/path"}, q)


def test_url_no_scheme_raises():
    q = make_question("url")
    with pytest.raises(UnprocessableError, match="URL"):
        validate_url_answer({"value": "example.com"}, q)


# ---------------------------------------------------------------------------
# misc_validators unit tests
# ---------------------------------------------------------------------------


def test_yes_no_valid_yes():
    q = make_question("yes_no")
    validate_yes_no_answer({"value": "yes"}, q)


def test_yes_no_valid_no():
    q = make_question("yes_no")
    validate_yes_no_answer({"value": "no"}, q)


def test_yes_no_invalid_raises():
    q = make_question("yes_no")
    with pytest.raises(UnprocessableError, match="'yes' or 'no'"):
        validate_yes_no_answer({"value": "maybe"}, q)


def test_time_valid_hhmm():
    q = make_question("time")
    validate_time_answer({"value": "14:30"}, q)


def test_time_valid_hhmmss():
    q = make_question("time")
    validate_time_answer({"value": "09:05:00"}, q)


def test_time_invalid_raises():
    q = make_question("time")
    with pytest.raises(UnprocessableError, match="valid time"):
        validate_time_answer({"value": "25:00"}, q)


def test_datetime_valid():
    q = make_question("datetime")
    validate_datetime_answer({"value": "2024-01-15T09:30:00"}, q)


def test_datetime_valid_date_only():
    q = make_question("datetime")
    validate_datetime_answer({"value": "2024-01-15"}, q)


def test_datetime_invalid_raises():
    q = make_question("datetime")
    with pytest.raises(UnprocessableError, match="valid datetime"):
        validate_datetime_answer({"value": "not-a-date"}, q)


def test_file_upload_required_empty_raises():
    q = make_question("file_upload", is_required=True)
    with pytest.raises(UnprocessableError, match="required"):
        validate_file_upload_answer({"value": None}, q)


def test_file_upload_not_required_ok():
    q = make_question("file_upload", is_required=False)
    validate_file_upload_answer({"value": None}, q)  # no exception


def test_number_valid():
    q = make_question("number")
    validate_number_answer({"value": 42.5}, q)


def test_number_required_missing_raises():
    q = make_question("number", is_required=True)
    with pytest.raises(UnprocessableError, match="required"):
        validate_number_answer({"value": None}, q)


def test_number_min_validation():
    q = make_question("number", validation={"min": 10})
    with pytest.raises(UnprocessableError, match="minimum"):
        validate_number_answer({"value": 5}, q)


def test_scale_valid():
    q = make_question("scale")
    validate_scale_answer({"value": 3}, q)


def test_scale_below_min_raises():
    q = make_question("scale", validation={"min": 1, "max": 5})
    with pytest.raises(UnprocessableError, match="minimum"):
        validate_scale_answer({"value": 0}, q)


# ===========================================================================
# Integration tests
# ===========================================================================

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "valengine@example.com",
    "password": "securepassword123",
    "name": "Validation Engine User",
}


async def _register_and_login(client: AsyncClient) -> dict:
    await client.post(REGISTER_URL, json=VALID_USER)
    resp = await client.post(
        LOGIN_URL,
        json={"email": VALID_USER["email"], "password": VALID_USER["password"]},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _create_survey(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(SURVEYS_URL, json={"title": "Validation Test Survey"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_group(client: AsyncClient, headers: dict, survey_id: str) -> str:
    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups",
        json={"title": "Test Group"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_create_question_invalid_validation_jsonb_returns_422(client: AsyncClient):
    """POST with invalid validation JSONB (min > max) should return 422."""
    headers = await _register_and_login(client)
    survey_id = await _create_survey(client, headers)
    group_id = await _create_group(client, headers, survey_id)

    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={
            "question_type": "numeric",
            "title": "Age",
            "validation": {"min": 100, "max": 5},  # invalid: min > max
        },
        headers=headers,
    )
    assert resp.status_code == 422
    body = resp.json()
    assert "detail" in body


@pytest.mark.asyncio
async def test_create_question_valid_validation_jsonb_returns_201(client: AsyncClient):
    """POST with valid validation JSONB should return 201."""
    headers = await _register_and_login(client)
    survey_id = await _create_survey(client, headers)
    group_id = await _create_group(client, headers, survey_id)

    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={
            "question_type": "short_text",
            "title": "Full Name",
            "validation": {"min_length": 2, "max_length": 100},
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["question_type"] == "short_text"


@pytest.mark.asyncio
async def test_create_question_unknown_validation_key_returns_422(client: AsyncClient):
    """POST with unknown key in validation JSONB should return 422."""
    headers = await _register_and_login(client)
    survey_id = await _create_survey(client, headers)
    group_id = await _create_group(client, headers, survey_id)

    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={
            "question_type": "short_text",
            "title": "Name",
            "validation": {"invalid_key": 1},
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_question_invalid_regex_returns_422(client: AsyncClient):
    """POST with syntactically invalid regex should return 422."""
    headers = await _register_and_login(client)
    survey_id = await _create_survey(client, headers)
    group_id = await _create_group(client, headers, survey_id)

    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={
            "question_type": "short_text",
            "title": "Pattern Question",
            "validation": {"regex": "[unclosed"},
        },
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_question_adds_invalid_min_max_returns_422(client: AsyncClient):
    """PATCH to add invalid min > max in validation should return 422."""
    headers = await _register_and_login(client)
    survey_id = await _create_survey(client, headers)
    group_id = await _create_group(client, headers, survey_id)

    # Create a valid question first
    create_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={"question_type": "numeric", "title": "Score"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Patch with invalid validation
    patch_resp = await client.patch(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions/{question_id}",
        json={"validation": {"min": 50, "max": 10}},
        headers=headers,
    )
    assert patch_resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_question_valid_validation_returns_200(client: AsyncClient):
    """PATCH with valid validation JSONB should return 200."""
    headers = await _register_and_login(client)
    survey_id = await _create_survey(client, headers)
    group_id = await _create_group(client, headers, survey_id)

    create_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={"question_type": "short_text", "title": "Bio"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions/{question_id}",
        json={"validation": {"min_length": 10, "max_length": 500}},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["validation"]["min_length"] == 10
