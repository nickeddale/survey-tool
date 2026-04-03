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


# ---------------------------------------------------------------------------
# Round-trip fidelity test: all 18+ question types
# ---------------------------------------------------------------------------

# All valid question types as defined in app/models/question.py VALID_QUESTION_TYPES
_ALL_QUESTION_TYPES = [
    "short_text",
    "long_text",
    "single_choice",
    "multiple_choice",
    "dropdown",
    "rating",
    "scale",
    "matrix_single",
    "matrix_multiple",
    "matrix",
    "matrix_dropdown",
    "matrix_dynamic",
    "date",
    "time",
    "datetime",
    "file_upload",
    "number",
    "numeric",
    "email",
    "phone",
    "url",
    "yes_no",
    "boolean",
    "ranking",
    "image_picker",
    "expression",
    "html",
]

# Question types that require answer options
_CHOICE_TYPES = {
    "single_choice", "multiple_choice", "dropdown", "ranking",
    "image_picker", "rating", "scale",
}

# Matrix types that require subquestions
_MATRIX_TYPES = {
    "matrix_single", "matrix_multiple", "matrix", "matrix_dropdown", "matrix_dynamic",
}


def _build_all_types_survey_payload() -> dict:
    """Build a survey export payload covering all question types with full field fidelity."""
    questions = []
    for idx, qtype in enumerate(_ALL_QUESTION_TYPES):
        code = f"Q{idx + 1:03d}"
        question: dict = {
            "code": code,
            "question_type": qtype,
            "title": f"Question {idx + 1} ({qtype})",
            "description": f"Description for {qtype}",
            "is_required": idx % 2 == 0,  # alternate required/optional
            "sort_order": idx + 1,
            "relevance": f"{code} != ''",
            "validation": {"min_length": 1} if qtype in ("short_text", "long_text") else None,
            "settings": {"custom_setting": f"value_{idx}"},
            "answer_options": [],
            "subquestions": [],
        }
        if qtype in _CHOICE_TYPES:
            question["answer_options"] = [
                {
                    "code": f"{code}_opt1",
                    "title": "Option 1",
                    "sort_order": 1,
                    "assessment_value": 1,
                },
                {
                    "code": f"{code}_opt2",
                    "title": "Option 2",
                    "sort_order": 2,
                    "assessment_value": 2,
                },
                {
                    "code": f"{code}_opt3",
                    "title": "Option 3",
                    "sort_order": 3,
                    "assessment_value": 3,
                },
            ]
        if qtype in _MATRIX_TYPES:
            question["subquestions"] = [
                {
                    "code": f"{code}_row1",
                    "question_type": "short_text",
                    "title": "Row 1",
                    "description": None,
                    "is_required": False,
                    "sort_order": 1,
                    "relevance": None,
                    "validation": None,
                    "settings": None,
                    "answer_options": [],
                    "subquestions": [],
                },
                {
                    "code": f"{code}_row2",
                    "question_type": "short_text",
                    "title": "Row 2",
                    "description": None,
                    "is_required": False,
                    "sort_order": 2,
                    "relevance": None,
                    "validation": None,
                    "settings": None,
                    "answer_options": [],
                    "subquestions": [],
                },
            ]
            # Matrix types also need column options
            question["answer_options"] = [
                {
                    "code": f"{code}_col1",
                    "title": "Column 1",
                    "sort_order": 1,
                    "assessment_value": 1,
                },
                {
                    "code": f"{code}_col2",
                    "title": "Column 2",
                    "sort_order": 2,
                    "assessment_value": 2,
                },
            ]
        questions.append(question)

    return {
        "title": "All Question Types Survey",
        "description": "Tests all 18+ question types for full round-trip fidelity",
        "status": "draft",
        "welcome_message": "Welcome to the fidelity test",
        "end_message": "Thank you for completing the survey",
        "default_language": "en",
        "settings": {"allow_back": True, "show_progress": False},
        "groups": [
            {
                "title": "Group A: Text Types",
                "description": "Short and long text questions",
                "sort_order": 1,
                "relevance": None,
                "questions": questions[:5],
            },
            {
                "title": "Group B: Choice Types",
                "description": "Single choice, multiple choice, dropdown",
                "sort_order": 2,
                "relevance": "Q001 != ''",
                "questions": questions[5:12],
            },
            {
                "title": "Group C: Special Types",
                "description": "Matrix, date/time, file, numeric, and other types",
                "sort_order": 3,
                "relevance": None,
                "questions": questions[12:],
            },
        ],
    }


