"""Tests for scalar question type validators (unit + integration)."""

import pytest
from httpx import AsyncClient
from unittest.mock import MagicMock

from app.services.validators.scalar_validators import (
    validate_numeric_settings,
    validate_rating_settings,
    validate_boolean_settings,
    validate_date_settings,
    validate_numeric_answer,
    validate_rating_answer,
    validate_boolean_answer,
    validate_date_answer,
)
from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_question(is_required: bool = False, settings: dict | None = None, validation: dict | None = None):
    q = MagicMock()
    q.is_required = is_required
    q.settings = settings
    q.validation = validation
    return q


# ---------------------------------------------------------------------------
# Unit tests: validate_numeric_settings
# ---------------------------------------------------------------------------


def test_numeric_settings_none_passes():
    validate_numeric_settings(None)


def test_numeric_settings_empty_dict_passes():
    validate_numeric_settings({})


def test_numeric_settings_valid():
    validate_numeric_settings({
        "min_value": 0,
        "max_value": 100,
        "step": 5,
        "prefix": "$",
        "suffix": "kg",
        "placeholder": "Enter amount",
    })


def test_numeric_settings_min_equals_max_passes():
    validate_numeric_settings({"min_value": 10, "max_value": 10})


def test_numeric_settings_min_greater_than_max_raises():
    with pytest.raises(UnprocessableError, match="min_value must be <= settings.max_value"):
        validate_numeric_settings({"min_value": 100, "max_value": 50})


def test_numeric_settings_step_zero_raises():
    with pytest.raises(UnprocessableError, match="step must be a number > 0"):
        validate_numeric_settings({"step": 0})


def test_numeric_settings_step_negative_raises():
    with pytest.raises(UnprocessableError, match="step must be a number > 0"):
        validate_numeric_settings({"step": -1})


def test_numeric_settings_step_valid_float():
    validate_numeric_settings({"step": 0.5})


def test_numeric_settings_invalid_min_value():
    with pytest.raises(UnprocessableError, match="min_value must be a number"):
        validate_numeric_settings({"min_value": "low"})


def test_numeric_settings_invalid_max_value():
    with pytest.raises(UnprocessableError, match="max_value must be a number"):
        validate_numeric_settings({"max_value": "high"})


def test_numeric_settings_invalid_prefix():
    with pytest.raises(UnprocessableError, match="prefix must be a string"):
        validate_numeric_settings({"prefix": 42})


def test_numeric_settings_invalid_suffix():
    with pytest.raises(UnprocessableError, match="suffix must be a string"):
        validate_numeric_settings({"suffix": True})


def test_numeric_settings_invalid_placeholder():
    with pytest.raises(UnprocessableError, match="placeholder must be a string"):
        validate_numeric_settings({"placeholder": 123})


# ---------------------------------------------------------------------------
# Unit tests: validate_rating_settings
# ---------------------------------------------------------------------------


def test_rating_settings_none_passes():
    validate_rating_settings(None)


def test_rating_settings_empty_dict_passes():
    validate_rating_settings({})


def test_rating_settings_valid():
    validate_rating_settings({
        "min_rating": 1,
        "max_rating": 10,
        "step": 1,
        "icon": "star",
    })


def test_rating_settings_valid_icons():
    for icon in ("star", "heart", "thumb"):
        validate_rating_settings({"icon": icon})


def test_rating_settings_invalid_icon():
    with pytest.raises(UnprocessableError, match="icon must be one of"):
        validate_rating_settings({"icon": "emoji"})


def test_rating_settings_min_equals_max_passes():
    validate_rating_settings({"min_rating": 3, "max_rating": 3})


def test_rating_settings_min_greater_than_max_raises():
    with pytest.raises(UnprocessableError, match="min_rating must be <= settings.max_rating"):
        validate_rating_settings({"min_rating": 5, "max_rating": 1})


