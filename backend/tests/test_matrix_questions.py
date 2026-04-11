"""Integration tests for matrix question types (matrix, matrix_dropdown, matrix_dynamic)."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER_BASE = {
    "password": "securepassword123",
    "name": "Matrix Test User",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_and_login(client: AsyncClient, email: str) -> dict:
    await client.post(REGISTER_URL, json={**VALID_USER_BASE, "email": email})
    response = await client.post(
        LOGIN_URL, json={"email": email, "password": VALID_USER_BASE["password"]}
    )
    assert response.status_code == 200
    return response.json()


async def auth_headers(client: AsyncClient, email: str) -> dict:
    tokens = await register_and_login(client, email=email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(SURVEYS_URL, json={"title": "Matrix Survey"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_group(client: AsyncClient, headers: dict, survey_id: str) -> str:
    resp = await client.post(
        f"/api/v1/surveys/{survey_id}/groups",
        json={"title": "Group 1"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def questions_url(survey_id: str, group_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/groups/{group_id}/questions"


def subquestions_url(survey_id: str, question_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/questions/{question_id}/subquestions"


def options_url(survey_id: str, question_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/questions/{question_id}/options"


# ---------------------------------------------------------------------------
# Tests: creating matrix question types
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_matrix_question_succeeds(client: AsyncClient):
    headers = await auth_headers(client, "matrix_create@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix", "title": "Matrix Q"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.json()
    data = resp.json()
    assert data["question_type"] == "matrix"
    assert data["subquestions"] == []
    assert data["answer_options"] == []


@pytest.mark.asyncio
async def test_create_matrix_dropdown_question_succeeds(client: AsyncClient):
    headers = await auth_headers(client, "matrix_dd_create@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix_dropdown", "title": "Matrix DD Q"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["question_type"] == "matrix_dropdown"


@pytest.mark.asyncio
async def test_create_matrix_dynamic_question_succeeds(client: AsyncClient):
    headers = await auth_headers(client, "matrix_dyn_create@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix_dynamic", "title": "Matrix Dyn Q"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["question_type"] == "matrix_dynamic"


# ---------------------------------------------------------------------------
# Tests: matrix settings validation on create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_matrix_with_settings_but_no_subquestions_returns_422(client: AsyncClient):
    headers = await auth_headers(client, "matrix_settings_no_sq@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await client.post(
        questions_url(survey_id, group_id),
        json={
            "question_type": "matrix",
            "title": "Matrix Q",
            "settings": {"alternate_rows": True},
        },
        headers=headers,
    )
    assert resp.status_code == 422, resp.json()


@pytest.mark.asyncio
async def test_create_matrix_dynamic_invalid_settings_returns_422(client: AsyncClient):
    headers = await auth_headers(client, "matrix_dyn_bad_settings@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # min_rows > max_rows should fail
    resp = await client.post(
        questions_url(survey_id, group_id),
        json={
            "question_type": "matrix_dynamic",
            "title": "Matrix Dyn Q",
            "settings": {"min_rows": 5, "max_rows": 2},
        },
        headers=headers,
    )
    assert resp.status_code == 422, resp.json()


# ---------------------------------------------------------------------------
# Tests: POST subquestions endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_subquestion_returns_parent_with_subquestion(client: AsyncClient):
    headers = await auth_headers(client, "matrix_sq_create@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # Create matrix parent
    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix", "title": "Matrix Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    parent_id = create_resp.json()["id"]

    # Create subquestion (row)
    sq_resp = await client.post(
        subquestions_url(survey_id, parent_id),
        json={"title": "Row 1"},
        headers=headers,
    )
    assert sq_resp.status_code == 201, sq_resp.json()
    parent_data = sq_resp.json()

    # Response should be the parent with subquestions embedded
    assert parent_data["id"] == parent_id
    assert len(parent_data["subquestions"]) == 1
    sq = parent_data["subquestions"][0]
    assert sq["title"] == "Row 1"
    assert sq["parent_id"] == parent_id


@pytest.mark.asyncio
async def test_create_subquestion_auto_generates_code(client: AsyncClient):
    headers = await auth_headers(client, "matrix_sq_autocode@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix", "title": "Matrix Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    parent_id = create_resp.json()["id"]
    parent_code = create_resp.json()["code"]

    sq_resp = await client.post(
        subquestions_url(survey_id, parent_id),
        json={"title": "Row 1"},
        headers=headers,
    )
    assert sq_resp.status_code == 201
    sq = sq_resp.json()["subquestions"][0]
    assert sq["code"] == f"{parent_code}_SQ001"

    # Second subquestion should get SQ002
    sq_resp2 = await client.post(
        subquestions_url(survey_id, parent_id),
        json={"title": "Row 2"},
        headers=headers,
    )
    assert sq_resp2.status_code == 201
    sqs = sq_resp2.json()["subquestions"]
    codes = {s["code"] for s in sqs}
    assert f"{parent_code}_SQ002" in codes


@pytest.mark.asyncio
@pytest.mark.parametrize("question_type", ["matrix_single", "matrix_multiple"])
async def test_create_subquestion_for_matrix_single_and_multiple_returns_201(
    client: AsyncClient, question_type: str
):
    """matrix_single and matrix_multiple should be recognized as matrix types."""
    email = f"matrix_sq_{question_type}@example.com"
    headers = await auth_headers(client, email)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": question_type, "title": "Matrix Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.json()
    question_id = create_resp.json()["id"]

    sq_resp = await client.post(
        subquestions_url(survey_id, question_id),
        json={"title": "Item A"},
        headers=headers,
    )
    assert sq_resp.status_code == 201, sq_resp.json()
    parent_data = sq_resp.json()
    assert len(parent_data["subquestions"]) == 1
    assert parent_data["subquestions"][0]["title"] == "Item A"


@pytest.mark.asyncio
async def test_create_subquestion_for_non_matrix_type_returns_422(client: AsyncClient):
    headers = await auth_headers(client, "matrix_sq_non_matrix@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # Create a non-matrix question
    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "single_choice", "title": "Radio Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    sq_resp = await client.post(
        subquestions_url(survey_id, question_id),
        json={"title": "Row 1"},
        headers=headers,
    )
    assert sq_resp.status_code == 422, sq_resp.json()


@pytest.mark.asyncio
async def test_create_subquestion_for_nonexistent_question_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "matrix_sq_404@example.com")
    survey_id = await create_survey(client, headers)

    import uuid
    fake_id = str(uuid.uuid4())

    sq_resp = await client.post(
        subquestions_url(survey_id, fake_id),
        json={"title": "Row 1"},
        headers=headers,
    )
    assert sq_resp.status_code == 404, sq_resp.json()


@pytest.mark.asyncio
async def test_create_subquestion_for_other_users_question_returns_404(client: AsyncClient):
    """A user cannot add subquestions to another user's question."""
    headers_owner = await auth_headers(client, "matrix_sq_owner@example.com")
    headers_other = await auth_headers(client, "matrix_sq_other@example.com")

    # Owner creates matrix question
    survey_id = await create_survey(client, headers_owner)
    group_id = await create_group(client, headers_owner, survey_id)
    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix", "title": "Matrix Q"},
        headers=headers_owner,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Other user attempts to create subquestion
    sq_resp = await client.post(
        subquestions_url(survey_id, question_id),
        json={"title": "Row 1"},
        headers=headers_other,
    )
    assert sq_resp.status_code == 404, sq_resp.json()