def _normalize_for_comparison(export_payload: dict) -> dict:
    """Strip any non-structural fields to allow structural comparison between two exports.

    UUIDs and timestamps are not present in the export format (it uses codes), so
    the export dict should be directly comparable. This function just sorts lists
    consistently to handle any ordering differences.
    """
    import copy
    data = copy.deepcopy(export_payload)

    # Normalize groups by sort_order
    data["groups"] = sorted(data.get("groups", []), key=lambda g: g.get("sort_order", 0))
    for group in data["groups"]:
        group["questions"] = sorted(
            group.get("questions", []), key=lambda q: q.get("sort_order", 0)
        )
        for question in group["questions"]:
            question["answer_options"] = sorted(
                question.get("answer_options", []), key=lambda o: o.get("sort_order", 0)
            )
            question["subquestions"] = sorted(
                question.get("subquestions", []), key=lambda sq: sq.get("sort_order", 0)
            )
            for subq in question["subquestions"]:
                subq["answer_options"] = sorted(
                    subq.get("answer_options", []), key=lambda o: o.get("sort_order", 0)
                )

    return data


@pytest.mark.asyncio
async def test_roundtrip_fidelity_all_question_types(client: AsyncClient):
    """Full round-trip fidelity test: import survey with all 18+ question types,
    export it, import again, export again, and verify the two exports are identical.

    Tests:
    - All question types are preserved through import → export
    - All fields (validation, settings, relevance, assessment_value) are preserved
    - Subquestions (matrix rows) are preserved
    - Answer options with assessment_value are preserved
    - Survey metadata (description, welcome/end messages, settings) are preserved
    """
    headers = await auth_headers(client, email="fidelity@example.com")

    original_payload = _build_all_types_survey_payload()

    # First import: create the survey from the comprehensive payload
    import1_resp = await client.post(
        f"{SURVEYS_URL}/import",
        json={"data": original_payload},
        headers=headers,
    )
    assert import1_resp.status_code == 201, f"First import failed: {import1_resp.text}"
    survey1_id = import1_resp.json()["id"]

    # First export
    export1_resp = await client.get(f"{SURVEYS_URL}/{survey1_id}/export", headers=headers)
    assert export1_resp.status_code == 200, f"First export failed: {export1_resp.text}"
    export1 = export1_resp.json()

    # Verify all question types are present in export1
    all_exported_types = set()
    for group in export1["groups"]:
        for question in group["questions"]:
            all_exported_types.add(question["question_type"])
            for sq in question.get("subquestions", []):
                pass  # subquestions just need to be present

    expected_types = set(_ALL_QUESTION_TYPES)
    assert expected_types == all_exported_types, (
        f"Missing question types in export: {expected_types - all_exported_types}"
    )

    # Second import: import the exported data
    import2_resp = await client.post(
        f"{SURVEYS_URL}/import",
        json={"data": export1},
        headers=headers,
    )
    assert import2_resp.status_code == 201, f"Second import failed: {import2_resp.text}"
    survey2_id = import2_resp.json()["id"]
    assert survey2_id != survey1_id

    # Second export
    export2_resp = await client.get(f"{SURVEYS_URL}/{survey2_id}/export", headers=headers)
    assert export2_resp.status_code == 200, f"Second export failed: {export2_resp.text}"
    export2 = export2_resp.json()

    # Normalize and compare the two exports for structural identity
    normalized1 = _normalize_for_comparison(export1)
    normalized2 = _normalize_for_comparison(export2)

    # Both exports should be draft (imported surveys always start as draft)
    assert normalized1["status"] == "draft"
    assert normalized2["status"] == "draft"

    # Strip status for comparison since original may differ
    normalized1.pop("status", None)
    normalized2.pop("status", None)

    assert normalized1 == normalized2, (
        "Round-trip fidelity failure: export1 != export2\n"
        f"export1 groups count: {len(normalized1['groups'])}\n"
        f"export2 groups count: {len(normalized2['groups'])}"
    )