def test_rating_settings_invalid_min_rating_float():
    with pytest.raises(UnprocessableError, match="min_rating must be an integer"):
        validate_rating_settings({"min_rating": 1.5})


def test_rating_settings_invalid_max_rating_string():
    with pytest.raises(UnprocessableError, match="max_rating must be an integer"):
        validate_rating_settings({"max_rating": "five"})


def test_rating_settings_step_zero_raises():
    with pytest.raises(UnprocessableError, match="step must be an integer > 0"):
        validate_rating_settings({"step": 0})


def test_rating_settings_step_negative_raises():
    with pytest.raises(UnprocessableError, match="step must be an integer > 0"):
        validate_rating_settings({"step": -2})


def test_rating_settings_step_float_raises():
    with pytest.raises(UnprocessableError, match="step must be an integer > 0"):
        validate_rating_settings({"step": 0.5})


# ---------------------------------------------------------------------------
# Unit tests: validate_boolean_settings
# ---------------------------------------------------------------------------


def test_boolean_settings_none_passes():
    validate_boolean_settings(None)


def test_boolean_settings_empty_dict_passes():
    validate_boolean_settings({})


def test_boolean_settings_valid():
    validate_boolean_settings({
        "label_true": "Yes",
        "label_false": "No",
        "display": "toggle",
    })


def test_boolean_settings_valid_displays():
    for display in ("toggle", "radio"):
        validate_boolean_settings({"display": display})


def test_boolean_settings_invalid_display():
    with pytest.raises(UnprocessableError, match="display must be one of"):
        validate_boolean_settings({"display": "switch"})


def test_boolean_settings_invalid_label_true():
    with pytest.raises(UnprocessableError, match="label_true must be a string"):
        validate_boolean_settings({"label_true": True})


def test_boolean_settings_invalid_label_false():
    with pytest.raises(UnprocessableError, match="label_false must be a string"):
        validate_boolean_settings({"label_false": 0})


# ---------------------------------------------------------------------------
# Unit tests: validate_date_settings
# ---------------------------------------------------------------------------


def test_date_settings_none_passes():
    validate_date_settings(None)


def test_date_settings_empty_dict_passes():
    validate_date_settings({})


def test_date_settings_valid():
    validate_date_settings({
        "min_date": "2024-01-01",
        "max_date": "2024-12-31",
        "date_format": "YYYY-MM-DD",
        "include_time": False,
    })


def test_date_settings_min_equals_max_passes():
    validate_date_settings({"min_date": "2024-06-15", "max_date": "2024-06-15"})


def test_date_settings_min_greater_than_max_raises():
    with pytest.raises(UnprocessableError, match="min_date must be <= settings.max_date"):
        validate_date_settings({"min_date": "2024-12-31", "max_date": "2024-01-01"})


def test_date_settings_invalid_date_format():
    with pytest.raises(UnprocessableError, match="date_format must be a string"):
        validate_date_settings({"date_format": 20240101})


def test_date_settings_invalid_min_date_format():
    with pytest.raises(UnprocessableError, match="does not match date_format"):
        validate_date_settings({"min_date": "01/01/2024", "date_format": "YYYY-MM-DD"})


def test_date_settings_invalid_max_date_format():
    with pytest.raises(UnprocessableError, match="does not match date_format"):
        validate_date_settings({"max_date": "31-12-2024", "date_format": "YYYY-MM-DD"})


def test_date_settings_invalid_min_date_type():
    with pytest.raises(UnprocessableError, match="min_date must be a string"):
        validate_date_settings({"min_date": 20240101})


def test_date_settings_invalid_max_date_type():
    with pytest.raises(UnprocessableError, match="max_date must be a string"):
        validate_date_settings({"max_date": 20241231})


def test_date_settings_invalid_include_time():
    with pytest.raises(UnprocessableError, match="include_time must be a boolean"):
        validate_date_settings({"include_time": "yes"})


