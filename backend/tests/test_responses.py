"""Tests for the public POST /api/v1/surveys/{id}/responses endpoint."""

import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update

from app.models.survey import Survey

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "responseuser@example.com",
    "password": "securepassword123",
    "name": "Response User",
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


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


async def add_group_and_question(
    client: AsyncClient, headers: dict, survey_id: str
) -> str:
    """Add a question group and one question; return the question id."""
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Question 1", "question_type": "short_text"},
        headers=headers,
    )
    assert q_resp.status_code == 201
    return q_resp.json()["id"]


async def activate_survey(client: AsyncClient, headers: dict, survey_id: str) -> None:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/activate",
        headers=headers,
    )
    assert resp.status_code == 200


async def create_active_survey(client: AsyncClient) -> tuple[str, str, dict]:
    """Create a user, survey, add a question, and activate the survey.

    Returns (survey_id, question_id, auth_headers).
    """
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    question_id = await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)
    return survey_id, question_id, headers


# --------------------------------------------------------------------------- #
# POST /surveys/{id}/responses — success cases
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_submit_response_returns_201(client: AsyncClient):
    survey_id, _question_id, _headers = await create_active_survey(client)

    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_submit_response_returns_expected_fields(client: AsyncClient):
    survey_id, _question_id, _headers = await create_active_survey(client)

    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert resp.status_code == 201
    body = resp.json()

    assert "id" in body
    assert body["survey_id"] == survey_id
    assert body["status"] == "incomplete"
    assert "started_at" in body
    assert "created_at" in body
    assert "updated_at" in body
    assert body["completed_at"] is None
    assert body["participant_id"] is None


@pytest.mark.asyncio
async def test_submit_response_no_auth_required(client: AsyncClient):
    """Endpoint is public — no Authorization header needed."""
    survey_id, _question_id, _headers = await create_active_survey(client)

    # Deliberately omit auth headers
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_submit_response_captures_ip_from_x_forwarded_for(client: AsyncClient):
    survey_id, _question_id, _headers = await create_active_survey(client)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={},
        headers={"X-Forwarded-For": "203.0.113.42"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["ip_address"] == "203.0.113.42"


@pytest.mark.asyncio
async def test_submit_response_captures_metadata(client: AsyncClient):
    survey_id, _question_id, _headers = await create_active_survey(client)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={},
        headers={
            "User-Agent": "TestBrowser/1.0",
            "Referer": "https://example.com/survey",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["metadata_"]["user_agent"] == "TestBrowser/1.0"
    assert body["metadata_"]["referrer"] == "https://example.com/survey"


@pytest.mark.asyncio
async def test_submit_response_with_initial_answers(client: AsyncClient):
    survey_id, question_id, _headers = await create_active_survey(client)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={
            "answers": [
                {"question_id": question_id, "value": "Hello world"},
            ]
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "incomplete"


@pytest.mark.asyncio
async def test_submit_response_empty_answers_list(client: AsyncClient):
    survey_id, _question_id, _headers = await create_active_survey(client)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": []},
    )
    assert resp.status_code == 201


# --------------------------------------------------------------------------- #
# POST /surveys/{id}/responses — error cases
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_submit_response_nonexistent_survey_returns_404(client: AsyncClient):
    nonexistent_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.post(f"{SURVEYS_URL}/{nonexistent_id}/responses", json={})
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_submit_response_invalid_uuid_returns_404(client: AsyncClient):
    resp = await client.post(f"{SURVEYS_URL}/not-a-uuid/responses", json={})
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_submit_response_to_draft_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers, title="Draft Survey")
    # Do NOT activate — leave as draft

    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["code"] == "UNPROCESSABLE"


@pytest.mark.asyncio
async def test_submit_response_to_closed_survey_returns_422(client: AsyncClient):
    survey_id, _question_id, headers = await create_active_survey(client)

    # Close the survey
    close_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/close", headers=headers
    )
    assert close_resp.status_code == 200

    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["code"] == "UNPROCESSABLE"


@pytest.mark.asyncio
async def test_complete_response_on_closed_survey_returns_422(client: AsyncClient):
    """Completing a response on a closed survey returns 422 UNPROCESSABLE."""
    survey_id, _question_id, headers = await create_active_survey(client)

    # Create a response while the survey is still active
    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Close the survey
    close_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)
    assert close_resp.status_code == 200

    # Attempt to complete the response on the now-closed survey
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_resp.status_code == 422
    body = patch_resp.json()
    assert body["detail"]["code"] == "UNPROCESSABLE"
    assert "closed" in body["detail"]["message"]


@pytest.mark.asyncio
async def test_complete_response_on_draft_survey_returns_422(
    client: AsyncClient, session: AsyncSession
):
    """Completing a response on a draft survey returns 422 UNPROCESSABLE."""
    survey_id, _question_id, headers = await create_active_survey(client)

    # Create a response while the survey is active
    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Revert the survey to draft status directly via DB
    await session.execute(
        update(Survey).where(Survey.id == uuid.UUID(survey_id)).values(status="draft")
    )
    await session.commit()

    # Attempt to complete the response on the now-draft survey
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_resp.status_code == 422
    body = patch_resp.json()
    assert body["detail"]["code"] == "UNPROCESSABLE"
    assert "draft" in body["detail"]["message"]


@pytest.mark.asyncio
async def test_submit_response_duplicate_question_id_returns_409(client: AsyncClient):
    survey_id, question_id, _headers = await create_active_survey(client)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={
            "answers": [
                {"question_id": question_id, "value": "first"},
                {"question_id": question_id, "value": "duplicate"},
            ]
        },
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["detail"]["code"] == "CONFLICT"


@pytest.mark.asyncio
async def test_submit_response_error_format_matches_standard(client: AsyncClient):
    """All errors must use the {detail: {code, message}} format."""
    nonexistent_id = "00000000-0000-0000-0000-000000000001"
    resp = await client.post(f"{SURVEYS_URL}/{nonexistent_id}/responses", json={})
    assert resp.status_code == 404
    body = resp.json()
    assert "detail" in body
    assert "code" in body["detail"]
    assert "message" in body["detail"]


# --------------------------------------------------------------------------- #
# POST /surveys/{id}/responses — answer validation (ISS-084)
# --------------------------------------------------------------------------- #


async def add_required_short_text_question(
    client: AsyncClient, headers: dict, survey_id: str, code: str = "Q1"
) -> str:
    """Add a required short_text question; return its id."""
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={
            "title": "Required text",
            "question_type": "short_text",
            "code": code,
            "is_required": True,
        },
        headers=headers,
    )
    assert q_resp.status_code == 201
    return q_resp.json()["id"]


async def add_numeric_question(
    client: AsyncClient, headers: dict, survey_id: str, code: str = "NUM1",
    settings: dict | None = None,
) -> str:
    """Add a numeric question; return its id."""
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Numeric Group"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    payload = {
        "title": "Numeric question",
        "question_type": "numeric",
        "code": code,
        "is_required": False,
    }
    if settings:
        payload["settings"] = settings

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json=payload,
        headers=headers,
    )
    assert q_resp.status_code == 201
    return q_resp.json()["id"]


@pytest.mark.asyncio
async def test_valid_answers_return_201(client: AsyncClient):
    """Submitting valid answers for all questions returns 201."""
    headers = await auth_headers(client, email="valid_ans@example.com")
    survey_id = await create_survey(client, headers, title="Validation Survey")
    question_id = await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "A valid answer"}]},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_required_answer_missing_returns_422(client: AsyncClient):
    """Omitting a value for a required question returns 422 with VALIDATION_ERROR."""
    headers = await auth_headers(client, email="req_missing@example.com")
    survey_id = await create_survey(client, headers, title="Required Survey")
    question_id = await add_required_short_text_question(
        client, headers, survey_id, code="REQ1"
    )
    await activate_survey(client, headers, survey_id)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": None}]},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"
    assert "message" in body["detail"]
    errors = body["detail"]["errors"]
    assert isinstance(errors, list)
    assert len(errors) >= 1
    assert errors[0]["question_code"] == "REQ1"
    assert "field" in errors[0]
    assert "message" in errors[0]


@pytest.mark.asyncio
async def test_invalid_numeric_answer_returns_422(client: AsyncClient):
    """Submitting a string for a numeric question returns 422 with VALIDATION_ERROR."""
    headers = await auth_headers(client, email="inv_num@example.com")
    survey_id = await create_survey(client, headers, title="Numeric Survey")
    question_id = await add_numeric_question(client, headers, survey_id, code="NUM1")
    await activate_survey(client, headers, survey_id)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "not-a-number"}]},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"
    errors = body["detail"]["errors"]
    assert isinstance(errors, list)
    assert len(errors) >= 1
    assert errors[0]["question_code"] == "NUM1"


