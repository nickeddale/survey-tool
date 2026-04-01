"""Tests for survey lifecycle state machine transitions."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "transitionuser@example.com",
    "password": "securepassword123",
    "name": "Transition User",
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


async def add_group_and_question(client: AsyncClient, headers: dict, survey_id: str) -> None:
    """Add one question group and one question to a survey (to satisfy activation requirement)."""
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


# --------------------------------------------------------------------------- #
# POST /surveys/{id}/activate
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_activate_draft_survey_with_questions_returns_200(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)

    response = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "active"
    assert body["id"] == survey_id


@pytest.mark.asyncio
async def test_activate_draft_survey_with_no_questions_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_activate_non_draft_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)

    # First activation succeeds
    activate_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert activate_resp.status_code == 200

    # Second activation attempt fails
    response = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_activate_survey_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.post(f"{SURVEYS_URL}/{fake_id}/activate", headers=headers)
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# POST /surveys/{id}/close
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_close_active_survey_returns_200(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)

    response = await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "closed"
    assert body["id"] == survey_id


@pytest.mark.asyncio
async def test_close_draft_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_close_already_closed_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)

    response = await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# POST /surveys/{id}/archive
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_archive_closed_survey_returns_200(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)

    response = await client.post(f"{SURVEYS_URL}/{survey_id}/archive", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "archived"
    assert body["id"] == survey_id


@pytest.mark.asyncio
async def test_archive_active_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)

    response = await client.post(f"{SURVEYS_URL}/{survey_id}/archive", headers=headers)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_archive_draft_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(f"{SURVEYS_URL}/{survey_id}/archive", headers=headers)
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# PATCH /surveys/{id} blocked for non-draft surveys
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_patch_active_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)

    response = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "New Title"}, headers=headers
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_closed_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)

    response = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "New Title"}, headers=headers
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_archived_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)
    await client.post(f"{SURVEYS_URL}/{survey_id}/archive", headers=headers)

    response = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "New Title"}, headers=headers
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# Creating question groups on non-draft survey is prevented
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_group_on_active_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_group_and_question(client, headers, survey_id)
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)

    response = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "New Group"},
        headers=headers,
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# Creating questions on non-draft survey is prevented
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_question_on_active_survey_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    # Create a group first (while in draft)
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    # Add a question to satisfy activation requirement
    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Question 1", "question_type": "short_text"},
        headers=headers,
    )
    assert q_resp.status_code == 201

    # Activate
    activate_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert activate_resp.status_code == 200

    # Now try to create another question — should fail
    response = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Question 2", "question_type": "short_text"},
        headers=headers,
    )
    assert response.status_code == 422