def test_date_settings_custom_format_valid():
    validate_date_settings({
        "date_format": "DD/MM/YYYY",
        "min_date": "01/01/2024",
        "max_date": "31/12/2024",
    })


def test_date_settings_custom_format_invalid_dates():
    with pytest.raises(UnprocessableError, match="does not match date_format"):
        validate_date_settings({
            "date_format": "DD/MM/YYYY",
            "min_date": "2024-01-01",
        })


# ---------------------------------------------------------------------------
# Unit tests: validate_numeric_answer
# ---------------------------------------------------------------------------


def test_numeric_answer_valid():
    q = make_question(is_required=False, settings={})
    validate_numeric_answer({"value": 42}, q)


def test_numeric_answer_none_not_required():
    q = make_question(is_required=False, settings={})
    validate_numeric_answer({"value": None}, q)


def test_numeric_answer_none_required_raises():
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_numeric_answer({"value": None}, q)


def test_numeric_answer_not_a_number_raises():
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a number"):
        validate_numeric_answer({"value": "abc"}, q)


def test_numeric_answer_below_min_raises():
    q = make_question(is_required=False, settings={"min_value": 10})
    with pytest.raises(UnprocessableError, match="below the minimum"):
        validate_numeric_answer({"value": 5}, q)


def test_numeric_answer_above_max_raises():
    q = make_question(is_required=False, settings={"max_value": 100})
    with pytest.raises(UnprocessableError, match="exceeds the maximum"):
        validate_numeric_answer({"value": 150}, q)


def test_numeric_answer_at_boundaries_passes():
    q = make_question(is_required=False, settings={"min_value": 0, "max_value": 100})
    validate_numeric_answer({"value": 0}, q)
    validate_numeric_answer({"value": 100}, q)


def test_numeric_answer_step_valid():
    q = make_question(is_required=False, settings={"min_value": 0, "step": 5})
    validate_numeric_answer({"value": 25}, q)


def test_numeric_answer_step_invalid_raises():
    q = make_question(is_required=False, settings={"min_value": 0, "step": 5})
    with pytest.raises(UnprocessableError, match="not divisible by step"):
        validate_numeric_answer({"value": 7}, q)


def test_numeric_answer_step_with_float_values():
    q = make_question(is_required=False, settings={"min_value": 0.0, "step": 0.5})
    validate_numeric_answer({"value": 1.5}, q)


def test_numeric_answer_step_float_invalid_raises():
    q = make_question(is_required=False, settings={"min_value": 0.0, "step": 0.5})
    with pytest.raises(UnprocessableError, match="not divisible by step"):
        validate_numeric_answer({"value": 1.3}, q)


def test_numeric_answer_no_settings():
    q = make_question(is_required=False, settings=None)
    validate_numeric_answer({"value": 999}, q)


# ---------------------------------------------------------------------------
# Unit tests: validate_rating_answer
# ---------------------------------------------------------------------------


def test_rating_answer_valid():
    q = make_question(is_required=False, settings={"min_rating": 1, "max_rating": 5})
    validate_rating_answer({"value": 3}, q)


def test_rating_answer_none_not_required():
    q = make_question(is_required=False, settings={})
    validate_rating_answer({"value": None}, q)


def test_rating_answer_none_required_raises():
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_rating_answer({"value": None}, q)


def test_rating_answer_not_integer_raises():
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be an integer"):
        validate_rating_answer({"value": 3.5}, q)


def test_rating_answer_below_min_raises():
    q = make_question(is_required=False, settings={"min_rating": 1, "max_rating": 5})
    with pytest.raises(UnprocessableError, match="below the minimum"):
        validate_rating_answer({"value": 0}, q)


def test_rating_answer_above_max_raises():
    q = make_question(is_required=False, settings={"min_rating": 1, "max_rating": 5})
    with pytest.raises(UnprocessableError, match="exceeds the maximum"):
        validate_rating_answer({"value": 6}, q)