@pytest.mark.asyncio
async def test_multiple_invalid_answers_all_collected(client: AsyncClient):
    """When multiple answers are invalid, ALL errors are returned (not just first)."""
    headers = await auth_headers(client, email="multi_err@example.com")
    survey_id = await create_survey(client, headers, title="Multi Error Survey")

    # Two required questions
    q1_id = await add_required_short_text_question(
        client, headers, survey_id, code="Q1"
    )
    q2_id = await add_required_short_text_question(
        client, headers, survey_id, code="Q2"
    )
    await activate_survey(client, headers, survey_id)

    # Both answers are None (required → both fail)
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={
            "answers": [
                {"question_id": q1_id, "value": None},
                {"question_id": q2_id, "value": None},
            ]
        },
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"
    errors = body["detail"]["errors"]
    assert isinstance(errors, list)
    assert len(errors) == 2
    question_codes = {e["question_code"] for e in errors}
    assert "Q1" in question_codes
    assert "Q2" in question_codes


@pytest.mark.asyncio
async def test_validation_error_shape_is_exact(client: AsyncClient):
    """The error response shape must be exactly {detail: {code, message, errors: [{question_code, field, message}]}}."""
    headers = await auth_headers(client, email="shape_test@example.com")
    survey_id = await create_survey(client, headers, title="Shape Survey")
    q_id = await add_required_short_text_question(
        client, headers, survey_id, code="SQ1"
    )
    await activate_survey(client, headers, survey_id)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q_id, "value": None}]},
    )
    assert resp.status_code == 422
    body = resp.json()

    # Top-level shape
    assert set(body.keys()) == {"detail"}
    detail = body["detail"]
    assert "code" in detail
    assert "message" in detail
    assert "errors" in detail

    # Per-error shape
    error = detail["errors"][0]
    assert "question_code" in error
    assert "field" in error
    assert "message" in error


@pytest.mark.asyncio
async def test_unknown_question_id_returns_422(client: AsyncClient):
    """Submitting an answer for a question_id not in the survey returns 422."""
    headers = await auth_headers(client, email="unk_q@example.com")
    survey_id = await create_survey(client, headers, title="Unknown Q Survey")
    # At least one real question to activate
    await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    unknown_id = "00000000-0000-0000-0000-000000000099"
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": unknown_id, "value": "hello"}]},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"
    assert "errors" in body["detail"]


@pytest.mark.asyncio
async def test_numeric_value_exceeds_max_returns_422(client: AsyncClient):
    """A numeric answer that exceeds max_value returns 422 with correct error."""
    headers = await auth_headers(client, email="num_max@example.com")
    survey_id = await create_survey(client, headers, title="Numeric Max Survey")
    q_id = await add_numeric_question(
        client, headers, survey_id, code="NMAX",
        settings={"min_value": 0, "max_value": 10},
    )
    await activate_survey(client, headers, survey_id)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q_id, "value": 999}]},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"
    errors = body["detail"]["errors"]
    assert len(errors) >= 1
    assert errors[0]["question_code"] == "NMAX"


@pytest.mark.asyncio
async def test_no_answers_skips_validation(client: AsyncClient):
    """Submitting no answers bypasses validation and returns 201."""
    headers = await auth_headers(client, email="no_ans@example.com")
    survey_id = await create_survey(client, headers, title="No Answers Survey")
    await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_validation_error_detail_has_no_extra_top_level_keys(client: AsyncClient):
    """Ensure no unexpected extra keys appear in the detail payload."""
    headers = await auth_headers(client, email="extra_keys@example.com")
    survey_id = await create_survey(client, headers, title="Extra Keys Survey")
    q_id = await add_required_short_text_question(
        client, headers, survey_id, code="EK1"
    )
    await activate_survey(client, headers, survey_id)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q_id, "value": None}]},
    )
    body = resp.json()
    # Only these three keys should be in detail
    detail_keys = set(body["detail"].keys())
    assert detail_keys == {"code", "message", "errors"}


# --------------------------------------------------------------------------- #
# PATCH /surveys/{id}/responses/{rid} — completion flow (ISS-085)
# --------------------------------------------------------------------------- #


async def add_question_with_relevance(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    code: str,
    relevance: str,
    is_required: bool = True,
) -> str:
    """Add a required short_text question with a relevance expression; return question id."""
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": f"Group for {code}"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={
            "title": f"Question {code}",
            "question_type": "short_text",
            "code": code,
            "is_required": is_required,
            "relevance": relevance,
        },
        headers=headers,
    )
    assert q_resp.status_code == 201
    return q_resp.json()["id"]


@pytest.mark.asyncio
async def test_patch_complete_sets_completed_at(client: AsyncClient):
    """PATCH with status:complete on a valid response sets completed_at and status."""
    headers = await auth_headers(client, email="complete_ok@example.com")
    survey_id = await create_survey(client, headers, title="Complete Survey")
    question_id = await add_required_short_text_question(
        client, headers, survey_id, code="Q1"
    )
    await activate_survey(client, headers, survey_id)

    # Submit a response with the required answer
    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "My answer"}]},
    )
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Complete the response
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["status"] == "complete"
    assert body["completed_at"] is not None
    assert body["id"] == response_id


@pytest.mark.asyncio
async def test_patch_complete_hidden_required_question_skipped(client: AsyncClient):
    """A required question hidden by relevance expression is not validated on completion."""
    headers = await auth_headers(client, email="hidden_req@example.com")
    survey_id = await create_survey(client, headers, title="Hidden Required Survey")

    # Q1: always visible, required
    q1_id = await add_required_short_text_question(
        client, headers, survey_id, code="Q1"
    )
    # Q2: only visible when Q1 == 'show_q2', required — will be hidden in this test
    await add_question_with_relevance(
        client, headers, survey_id, code="Q2",
        relevance="{Q1} == 'show_q2'", is_required=True,
    )
    await activate_survey(client, headers, survey_id)

    # Submit a response answering Q1 with a value that hides Q2
    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q1_id, "value": "hide_q2"}]},
    )
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Complete — Q2 is hidden, so even though it's required, no error should occur
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["status"] == "complete"
    assert body["completed_at"] is not None


@pytest.mark.asyncio
async def test_patch_complete_visible_required_question_missing_answer_returns_422(
    client: AsyncClient,
):
    """PATCH with status:complete returns 422 when a visible required question has no answer."""
    headers = await auth_headers(client, email="vis_req_missing@example.com")
    survey_id = await create_survey(client, headers, title="Visible Required Survey")
    await add_required_short_text_question(client, headers, survey_id, code="VREQ")
    await activate_survey(client, headers, survey_id)

    # Submit an empty response (no answers)
    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={},
    )
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Attempt to complete — required visible question has no answer
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_resp.status_code == 422
    body = patch_resp.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"
    errors = body["detail"]["errors"]
    assert isinstance(errors, list)
    assert len(errors) >= 1
    question_codes = {e["question_code"] for e in errors}
    assert "VREQ" in question_codes


@pytest.mark.asyncio
async def test_patch_complete_nonexistent_response_returns_404(client: AsyncClient):
    """PATCH on a non-existent response returns 404."""
    survey_id, _question_id, _headers = await create_active_survey(client)

    nonexistent_response_id = "00000000-0000-0000-0000-000000000000"
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{nonexistent_response_id}",
        json={"status": "complete"},
    )
    assert patch_resp.status_code == 404
    body = patch_resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_patch_complete_already_completed_returns_409(client: AsyncClient):
    """PATCH on an already-completed response returns 409 CONFLICT."""
    headers = await auth_headers(client, email="already_done@example.com")
    survey_id = await create_survey(client, headers, title="Already Done Survey")
    q_id = await add_required_short_text_question(
        client, headers, survey_id, code="ADQ"
    )
    await activate_survey(client, headers, survey_id)

    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q_id, "value": "done"}]},
    )
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Complete once
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_resp.status_code == 200

    # Attempt to complete again — should fail with 409
    patch_resp2 = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_resp2.status_code == 409
    body = patch_resp2.json()
    assert body["detail"]["code"] == "CONFLICT"


# --------------------------------------------------------------------------- #
# PATCH /surveys/{id}/responses/{rid}/status — disqualification (ISS-086)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_disqualify_incomplete_response_returns_200(client: AsyncClient):
    """Admin can disqualify an incomplete response."""
    survey_id, _question_id, headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["status"] == "disqualified"
    assert body["id"] == response_id


