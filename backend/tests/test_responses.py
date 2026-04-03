"""Tests for the public POST /api/v1/surveys/{id}/responses endpoint."""

import pytest
from httpx import AsyncClient

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
