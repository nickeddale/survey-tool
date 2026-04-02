"""Tests for choice question type validators (unit + integration)."""

import pytest
from httpx import AsyncClient
from unittest.mock import MagicMock

from app.services.validators.choice_validators import (
    validate_checkbox_settings,
    validate_dropdown_settings,
    validate_radio_settings,
    validate_checkbox_answer,
    validate_dropdown_answer,
    validate_radio_answer,
)
from app.utils.errors import UnprocessableError


# ---------------------------------------------------------------------------
# Helpers for mock objects
# ---------------------------------------------------------------------------


def make_option(code: str):
    opt = MagicMock()
    opt.code = code
    return opt


def make_question(is_required: bool = False, settings: dict | None = None):
    q = MagicMock()
    q.is_required = is_required
    q.settings = settings
    return q


# ---------------------------------------------------------------------------
# Unit tests: validate_radio_settings
# ---------------------------------------------------------------------------


def test_radio_settings_valid_with_options():
    options = [make_option("A"), make_option("B")]
    validate_radio_settings(None, options)  # no exception


def test_radio_settings_no_options_raises():
    with pytest.raises(UnprocessableError, match="at least one answer option"):
        validate_radio_settings(None, [])


def test_radio_settings_with_valid_settings():
    options = [make_option("A")]
    settings = {
        "has_other": True,
        "other_text": "Other",
        "randomize": False,
        "columns": 2,
    }
    validate_radio_settings(settings, options)


def test_radio_settings_invalid_has_other():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="has_other must be a boolean"):
        validate_radio_settings({"has_other": "yes"}, options)


def test_radio_settings_invalid_other_text():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="other_text must be a string"):
        validate_radio_settings({"other_text": 123}, options)


def test_radio_settings_invalid_randomize():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="randomize must be a boolean"):
        validate_radio_settings({"randomize": "true"}, options)


def test_radio_settings_invalid_columns_zero():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="columns must be an integer between 1 and 4"):
        validate_radio_settings({"columns": 0}, options)


def test_radio_settings_invalid_columns_five():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="columns must be an integer between 1 and 4"):
        validate_radio_settings({"columns": 5}, options)


def test_radio_settings_invalid_columns_string():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="columns must be an integer between 1 and 4"):
        validate_radio_settings({"columns": "2"}, options)


def test_radio_settings_columns_valid_boundaries():
    options = [make_option("A")]
    validate_radio_settings({"columns": 1}, options)
    validate_radio_settings({"columns": 4}, options)


# ---------------------------------------------------------------------------
# Unit tests: validate_dropdown_settings
# ---------------------------------------------------------------------------


def test_dropdown_settings_valid_with_options():
    options = [make_option("A")]
    validate_dropdown_settings(None, options)


def test_dropdown_settings_no_options_raises():
    with pytest.raises(UnprocessableError, match="at least one answer option"):
        validate_dropdown_settings(None, [])


def test_dropdown_settings_with_valid_settings():
    options = [make_option("A")]
    settings = {
        "placeholder": "Select one...",
        "searchable": True,
        "has_other": False,
        "other_text": "Other",
    }
    validate_dropdown_settings(settings, options)


def test_dropdown_settings_invalid_placeholder():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="placeholder must be a string"):
        validate_dropdown_settings({"placeholder": 42}, options)


def test_dropdown_settings_invalid_searchable():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="searchable must be a boolean"):
        validate_dropdown_settings({"searchable": 1}, options)


def test_dropdown_settings_invalid_has_other():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="has_other must be a boolean"):
        validate_dropdown_settings({"has_other": "no"}, options)


def test_dropdown_settings_invalid_other_text():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="other_text must be a string"):
        validate_dropdown_settings({"other_text": []}, options)


# ---------------------------------------------------------------------------
# Unit tests: validate_checkbox_settings
# ---------------------------------------------------------------------------


def test_checkbox_settings_valid_with_options():
    options = [make_option("A"), make_option("B")]
    validate_checkbox_settings(None, options)


def test_checkbox_settings_no_options_raises():
    with pytest.raises(UnprocessableError, match="at least one answer option"):
        validate_checkbox_settings(None, [])


def test_checkbox_settings_with_all_valid_settings():
    options = [make_option("A"), make_option("B"), make_option("C")]
    settings = {
        "has_other": True,
        "other_text": "Other",
        "randomize": True,
        "columns": 3,
        "select_all": True,
        "select_all_text": "Select all",
        "min_choices": 1,
        "max_choices": 3,
    }
    validate_checkbox_settings(settings, options)