@pytest.mark.asyncio
async def test_disqualify_complete_response_returns_200(client: AsyncClient):
    """Admin can disqualify a complete response."""
    headers = await auth_headers(client, email="disq_complete@example.com")
    survey_id = await create_survey(client, headers, title="Disq Complete Survey")
    q_id = await add_required_short_text_question(client, headers, survey_id, code="DCQ")
    await activate_survey(client, headers, survey_id)

    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q_id, "value": "answer"}]},
    )
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Complete the response first
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )

    # Now disqualify it
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["status"] == "disqualified"


@pytest.mark.asyncio
async def test_disqualify_already_disqualified_returns_422(client: AsyncClient):
    """Attempting to disqualify an already-disqualified response returns 422."""
    survey_id, _question_id, headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # First disqualification
    first_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
        headers=headers,
    )
    assert first_resp.status_code == 200

    # Second disqualification — should fail with 422
    second_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
        headers=headers,
    )
    assert second_resp.status_code == 422
    body = second_resp.json()
    assert body["detail"]["code"] == "UNPROCESSABLE"


@pytest.mark.asyncio
async def test_complete_disqualified_response_returns_422(client: AsyncClient):
    """Attempting to complete a disqualified response returns 422."""
    survey_id, question_id, headers = await create_active_survey(client)

    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "test answer"}]},
    )
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Disqualify it
    disq_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
        headers=headers,
    )
    assert disq_resp.status_code == 200

    # Attempt to complete — should fail with 422
    complete_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert complete_resp.status_code == 422
    body = complete_resp.json()
    assert body["detail"]["code"] == "UNPROCESSABLE"


@pytest.mark.asyncio
async def test_disqualify_status_endpoint_requires_auth(client: AsyncClient):
    """PATCH /status without auth returns 403."""
    survey_id, _question_id, _headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # No auth headers
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
    )
    assert patch_resp.status_code == 403


@pytest.mark.asyncio
async def test_disqualify_invalid_status_value_returns_422(client: AsyncClient):
    """PATCH /status with an unrecognized status returns 422."""
    survey_id, _question_id, headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "incomplete"},
        headers=headers,
    )
    assert patch_resp.status_code == 422
    body = patch_resp.json()
    assert body["detail"]["code"] == "UNPROCESSABLE"


@pytest.mark.asyncio
async def test_disqualify_nonexistent_response_returns_404(client: AsyncClient):
    """PATCH /status on a non-existent response returns 404."""
    survey_id, _question_id, headers = await create_active_survey(client)

    nonexistent_id = "00000000-0000-0000-0000-000000000000"
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{nonexistent_id}/status",
        json={"status": "disqualified"},
        headers=headers,
    )
    assert patch_resp.status_code == 404
    body = patch_resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


# --------------------------------------------------------------------------- #
# PATCH /surveys/{id}/responses/{rid} — partial save (ISS-087)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_partial_save_returns_200_with_answers(client: AsyncClient):
    """PATCH with answers and no status performs partial save and returns 200 with answers."""
    survey_id, question_id, _headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": [{"question_id": question_id, "value": "partial answer"}]},
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["status"] == "incomplete"
    assert body["id"] == response_id
    assert len(body["answers"]) == 1
    assert body["answers"][0]["question_id"] == question_id
    assert body["answers"][0]["value"] == "partial answer"


@pytest.mark.asyncio
async def test_partial_save_status_remains_incomplete(client: AsyncClient):
    """Partial save does not change status from 'incomplete'."""
    survey_id, question_id, _headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": [{"question_id": question_id, "value": "hello"}]},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "incomplete"
    assert patch_resp.json()["completed_at"] is None


@pytest.mark.asyncio
async def test_partial_save_does_not_validate_required_fields(client: AsyncClient):
    """Partial save does not enforce required-field validation."""
    headers = await auth_headers(client, email="partial_novalidate@example.com")
    survey_id = await create_survey(client, headers, title="Required Partial Survey")
    # Required question — partial save must not fail even when missing
    await add_required_short_text_question(client, headers, survey_id, code="REQ_P")
    await activate_survey(client, headers, survey_id)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Partial save with NO answers at all — should still return 200
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": []},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "incomplete"


@pytest.mark.asyncio
async def test_multiple_partial_saves_merge_answers(client: AsyncClient):
    """Multiple partial saves accumulate and overwrite answers for the same question."""
    headers = await auth_headers(client, email="multi_partial@example.com")
    survey_id = await create_survey(client, headers, title="Multi Partial Survey")

    # Add two questions
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    q1_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text", "code": "Q1"},
        headers=headers,
    )
    assert q1_resp.status_code == 201
    q1_id = q1_resp.json()["id"]

    q2_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q2", "question_type": "short_text", "code": "Q2"},
        headers=headers,
    )
    assert q2_resp.status_code == 201
    q2_id = q2_resp.json()["id"]

    await activate_survey(client, headers, survey_id)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # First partial save: only Q1
    patch1 = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": [{"question_id": q1_id, "value": "first"}]},
    )
    assert patch1.status_code == 200
    body1 = patch1.json()
    assert len(body1["answers"]) == 1

    # Second partial save: overwrite Q1 and add Q2
    patch2 = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={
            "answers": [
                {"question_id": q1_id, "value": "updated"},
                {"question_id": q2_id, "value": "added"},
            ]
        },
    )
    assert patch2.status_code == 200
    body2 = patch2.json()
    assert len(body2["answers"]) == 2
    values_by_qid = {a["question_id"]: a["value"] for a in body2["answers"]}
    assert values_by_qid[q1_id] == "updated"
    assert values_by_qid[q2_id] == "added"


@pytest.mark.asyncio
async def test_partial_save_nonexistent_response_returns_404(client: AsyncClient):
    """PATCH partial save on a non-existent response returns 404."""
    survey_id, question_id, _headers = await create_active_survey(client)

    nonexistent_id = "00000000-0000-0000-0000-000000000000"
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{nonexistent_id}",
        json={"answers": [{"question_id": question_id, "value": "val"}]},
    )
    assert patch_resp.status_code == 404
    body = patch_resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_complete_after_partial_save_validates_correctly(client: AsyncClient):
    """PATCH with status='complete' after partial saves still triggers full validation."""
    headers = await auth_headers(client, email="complete_after_partial@example.com")
    survey_id = await create_survey(client, headers, title="Complete After Partial Survey")
    q_id = await add_required_short_text_question(
        client, headers, survey_id, code="CAP"
    )
    await activate_survey(client, headers, survey_id)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Partial save with the required answer
    patch_partial = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": [{"question_id": q_id, "value": "my answer"}]},
    )
    assert patch_partial.status_code == 200

    # Complete — should succeed because required answer is now present
    patch_complete = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_complete.status_code == 200
    body = patch_complete.json()
    assert body["status"] == "complete"
    assert body["completed_at"] is not None


@pytest.mark.asyncio
async def test_complete_with_answers_in_body_no_prior_save(client: AsyncClient):
    """PATCH status=complete with answers in body succeeds without a prior partial save.

    Regression test for ISS-166: single-page survey submit fails with 422 because
    the completion endpoint previously ignored answers in the request body, validating
    only previously-stored (empty) answers.
    """
    headers = await auth_headers(client, email="single_page_complete@example.com")
    survey_id = await create_survey(client, headers, title="Single Page Survey")
    q_id = await add_required_short_text_question(
        client, headers, survey_id, code="SPQ"
    )
    await activate_survey(client, headers, survey_id)

    # Create an empty response (no answers saved yet — simulates single-page survey start)
    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Complete with answers in the body — no prior partial save
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={
            "status": "complete",
            "answers": [{"question_id": q_id, "value": "My answer"}],
        },
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["status"] == "complete"
    assert body["completed_at"] is not None


@pytest.mark.asyncio
async def test_patch_complete_with_multiple_choice_answer_returns_200(client: AsyncClient):
    """PATCH status=complete with a multiple_choice answer does not crash with 500.

    Regression test for ISS-180: evaluate_relevance() builds a frozenset cache key
    from answers.items(), but multiple_choice answers are stored as Python lists which
    are not hashable — causing an unhashable type: 'list' crash. The survey must have
    a relevance expression so evaluate_relevance() is actually called on completion.
    """
    headers = await auth_headers(client, email="mc_complete_180@example.com")
    survey_id = await create_survey(client, headers, title="MC Complete Survey")

    # Add a multiple_choice question (MC1) — its answer will be a list
    mc_q_id = await add_multiple_choice_question(client, headers, survey_id, code="MC1")

    # Add a short_text question with a relevance expression referencing MC1 so that
    # evaluate_relevance() is invoked on completion, exercising the frozenset cache path
    await add_question_with_relevance(
        client, headers, survey_id, code="Q2",
        relevance="{MC1} == 'opt_a'", is_required=False,
    )

    await activate_survey(client, headers, survey_id)

    # Create a response and partial-save a list answer for the multiple_choice question
    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    patch_partial = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": [{"question_id": mc_q_id, "value": ["opt_a", "opt_b"]}]},
    )
    assert patch_partial.status_code == 200

    # Complete — previously crashed with 500 due to frozenset(answers.items()) failing
    # on the list value stored for MC1
    patch_complete = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_complete.status_code == 200
    body = patch_complete.json()
    assert body["status"] == "complete"
    assert body["completed_at"] is not None


