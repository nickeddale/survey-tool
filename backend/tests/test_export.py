"""Tests for survey clone, export, and import endpoints."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "exportuser@example.com",
    "password": "securepassword123",
    "name": "Export User",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


async def add_group(client: AsyncClient, headers: dict, survey_id: str, title: str = "Group 1") -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": title},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def add_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    group_id: str,
    title: str = "Question 1",
    question_type: str = "single_choice",
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": title, "question_type": question_type},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def add_answer_option(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    question_id: str,
    title: str = "Option A",
    code: str = "opt_a",
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{question_id}/options",
        json={"title": title, "code": code},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def build_full_survey(client: AsyncClient, headers: dict, title: str = "Full Survey") -> dict:
    """Create a survey with one group, one question, and two options. Returns ids dict."""
    survey_id = await create_survey(client, headers, title=title)
    group_id = await add_group(client, headers, survey_id)
    question_id = await add_question(client, headers, survey_id, group_id)
    option_a_id = await add_answer_option(
        client, headers, survey_id, question_id, title="Option A", code="opt_a"
    )
    option_b_id = await add_answer_option(
        client, headers, survey_id, question_id, title="Option B", code="opt_b"
    )
    return {
        "survey_id": survey_id,
        "group_id": group_id,
        "question_id": question_id,
        "option_a_id": option_a_id,
        "option_b_id": option_b_id,
    }


# ---------------------------------------------------------------------------
# POST /surveys/{id}/clone
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clone_creates_new_uuid_and_draft_status(client: AsyncClient):
    headers = await auth_headers(client)
    ids = await build_full_survey(client, headers)
    survey_id = ids["survey_id"]

    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/clone", headers=headers)
    assert resp.status_code == 201
    body = resp.json()

    assert body["id"] != survey_id
    assert body["status"] == "draft"


@pytest.mark.asyncio
async def test_clone_default_title_suffix(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers, title="My Survey")

    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/clone", headers=headers)
    assert resp.status_code == 201
    assert resp.json()["title"] == "My Survey (Copy)"


@pytest.mark.asyncio
async def test_clone_custom_title(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers, title="My Survey")

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/clone",
        json={"title": "Renamed Clone"},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "Renamed Clone"


@pytest.mark.asyncio
async def test_clone_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.post(f"{SURVEYS_URL}/{fake_id}/clone", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_clone_invalid_uuid_returns_404(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.post(f"{SURVEYS_URL}/not-a-uuid/clone", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_clone_copies_groups_questions_options(client: AsyncClient):
    headers = await auth_headers(client)
    ids = await build_full_survey(client, headers, title="Original")
    survey_id = ids["survey_id"]

    clone_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/clone", headers=headers)
    assert clone_resp.status_code == 201
    clone_id = clone_resp.json()["id"]

    # Fetch the cloned survey full
    get_resp = await client.get(f"{SURVEYS_URL}/{clone_id}", headers=headers)
    assert get_resp.status_code == 200
    cloned = get_resp.json()

    assert len(cloned["groups"]) == 1
    cloned_group = cloned["groups"][0]
    assert cloned_group["id"] != ids["group_id"]

    # Questions are loaded within the group
    assert len(cloned_group["questions"]) == 1
    cloned_question = cloned_group["questions"][0]
    assert cloned_question["id"] != ids["question_id"]


# ---------------------------------------------------------------------------
# GET /surveys/{id}/export
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_returns_nested_structure(client: AsyncClient):
    headers = await auth_headers(client)
    ids = await build_full_survey(client, headers, title="Exportable Survey")
    survey_id = ids["survey_id"]

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/export", headers=headers)
    assert resp.status_code == 200
    body = resp.json()

    assert body["title"] == "Exportable Survey"
    assert "groups" in body
    assert len(body["groups"]) == 1

    group = body["groups"][0]
    assert "questions" in group
    assert len(group["questions"]) == 1

    question = group["questions"][0]
    assert "answer_options" in question
    assert len(question["answer_options"]) == 2


@pytest.mark.asyncio
async def test_export_uses_codes_not_uuids(client: AsyncClient):
    headers = await auth_headers(client)
    ids = await build_full_survey(client, headers)
    survey_id = ids["survey_id"]

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/export", headers=headers)
    assert resp.status_code == 200
    body = resp.json()

    question = body["groups"][0]["questions"][0]
    # question should have 'code' field, not 'id'
    assert "code" in question
    assert "id" not in question

    for option in question["answer_options"]:
        assert "code" in option
        assert "id" not in option

    option_codes = {o["code"] for o in question["answer_options"]}
    assert option_codes == {"opt_a", "opt_b"}


@pytest.mark.asyncio
async def test_export_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"{SURVEYS_URL}/{fake_id}/export", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_export_invalid_uuid_returns_404(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.get(f"{SURVEYS_URL}/not-a-uuid/export", headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /surveys/import
# ---------------------------------------------------------------------------


def _make_valid_import_payload(title: str = "Imported Survey") -> dict:
    return {
        "data": {
            "title": title,
            "description": "Imported description",
            "status": "active",  # should be overridden to draft
            "welcome_message": "Welcome!",
            "end_message": "Thank you!",
            "default_language": "en",
            "settings": None,
            "groups": [
                {
                    "title": "Group 1",
                    "description": None,
                    "sort_order": 1,
                    "relevance": None,
                    "questions": [
                        {
                            "code": "Q1",
                            "question_type": "single_choice",
                            "title": "Favourite colour?",
                            "description": None,
                            "is_required": False,
                            "sort_order": 1,
                            "relevance": None,
                            "validation": None,
                            "settings": None,
                            "answer_options": [
                                {"code": "opt_a", "title": "Red", "sort_order": 1, "assessment_value": 0},
                                {"code": "opt_b", "title": "Blue", "sort_order": 2, "assessment_value": 0},
                            ],
                            "subquestions": [],
                        }
                    ],
                }
            ],
        }
    }


@pytest.mark.asyncio
async def test_import_creates_new_survey(client: AsyncClient):
    headers = await auth_headers(client)
    payload = _make_valid_import_payload(title="Imported Survey")

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Imported Survey"
    assert body["status"] == "draft"
    assert "id" in body


@pytest.mark.asyncio
async def test_import_status_always_draft(client: AsyncClient):
    headers = await auth_headers(client)
    payload = _make_valid_import_payload()
    # The exported data has status=active; imported survey should still be draft
    payload["data"]["status"] = "active"

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["status"] == "draft"


@pytest.mark.asyncio
async def test_import_with_custom_title(client: AsyncClient):
    headers = await auth_headers(client)
    payload = _make_valid_import_payload(title="From Export")
    payload["title"] = "Custom Title Override"

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["title"] == "Custom Title Override"


@pytest.mark.asyncio
async def test_import_missing_title_returns_400(client: AsyncClient):
    headers = await auth_headers(client)
    payload = _make_valid_import_payload()
    del payload["data"]["title"]

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_missing_groups_returns_400(client: AsyncClient):
    headers = await auth_headers(client)
    payload = _make_valid_import_payload()
    del payload["data"]["groups"]

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_invalid_question_type_returns_400(client: AsyncClient):
    headers = await auth_headers(client)
    payload = _make_valid_import_payload()
    payload["data"]["groups"][0]["questions"][0]["question_type"] = "not_a_real_type"

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_missing_question_code_returns_400(client: AsyncClient):
    headers = await auth_headers(client)
    payload = _make_valid_import_payload()
    del payload["data"]["groups"][0]["questions"][0]["code"]

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_missing_question_title_returns_400(client: AsyncClient):
    headers = await auth_headers(client)
    payload = _make_valid_import_payload()
    del payload["data"]["groups"][0]["questions"][0]["title"]

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_missing_group_title_returns_400(client: AsyncClient):
    headers = await auth_headers(client)
    payload = _make_valid_import_payload()
    del payload["data"]["groups"][0]["title"]

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_empty_groups_allowed(client: AsyncClient):
    """A survey import with an empty groups list should succeed."""
    headers = await auth_headers(client)
    payload = {
        "data": {
            "title": "No Groups Survey",
            "groups": [],
        }
    }

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["status"] == "draft"


@pytest.mark.asyncio
async def test_export_then_import_roundtrip(client: AsyncClient):
    """Export a survey then import it; the imported copy should match the original structure."""
    headers = await auth_headers(client)
    ids = await build_full_survey(client, headers, title="Roundtrip Survey")
    survey_id = ids["survey_id"]

    export_resp = await client.get(f"{SURVEYS_URL}/{survey_id}/export", headers=headers)
    assert export_resp.status_code == 200
    exported = export_resp.json()

    import_resp = await client.post(
        f"{SURVEYS_URL}/import",
        json={"data": exported},
        headers=headers,
    )
    assert import_resp.status_code == 201
    imported = import_resp.json()

    assert imported["title"] == "Roundtrip Survey"
    assert imported["status"] == "draft"
    assert imported["id"] != survey_id

    # Verify nested structure via get
    get_resp = await client.get(f"{SURVEYS_URL}/{imported['id']}", headers=headers)
    assert get_resp.status_code == 200
    full = get_resp.json()
    assert len(full["groups"]) == 1