def test_checkbox_settings_min_choices_exceeds_options():
    options = [make_option("A"), make_option("B")]
    with pytest.raises(UnprocessableError, match="min_choices.*exceeds the number of answer options"):
        validate_checkbox_settings({"min_choices": 3}, options)


def test_checkbox_settings_min_choices_equals_options_count():
    options = [make_option("A"), make_option("B")]
    validate_checkbox_settings({"min_choices": 2}, options)  # OK: equal is fine


def test_checkbox_settings_max_choices_less_than_min():
    options = [make_option("A"), make_option("B"), make_option("C")]
    with pytest.raises(UnprocessableError, match="max_choices must be >= settings.min_choices"):
        validate_checkbox_settings({"min_choices": 3, "max_choices": 2}, options)


def test_checkbox_settings_min_choices_zero_raises():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="min_choices must be an integer >= 1"):
        validate_checkbox_settings({"min_choices": 0}, options)


def test_checkbox_settings_max_choices_zero_raises():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="max_choices must be an integer >= 1"):
        validate_checkbox_settings({"max_choices": 0}, options)


def test_checkbox_settings_invalid_select_all():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="select_all must be a boolean"):
        validate_checkbox_settings({"select_all": "yes"}, options)


def test_checkbox_settings_invalid_select_all_text():
    options = [make_option("A")]
    with pytest.raises(UnprocessableError, match="select_all_text must be a string"):
        validate_checkbox_settings({"select_all_text": 0}, options)


# ---------------------------------------------------------------------------
# Unit tests: validate_radio_answer
# ---------------------------------------------------------------------------


def test_radio_answer_valid_option():
    options = [make_option("A1"), make_option("A2")]
    q = make_question(is_required=False, settings={})
    validate_radio_answer({"value": "A1"}, q, options)


def test_radio_answer_null_not_required():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    validate_radio_answer({"value": None}, q, options)


def test_radio_answer_null_required_raises():
    options = [make_option("A1")]
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_radio_answer({"value": None}, q, options)


def test_radio_answer_invalid_code_raises():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid answer option code"):
        validate_radio_answer({"value": "INVALID"}, q, options)


def test_radio_answer_other_with_has_other():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={"has_other": True})
    validate_radio_answer({"value": "other", "other_value": "My custom answer"}, q, options)


def test_radio_answer_other_without_has_other_raises():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={"has_other": False})
    with pytest.raises(UnprocessableError, match="'other' is not a valid option"):
        validate_radio_answer({"value": "other", "other_value": "text"}, q, options)


def test_radio_answer_other_empty_other_value_raises():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={"has_other": True})
    with pytest.raises(UnprocessableError, match="other_value is required"):
        validate_radio_answer({"value": "other", "other_value": "  "}, q, options)


# ---------------------------------------------------------------------------
# Unit tests: validate_dropdown_answer (delegates to radio logic)
# ---------------------------------------------------------------------------


def test_dropdown_answer_valid():
    options = [make_option("OPT1"), make_option("OPT2")]
    q = make_question(is_required=False, settings={})
    validate_dropdown_answer({"value": "OPT1"}, q, options)


def test_dropdown_answer_invalid_code():
    options = [make_option("OPT1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid answer option code"):
        validate_dropdown_answer({"value": "NOPE"}, q, options)


# ---------------------------------------------------------------------------
# Unit tests: validate_checkbox_answer
# ---------------------------------------------------------------------------


def test_checkbox_answer_valid_single():
    options = [make_option("A1"), make_option("A2")]
    q = make_question(is_required=False, settings={})
    validate_checkbox_answer({"values": ["A1"]}, q, options)


def test_checkbox_answer_valid_multiple():
    options = [make_option("A1"), make_option("A2"), make_option("A3")]
    q = make_question(is_required=False, settings={"min_choices": 2, "max_choices": 3})
    validate_checkbox_answer({"values": ["A1", "A2"]}, q, options)


def test_checkbox_answer_empty_not_required():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    validate_checkbox_answer({"values": []}, q, options)


def test_checkbox_answer_empty_required_raises():
    options = [make_option("A1")]
    q = make_question(is_required=True, settings={})
    with pytest.raises(UnprocessableError, match="required"):
        validate_checkbox_answer({"values": []}, q, options)


def test_checkbox_answer_invalid_code():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="not a valid answer option code"):
        validate_checkbox_answer({"values": ["NOPE"]}, q, options)


def test_checkbox_answer_below_min_choices():
    options = [make_option("A1"), make_option("A2"), make_option("A3")]
    q = make_question(is_required=False, settings={"min_choices": 2})
    with pytest.raises(UnprocessableError, match="At least 2 answer"):
        validate_checkbox_answer({"values": ["A1"]}, q, options)