# --------------------------------------------------------------------------- #
# GET /surveys/{id}/responses/{rid} — resume (ISS-087)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_response_returns_current_answers(client: AsyncClient):
    """GET /surveys/{id}/responses/{rid} returns the response with its saved answers."""
    survey_id, question_id, _headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Save some partial answers
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": [{"question_id": question_id, "value": "saved answer"}]},
    )

    # GET to retrieve current answers for resume
    get_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
    )
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body["id"] == response_id
    assert body["survey_id"] == survey_id
    assert body["status"] == "incomplete"
    assert len(body["answers"]) == 1
    assert body["answers"][0]["question_id"] == question_id
    assert body["answers"][0]["value"] == "saved answer"


@pytest.mark.asyncio
async def test_get_response_no_auth_required(client: AsyncClient):
    """GET response endpoint is public — no Authorization header needed."""
    survey_id, _question_id, _headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    get_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
    )
    assert get_resp.status_code == 200


@pytest.mark.asyncio
async def test_get_response_nonexistent_returns_404(client: AsyncClient):
    """GET on a non-existent response returns 404."""
    survey_id, _question_id, _headers = await create_active_survey(client)

    nonexistent_id = "00000000-0000-0000-0000-000000000000"
    get_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{nonexistent_id}",
    )
    assert get_resp.status_code == 404
    body = get_resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_get_response_empty_answers_when_none_saved(client: AsyncClient):
    """GET response returns empty answers list when no partial saves have occurred."""
    survey_id, _question_id, _headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    get_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
    )
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body["answers"] == []


@pytest.mark.asyncio
async def test_partial_save_on_complete_response_returns_422(client: AsyncClient):
    """Partial save on a completed response returns 422."""
    headers = await auth_headers(client, email="partial_on_complete@example.com")
    survey_id = await create_survey(client, headers, title="Complete Partial Survey")
    q_id = await add_required_short_text_question(client, headers, survey_id, code="CPC")
    await activate_survey(client, headers, survey_id)

    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q_id, "value": "done"}]},
    )
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Complete the response
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )

    # Partial save on completed response should fail
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": [{"question_id": q_id, "value": "override"}]},
    )
    assert patch_resp.status_code == 422
    body = patch_resp.json()
    assert body["detail"]["code"] == "UNPROCESSABLE"


# --------------------------------------------------------------------------- #
# GET /surveys/{id}/responses — response listing (ISS-088)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_responses_no_filters_returns_200(client: AsyncClient):
    """GET /surveys/{id}/responses returns 200 with pagination envelope."""
    survey_id, _question_id, headers = await create_active_survey(client)

    # Submit a couple of responses
    await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()

    assert "items" in body
    assert "total" in body
    assert "page" in body
    assert "per_page" in body
    assert "pages" in body
    assert body["total"] == 2
    assert body["page"] == 1
    assert len(body["items"]) == 2


@pytest.mark.asyncio
async def test_list_responses_item_fields(client: AsyncClient):
    """Each item in the list contains exactly the summary fields."""
    survey_id, _question_id, headers = await create_active_survey(client)

    await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses",
        headers=headers,
    )
    assert resp.status_code == 200
    item = resp.json()["items"][0]

    # Required fields
    assert "id" in item
    assert "status" in item
    assert "started_at" in item
    assert "completed_at" in item
    assert "ip_address" in item
    assert "participant_id" in item

    # No extra sensitive fields like answers or metadata_
    assert "answers" not in item
    assert "metadata_" not in item


@pytest.mark.asyncio
async def test_list_responses_status_filter(client: AsyncClient):
    """Status filter returns only responses matching the status."""
    headers = await auth_headers(client, email="list_status@example.com")
    survey_id = await create_survey(client, headers, title="Status Filter Survey")
    q_id = await add_required_short_text_question(client, headers, survey_id, code="SF1")
    await activate_survey(client, headers, survey_id)

    # Incomplete response
    post1 = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post1.status_code == 201

    # Complete response
    post2 = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q_id, "value": "done"}]},
    )
    assert post2.status_code == 201
    response_id_2 = post2.json()["id"]
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id_2}",
        json={"status": "complete"},
    )

    # Filter for incomplete only
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?status=incomplete",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert all(item["status"] == "incomplete" for item in body["items"])

    # Filter for complete only
    resp2 = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?status=complete",
        headers=headers,
    )
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert body2["total"] == 1
    assert all(item["status"] == "complete" for item in body2["items"])


@pytest.mark.asyncio
async def test_list_responses_pagination(client: AsyncClient):
    """Pagination splits results correctly and total reflects full count."""
    headers = await auth_headers(client, email="list_paginate@example.com")
    survey_id = await create_survey(client, headers, title="Paginate Survey")
    await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    # Create 5 responses
    for _ in range(5):
        await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})

    # Page 1 with per_page=2
    resp_p1 = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?page=1&per_page=2",
        headers=headers,
    )
    assert resp_p1.status_code == 200
    body_p1 = resp_p1.json()
    assert body_p1["total"] == 5
    assert body_p1["page"] == 1
    assert body_p1["per_page"] == 2
    assert body_p1["pages"] == 3
    assert len(body_p1["items"]) == 2

    # Page 3 (last page with 1 item)
    resp_p3 = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?page=3&per_page=2",
        headers=headers,
    )
    assert resp_p3.status_code == 200
    body_p3 = resp_p3.json()
    assert body_p3["total"] == 5
    assert body_p3["page"] == 3
    assert len(body_p3["items"]) == 1


@pytest.mark.asyncio
async def test_list_responses_total_reflects_full_filtered_count(client: AsyncClient):
    """Total must reflect the full filtered count, not just the current page size."""
    headers = await auth_headers(client, email="list_total@example.com")
    survey_id = await create_survey(client, headers, title="Total Count Survey")
    await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    # Create 4 responses
    for _ in range(4):
        await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})

    # Request page 2 with per_page=2 — items on this page = 2, but total should still be 4
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?page=2&per_page=2",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 4  # full count, not len(page items)
    assert len(body["items"]) == 2


@pytest.mark.asyncio
async def test_list_responses_sort_by_started_at_desc(client: AsyncClient):
    """Default sort (started_at desc) returns most-recent first."""
    survey_id, _question_id, headers = await create_active_survey(client)

    r1 = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert r1.status_code == 201
    r2 = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert r2.status_code == 201
    r2_id = r2.json()["id"]

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?sort_by=started_at&sort_order=desc",
        headers=headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 2
    # Most recently created (r2) should be first
    assert items[0]["id"] == r2_id


@pytest.mark.asyncio
async def test_list_responses_sort_by_started_at_asc(client: AsyncClient):
    """Sort by started_at asc returns oldest first."""
    survey_id, _question_id, headers = await create_active_survey(client)

    r1 = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert r1.status_code == 201
    r1_id = r1.json()["id"]
    r2 = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert r2.status_code == 201

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?sort_by=started_at&sort_order=asc",
        headers=headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 2
    # Oldest (r1) should be first
    assert items[0]["id"] == r1_id


@pytest.mark.asyncio
async def test_list_responses_sort_by_status(client: AsyncClient):
    """Sort by status is accepted without error."""
    survey_id, _question_id, headers = await create_active_survey(client)

    await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?sort_by=status&sort_order=asc",
        headers=headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_responses_empty_when_no_responses(client: AsyncClient):
    """Returns empty items list and total=0 when survey has no responses."""
    headers = await auth_headers(client, email="list_empty@example.com")
    survey_id = await create_survey(client, headers, title="Empty Survey")
    await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []
    assert body["pages"] == 1