@pytest.mark.asyncio
async def test_roundtrip_preserves_all_question_fields(client: AsyncClient):
    """Verify that all question fields survive a full round-trip (export → import → export)."""
    headers = await auth_headers(client, email="fields@example.com")

    # A survey with a single question having all fields populated
    payload = {
        "title": "Field Fidelity Survey",
        "description": "Testing field preservation",
        "status": "active",  # should become draft after import
        "welcome_message": "Welcome!",
        "end_message": "Done!",
        "default_language": "fr",
        "settings": {"show_toc": True, "allow_back": False},
        "groups": [
            {
                "title": "Only Group",
                "description": "Group description",
                "sort_order": 1,
                "relevance": "1==1",
                "questions": [
                    {
                        "code": "Q001",
                        "question_type": "single_choice",
                        "title": "Favourite colour?",
                        "description": "Pick one",
                        "is_required": True,
                        "sort_order": 1,
                        "relevance": "Q001 != ''",
                        "validation": {"min_answers": 1, "max_answers": 1},
                        "settings": {"randomize": True, "other_option": False},
                        "answer_options": [
                            {"code": "red", "title": "Red", "sort_order": 1, "assessment_value": 10},
                            {"code": "blue", "title": "Blue", "sort_order": 2, "assessment_value": 20},
                            {"code": "green", "title": "Green", "sort_order": 3, "assessment_value": 30},
                        ],
                        "subquestions": [],
                    },
                    {
                        "code": "Q002",
                        "question_type": "matrix_single",
                        "title": "Rate each item",
                        "description": "Matrix question",
                        "is_required": False,
                        "sort_order": 2,
                        "relevance": None,
                        "validation": None,
                        "settings": {"transpose": False},
                        "answer_options": [
                            {"code": "agree", "title": "Agree", "sort_order": 1, "assessment_value": 1},
                            {"code": "disagree", "title": "Disagree", "sort_order": 2, "assessment_value": 0},
                        ],
                        "subquestions": [
                            {
                                "code": "Q002_row1",
                                "question_type": "short_text",
                                "title": "Item 1",
                                "description": None,
                                "is_required": False,
                                "sort_order": 1,
                                "relevance": None,
                                "validation": None,
                                "settings": None,
                                "answer_options": [],
                                "subquestions": [],
                            },
                            {
                                "code": "Q002_row2",
                                "question_type": "short_text",
                                "title": "Item 2",
                                "description": None,
                                "is_required": False,
                                "sort_order": 2,
                                "relevance": None,
                                "validation": None,
                                "settings": None,
                                "answer_options": [],
                                "subquestions": [],
                            },
                        ],
                    },
                ],
            }
        ],
    }

    # Import
    import_resp = await client.post(
        f"{SURVEYS_URL}/import", json={"data": payload}, headers=headers
    )
    assert import_resp.status_code == 201
    survey_id = import_resp.json()["id"]

    # Export
    export_resp = await client.get(f"{SURVEYS_URL}/{survey_id}/export", headers=headers)
    assert export_resp.status_code == 200
    exported = export_resp.json()

    # Verify survey metadata
    assert exported["title"] == "Field Fidelity Survey"
    assert exported["description"] == "Testing field preservation"
    assert exported["status"] == "draft"  # always draft after import
    assert exported["welcome_message"] == "Welcome!"
    assert exported["end_message"] == "Done!"
    assert exported["default_language"] == "fr"
    assert exported["settings"] == {"show_toc": True, "allow_back": False}

    # Verify group fields
    group = exported["groups"][0]
    assert group["title"] == "Only Group"
    assert group["description"] == "Group description"
    assert group["sort_order"] == 1
    assert group["relevance"] == "1==1"

    # Verify Q001 (single_choice) fields
    q1 = group["questions"][0]
    assert q1["code"] == "Q001"
    assert q1["question_type"] == "single_choice"
    assert q1["title"] == "Favourite colour?"
    assert q1["description"] == "Pick one"
    assert q1["is_required"] is True
    assert q1["sort_order"] == 1
    assert q1["relevance"] == "Q001 != ''"
    assert q1["validation"] == {"min_answers": 1, "max_answers": 1}
    assert q1["settings"] == {"randomize": True, "other_option": False}

    # Verify answer options with assessment_value
    opts = {o["code"]: o for o in q1["answer_options"]}
    assert len(opts) == 3
    assert opts["red"]["title"] == "Red"
    assert opts["red"]["sort_order"] == 1
    assert opts["red"]["assessment_value"] == 10
    assert opts["blue"]["assessment_value"] == 20
    assert opts["green"]["assessment_value"] == 30

    # Verify Q002 (matrix_single) with subquestions
    q2 = group["questions"][1]
    assert q2["code"] == "Q002"
    assert q2["question_type"] == "matrix_single"
    assert q2["settings"] == {"transpose": False}
    assert len(q2["answer_options"]) == 2
    assert len(q2["subquestions"]) == 2

    subq_codes = {sq["code"] for sq in q2["subquestions"]}
    assert subq_codes == {"Q002_row1", "Q002_row2"}

    col_codes = {o["code"] for o in q2["answer_options"]}
    assert col_codes == {"agree", "disagree"}


@pytest.mark.asyncio
async def test_import_is_atomic_partial_failure_rolls_back(client: AsyncClient):
    """If any question in the import payload has an invalid type, the entire import
    should fail and no partial survey should be created (all-or-nothing transaction)."""
    headers = await auth_headers(client, email="atomic@example.com")

    payload = {
        "data": {
            "title": "Atomic Test Survey",
            "groups": [
                {
                    "title": "Group 1",
                    "questions": [
                        {
                            "code": "Q001",
                            "question_type": "short_text",
                            "title": "Valid question",
                            "answer_options": [],
                            "subquestions": [],
                        },
                        {
                            "code": "Q002",
                            "question_type": "invalid_type_that_does_not_exist",
                            "title": "Invalid question",
                            "answer_options": [],
                            "subquestions": [],
                        },
                    ],
                }
            ],
        }
    }

    resp = await client.post(f"{SURVEYS_URL}/import", json=payload, headers=headers)
    assert resp.status_code == 400

    # Verify no survey was created (the list should be empty for this user)
    list_resp = await client.get(SURVEYS_URL, headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 0, (
        "Atomic transaction failed: a partial survey was created despite import error"
    )
