"""Tests for Question CRUD endpoints."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "questionuser@example.com",
    "password": "securepassword123",
    "name": "Question User",
}

VALID_QUESTION_TYPES = [
    "short_text",
    "long_text",
    "single_choice",
    "multiple_choice",
    "dropdown",
    "rating",
    "scale",
    "matrix_single",
    "matrix_multiple",
    "date",
    "time",
    "datetime",
    "file_upload",
    "number",
    "email",
    "phone",
    "url",
    "yes_no",
]


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
    question_type: str = "short_text",
    title: str = "Test Question",
    **kwargs,
) -> dict:
    payload = {"question_type": question_type, "title": title, **kwargs}
    resp = await client.post(
        questions_url(survey_id, group_id),
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


def questions_url(survey_id: str, group_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions"


# --------------------------------------------------------------------------- #
# POST /surveys/{survey_id}/groups/{group_id}/questions
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_question_returns_201(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    response = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Q1"},
        headers=headers,
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_question_auto_generated_code(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp1 = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "First"},
        headers=headers,
    )
    resp2 = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "long_text", "title": "Second"},
        headers=headers,
    )
    assert resp1.status_code == 201
    assert resp2.status_code == 201
    assert resp1.json()["code"] == "Q1"
    assert resp2.json()["code"] == "Q2"


@pytest.mark.asyncio
async def test_create_question_explicit_code(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    response = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Custom Code Q", "code": "MYCODE"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["code"] == "MYCODE"


@pytest.mark.asyncio
async def test_create_question_all_18_types(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    for qtype in VALID_QUESTION_TYPES:
        resp = await client.post(
            questions_url(survey_id, group_id),
            json={"question_type": qtype, "title": f"Q {qtype}"},
            headers=headers,
        )
        assert resp.status_code == 201, f"Failed for type: {qtype}, got {resp.json()}"


@pytest.mark.asyncio
async def test_create_question_invalid_type_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    response = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "invalid_type", "title": "Bad Q"},
        headers=headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_question_returns_all_fields(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    payload = {
        "question_type": "rating",
        "title": "How satisfied are you?",
        "description": "Rate from 1 to 5",
        "is_required": True,
        "sort_order": 3,
        "relevance": "some_condition",
        "validation": {"min": 1, "max": 5},
        "settings": {"display": "stars"},
    }
    response = await client.post(
        questions_url(survey_id, group_id),
        json=payload,
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["question_type"] == "rating"
    assert body["title"] == "How satisfied are you?"
    assert body["description"] == "Rate from 1 to 5"
    assert body["is_required"] is True
    assert body["sort_order"] == 3
    assert body["relevance"] == "some_condition"
    assert body["validation"] == {"min": 1, "max": 5}
    assert body["settings"] == {"display": "stars"}
    assert body["group_id"] == group_id
    assert "id" in body
    assert "created_at" in body
    assert body["subquestions"] == []


@pytest.mark.asyncio
async def test_create_question_auto_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp1 = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "First"},
        headers=headers,
    )
    resp2 = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Second"},
        headers=headers,
    )
    assert resp1.json()["sort_order"] == 1
    assert resp2.json()["sort_order"] == 2


@pytest.mark.asyncio
async def test_create_question_survey_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    fake_survey_id = "00000000-0000-0000-0000-000000000000"
    fake_group_id = "00000000-0000-0000-0000-000000000001"
    response = await client.post(
        questions_url(fake_survey_id, fake_group_id),
        json={"question_type": "short_text", "title": "Q"},
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_question_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    response = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Q"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_question_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="q_owner_a@example.com")
    headers_b = await auth_headers(client, email="q_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    group_id = await create_group(client, headers_a, survey_id)

    response = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Q"},
        headers=headers_b,
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# GET /surveys/{survey_id}/groups/{group_id}/questions
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_questions_returns_empty_initially(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    response = await client.get(questions_url(survey_id, group_id), headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_list_questions_ordered_by_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "C", "sort_order": 3},
        headers=headers,
    )
    await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "A", "sort_order": 1},
        headers=headers,
    )
    await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "B", "sort_order": 2},
        headers=headers,
    )

    response = await client.get(questions_url(survey_id, group_id), headers=headers)
    assert response.status_code == 200
    titles = [q["title"] for q in response.json()["items"]]
    assert titles == ["A", "B", "C"]


@pytest.mark.asyncio
async def test_list_questions_group_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    fake_group_id = "00000000-0000-0000-0000-000000000000"

    response = await client.get(questions_url(survey_id, fake_group_id), headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_questions_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    response = await client.get(questions_url(survey_id, group_id))
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# GET /surveys/{survey_id}/groups/{group_id}/questions/{question_id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_question_by_id(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q = await create_question(client, headers, survey_id, group_id, title="My Question")
    question_id = q["id"]

    response = await client.get(
        f"{questions_url(survey_id, group_id)}/{question_id}", headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == question_id
    assert body["title"] == "My Question"
    assert body["subquestions"] == []


@pytest.mark.asyncio
async def test_get_question_includes_subquestions(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    parent = await create_question(client, headers, survey_id, group_id, title="Parent")
    parent_id = parent["id"]

    # Create a subquestion
    sub_resp = await client.post(
        questions_url(survey_id, group_id),
        json={
            "question_type": "short_text",
            "title": "Sub 1",
            "parent_id": parent_id,
        },
        headers=headers,
    )
    assert sub_resp.status_code == 201
    sub_id = sub_resp.json()["id"]

    response = await client.get(
        f"{questions_url(survey_id, group_id)}/{parent_id}", headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["subquestions"]) == 1
    assert body["subquestions"][0]["id"] == sub_id


@pytest.mark.asyncio
async def test_get_question_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.get(
        f"{questions_url(survey_id, group_id)}/{fake_id}", headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_question_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="gq_owner_a@example.com")
    headers_b = await auth_headers(client, email="gq_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    group_id = await create_group(client, headers_a, survey_id)
    q = await create_question(client, headers_a, survey_id, group_id)
    question_id = q["id"]

    response = await client.get(
        f"{questions_url(survey_id, group_id)}/{question_id}", headers=headers_b
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# PATCH /surveys/{survey_id}/groups/{group_id}/questions/{question_id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_patch_question_updates_title(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q = await create_question(client, headers, survey_id, group_id, title="Old Title")
    question_id = q["id"]

    response = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"title": "New Title"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "New Title"


@pytest.mark.asyncio
async def test_patch_question_updates_only_provided_fields(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q = await create_question(
        client, headers, survey_id, group_id,
        title="My Q", description="Original desc"
    )
    question_id = q["id"]

    response = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"title": "Updated Title"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Updated Title"
    assert body["description"] == "Original desc"


@pytest.mark.asyncio
async def test_patch_question_invalid_type_returns_422(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q = await create_question(client, headers, survey_id, group_id)
    question_id = q["id"]

    response = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"question_type": "invalid_type"},
        headers=headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_question_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.patch(
        f"{questions_url(survey_id, group_id)}/{fake_id}",
        json={"title": "No Q"},
        headers=headers,
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# DELETE /surveys/{survey_id}/groups/{group_id}/questions/{question_id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_delete_question_returns_204(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q = await create_question(client, headers, survey_id, group_id, title="Delete Me")
    question_id = q["id"]

    response = await client.delete(
        f"{questions_url(survey_id, group_id)}/{question_id}", headers=headers
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_question_removes_from_list(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q = await create_question(client, headers, survey_id, group_id, title="Delete Me")
    question_id = q["id"]

    await client.delete(
        f"{questions_url(survey_id, group_id)}/{question_id}", headers=headers
    )

    list_resp = await client.get(questions_url(survey_id, group_id), headers=headers)
    assert list_resp.json()["items"] == []


@pytest.mark.asyncio
async def test_delete_question_cascades_to_subquestions(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    parent = await create_question(client, headers, survey_id, group_id, title="Parent")
    parent_id = parent["id"]

    # Create subquestion
    sub_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Sub", "parent_id": parent_id},
        headers=headers,
    )
    assert sub_resp.status_code == 201

    # Delete parent
    await client.delete(
        f"{questions_url(survey_id, group_id)}/{parent_id}", headers=headers
    )

    # List should be empty
    list_resp = await client.get(questions_url(survey_id, group_id), headers=headers)
    assert list_resp.json()["items"] == []


@pytest.mark.asyncio
async def test_delete_question_not_found(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    fake_id = "00000000-0000-0000-0000-000000000000"

    response = await client.delete(
        f"{questions_url(survey_id, group_id)}/{fake_id}", headers=headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_question_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="dq_owner_a@example.com")
    headers_b = await auth_headers(client, email="dq_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    group_id = await create_group(client, headers_a, survey_id)
    q = await create_question(client, headers_a, survey_id, group_id)
    question_id = q["id"]

    response = await client.delete(
        f"{questions_url(survey_id, group_id)}/{question_id}", headers=headers_b
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_question_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q = await create_question(client, headers, survey_id, group_id)
    question_id = q["id"]

    response = await client.delete(
        f"{questions_url(survey_id, group_id)}/{question_id}"
    )
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# Subquestion code auto-generation
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_subquestion_code_auto_generated(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    parent = await create_question(client, headers, survey_id, group_id)
    parent_id = parent["id"]
    parent_code = parent["code"]  # e.g. Q1

    sub_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Sub 1", "parent_id": parent_id},
        headers=headers,
    )
    assert sub_resp.status_code == 201
    assert sub_resp.json()["code"] == f"{parent_code}_SQ001"


@pytest.mark.asyncio
async def test_subquestion_codes_increment(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    parent = await create_question(client, headers, survey_id, group_id)
    parent_id = parent["id"]
    parent_code = parent["code"]

    sub1 = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Sub 1", "parent_id": parent_id},
        headers=headers,
    )
    sub2 = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Sub 2", "parent_id": parent_id},
        headers=headers,
    )
    assert sub1.json()["code"] == f"{parent_code}_SQ001"
    assert sub2.json()["code"] == f"{parent_code}_SQ002"


# --------------------------------------------------------------------------- #
# Code uniqueness
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_duplicate_code_within_survey_returns_409(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # Create first question with explicit code
    resp1 = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Q1", "code": "DUPCODE"},
        headers=headers,
    )
    assert resp1.status_code == 201

    # Try to create second question with same code in same group
    resp2 = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "short_text", "title": "Q2", "code": "DUPCODE"},
        headers=headers,
    )
    # Should fail - codes should be unique within survey
    assert resp2.status_code in (409, 422, 500)


# --------------------------------------------------------------------------- #
# POST /surveys/{survey_id}/groups/{group_id}/questions/reorder
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_reorder_questions_updates_sort_order(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    q1 = await create_question(client, headers, survey_id, group_id, title="First")
    q2 = await create_question(client, headers, survey_id, group_id, title="Second")
    id1 = q1["id"]
    id2 = q2["id"]

    # Swap
    reorder_payload = {
        "items": [
            {"id": id1, "sort_order": 2},
            {"id": id2, "sort_order": 1},
        ]
    }
    response = await client.post(
        f"{questions_url(survey_id, group_id)}/reorder",
        json=reorder_payload,
        headers=headers,
    )
    assert response.status_code == 200
    questions = response.json()
    # Returned ordered by sort_order: Second (1) then First (2)
    assert questions[0]["id"] == id2
    assert questions[0]["sort_order"] == 1
    assert questions[1]["id"] == id1
    assert questions[1]["sort_order"] == 2


@pytest.mark.asyncio
async def test_reorder_questions_cross_group_move(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id_a = await create_group(client, headers, survey_id, title="Group A")
    group_id_b = await create_group(client, headers, survey_id, title="Group B")

    q = await create_question(client, headers, survey_id, group_id_a, title="Move Me")
    question_id = q["id"]

    reorder_payload = {
        "items": [
            {"id": question_id, "sort_order": 1, "group_id": group_id_b},
        ]
    }
    response = await client.post(
        f"{questions_url(survey_id, group_id_a)}/reorder",
        json=reorder_payload,
        headers=headers,
    )
    assert response.status_code == 200

    # The question should now be in group B
    get_resp = await client.get(
        f"{questions_url(survey_id, group_id_b)}/{question_id}", headers=headers
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["group_id"] == group_id_b


@pytest.mark.asyncio
async def test_reorder_questions_cross_survey_rejected(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id_a = await create_survey(client, headers, title="Survey A")
    survey_id_b = await create_survey(client, headers, title="Survey B")
    group_id_a = await create_group(client, headers, survey_id_a)
    group_id_b = await create_group(client, headers, survey_id_b)

    q = await create_question(client, headers, survey_id_b, group_id_b, title="B Question")
    question_id_from_b = q["id"]

    reorder_payload = {
        "items": [{"id": question_id_from_b, "sort_order": 1}]
    }
    # Try to reorder survey A's group using question from survey B
    response = await client.post(
        f"{questions_url(survey_id_a, group_id_a)}/reorder",
        json=reorder_payload,
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_reorder_questions_requires_auth(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    response = await client.post(
        f"{questions_url(survey_id, group_id)}/reorder",
        json={"items": []},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_reorder_questions_wrong_owner_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="rq_owner_a@example.com")
    headers_b = await auth_headers(client, email="rq_owner_b@example.com")
    survey_id = await create_survey(client, headers_a)
    group_id = await create_group(client, headers_a, survey_id)
    q = await create_question(client, headers_a, survey_id, group_id)
    question_id = q["id"]

    reorder_payload = {"items": [{"id": question_id, "sort_order": 5}]}
    response = await client.post(
        f"{questions_url(survey_id, group_id)}/reorder",
        json=reorder_payload,
        headers=headers_b,
    )
    assert response.status_code == 404