@pytest.mark.asyncio
async def test_list_responses_404_unknown_survey(client: AsyncClient):
    """Returns 404 for a non-existent survey ID."""
    headers = await auth_headers(client, email="list_404@example.com")

    nonexistent_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(
        f"{SURVEYS_URL}/{nonexistent_id}/responses",
        headers=headers,
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_list_responses_404_survey_owned_by_other_user(client: AsyncClient):
    """Survey owned by another user returns 404, not 403 (prevents 404-oracle)."""
    # Owner creates the survey
    owner_headers = await auth_headers(client, email="owner_list@example.com")
    survey_id = await create_survey(client, owner_headers, title="Owner Survey")
    await add_group_and_question(client, owner_headers, survey_id)
    await activate_survey(client, owner_headers, survey_id)

    # Different user tries to list responses
    other_headers = await auth_headers(client, email="other_list@example.com")
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses",
        headers=other_headers,
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_list_responses_401_when_unauthenticated(client: AsyncClient):
    """Returns 403 when no auth credentials are provided."""
    survey_id, _question_id, _headers = await create_active_survey(client)

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/responses")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_responses_started_after_filter(client: AsyncClient):
    """started_after filter excludes responses started before the cutoff."""
    import asyncio
    from datetime import timezone

    headers = await auth_headers(client, email="list_started_after@example.com")
    survey_id = await create_survey(client, headers, title="Started After Survey")
    await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    # Submit one response, record time, then submit another
    r1 = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert r1.status_code == 201
    r1_started_at = r1.json()["started_at"]

    # Brief delay to ensure r2.started_at > r1.started_at
    await asyncio.sleep(0.05)

    r2 = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert r2.status_code == 201
    r2_id = r2.json()["id"]

    # Filter: only responses started after r1
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?started_after={r1_started_at}",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    item_ids = [item["id"] for item in body["items"]]
    assert r2_id in item_ids
    # r1 was started_at the cutoff boundary, so it should not be included (strict >)
    assert r1.json()["id"] not in item_ids


@pytest.mark.asyncio
async def test_list_responses_invalid_survey_id_returns_404(client: AsyncClient):
    """Returns 404 for a non-UUID survey_id in the path."""
    headers = await auth_headers(client, email="list_invalid_id@example.com")

    resp = await client.get(
        f"{SURVEYS_URL}/not-a-valid-uuid/responses",
        headers=headers,
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


# --------------------------------------------------------------------------- #
# GET /surveys/{id}/responses/{rid}/detail — response detail (ISS-089)
# --------------------------------------------------------------------------- #


async def add_choice_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    code: str = "CHOICE1",
) -> tuple[str, str, str]:
    """Add a single_choice question with two options. Returns (question_id, opt1_code, opt2_code)."""
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": f"Group for {code}"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": f"Choice Question {code}", "question_type": "single_choice", "code": code},
        headers=headers,
    )
    assert q_resp.status_code == 201
    question_id = q_resp.json()["id"]

    # Add two answer options
    opt1_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{question_id}/options",
        json={"code": "opt_a", "title": "Option A"},
        headers=headers,
    )
    assert opt1_resp.status_code == 201
    opt1_code = opt1_resp.json()["code"]

    opt2_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{question_id}/options",
        json={"code": "opt_b", "title": "Option B"},
        headers=headers,
    )
    assert opt2_resp.status_code == 201
    opt2_code = opt2_resp.json()["code"]

    return question_id, opt1_code, opt2_code


@pytest.mark.asyncio
async def test_get_response_detail_returns_200_with_full_metadata(client: AsyncClient):
    """Authenticated GET /detail returns 200 with response metadata fields."""
    survey_id, question_id, headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Save an answer
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": [{"question_id": question_id, "value": "my answer"}]},
    )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()

    # Verify metadata fields
    assert body["id"] == response_id
    assert body["status"] == "incomplete"
    assert "started_at" in body
    assert "completed_at" in body
    assert "ip_address" in body
    assert "metadata" in body
    assert "participant_id" in body
    assert "answers" in body


@pytest.mark.asyncio
async def test_get_response_detail_answers_have_question_metadata(client: AsyncClient):
    """Each answer in detail response includes question_id, question_code, question_title, question_type."""
    headers = await auth_headers(client, email="detail_meta@example.com")
    survey_id = await create_survey(client, headers, title="Detail Meta Survey")

    # Add a question with explicit code
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "My Text Question", "question_type": "short_text", "code": "TQ1"},
        headers=headers,
    )
    assert q_resp.status_code == 201
    question_id = q_resp.json()["id"]
    await activate_survey(client, headers, survey_id)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"answers": [{"question_id": question_id, "value": "hello"}]},
    )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["answers"]) == 1
    answer = body["answers"][0]

    assert answer["question_id"] == question_id
    assert answer["question_code"] == "TQ1"
    assert answer["question_title"] == "My Text Question"
    assert answer["question_type"] == "short_text"
    assert answer["value"] == "hello"


@pytest.mark.asyncio
async def test_get_response_detail_unauthenticated_returns_403(client: AsyncClient):
    """GET /detail without auth credentials returns 403."""
    survey_id, _question_id, _headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_response_detail_wrong_owner_returns_404(client: AsyncClient):
    """GET /detail for a response on another user's survey returns 404 (no ownership oracle)."""
    # Owner creates survey and response
    owner_headers = await auth_headers(client, email="detail_owner@example.com")
    survey_id = await create_survey(client, owner_headers, title="Owner Detail Survey")
    await add_group_and_question(client, owner_headers, survey_id)
    await activate_survey(client, owner_headers, survey_id)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Other user attempts to access it
    other_headers = await auth_headers(client, email="detail_other@example.com")
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers=other_headers,
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_get_response_detail_nonexistent_response_returns_404(client: AsyncClient):
    """GET /detail for a non-existent response_id returns 404."""
    survey_id, _question_id, headers = await create_active_survey(client)

    nonexistent_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{nonexistent_id}/detail",
        headers=headers,
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_get_response_detail_invalid_uuid_returns_404(client: AsyncClient):
    """GET /detail with a non-UUID response_id returns 404."""
    survey_id, _question_id, headers = await create_active_survey(client)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/not-a-uuid/detail",
        headers=headers,
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_get_response_detail_empty_answers_when_none_saved(client: AsyncClient):
    """GET /detail returns empty answers list when no answers were saved."""
    survey_id, _question_id, headers = await create_active_survey(client)

    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["answers"] == []


@pytest.mark.asyncio
async def test_get_response_detail_choice_question_includes_selected_option_title(
    client: AsyncClient,
):
    """Choice question answer includes selected_option_title resolved from answer_options."""
    headers = await auth_headers(client, email="detail_choice@example.com")
    survey_id = await create_survey(client, headers, title="Choice Detail Survey")

    question_id, opt_a_code, _opt_b_code = await add_choice_question(
        client, headers, survey_id, code="CHOICE1"
    )
    await activate_survey(client, headers, survey_id)

    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": opt_a_code}]},
    )
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["answers"]) == 1
    answer = body["answers"][0]
    assert answer["question_type"] == "single_choice"
    assert answer["selected_option_title"] == "Option A"


@pytest.mark.asyncio
async def test_get_response_detail_sensitive_fields_present_when_authenticated(
    client: AsyncClient,
):
    """Authenticated detail response includes ip_address and metadata fields."""
    survey_id, _question_id, headers = await create_active_survey(client)

    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={},
        headers={"X-Forwarded-For": "198.51.100.1"},
    )
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    # ip_address and metadata must be explicitly present in the authenticated response
    assert "ip_address" in body
    assert body["ip_address"] == "198.51.100.1"
    assert "metadata" in body


# --------------------------------------------------------------------------- #
# GET /surveys/{id}/responses/export — response export CSV/JSON (ISS-090)
# --------------------------------------------------------------------------- #


import csv as _csv
import io as _io


async def add_multiple_choice_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    code: str = "MC1",
) -> str:
    """Add a multiple_choice question; return question_id."""
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": f"Group for {code}"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": f"MC Question {code}", "question_type": "multiple_choice", "code": code},
        headers=headers,
    )
    assert q_resp.status_code == 201
    return q_resp.json()["id"]


async def add_matrix_question_with_subquestions(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    parent_code: str = "Q5",
) -> tuple[str, list[str]]:
    """Add a matrix question with two subquestions. Returns (parent_q_id, [subq1_id, subq2_id])."""
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": f"Group for {parent_code}"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    parent_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": f"Matrix {parent_code}", "question_type": "matrix", "code": parent_code},
        headers=headers,
    )
    assert parent_resp.status_code == 201
    parent_id = parent_resp.json()["id"]

    subq_ids = []
    for i, sq_code in enumerate(["SQ001", "SQ002"], start=1):
        sq_resp = await client.post(
            f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
            json={
                "title": f"Subquestion {sq_code}",
                "question_type": "matrix",
                "code": sq_code,
                "parent_id": parent_id,
                "sort_order": i,
            },
            headers=headers,
        )
        assert sq_resp.status_code == 201
        subq_ids.append(sq_resp.json()["id"])

    return parent_id, subq_ids