def test_rating_answer_at_boundaries_passes():
    q = make_question(is_required=False, settings={"min_rating": 1, "max_rating": 5})
    validate_rating_answer({"value": 1}, q)
    validate_rating_answer({"value": 5}, q)


def test_rating_answer_uses_defaults_when_no_settings():
    q = make_question(is_required=False, settings=None)
    validate_rating_answer({"value": 1}, q)
    validate_rating_answer({"value": 5}, q)
    with pytest.raises(UnprocessableError, match="below the minimum"):
        validate_rating_answer({"value": 0}, q)
    with pytest.raises(UnprocessableError, match="exceeds the maximum"):
        validate_rating_answer({"value": 6}, q)


# ---------------------------------------------------------------------------
# Unit tests: validate_boolean_answer
# ---------------------------------------------------------------------------


def test_boolean_answer_true_string_passes():
    q = make_question(is_required=False, settings={})
    validate_boolean_answer({"value": "true"}, q)


def test_boolean_answer_false_string_passes():
    q = make_question(is_required=False, settings={})
    validate_boolean_answer({"value": "false"}, q)


def test_boolean_answer_none_not_required():
    q = make_question(is_required=False, settings={})
    validate_boolean_answer({"value": None}, q)


def test_boolean_answer_none_required_raises():
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_boolean_answer({"value": None}, q)


def test_boolean_answer_boolean_true_raises():
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be 'true' or 'false'"):
        validate_boolean_answer({"value": True}, q)


def test_boolean_answer_boolean_false_raises():
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be 'true' or 'false'"):
        validate_boolean_answer({"value": False}, q)


def test_boolean_answer_invalid_string_raises():
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be 'true' or 'false'"):
        validate_boolean_answer({"value": "yes"}, q)


def test_boolean_answer_integer_raises():
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be 'true' or 'false'"):
        validate_boolean_answer({"value": 1}, q)


# ---------------------------------------------------------------------------
# Unit tests: validate_date_answer
# ---------------------------------------------------------------------------


def test_date_answer_valid():
    q = make_question(is_required=False, settings={"date_format": "YYYY-MM-DD"})
    validate_date_answer({"value": "2024-06-15"}, q)


def test_date_answer_none_not_required():
    q = make_question(is_required=False, settings={})
    validate_date_answer({"value": None}, q)


def test_date_answer_none_required_raises():
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_date_answer({"value": None}, q)


def test_date_answer_not_string_raises():
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a string"):
        validate_date_answer({"value": 20240615}, q)


def test_date_answer_invalid_format_raises():
    q = make_question(is_required=False, settings={"date_format": "YYYY-MM-DD"})
    with pytest.raises(UnprocessableError, match="does not match date_format"):
        validate_date_answer({"value": "15/06/2024"}, q)


def test_date_answer_before_min_date_raises():
    q = make_question(is_required=False, settings={
        "date_format": "YYYY-MM-DD",
        "min_date": "2024-01-01",
    })
    with pytest.raises(UnprocessableError, match="before the minimum date"):
        validate_date_answer({"value": "2023-12-31"}, q)


def test_date_answer_after_max_date_raises():
    q = make_question(is_required=False, settings={
        "date_format": "YYYY-MM-DD",
        "max_date": "2024-12-31",
    })
    with pytest.raises(UnprocessableError, match="after the maximum date"):
        validate_date_answer({"value": "2025-01-01"}, q)


def test_date_answer_at_boundaries_passes():
    q = make_question(is_required=False, settings={
        "date_format": "YYYY-MM-DD",
        "min_date": "2024-01-01",
        "max_date": "2024-12-31",
    })
    validate_date_answer({"value": "2024-01-01"}, q)
    validate_date_answer({"value": "2024-12-31"}, q)


def test_date_answer_custom_format():
    q = make_question(is_required=False, settings={"date_format": "DD/MM/YYYY"})
    validate_date_answer({"value": "15/06/2024"}, q)


