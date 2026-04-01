"""Tests for Answer Option CRUD endpoints."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "optionuser@example.com",
    "password": "securepassword123",
    "name": "Option User",
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


async def create_group(
    client: AsyncClient, headers: dict, survey_id: str, title: str = "Test Group"
) -> str:
    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups",
        json={"title": title},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    group_id: str,
    title: str = "Test Question",
) -> str:
    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions",
        json={"question_type": "single_choice", "title": title},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def options_url(survey_id: str, question_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/questions/{question_id}/options"


async def create_option(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    question_id: str,
    title: str = "Option Title",
    **kwargs,
) -> dict:
    payload = {"title": title, **kwargs}
    resp = await client.post(options_url(survey_id, question_id), json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()


# --------------------------------------------------------------------------- #
# POST /surveys/{survey_id}/questions/{question_id}/options
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_option_returns_201(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    response = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Yes"},
        headers=headers,
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_option_auto_generated_code(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    resp1 = await client.post(
        options_url(survey_id, question_id),
        json={"title": "First"},
        headers=headers,
    )
    resp2 = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Second"},
        headers=headers,
    )
    assert resp1.status_code == 201
    assert resp2.status_code == 201
    assert resp1.json()["code"] == "A1"
    assert resp2.json()["code"] == "A2"


@pytest.mark.asyncio
async def test_create_option_explicit_code(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    response = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Custom Code Option", "code": "MYCODE"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["code"] == "MYCODE"


@pytest.mark.asyncio
async def test_create_option_assessment_value_defaults_to_zero(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    response = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Option"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["assessment_value"] == 0


@pytest.mark.asyncio
async def test_create_option_explicit_assessment_value(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    response = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Strongly Agree", "assessment_value": 5},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["assessment_value"] == 5


@pytest.mark.asyncio
async def test_create_option_auto_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    resp1 = await client.post(
        options_url(survey_id, question_id),
        json={"title": "First"},
        headers=headers,
    )
    resp2 = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Second"},
        headers=headers,
    )
    assert resp1.json()["sort_order"] == 1
    assert resp2.json()["sort_order"] == 2


@pytest.mark.asyncio
async def test_create_option_returns_all_fields(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    response = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Option A", "code": "OA", "sort_order": 3, "assessment_value": 2},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Option A"
    assert body["code"] == "OA"
    assert body["sort_order"] == 3
    assert body["assessment_value"] == 2
    assert body["question_id"] == question_id
    assert "id" in body
    assert "created_at" in body


@pytest.mark.asyncio
async def test_create_option_question_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    fake_question_id = "00000000-0000-0000-0000-000000000000"

    response = await client.post(
        options_url(survey_id, fake_question_id),
        json={"title": "Option"},
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_option_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    response = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Option"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_option_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="ao_owner_a@example.com")
    headers_b = await auth_headers(client, email="ao_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    group_id = await create_group(client, headers_a, survey_id)
    question_id = await create_question(client, headers_a, survey_id, group_id)

    response = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Option"},
        headers=headers_b,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_option_duplicate_code_returns_409(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    resp1 = await client.post(
        options_url(survey_id, question_id),
        json={"title": "First", "code": "DUP"},
        headers=headers,
    )
    assert resp1.status_code == 201

    resp2 = await client.post(
        options_url(survey_id, question_id),
        json={"title": "Second", "code": "DUP"},
        headers=headers,
    )
    assert resp2.status_code == 409


# --------------------------------------------------------------------------- #
# GET /surveys/{survey_id}/questions/{question_id}/options
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_options_returns_empty_initially(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    response = await client.get(options_url(survey_id, question_id), headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_options_ordered_by_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    await client.post(
        options_url(survey_id, question_id),
        json={"title": "C", "sort_order": 3},
        headers=headers,
    )
    await client.post(
        options_url(survey_id, question_id),
        json={"title": "A", "sort_order": 1},
        headers=headers,
    )
    await client.post(
        options_url(survey_id, question_id),
        json={"title": "B", "sort_order": 2},
        headers=headers,
    )

    response = await client.get(options_url(survey_id, question_id), headers=headers)
    assert response.status_code == 200
    titles = [o["title"] for o in response.json()["items"]]
    assert titles == ["A", "B", "C"]


@pytest.mark.asyncio
async def test_list_options_question_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    fake_question_id = "00000000-0000-0000-0000-000000000000"

    response = await client.get(options_url(survey_id, fake_question_id), headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_options_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    response = await client.get(options_url(survey_id, question_id))
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# GET /surveys/{survey_id}/questions/{question_id}/options/{option_id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_option_by_id(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    opt = await create_option(client, headers, survey_id, question_id, title="My Option")
    option_id = opt["id"]

    response = await client.get(
        f"{options_url(survey_id, question_id)}/{option_id}", headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == option_id
    assert body["title"] == "My Option"


@pytest.mark.asyncio
async def test_get_option_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.get(
        f"{options_url(survey_id, question_id)}/{fake_id}", headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_option_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="go_owner_a@example.com")
    headers_b = await auth_headers(client, email="go_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    group_id = await create_group(client, headers_a, survey_id)
    question_id = await create_question(client, headers_a, survey_id, group_id)
    opt = await create_option(client, headers_a, survey_id, question_id)
    option_id = opt["id"]

    response = await client.get(
        f"{options_url(survey_id, question_id)}/{option_id}", headers=headers_b
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# PATCH /surveys/{survey_id}/questions/{question_id}/options/{option_id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_patch_option_updates_title(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    opt = await create_option(client, headers, survey_id, question_id, title="Old Title")
    option_id = opt["id"]

    response = await client.patch(
        f"{options_url(survey_id, question_id)}/{option_id}",
        json={"title": "New Title"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "New Title"


@pytest.mark.asyncio
async def test_patch_option_updates_only_provided_fields(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    opt = await create_option(
        client, headers, survey_id, question_id, title="My Option", assessment_value=3
    )
    option_id = opt["id"]

    response = await client.patch(
        f"{options_url(survey_id, question_id)}/{option_id}",
        json={"title": "Updated Title"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated Title"
    assert body["assessment_value"] == 3


@pytest.mark.asyncio
async def test_patch_option_updates_assessment_value(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    opt = await create_option(client, headers, survey_id, question_id, title="Option")
    option_id = opt["id"]

    response = await client.patch(
        f"{options_url(survey_id, question_id)}/{option_id}",
        json={"assessment_value": 10},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["assessment_value"] == 10


@pytest.mark.asyncio
async def test_patch_option_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.patch(
        f"{options_url(survey_id, question_id)}/{fake_id}",
        json={"title": "No Option"},
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_option_duplicate_code_returns_409(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    opt1 = await create_option(client, headers, survey_id, question_id, title="First", code="CODE1")
    opt2 = await create_option(client, headers, survey_id, question_id, title="Second", code="CODE2")

    response = await client.patch(
        f"{options_url(survey_id, question_id)}/{opt2['id']}",
        json={"code": "CODE1"},
        headers=headers,
    )
    assert response.status_code == 409


# --------------------------------------------------------------------------- #
# DELETE /surveys/{survey_id}/questions/{question_id}/options/{option_id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_delete_option_returns_204(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    opt = await create_option(client, headers, survey_id, question_id, title="Delete Me")
    option_id = opt["id"]

    response = await client.delete(
        f"{options_url(survey_id, question_id)}/{option_id}", headers=headers
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_option_removes_from_list(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    opt = await create_option(client, headers, survey_id, question_id, title="Delete Me")
    option_id = opt["id"]

    await client.delete(
        f"{options_url(survey_id, question_id)}/{option_id}", headers=headers
    )

    list_resp = await client.get(options_url(survey_id, question_id), headers=headers)
    assert list_resp.json()["items"] == []


@pytest.mark.asyncio
async def test_delete_option_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.delete(
        f"{options_url(survey_id, question_id)}/{fake_id}", headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_option_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="do_owner_a@example.com")
    headers_b = await auth_headers(client, email="do_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    group_id = await create_group(client, headers_a, survey_id)
    question_id = await create_question(client, headers_a, survey_id, group_id)
    opt = await create_option(client, headers_a, survey_id, question_id)
    option_id = opt["id"]

    response = await client.delete(
        f"{options_url(survey_id, question_id)}/{option_id}", headers=headers_b
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_option_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)
    opt = await create_option(client, headers, survey_id, question_id)
    option_id = opt["id"]

    response = await client.delete(
        f"{options_url(survey_id, question_id)}/{option_id}"
    )
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# POST /surveys/{survey_id}/questions/{question_id}/options/reorder
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_reorder_options_updates_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    opt1 = await create_option(client, headers, survey_id, question_id, title="First")
    opt2 = await create_option(client, headers, survey_id, question_id, title="Second")
    id1 = opt1["id"]
    id2 = opt2["id"]

    # Swap
    reorder_payload = {
        "items": [
            {"id": id1, "sort_order": 2},
            {"id": id2, "sort_order": 1},
        ]
    }
    response = await client.post(
        f"{options_url(survey_id, question_id)}/reorder",
        json=reorder_payload,
        headers=headers,
    )
    assert response.status_code == 200
    options = response.json()
    # Returned ordered by sort_order: Second (1) then First (2)
    assert options[0]["id"] == id2
    assert options[0]["sort_order"] == 1
    assert options[1]["id"] == id1
    assert options[1]["sort_order"] == 2


@pytest.mark.asyncio
async def test_reorder_options_cross_question_rejected(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id_a = await create_question(client, headers, survey_id, group_id, title="Q A")
    question_id_b = await create_question(client, headers, survey_id, group_id, title="Q B")

    opt_b = await create_option(client, headers, survey_id, question_id_b, title="Option from B")
    option_id_from_b = opt_b["id"]

    reorder_payload = {
        "items": [{"id": option_id_from_b, "sort_order": 1}]
    }
    # Try to reorder question A's options using an option from question B
    response = await client.post(
        f"{options_url(survey_id, question_id_a)}/reorder",
        json=reorder_payload,
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_reorder_options_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id)

    response = await client.post(
        f"{options_url(survey_id, question_id)}/reorder",
        json={"items": []},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_reorder_options_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="ro_owner_a@example.com")
    headers_b = await auth_headers(client, email="ro_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    group_id = await create_group(client, headers_a, survey_id)
    question_id = await create_question(client, headers_a, survey_id, group_id)
    opt = await create_option(client, headers_a, survey_id, question_id)
    option_id = opt["id"]

    reorder_payload = {"items": [{"id": option_id, "sort_order": 5}]}
    response = await client.post(
        f"{options_url(survey_id, question_id)}/reorder",
        json=reorder_payload,
        headers=headers_b,
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# Code uniqueness within a question (same code allowed in different questions)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_same_code_allowed_in_different_questions(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id_a = await create_question(client, headers, survey_id, group_id, title="Q A")
    question_id_b = await create_question(client, headers, survey_id, group_id, title="Q B")

    resp_a = await client.post(
        options_url(survey_id, question_id_a),
        json={"title": "Option", "code": "SHARED"},
        headers=headers,
    )
    resp_b = await client.post(
        options_url(survey_id, question_id_b),
        json={"title": "Option", "code": "SHARED"},
        headers=headers,
    )
    assert resp_a.status_code == 201
    assert resp_b.status_code == 201