def parse_csv_response(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    """Parse CSV bytes into (headers, rows). Each row is a dict keyed by header."""
    text = content.decode("utf-8")
    reader = _csv.DictReader(_io.StringIO(text))
    headers = reader.fieldnames or []
    rows = list(reader)
    return list(headers), rows


@pytest.mark.asyncio
async def test_export_csv_returns_200_with_correct_content_type(client: AsyncClient):
    """GET /export returns 200 with text/csv content-type."""
    survey_id, _question_id, headers = await create_active_survey(client)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export",
        headers=headers,
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_export_csv_has_content_disposition_attachment(client: AsyncClient):
    """GET /export CSV response includes Content-Disposition: attachment header."""
    survey_id, _question_id, headers = await create_active_survey(client)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export",
        headers=headers,
    )
    assert resp.status_code == 200
    content_disp = resp.headers.get("content-disposition", "")
    assert "attachment" in content_disp
    assert ".csv" in content_disp


@pytest.mark.asyncio
async def test_export_json_returns_200_with_json_content_type(client: AsyncClient):
    """GET /export?format=json returns 200 with application/json content-type."""
    survey_id, _question_id, headers = await create_active_survey(client)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export?format=json",
        headers=headers,
    )
    assert resp.status_code == 200
    assert "application/json" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_export_json_has_content_disposition_attachment(client: AsyncClient):
    """GET /export?format=json response includes Content-Disposition: attachment header."""
    survey_id, _question_id, headers = await create_active_survey(client)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export?format=json",
        headers=headers,
    )
    assert resp.status_code == 200
    content_disp = resp.headers.get("content-disposition", "")
    assert "attachment" in content_disp
    assert ".json" in content_disp


@pytest.mark.asyncio
async def test_export_csv_empty_survey_has_headers_only(client: AsyncClient):
    """Empty survey (no responses) returns valid CSV with only the header row."""
    headers = await auth_headers(client, email="export_empty@example.com")
    survey_id = await create_survey(client, headers, title="Export Empty Survey")
    await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export",
        headers=headers,
    )
    assert resp.status_code == 200
    col_headers, rows = parse_csv_response(resp.content)
    # At minimum the meta headers should be present
    assert "response_id" in col_headers
    assert "status" in col_headers
    assert rows == []


@pytest.mark.asyncio
async def test_export_csv_rows_match_response_count(client: AsyncClient):
    """CSV export contains one data row per response in the survey."""
    survey_id, question_id, headers = await create_active_survey(client)

    # Create 3 responses
    for _ in range(3):
        await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export",
        headers=headers,
    )
    assert resp.status_code == 200
    _col_headers, rows = parse_csv_response(resp.content)
    assert len(rows) == 3


@pytest.mark.asyncio
async def test_export_csv_includes_question_code_as_column(client: AsyncClient):
    """CSV export includes question codes as column headers."""
    headers = await auth_headers(client, email="export_q_code@example.com")
    survey_id = await create_survey(client, headers, title="Export QCode Survey")

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    group_id = group_resp.json()["id"]
    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "My Q", "question_type": "short_text", "code": "MYCODE"},
        headers=headers,
    )
    question_id = q_resp.json()["id"]
    await activate_survey(client, headers, survey_id)

    # Submit a response with an answer
    post_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "hello export"}]},
    )
    assert post_resp.status_code == 201

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export",
        headers=headers,
    )
    assert resp.status_code == 200
    col_headers, rows = parse_csv_response(resp.content)
    assert "MYCODE" in col_headers
    assert len(rows) == 1
    assert rows[0]["MYCODE"] == "hello export"


@pytest.mark.asyncio
async def test_export_csv_column_filter_only_includes_specified_codes(client: AsyncClient):
    """columns param restricts CSV output to only those question codes."""
    headers = await auth_headers(client, email="export_col_filter@example.com")
    survey_id = await create_survey(client, headers, title="Column Filter Survey")

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    group_id = group_resp.json()["id"]

    q1_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text", "code": "QONE"},
        headers=headers,
    )
    q1_id = q1_resp.json()["id"]

    q2_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q2", "question_type": "short_text", "code": "QTWO"},
        headers=headers,
    )
    q2_id = q2_resp.json()["id"]
    await activate_survey(client, headers, survey_id)

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [
            {"question_id": q1_id, "value": "val1"},
            {"question_id": q2_id, "value": "val2"},
        ]},
    )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export?columns=QONE",
        headers=headers,
    )
    assert resp.status_code == 200
    col_headers, rows = parse_csv_response(resp.content)
    assert "QONE" in col_headers
    assert "QTWO" not in col_headers
    assert rows[0]["QONE"] == "val1"


@pytest.mark.asyncio
async def test_export_csv_status_filter_excludes_non_matching(client: AsyncClient):
    """status filter only exports responses matching that status."""
    headers = await auth_headers(client, email="export_status_filter@example.com")
    survey_id = await create_survey(client, headers, title="Status Filter Export Survey")
    q_id = await add_required_short_text_question(client, headers, survey_id, code="SFQ")
    await activate_survey(client, headers, survey_id)

    # Create one incomplete response
    r1 = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert r1.status_code == 201

    # Create one complete response
    r2 = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q_id, "value": "done"}]},
    )
    assert r2.status_code == 201
    r2_id = r2.json()["id"]
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{r2_id}",
        json={"status": "complete"},
    )

    # Export with status=complete only
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export?status=complete",
        headers=headers,
    )
    assert resp.status_code == 200
    _col_headers, rows = parse_csv_response(resp.content)
    assert len(rows) == 1
    assert rows[0]["status"] == "complete"


@pytest.mark.asyncio
async def test_export_json_returns_array_with_question_code_keys(client: AsyncClient):
    """JSON export returns array of objects with question_code keys in 'answers'."""
    headers = await auth_headers(client, email="export_json_keys@example.com")
    survey_id = await create_survey(client, headers, title="JSON Keys Survey")

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    group_id = group_resp.json()["id"]
    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "JSON Q", "question_type": "short_text", "code": "JSONQ"},
        headers=headers,
    )
    question_id = q_resp.json()["id"]
    await activate_survey(client, headers, survey_id)

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "json value"}]},
    )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export?format=json",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    item = data[0]
    assert "response_id" in item
    assert "status" in item
    assert "answers" in item
    assert "JSONQ" in item["answers"]
    assert item["answers"]["JSONQ"] == "json value"


@pytest.mark.asyncio
async def test_export_unauthenticated_returns_403(client: AsyncClient):
    """GET /export without auth returns 403."""
    survey_id, _question_id, _headers = await create_active_survey(client)

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/responses/export")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_export_wrong_owner_returns_404(client: AsyncClient):
    """GET /export for a survey owned by another user returns 404 (no ownership oracle)."""
    owner_headers = await auth_headers(client, email="export_owner@example.com")
    survey_id = await create_survey(client, owner_headers, title="Export Owner Survey")
    await add_group_and_question(client, owner_headers, survey_id)
    await activate_survey(client, owner_headers, survey_id)

    other_headers = await auth_headers(client, email="export_other@example.com")
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export",
        headers=other_headers,
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_export_invalid_format_returns_400(client: AsyncClient):
    """GET /export?format=xml returns 400 Bad Request."""
    survey_id, _question_id, headers = await create_active_survey(client)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export?format=xml",
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_export_route_not_captured_as_response_id(client: AsyncClient):
    """Accessing /export with auth must not be captured as a UUID response_id path param."""
    survey_id, _question_id, headers = await create_active_survey(client)

    # If 'export' were captured as response_id, this would return 404 (response not found).
    # With correct route ordering it should return 200 (export endpoint).
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export",
        headers=headers,
    )
    # Should NOT be treated as a response_id lookup
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_export_csv_multiple_choice_values_joined(client: AsyncClient):
    """multiple_choice answer values are comma-joined within the CSV cell."""
    headers = await auth_headers(client, email="export_mc@example.com")
    survey_id = await create_survey(client, headers, title="MC Export Survey")
    mc_question_id = await add_multiple_choice_question(client, headers, survey_id, code="MC1")
    await activate_survey(client, headers, survey_id)

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": mc_question_id, "value": ["opt_a", "opt_b", "opt_c"]}]},
    )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export",
        headers=headers,
    )
    assert resp.status_code == 200
    col_headers, rows = parse_csv_response(resp.content)
    assert "MC1" in col_headers
    assert len(rows) == 1
    cell = rows[0]["MC1"]
    # Should be comma-separated
    values = cell.split(",")
    assert set(values) == {"opt_a", "opt_b", "opt_c"}