def test_date_answer_custom_format_invalid_raises():
    q = make_question(is_required=False, settings={"date_format": "DD/MM/YYYY"})
    with pytest.raises(UnprocessableError, match="does not match date_format"):
        validate_date_answer({"value": "2024-06-15"}, q)


def test_date_answer_uses_default_format_when_no_settings():
    q = make_question(is_required=False, settings=None)
    validate_date_answer({"value": "2024-06-15"}, q)


# ---------------------------------------------------------------------------
# Integration tests (HTTP)
# ---------------------------------------------------------------------------

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "scalarvalidator@example.com",
    "password": "securepassword123",
    "name": "Scalar Validator User",
}


async def register_and_login(client: AsyncClient, email: str) -> dict:
    await client.post(REGISTER_URL, json={**VALID_USER, "email": email})
    response = await client.post(
        LOGIN_URL, json={"email": email, "password": VALID_USER["password"]}
    )
    assert response.status_code == 200
    return response.json()


async def auth_headers(client: AsyncClient, email: str) -> dict:
    tokens = await register_and_login(client, email=email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict, title: str = "Test Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_group(client: AsyncClient, headers: dict, survey_id: str) -> str:
    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups",
        json={"title": "Test Group"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def questions_url(survey_id: str, group_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions"


async def create_question_no_assert(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    group_id: str,
    question_type: str,
    settings: dict | None = None,
):
    payload = {"question_type": question_type, "title": "Test Q"}
    if settings is not None:
        payload["settings"] = settings
    return await client.post(questions_url(survey_id, group_id), json=payload, headers=headers)


# ---------------------------------------------------------------------------
# Integration: create scalar question without settings → 201
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_numeric_without_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="sv_numeric_no_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(client, headers, survey_id, group_id, "numeric")
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_rating_without_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="sv_rating_no_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(client, headers, survey_id, group_id, "rating")
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_boolean_without_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="sv_boolean_no_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(client, headers, survey_id, group_id, "boolean")
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_date_without_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="sv_date_no_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(client, headers, survey_id, group_id, "date")
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Integration: create scalar question with valid settings → 201
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_numeric_with_valid_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="sv_numeric_valid_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "numeric",
        settings={"min_value": 0, "max_value": 100, "step": 5, "prefix": "$"}
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_rating_with_valid_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="sv_rating_valid_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "rating",
        settings={"min_rating": 1, "max_rating": 5, "icon": "star"}
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_boolean_with_valid_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="sv_boolean_valid_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "boolean",
        settings={"label_true": "Yes", "label_false": "No", "display": "toggle"}
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_date_with_valid_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="sv_date_valid_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "date",
        settings={"date_format": "YYYY-MM-DD", "min_date": "2024-01-01", "max_date": "2024-12-31"}
    )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Integration: create scalar question with invalid settings → 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_numeric_invalid_step_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="sv_numeric_bad_step@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "numeric",
        settings={"step": 0}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_numeric_min_greater_than_max_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="sv_numeric_min_max@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "numeric",
        settings={"min_value": 100, "max_value": 50}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_rating_invalid_icon_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="sv_rating_bad_icon@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "rating",
        settings={"icon": "emoji"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_boolean_invalid_display_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="sv_boolean_bad_display@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "boolean",
        settings={"display": "slider"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_date_invalid_min_max_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="sv_date_bad_minmax@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "date",
        settings={"min_date": "2024-12-31", "max_date": "2024-01-01"}
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Integration: update scalar question settings → validates correctly
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_numeric_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="sv_numeric_update@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "numeric", "title": "Numeric Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"min_value": 0, "max_value": 50, "step": 10}},
        headers=headers,
    )
    assert patch_resp.status_code == 200


@pytest.mark.asyncio
async def test_update_numeric_settings_invalid_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="sv_numeric_update_bad@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "numeric", "title": "Numeric Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"step": -5}},
        headers=headers,
    )
    assert patch_resp.status_code == 422