def test_checkbox_answer_above_max_choices():
    options = [make_option("A1"), make_option("A2"), make_option("A3")]
    q = make_question(is_required=False, settings={"max_choices": 2})
    with pytest.raises(UnprocessableError, match="No more than 2 answer"):
        validate_checkbox_answer({"values": ["A1", "A2", "A3"]}, q, options)


def test_checkbox_answer_other_with_has_other():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={"has_other": True})
    validate_checkbox_answer({"values": ["A1", "other"], "other_value": "custom"}, q, options)


def test_checkbox_answer_other_without_has_other_raises():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={"has_other": False})
    with pytest.raises(UnprocessableError, match="'other' is not a valid option"):
        validate_checkbox_answer({"values": ["other"], "other_value": "text"}, q, options)


def test_checkbox_answer_values_not_list():
    options = [make_option("A1")]
    q = make_question(is_required=False, settings={})
    with pytest.raises(UnprocessableError, match="must be a list"):
        validate_checkbox_answer({"values": "A1"}, q, options)


# ---------------------------------------------------------------------------
# Integration tests (HTTP)
# ---------------------------------------------------------------------------

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "choicevalidator@example.com",
    "password": "securepassword123",
    "name": "Choice Validator User",
}


async def register_and_login(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
    await client.post(REGISTER_URL, json={**VALID_USER, "email": email})
    response = await client.post(
        LOGIN_URL, json={"email": email, "password": VALID_USER["password"]}
    )
    assert response.status_code == 200
    return response.json()


async def auth_headers(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
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


def options_url(survey_id: str, question_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/questions/{question_id}/options"


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


# --------------------------------------------------------------------------- #
# Integration: create choice question with settings but no options → 422
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_radio_with_settings_no_options_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="cv_radio_no_opts@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id,
        "single_choice", settings={"randomize": False}
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.json()}"


@pytest.mark.asyncio
async def test_create_dropdown_with_settings_no_options_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="cv_dd_no_opts@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id,
        "dropdown", settings={"searchable": True}
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.json()}"


@pytest.mark.asyncio
async def test_create_checkbox_with_settings_no_options_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="cv_cb_no_opts@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id,
        "multiple_choice", settings={"randomize": True}
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.json()}"


# --------------------------------------------------------------------------- #
# Integration: create choice question without settings → 201 (no validation)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_radio_without_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="cv_radio_no_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "single_choice"
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_dropdown_without_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="cv_dd_no_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "dropdown"
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_checkbox_without_settings_succeeds(client: AsyncClient):
    headers = await auth_headers(client, email="cv_cb_no_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id, "multiple_choice"
    )
    assert resp.status_code == 201


# --------------------------------------------------------------------------- #
# Integration: invalid settings fields return 422
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_radio_invalid_columns_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="cv_radio_bad_cols@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id,
        "single_choice", settings={"columns": 99}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_dropdown_invalid_searchable_returns_422(client: AsyncClient):
    headers = await auth_headers(client, email="cv_dd_bad_search@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await create_question_no_assert(
        client, headers, survey_id, group_id,
        "dropdown", settings={"searchable": "yes"}
    )
    assert resp.status_code == 422


# --------------------------------------------------------------------------- #
# Integration: update settings with options present → validates option count
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_update_radio_settings_with_options_succeeds(client: AsyncClient):
    """Update a radio question's settings after adding options → should succeed."""
    headers = await auth_headers(client, email="cv_radio_update@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # Create question without settings
    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "single_choice", "title": "Radio Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Add an answer option
    opt_resp = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Option A"},
        headers=headers,
    )
    assert opt_resp.status_code == 201

    # Update with settings — should pass since options now exist
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"randomize": True, "columns": 2}},
        headers=headers,
    )
    assert patch_resp.status_code == 200


@pytest.mark.asyncio
async def test_update_radio_settings_without_options_returns_422(client: AsyncClient):
    """Update a radio question's settings when no options exist → 422."""
    headers = await auth_headers(client, email="cv_radio_update_no_opts@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "single_choice", "title": "Radio Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"randomize": True}},
        headers=headers,
    )
    assert patch_resp.status_code == 422


@pytest.mark.asyncio
async def test_update_checkbox_min_choices_exceeds_options_returns_422(client: AsyncClient):
    """Update checkbox min_choices to exceed option count → 422."""
    headers = await auth_headers(client, email="cv_cb_min_exceed@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # Create question without settings
    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "multiple_choice", "title": "Checkbox Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Add only 1 option
    await client.post(
        options_url(survey_id, question_id),
        json={"title": "Option A"},
        headers=headers,
    )

    # Update with min_choices=3 (more than 1 option) → 422
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"min_choices": 3}},
        headers=headers,
    )
    assert patch_resp.status_code == 422