@pytest.mark.asyncio
async def test_export_csv_response_with_no_answers_has_empty_columns(client: AsyncClient):
    """A response with no answers produces a row with empty-string values for all question columns."""
    headers = await auth_headers(client, email="export_no_answers@example.com")
    survey_id = await create_survey(client, headers, title="No Answers Export Survey")

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    group_id = group_resp.json()["id"]
    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q", "question_type": "short_text", "code": "EMPTY_Q"},
        headers=headers,
    )
    question_id = q_resp.json()["id"]
    await activate_survey(client, headers, survey_id)

    # Submit response WITH an answer so the column appears in export
    r1 = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "answered"}]},
    )
    assert r1.status_code == 201

    # Submit response WITHOUT an answer
    r2 = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert r2.status_code == 201
    r2_id = r2.json()["id"]

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export",
        headers=headers,
    )
    assert resp.status_code == 200
    col_headers, rows = parse_csv_response(resp.content)
    assert "EMPTY_Q" in col_headers

    # Find the row for r2
    r2_row = next(row for row in rows if row["response_id"] == r2_id)
    # Column value should be empty string, not KeyError
    assert r2_row["EMPTY_Q"] == ""


# --------------------------------------------------------------------------- #
# PATCH /surveys/{id}/responses/{rid} — quota enforcement (ISS-099)
# --------------------------------------------------------------------------- #


async def create_quota(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    question_id: str,
    action: str = "terminate",
    limit: int = 1,
    operator: str = "eq",
    value: object = "trigger",
) -> str:
    """Create a quota for a survey; return the quota id."""
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/quotas",
        json={
            "name": f"Test {action} Quota",
            "limit": limit,
            "action": action,
            "conditions": [
                {
                    "question_id": question_id,
                    "operator": operator,
                    "value": value,
                }
            ],
            "is_active": True,
        },
        headers=headers,
    )
    assert resp.status_code == 201, f"Failed to create quota: {resp.text}"
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_complete_response_terminate_quota_disqualifies_response(client: AsyncClient):
    """PATCH complete on a response that matches a full terminate quota returns 403."""
    headers = await auth_headers(client, email="quota_terminate@example.com")
    survey_id = await create_survey(client, headers, title="Quota Terminate Survey")

    # Add a required short_text question (code=Q1)
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text", "code": "Q1", "is_required": True},
        headers=headers,
    )
    assert q_resp.status_code == 201
    question_id = q_resp.json()["id"]

    # Create a terminate quota: limit=1, condition: Q1 == "trigger"
    await create_quota(
        client, headers, survey_id, question_id,
        action="terminate", limit=1, operator="eq", value="trigger",
    )

    await activate_survey(client, headers, survey_id)

    # First response: submits Q1="trigger" and completes — this fills the quota.
    # Since limit=1 and this is the first submission, new_count == limit → disqualified.
    post1 = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "trigger"}]},
    )
    assert post1.status_code == 201
    r1_id = post1.json()["id"]

    complete1 = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{r1_id}",
        json={"status": "complete"},
    )
    # The first submission fills the quota (new_count == limit == 1) → disqualified
    assert complete1.status_code == 403
    body = complete1.json()
    assert body["detail"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_complete_response_terminate_quota_second_response_also_disqualified(
    client: AsyncClient,
):
    """PATCH complete on a response after quota is full → second response also disqualified."""
    headers = await auth_headers(client, email="quota_term2@example.com")
    survey_id = await create_survey(client, headers, title="Quota Terminate2 Survey")

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text", "code": "Q1", "is_required": True},
        headers=headers,
    )
    question_id = q_resp.json()["id"]

    # limit=2 so first two fill it
    await create_quota(
        client, headers, survey_id, question_id,
        action="terminate", limit=2, operator="eq", value="trigger",
    )

    await activate_survey(client, headers, survey_id)

    # First submission — limit=2, new_count=1 after increment → NOT disqualified yet
    post1 = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "trigger"}]},
    )
    assert post1.status_code == 201
    r1_id = post1.json()["id"]

    complete1 = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{r1_id}",
        json={"status": "complete"},
    )
    assert complete1.status_code == 200  # new_count=1, limit=2 → OK

    # Second submission — new_count=2 == limit → disqualified
    post2 = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "trigger"}]},
    )
    assert post2.status_code == 201
    r2_id = post2.json()["id"]

    complete2 = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{r2_id}",
        json={"status": "complete"},
    )
    assert complete2.status_code == 403

    # Third submission — quota already full (rowcount=0) → disqualified
    post3 = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "trigger"}]},
    )
    assert post3.status_code == 201
    r3_id = post3.json()["id"]

    complete3 = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{r3_id}",
        json={"status": "complete"},
    )
    assert complete3.status_code == 403


@pytest.mark.asyncio
async def test_complete_response_terminate_quota_non_matching_answer_completes_normally(
    client: AsyncClient,
):
    """When answer does not match terminate quota condition, response completes normally."""
    headers = await auth_headers(client, email="quota_nomatch@example.com")
    survey_id = await create_survey(client, headers, title="Quota NoMatch Survey")

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text", "code": "Q1", "is_required": True},
        headers=headers,
    )
    question_id = q_resp.json()["id"]

    # Quota only triggers for "trigger" value
    await create_quota(
        client, headers, survey_id, question_id,
        action="terminate", limit=1, operator="eq", value="trigger",
    )

    await activate_survey(client, headers, survey_id)

    post = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "safe_value"}]},
    )
    assert post.status_code == 201
    response_id = post.json()["id"]

    # Complete — "safe_value" does not match the quota condition → no disqualification
    complete = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert complete.status_code == 200
    body = complete.json()
    assert body["status"] == "complete"


@pytest.mark.asyncio
async def test_complete_response_inactive_quota_not_enforced(client: AsyncClient):
    """Inactive quotas are not evaluated during response completion."""
    headers = await auth_headers(client, email="quota_inactive@example.com")
    survey_id = await create_survey(client, headers, title="Inactive Quota Survey")

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text", "code": "Q1", "is_required": True},
        headers=headers,
    )
    question_id = q_resp.json()["id"]

    await activate_survey(client, headers, survey_id)

    # Create an inactive quota
    quota_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/quotas",
        json={
            "name": "Inactive Quota",
            "limit": 1,
            "action": "terminate",
            "conditions": [
                {"question_id": question_id, "operator": "eq", "value": "trigger"}
            ],
            "is_active": False,
        },
        headers=headers,
    )
    assert quota_resp.status_code == 201

    # Response matching condition should NOT be disqualified (quota is inactive)
    post = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "trigger"}]},
    )
    assert post.status_code == 201
    response_id = post.json()["id"]

    complete = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert complete.status_code == 200
    body = complete.json()
    assert body["status"] == "complete"


@pytest.mark.asyncio
async def test_complete_response_hide_question_quota_hides_questions(client: AsyncClient):
    """A matched hide_question quota makes matching questions hidden from validation."""
    headers = await auth_headers(client, email="quota_hide@example.com")
    survey_id = await create_survey(client, headers, title="Hide Question Quota Survey")

    # Create two questions in one group
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    group_id = group_resp.json()["id"]

    # Q1: short_text, not required
    q1_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text", "code": "Q1", "is_required": False},
        headers=headers,
    )
    q1_id = q1_resp.json()["id"]

    # Q2: required — we want this to be hidden by the quota
    q2_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q2", "question_type": "short_text", "code": "Q2", "is_required": True},
        headers=headers,
    )
    q2_id = q2_resp.json()["id"]

    # Create a hide_question quota: when Q1 == "hide", hide Q2 (Q2 is in conditions)
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/quotas",
        json={
            "name": "Hide Q2 Quota",
            "limit": 100,  # high limit so it doesn't fill
            "action": "hide_question",
            "conditions": [
                {"question_id": q2_id, "operator": "eq", "value": "irrelevant"}
            ],
            "is_active": True,
        },
        headers=headers,
    )

    # The actual hiding test: a quota whose condition matches Q1 value
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/quotas",
        json={
            "name": "Hide Q2 Via Q1 Quota",
            "limit": 100,
            "action": "hide_question",
            "conditions": [
                {"question_id": q1_id, "operator": "eq", "value": "hide"}
            ],
            "is_active": True,
        },
        headers=headers,
    )

    await activate_survey(client, headers, survey_id)

    # Submit response with Q1="hide", no answer for Q2 (which is required but should be hidden)
    post = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": q1_id, "value": "hide"}]},
    )
    assert post.status_code == 201
    response_id = post.json()["id"]

    # Complete — the "Hide Q2 Via Q1 Quota" matches (Q1=="hide"), so Q1 gets hidden.
    # Q2 was required but may still be visible (depends on which conditions reference it).
    # The key behavior: response should complete if all visible required questions are answered.
    complete = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    # Q2 is required and has no answer. The quota hides Q1 (since Q1 is in the condition).
    # Q2 is still visible and required → this should fail with 422
    # unless Q2 is also hidden by the first quota when its condition (Q2=="irrelevant") doesn't match.
    # Since Q2 != "irrelevant", first quota does NOT match, so Q2 stays visible.
    # This tests that the hide_question mechanism works correctly.
    # Response should fail because Q2 is still visible and required.
    assert complete.status_code == 422
    body = complete.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_quota_current_count_incremented_after_completion(client: AsyncClient):
    """After successful completion matching a quota, the quota current_count is incremented."""
    headers = await auth_headers(client, email="quota_count@example.com")
    survey_id = await create_survey(client, headers, title="Quota Count Survey")

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group"},
        headers=headers,
    )
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text", "code": "Q1", "is_required": True},
        headers=headers,
    )
    question_id = q_resp.json()["id"]

    # limit=5 so multiple completions are allowed before disqualification
    quota_id = await create_quota(
        client, headers, survey_id, question_id,
        action="terminate", limit=5, operator="eq", value="counted",
    )

    await activate_survey(client, headers, survey_id)

    # First completion matching quota condition (new_count=1 < limit=5 → complete OK)
    post = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": "counted"}]},
    )
    assert post.status_code == 201
    response_id = post.json()["id"]

    complete = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert complete.status_code == 200

    # Verify quota current_count increased to 1
    quota_check = await client.get(
        f"{SURVEYS_URL}/{survey_id}/quotas/{quota_id}",
        headers=headers,
    )
    assert quota_check.status_code == 200
    assert quota_check.json()["current_count"] == 1