# ---------------------------------------------------------------------------
# Tests: GET question includes subquestions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_matrix_question_includes_subquestions(client: AsyncClient):
    headers = await auth_headers(client, "matrix_get_sq@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # Create matrix question
    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix", "title": "Matrix Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Add subquestion
    sq_resp = await client.post(
        subquestions_url(survey_id, question_id),
        json={"title": "Row 1"},
        headers=headers,
    )
    assert sq_resp.status_code == 201

    # GET the question
    get_resp = await client.get(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        headers=headers,
    )
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert len(data["subquestions"]) == 1
    assert data["subquestions"][0]["title"] == "Row 1"


# ---------------------------------------------------------------------------
# Tests: update matrix settings validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_matrix_settings_with_subquestions_and_options_succeeds(client: AsyncClient):
    headers = await auth_headers(client, "matrix_update_valid@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # Create matrix question
    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix", "title": "Matrix Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Add subquestion
    await client.post(
        subquestions_url(survey_id, question_id),
        json={"title": "Row 1"},
        headers=headers,
    )

    # Add answer option (column)
    await client.post(
        options_url(survey_id, question_id),
        json={"title": "Col 1"},
        headers=headers,
    )

    # Update settings — should succeed
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"alternate_rows": True, "is_all_rows_required": False}},
        headers=headers,
    )
    assert patch_resp.status_code == 200, patch_resp.json()


