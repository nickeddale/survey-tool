"""Tests for QuestionGroup CRUD endpoints."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "groupuser@example.com",
    "password": "securepassword123",
    "name": "Group User",
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


def groups_url(survey_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/groups"


# --------------------------------------------------------------------------- #
# POST /surveys/{survey_id}/groups
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_group_returns_201(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    response = await client.post(
        groups_url(survey_id), json={"title": "Group 1"}, headers=headers
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_group_auto_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    resp1 = await client.post(
        groups_url(survey_id), json={"title": "First Group"}, headers=headers
    )
    resp2 = await client.post(
        groups_url(survey_id), json={"title": "Second Group"}, headers=headers
    )
    assert resp1.status_code == 201
    assert resp2.status_code == 201
    assert resp1.json()["sort_order"] == 1
    assert resp2.json()["sort_order"] == 2


@pytest.mark.asyncio
async def test_create_group_explicit_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    response = await client.post(
        groups_url(survey_id), json={"title": "Group A", "sort_order": 10}, headers=headers
    )
    assert response.status_code == 201
    assert response.json()["sort_order"] == 10


@pytest.mark.asyncio
async def test_create_group_returns_all_fields(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    payload = {
        "title": "Full Group",
        "description": "A description",
        "relevance": "condition_expression",
        "sort_order": 5,
    }
    response = await client.post(groups_url(survey_id), json=payload, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Full Group"
    assert body["description"] == "A description"
    assert body["relevance"] == "condition_expression"
    assert body["sort_order"] == 5
    assert body["survey_id"] == survey_id
    assert "id" in body
    assert "created_at" in body
    assert body["questions"] == []


@pytest.mark.asyncio
async def test_create_group_survey_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.post(
        groups_url(fake_id), json={"title": "Group"}, headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_group_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    response = await client.post(groups_url(survey_id), json={"title": "Group"})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_group_wrong_survey_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="group_owner_a@example.com")
    headers_b = await auth_headers(client, email="group_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    response = await client.post(
        groups_url(survey_id), json={"title": "Group"}, headers=headers_b
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# GET /surveys/{survey_id}/groups
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_groups_returns_empty_initially(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    response = await client.get(groups_url(survey_id), headers=headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_groups_ordered_by_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    await client.post(groups_url(survey_id), json={"title": "C", "sort_order": 3}, headers=headers)
    await client.post(groups_url(survey_id), json={"title": "A", "sort_order": 1}, headers=headers)
    await client.post(groups_url(survey_id), json={"title": "B", "sort_order": 2}, headers=headers)

    response = await client.get(groups_url(survey_id), headers=headers)
    assert response.status_code == 200
    titles = [g["title"] for g in response.json()]
    assert titles == ["A", "B", "C"]


@pytest.mark.asyncio
async def test_list_groups_survey_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(groups_url(fake_id), headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_groups_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    response = await client.get(groups_url(survey_id))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_groups_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="list_owner_a@example.com")
    headers_b = await auth_headers(client, email="list_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    response = await client.get(groups_url(survey_id), headers=headers_b)
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# GET /surveys/{survey_id}/groups/{group_id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_group_by_id(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    create_resp = await client.post(
        groups_url(survey_id), json={"title": "My Group"}, headers=headers
    )
    group_id = create_resp.json()["id"]

    response = await client.get(f"{groups_url(survey_id)}/{group_id}", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == group_id
    assert body["title"] == "My Group"
    assert body["questions"] == []


@pytest.mark.asyncio
async def test_get_group_by_id_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    fake_group_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(
        f"{groups_url(survey_id)}/{fake_group_id}", headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_group_wrong_survey_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="get_owner_a@example.com")
    headers_b = await auth_headers(client, email="get_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    create_resp = await client.post(
        groups_url(survey_id), json={"title": "My Group"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]

    response = await client.get(f"{groups_url(survey_id)}/{group_id}", headers=headers_b)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_group_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    create_resp = await client.post(
        groups_url(survey_id), json={"title": "My Group"}, headers=headers
    )
    group_id = create_resp.json()["id"]
    response = await client.get(f"{groups_url(survey_id)}/{group_id}")
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# PATCH /surveys/{survey_id}/groups/{group_id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_patch_group_updates_title(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    create_resp = await client.post(
        groups_url(survey_id), json={"title": "Old Title"}, headers=headers
    )
    group_id = create_resp.json()["id"]

    response = await client.patch(
        f"{groups_url(survey_id)}/{group_id}",
        json={"title": "New Title"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "New Title"


@pytest.mark.asyncio
async def test_patch_group_updates_only_provided_fields(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    create_resp = await client.post(
        groups_url(survey_id),
        json={"title": "My Group", "description": "Original desc"},
        headers=headers,
    )
    group_id = create_resp.json()["id"]

    response = await client.patch(
        f"{groups_url(survey_id)}/{group_id}",
        json={"title": "Updated Title"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated Title"
    assert body["description"] == "Original desc"


@pytest.mark.asyncio
async def test_patch_group_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    fake_group_id = "00000000-0000-0000-0000-000000000000"
    response = await client.patch(
        f"{groups_url(survey_id)}/{fake_group_id}",
        json={"title": "No Group"},
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_group_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="patch_owner_a@example.com")
    headers_b = await auth_headers(client, email="patch_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    create_resp = await client.post(
        groups_url(survey_id), json={"title": "My Group"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]

    response = await client.patch(
        f"{groups_url(survey_id)}/{group_id}",
        json={"title": "Hacked"},
        headers=headers_b,
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# DELETE /surveys/{survey_id}/groups/{group_id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_delete_group_returns_204(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    create_resp = await client.post(
        groups_url(survey_id), json={"title": "Delete Me"}, headers=headers
    )
    group_id = create_resp.json()["id"]

    response = await client.delete(f"{groups_url(survey_id)}/{group_id}", headers=headers)
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_group_removes_from_list(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    create_resp = await client.post(
        groups_url(survey_id), json={"title": "Delete Me"}, headers=headers
    )
    group_id = create_resp.json()["id"]

    await client.delete(f"{groups_url(survey_id)}/{group_id}", headers=headers)

    list_resp = await client.get(groups_url(survey_id), headers=headers)
    assert list_resp.json() == []


@pytest.mark.asyncio
async def test_delete_group_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    fake_group_id = "00000000-0000-0000-0000-000000000000"
    response = await client.delete(
        f"{groups_url(survey_id)}/{fake_group_id}", headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_group_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="del_owner_a@example.com")
    headers_b = await auth_headers(client, email="del_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    create_resp = await client.post(
        groups_url(survey_id), json={"title": "My Group"}, headers=headers_a
    )
    group_id = create_resp.json()["id"]

    response = await client.delete(
        f"{groups_url(survey_id)}/{group_id}", headers=headers_b
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_group_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    create_resp = await client.post(
        groups_url(survey_id), json={"title": "My Group"}, headers=headers
    )
    group_id = create_resp.json()["id"]
    response = await client.delete(f"{groups_url(survey_id)}/{group_id}")
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# PATCH /surveys/{survey_id}/groups/reorder
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_reorder_groups_updates_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    resp1 = await client.post(
        groups_url(survey_id), json={"title": "First", "sort_order": 1}, headers=headers
    )
    resp2 = await client.post(
        groups_url(survey_id), json={"title": "Second", "sort_order": 2}, headers=headers
    )
    id1 = resp1.json()["id"]
    id2 = resp2.json()["id"]

    # Swap them
    reorder_payload = {
        "order": [
            {"id": id1, "sort_order": 2},
            {"id": id2, "sort_order": 1},
        ]
    }
    response = await client.patch(
        f"{groups_url(survey_id)}/reorder", json=reorder_payload, headers=headers
    )
    assert response.status_code == 200
    groups = response.json()
    # Should be returned ordered by sort_order: Second (1) then First (2)
    assert groups[0]["id"] == id2
    assert groups[0]["sort_order"] == 1
    assert groups[1]["id"] == id1
    assert groups[1]["sort_order"] == 2


@pytest.mark.asyncio
async def test_reorder_groups_survey_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    reorder_payload = {
        "order": [{"id": fake_id, "sort_order": 1}]
    }
    response = await client.patch(
        f"{groups_url(fake_id)}/reorder", json=reorder_payload, headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_reorder_groups_cross_survey_rejected(client: AsyncClient):
    """Group IDs from a different survey should cause a 404."""
    headers = await auth_headers(client)
    survey_id_a = await create_survey(client, headers, title="Survey A")
    survey_id_b = await create_survey(client, headers, title="Survey B")

    resp = await client.post(
        groups_url(survey_id_b), json={"title": "Group B1"}, headers=headers
    )
    group_id_from_b = resp.json()["id"]

    # Try to reorder survey A using group from survey B
    reorder_payload = {
        "order": [{"id": group_id_from_b, "sort_order": 1}]
    }
    response = await client.patch(
        f"{groups_url(survey_id_a)}/reorder", json=reorder_payload, headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_reorder_groups_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    response = await client.patch(
        f"{groups_url(survey_id)}/reorder", json={"order": []}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_reorder_groups_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="reorder_owner_a@example.com")
    headers_b = await auth_headers(client, email="reorder_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    resp = await client.post(
        groups_url(survey_id), json={"title": "Group 1"}, headers=headers_a
    )
    group_id = resp.json()["id"]

    reorder_payload = {"order": [{"id": group_id, "sort_order": 5}]}
    response = await client.patch(
        f"{groups_url(survey_id)}/reorder", json=reorder_payload, headers=headers_b
    )
    assert response.status_code == 404