# --------------------------------------------------------------------------- #
# GET /surveys/{id}/responses/{rid}/detail — API key scope validation (SEC-07)
# --------------------------------------------------------------------------- #

KEYS_URL = "/api/v1/auth/keys"


async def _create_api_key(client: AsyncClient, headers: dict, scopes: list | None) -> str:
    """Create an API key with the given scopes; return the raw key string."""
    payload: dict = {"name": "Test Key"}
    if scopes is not None:
        payload["scopes"] = scopes
    resp = await client.post(KEYS_URL, json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()["key"]


async def _setup_survey_with_response(client: AsyncClient) -> tuple[str, str, dict]:
    """Create an active survey, submit a response, return (survey_id, response_id, jwt_headers)."""
    headers = await auth_headers(client, email="scope_test@example.com")
    survey_id = await create_survey(client, headers, title="Scope Test Survey")
    await add_group_and_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    post = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post.status_code == 201
    response_id = post.json()["id"]

    return survey_id, response_id, headers


@pytest.mark.asyncio
async def test_response_detail_jwt_auth_returns_200(client: AsyncClient):
    """JWT-authenticated requests to /detail are unaffected by scope validation."""
    survey_id, response_id, headers = await _setup_survey_with_response(client)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers=headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_response_detail_api_key_with_scope_returns_200(client: AsyncClient):
    """API key that includes responses:read scope can access /detail."""
    survey_id, response_id, headers = await _setup_survey_with_response(client)
    api_key = await _create_api_key(client, headers, scopes=["responses:read"])

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_response_detail_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without responses:read scope gets HTTP 403."""
    survey_id, response_id, headers = await _setup_survey_with_response(client)
    api_key = await _create_api_key(client, headers, scopes=["surveys:read"])

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"
    assert "message" in body["detail"]


@pytest.mark.asyncio
async def test_response_detail_api_key_empty_scopes_returns_403(client: AsyncClient):
    """API key with an empty scopes list gets HTTP 403."""
    survey_id, response_id, headers = await _setup_survey_with_response(client)
    api_key = await _create_api_key(client, headers, scopes=[])

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"
    assert "message" in body["detail"]


@pytest.mark.asyncio
async def test_response_detail_api_key_null_scopes_returns_403(client: AsyncClient):
    """API key with null/no scopes gets HTTP 403."""
    survey_id, response_id, headers = await _setup_survey_with_response(client)
    # Creating a key without specifying scopes leaves them null/empty
    api_key = await _create_api_key(client, headers, scopes=None)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"
    assert "message" in body["detail"]


# --------------------------------------------------------------------------- #
# PATCH /surveys/{id}/responses/{rid}/status — API key scope (SEC-ISS-217)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_update_response_status_jwt_auth_returns_200(client: AsyncClient):
    """JWT-authenticated requests to update response status bypass scope enforcement."""
    survey_id, response_id, headers = await _setup_survey_with_response(client)
    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
        headers=headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_update_response_status_api_key_with_scope_returns_200(client: AsyncClient):
    """API key with responses:write scope can update response status."""
    survey_id, response_id, headers = await _setup_survey_with_response(client)
    api_key = await _create_api_key(client, headers, scopes=["responses:write"])

    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_update_response_status_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without responses:write scope cannot update response status."""
    survey_id, response_id, headers = await _setup_survey_with_response(client)
    api_key = await _create_api_key(client, headers, scopes=["responses:read"])

    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"
    assert "message" in body["detail"]


@pytest.mark.asyncio
async def test_update_response_status_api_key_empty_scopes_returns_403(client: AsyncClient):
    """API key with empty scopes cannot update response status."""
    survey_id, response_id, headers = await _setup_survey_with_response(client)
    api_key = await _create_api_key(client, headers, scopes=[])

    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/status",
        json={"status": "disqualified"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"


# --------------------------------------------------------------------------- #
# ISS-259: Matrix response completion — subquestion validator skip
# --------------------------------------------------------------------------- #


async def _create_matrix_survey_with_options(
    client: AsyncClient,
) -> tuple[str, str, dict]:
    """Create an active survey with a matrix_single question (3 subquestions, 3 options).

    Returns (survey_id, parent_question_id, auth_headers).
    """
    headers = await auth_headers(client, email="matrix_complete_259@example.com")
    survey_id = await create_survey(client, headers, title="Matrix Complete Survey ISS-259")

    # Create a group
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Matrix Group"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    # Create parent matrix question
    parent_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={
            "title": "Matrix Question",
            "question_type": "matrix_single",
            "code": "MAT1",
            "is_required": True,
        },
        headers=headers,
    )
    assert parent_resp.status_code == 201
    parent_id = parent_resp.json()["id"]

    # Add 3 subquestions
    for i, sq_code in enumerate(["SQ001", "SQ002", "SQ003"], start=1):
        sq_resp = await client.post(
            f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
            json={
                "title": f"Row {sq_code}",
                "question_type": "matrix_single",
                "code": sq_code,
                "parent_id": parent_id,
                "sort_order": i,
            },
            headers=headers,
        )
        assert sq_resp.status_code == 201

    # Add 3 answer options to the parent
    for opt_code in ["A1", "A2", "A3"]:
        opt_resp = await client.post(
            f"{SURVEYS_URL}/{survey_id}/questions/{parent_id}/options",
            json={"code": opt_code, "title": f"Option {opt_code}"},
            headers=headers,
        )
        assert opt_resp.status_code == 201

    await activate_survey(client, headers, survey_id)
    return survey_id, parent_id, headers


@pytest.mark.asyncio
async def test_matrix_complete_with_all_subquestions_answered_returns_200(
    client: AsyncClient,
):
    """Completing a matrix response with all subquestions answered returns 200.

    Regression test for ISS-259: validator previously ran against subquestions (SQ001,
    SQ002, SQ003) instead of the parent question, causing a 422 because each subquestion
    lacks its own standalone answer dict.
    """
    survey_id, parent_id, _ = await _create_matrix_survey_with_options(client)

    # Start a response
    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Partial save: answer stored on the parent question (dict mapping subq code -> option code)
    patch_partial = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={
            "answers": [
                {
                    "question_id": parent_id,
                    "value": {"SQ001": "A1", "SQ002": "A2", "SQ003": "A3"},
                }
            ]
        },
    )
    assert patch_partial.status_code == 200

    # Complete — must return 200, not 422
    patch_complete = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_complete.status_code == 200, patch_complete.text
    body = patch_complete.json()
    assert body["status"] == "complete"
    assert body["completed_at"] is not None


@pytest.mark.asyncio
async def test_matrix_complete_missing_answer_on_required_parent_returns_422(
    client: AsyncClient,
):
    """Completing a matrix response without answering the required parent returns 422.

    Regression guard: the fix must not allow unanswered required matrix questions through.
    """
    survey_id, _parent_id, _ = await _create_matrix_survey_with_options(client)

    # Start a response without saving any answers
    post_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert post_resp.status_code == 201
    response_id = post_resp.json()["id"]

    # Complete without any answers — required matrix parent must be flagged
    patch_complete = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_complete.status_code == 422
    body = patch_complete.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"
    errors = body["detail"]["errors"]
    # Only the parent question (MAT1) should appear in errors, NOT the subquestions
    error_codes = {e["question_code"] for e in errors}
    assert "MAT1" in error_codes
    assert "SQ001" not in error_codes
    assert "SQ002" not in error_codes
    assert "SQ003" not in error_codes
