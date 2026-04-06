"""Tests for Survey CRUD endpoints."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "surveyuser@example.com",
    "password": "securepassword123",
    "name": "Survey User",
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


# --------------------------------------------------------------------------- #
# POST /surveys
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_survey_returns_201(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.post(SURVEYS_URL, json={"title": "My Survey"}, headers=headers)
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_survey_only_title_required(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.post(SURVEYS_URL, json={"title": "Minimal Survey"}, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Minimal Survey"
    assert body["description"] is None
    assert body["welcome_message"] is None
    assert body["end_message"] is None


@pytest.mark.asyncio
async def test_create_survey_defaults_to_draft(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.post(SURVEYS_URL, json={"title": "Draft Survey"}, headers=headers)
    assert response.status_code == 201
    assert response.json()["status"] == "draft"


@pytest.mark.asyncio
async def test_create_survey_returns_all_fields(client: AsyncClient):
    headers = await auth_headers(client)
    payload = {
        "title": "Full Survey",
        "description": "A description",
        "welcome_message": "Welcome!",
        "end_message": "Thanks!",
        "default_language": "fr",
        "settings": {"theme": "dark"},
    }
    response = await client.post(SURVEYS_URL, json=payload, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Full Survey"
    assert body["description"] == "A description"
    assert body["welcome_message"] == "Welcome!"
    assert body["end_message"] == "Thanks!"
    assert body["default_language"] == "fr"
    assert body["settings"] == {"theme": "dark"}
    assert "id" in body
    assert "user_id" in body
    assert "created_at" in body
    assert "updated_at" in body


@pytest.mark.asyncio
async def test_create_survey_requires_auth(client: AsyncClient):
    response = await client.post(SURVEYS_URL, json={"title": "No Auth"})
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# GET /surveys
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_surveys_returns_empty_initially(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.get(SURVEYS_URL, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["page"] == 1
    assert body["per_page"] == 20


@pytest.mark.asyncio
async def test_list_surveys_returns_paginated_response(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(SURVEYS_URL, json={"title": "Survey 1"}, headers=headers)
    await client.post(SURVEYS_URL, json={"title": "Survey 2"}, headers=headers)

    response = await client.get(SURVEYS_URL, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    assert body["page"] == 1
    assert body["per_page"] == 20


@pytest.mark.asyncio
async def test_list_surveys_pagination(client: AsyncClient):
    headers = await auth_headers(client)
    for i in range(5):
        await client.post(SURVEYS_URL, json={"title": f"Survey {i}"}, headers=headers)

    response = await client.get(f"{SURVEYS_URL}?page=1&per_page=2", headers=headers)
    body = response.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2
    assert body["page"] == 1
    assert body["per_page"] == 2


@pytest.mark.asyncio
async def test_list_surveys_second_page(client: AsyncClient):
    headers = await auth_headers(client)
    for i in range(3):
        await client.post(SURVEYS_URL, json={"title": f"Survey {i}"}, headers=headers)

    response = await client.get(f"{SURVEYS_URL}?page=2&per_page=2", headers=headers)
    body = response.json()
    assert body["total"] == 3
    assert len(body["items"]) == 1
    assert body["page"] == 2


@pytest.mark.asyncio
async def test_list_surveys_status_filter(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(SURVEYS_URL, json={"title": "Draft One"}, headers=headers)
    await client.post(SURVEYS_URL, json={"title": "Active One", "status": "active"}, headers=headers)

    response = await client.get(f"{SURVEYS_URL}?status=active", headers=headers)
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Active One"
    assert body["items"][0]["status"] == "active"


@pytest.mark.asyncio
async def test_list_surveys_title_search(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(SURVEYS_URL, json={"title": "Customer Satisfaction"}, headers=headers)
    await client.post(SURVEYS_URL, json={"title": "Employee Feedback"}, headers=headers)

    response = await client.get(f"{SURVEYS_URL}?search=customer", headers=headers)
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Customer Satisfaction"


@pytest.mark.asyncio
async def test_list_surveys_requires_auth(client: AsyncClient):
    response = await client.get(SURVEYS_URL)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_surveys_only_shows_own_surveys(client: AsyncClient):
    headers_a = await auth_headers(client, email="usera_survey@example.com")
    headers_b = await auth_headers(client, email="userb_survey@example.com")

    await client.post(SURVEYS_URL, json={"title": "A's Survey"}, headers=headers_a)
    await client.post(SURVEYS_URL, json={"title": "B's Survey"}, headers=headers_b)

    resp_a = await client.get(SURVEYS_URL, headers=headers_a)
    assert resp_a.json()["total"] == 1
    assert resp_a.json()["items"][0]["title"] == "A's Survey"

    resp_b = await client.get(SURVEYS_URL, headers=headers_b)
    assert resp_b.json()["total"] == 1
    assert resp_b.json()["items"][0]["title"] == "B's Survey"


# --------------------------------------------------------------------------- #
# GET /surveys/{id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_survey_by_id(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "My Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    response = await client.get(f"{SURVEYS_URL}/{survey_id}", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == survey_id
    assert body["title"] == "My Survey"


@pytest.mark.asyncio
async def test_get_survey_by_id_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"{SURVEYS_URL}/{fake_id}", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_survey_include_full_returns_extra_fields(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "Full Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    response = await client.get(f"{SURVEYS_URL}/{survey_id}?include=full", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "groups" in body
    assert "questions" in body
    assert "options" in body
    assert body["groups"] == []
    assert body["questions"] == []
    assert body["options"] == []


@pytest.mark.asyncio
async def test_get_survey_user_isolation_returns_404(client: AsyncClient):
    headers_owner = await auth_headers(client, email="owner_survey@example.com")
    headers_other = await auth_headers(client, email="other_survey@example.com")

    create_resp = await client.post(
        SURVEYS_URL, json={"title": "Owner Survey"}, headers=headers_owner
    )
    survey_id = create_resp.json()["id"]

    response = await client.get(f"{SURVEYS_URL}/{survey_id}", headers=headers_other)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_survey_requires_auth(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"{SURVEYS_URL}/{fake_id}")
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# PATCH /surveys/{id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_patch_survey_updates_title(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "Old Title"}, headers=headers)
    survey_id = create_resp.json()["id"]

    response = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "New Title"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["title"] == "New Title"


@pytest.mark.asyncio
async def test_patch_survey_updates_only_provided_fields(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(
        SURVEYS_URL,
        json={"title": "My Survey", "description": "Original desc"},
        headers=headers,
    )
    survey_id = create_resp.json()["id"]

    response = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "Updated Title"}, headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated Title"
    assert body["description"] == "Original desc"


@pytest.mark.asyncio
async def test_patch_survey_updates_status(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    response = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"status": "active"}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["status"] == "active"


@pytest.mark.asyncio
async def test_patch_survey_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.patch(
        f"{SURVEYS_URL}/{fake_id}", json={"title": "No Survey"}, headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_survey_user_isolation_returns_404(client: AsyncClient):
    headers_owner = await auth_headers(client, email="owner_patch@example.com")
    headers_other = await auth_headers(client, email="other_patch@example.com")

    create_resp = await client.post(
        SURVEYS_URL, json={"title": "Owner Survey"}, headers=headers_owner
    )
    survey_id = create_resp.json()["id"]

    response = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "Hacked"}, headers=headers_other
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_survey_requires_auth(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.patch(f"{SURVEYS_URL}/{fake_id}", json={"title": "No"})
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# DELETE /surveys/{id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_delete_survey_returns_204(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "Delete Me"}, headers=headers)
    survey_id = create_resp.json()["id"]

    response = await client.delete(f"{SURVEYS_URL}/{survey_id}", headers=headers)
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_survey_removes_from_list(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "Delete Me"}, headers=headers)
    survey_id = create_resp.json()["id"]

    await client.delete(f"{SURVEYS_URL}/{survey_id}", headers=headers)

    list_resp = await client.get(SURVEYS_URL, headers=headers)
    assert list_resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_delete_survey_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.delete(f"{SURVEYS_URL}/{fake_id}", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_survey_user_isolation_returns_404(client: AsyncClient):
    headers_owner = await auth_headers(client, email="owner_del@example.com")
    headers_other = await auth_headers(client, email="other_del@example.com")

    create_resp = await client.post(
        SURVEYS_URL, json={"title": "Owner Survey"}, headers=headers_owner
    )
    survey_id = create_resp.json()["id"]

    response = await client.delete(f"{SURVEYS_URL}/{survey_id}", headers=headers_other)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_survey_requires_auth(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.delete(f"{SURVEYS_URL}/{fake_id}")
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# Survey versioning
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_survey_version_starts_at_1(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.post(SURVEYS_URL, json={"title": "Versioned Survey"}, headers=headers)
    assert response.status_code == 201
    assert response.json()["version"] == 1


@pytest.mark.asyncio
async def test_patch_survey_increments_version(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "V1 Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]
    assert create_resp.json()["version"] == 1

    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "V2 Survey"}, headers=headers
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["version"] == 2


@pytest.mark.asyncio
async def test_patch_survey_multiple_times_increments_version(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    await client.patch(f"{SURVEYS_URL}/{survey_id}", json={"title": "Update 1"}, headers=headers)
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "Update 2"}, headers=headers
    )
    assert patch_resp.json()["version"] == 3


@pytest.mark.asyncio
async def test_get_survey_versions_returns_history(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "History Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    # Perform two updates to generate two version snapshots
    await client.patch(f"{SURVEYS_URL}/{survey_id}", json={"title": "Update 1"}, headers=headers)
    await client.patch(f"{SURVEYS_URL}/{survey_id}", json={"title": "Update 2"}, headers=headers)

    versions_resp = await client.get(f"{SURVEYS_URL}/{survey_id}/versions", headers=headers)
    assert versions_resp.status_code == 200
    body = versions_resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    # Ordered by version desc — most recent snapshot first (version 2 before version 1)
    assert body["items"][0]["version"] == 2
    assert body["items"][1]["version"] == 1


@pytest.mark.asyncio
async def test_get_survey_versions_snapshot_content(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "Snapshot Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "Updated Title"}, headers=headers
    )

    versions_resp = await client.get(f"{SURVEYS_URL}/{survey_id}/versions", headers=headers)
    assert versions_resp.status_code == 200
    items = versions_resp.json()["items"]
    assert len(items) == 1
    snapshot = items[0]["snapshot"]
    # Snapshot should capture the ORIGINAL title before the update
    assert snapshot["title"] == "Snapshot Survey"
    assert snapshot["version"] == 1


@pytest.mark.asyncio
async def test_get_survey_versions_empty_before_updates(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "No Update Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    versions_resp = await client.get(f"{SURVEYS_URL}/{survey_id}/versions", headers=headers)
    assert versions_resp.status_code == 200
    body = versions_resp.json()
    assert body["total"] == 0
    assert body["items"] == []


@pytest.mark.asyncio
async def test_get_survey_versions_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"{SURVEYS_URL}/{fake_id}/versions", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_survey_versions_requires_auth(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"{SURVEYS_URL}/{fake_id}/versions")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_survey_versions_user_isolation(client: AsyncClient):
    headers_owner = await auth_headers(client, email="owner_versions@example.com")
    headers_other = await auth_headers(client, email="other_versions@example.com")

    create_resp = await client.post(
        SURVEYS_URL, json={"title": "Owner Survey"}, headers=headers_owner
    )
    survey_id = create_resp.json()["id"]
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"title": "Updated"}, headers=headers_owner
    )

    response = await client.get(f"{SURVEYS_URL}/{survey_id}/versions", headers=headers_other)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_survey_versions_pagination(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(SURVEYS_URL, json={"title": "Paged Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    # Perform 3 updates to generate 3 version entries
    for i in range(3):
        await client.patch(
            f"{SURVEYS_URL}/{survey_id}", json={"title": f"Update {i}"}, headers=headers
        )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/versions?page=1&per_page=2", headers=headers
    )
    body = resp.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["page"] == 1
    assert body["per_page"] == 2