@pytest.mark.asyncio
async def test_update_matrix_settings_without_subquestions_returns_422(client: AsyncClient):
    headers = await auth_headers(client, "matrix_update_no_sq@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix", "title": "Matrix Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Try to update settings without any subquestions → 422
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"alternate_rows": True}},
        headers=headers,
    )
    assert patch_resp.status_code == 422, patch_resp.json()


@pytest.mark.asyncio
async def test_update_matrix_dynamic_settings_invalid_row_range_returns_422(client: AsyncClient):
    headers = await auth_headers(client, "matrix_dyn_update_bad@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix_dynamic", "title": "Matrix Dyn Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Add required subquestion and option first so row count is the only error
    await client.post(subquestions_url(survey_id, question_id), json={"title": "Row"}, headers=headers)
    await client.post(options_url(survey_id, question_id), json={"title": "Col"}, headers=headers)

    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"min_rows": 5, "max_rows": 2}},
        headers=headers,
    )
    assert patch_resp.status_code == 422, patch_resp.json()


# ---------------------------------------------------------------------------
# Tests: matrix_dropdown with column_types
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_matrix_dropdown_with_column_types_succeeds(client: AsyncClient):
    headers = await auth_headers(client, "matrix_dd_col_types@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix_dropdown", "title": "Matrix DD Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Add subquestion and option
    await client.post(subquestions_url(survey_id, question_id), json={"title": "Row"}, headers=headers)
    await client.post(options_url(survey_id, question_id), json={"title": "Col"}, headers=headers)

    # Update with column_types — should succeed
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"column_types": {"A1": "dropdown", "A2": "text"}}},
        headers=headers,
    )
    assert patch_resp.status_code == 200, patch_resp.json()


@pytest.mark.asyncio
async def test_update_matrix_dropdown_invalid_column_types_returns_422(client: AsyncClient):
    headers = await auth_headers(client, "matrix_dd_bad_col_types@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix_dropdown", "title": "Matrix DD Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    await client.post(subquestions_url(survey_id, question_id), json={"title": "Row"}, headers=headers)
    await client.post(options_url(survey_id, question_id), json={"title": "Col"}, headers=headers)

    # column_types value is not a string → 422
    patch_resp = await client.patch(
        f"{questions_url(survey_id, group_id)}/{question_id}",
        json={"settings": {"column_types": {"A1": 999}}},
        headers=headers,
    )
    assert patch_resp.status_code == 422, patch_resp.json()


# ---------------------------------------------------------------------------
# Tests: matrix type subquestions in list endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_questions_excludes_subquestions_from_top_level(client: AsyncClient):
    """List questions should not include subquestions as top-level items."""
    headers = await auth_headers(client, "matrix_list_no_sq@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    create_resp = await client.post(
        questions_url(survey_id, group_id),
        json={"question_type": "matrix", "title": "Matrix Q"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    question_id = create_resp.json()["id"]

    # Add 2 subquestions
    await client.post(subquestions_url(survey_id, question_id), json={"title": "Row 1"}, headers=headers)
    await client.post(subquestions_url(survey_id, question_id), json={"title": "Row 2"}, headers=headers)

    # List questions — should only return 1 top-level question
    list_resp = await client.get(questions_url(survey_id, group_id), headers=headers)
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert len(data["items"][0]["subquestions"]) == 2
