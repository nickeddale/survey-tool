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
