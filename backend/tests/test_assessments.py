"""Tests for assessment CRUD endpoints and scoring engine.

Tests cover:
    - CRUD endpoints: create, list, get, update, delete assessments
    - Scoring engine via GET /surveys/{id}/responses/{rid}/assessment
      - total scope sums all selected answer_option.assessment_value
      - group scope sums only options for questions in the target group
      - multiple overlapping assessment rules all returned
      - empty response returns score=0 with empty matches
      - boundary conditions (min_score == score and max_score == score)
    - Auth/ownership: 404 for surveys not owned by the authenticated user
"""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_and_login(client: AsyncClient, email: str, password: str = "testpass123") -> dict:
    await client.post(REGISTER_URL, json={"email": email, "password": password, "name": "Test User"})
    resp = await client.post(LOGIN_URL, json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()


async def auth_headers(client: AsyncClient, email: str) -> dict:
    tokens = await register_and_login(client, email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict, title: str = "Test Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_group(client: AsyncClient, headers: dict, survey_id: str, title: str = "Group 1") -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": title},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_question(
    client: AsyncClient, headers: dict, survey_id: str, group_id: str, code: str = "Q1"
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Question", "question_type": "single_choice", "code": code},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_answer_option(
    client: AsyncClient, headers: dict, survey_id: str, question_id: str,
    code: str, assessment_value: int
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{question_id}/options",
        json={"code": code, "title": code, "sort_order": 1, "assessment_value": assessment_value},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def activate_survey(client: AsyncClient, headers: dict, survey_id: str) -> None:
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert resp.status_code == 200


async def submit_response(
    client: AsyncClient, survey_id: str, answers: list | None = None
) -> str:
    payload = {} if answers is None else {"answers": answers}
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]


async def complete_response(client: AsyncClient, survey_id: str, response_id: str) -> None:
    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/complete",
        json={},
    )
    # 200 or 422 (validation errors ok for our purposes)


def assessment_payload(
    name: str = "Test Assessment",
    scope: str = "total",
    min_score: float = 0,
    max_score: float = 10,
    message: str = "Test message",
    group_id: str | None = None,
) -> dict:
    payload = {
        "name": name,
        "scope": scope,
        "min_score": min_score,
        "max_score": max_score,
        "message": message,
    }
    if group_id is not None:
        payload["group_id"] = group_id
    return payload


# ---------------------------------------------------------------------------
# CRUD Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_assessment_returns_201(client: AsyncClient):
    headers = await auth_headers(client, "create_asmt@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Assessment"
    assert data["scope"] == "total"
    assert data["survey_id"] == survey_id
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_create_assessment_group_scope(client: AsyncClient):
    headers = await auth_headers(client, "create_group_asmt@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(scope="group", group_id=group_id),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["scope"] == "group"
    assert data["group_id"] == group_id


@pytest.mark.asyncio
async def test_create_assessment_wrong_owner_returns_404(client: AsyncClient):
    headers1 = await auth_headers(client, "owner1_asmt@example.com")
    headers2 = await auth_headers(client, "owner2_asmt@example.com")
    survey_id = await create_survey(client, headers1)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(),
        headers=headers2,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_assessments_returns_200_and_pagination(client: AsyncClient):
    headers = await auth_headers(client, "list_asmt@example.com")
    survey_id = await create_survey(client, headers)

    for i in range(3):
        await client.post(
            f"{SURVEYS_URL}/{survey_id}/assessments",
            json=assessment_payload(name=f"Assessment {i}"),
            headers=headers,
        )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3
    assert data["page"] == 1
    assert "pages" in data


@pytest.mark.asyncio
async def test_list_assessments_pagination(client: AsyncClient):
    headers = await auth_headers(client, "page_asmt@example.com")
    survey_id = await create_survey(client, headers)

    for i in range(5):
        await client.post(
            f"{SURVEYS_URL}/{survey_id}/assessments",
            json=assessment_payload(name=f"Assessment {i}"),
            headers=headers,
        )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments?page=1&per_page=2",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["pages"] == 3


@pytest.mark.asyncio
async def test_get_assessment_returns_200(client: AsyncClient):
    headers = await auth_headers(client, "get_asmt@example.com")
    survey_id = await create_survey(client, headers)

    create_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Specific"),
        headers=headers,
    )
    assert create_resp.status_code == 201
    assessment_id = create_resp.json()["id"]

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments/{assessment_id}",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Specific"


@pytest.mark.asyncio
async def test_get_assessment_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "get404_asmt@example.com")
    survey_id = await create_survey(client, headers)

    import uuid
    fake_id = str(uuid.uuid4())
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments/{fake_id}",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_assessment_returns_200(client: AsyncClient):
    headers = await auth_headers(client, "update_asmt@example.com")
    survey_id = await create_survey(client, headers)

    create_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Old Name"),
        headers=headers,
    )
    assessment_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/assessments/{assessment_id}",
        json={"name": "New Name", "message": "Updated message"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["name"] == "New Name"
    assert data["message"] == "Updated message"
    # unchanged fields preserved
    assert data["scope"] == "total"


@pytest.mark.asyncio
async def test_delete_assessment_returns_204(client: AsyncClient):
    headers = await auth_headers(client, "delete_asmt@example.com")
    survey_id = await create_survey(client, headers)

    create_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(),
        headers=headers,
    )
    assessment_id = create_resp.json()["id"]

    del_resp = await client.delete(
        f"{SURVEYS_URL}/{survey_id}/assessments/{assessment_id}",
        headers=headers,
    )
    assert del_resp.status_code == 204

    # Subsequent GET returns 404
    get_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments/{assessment_id}",
        headers=headers,
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_assessment_wrong_owner_returns_404(client: AsyncClient):
    headers1 = await auth_headers(client, "delowner1_asmt@example.com")
    headers2 = await auth_headers(client, "delowner2_asmt@example.com")
    survey_id = await create_survey(client, headers1)

    create_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(),
        headers=headers1,
    )
    assessment_id = create_resp.json()["id"]

    del_resp = await client.delete(
        f"{SURVEYS_URL}/{survey_id}/assessments/{assessment_id}",
        headers=headers2,
    )
    assert del_resp.status_code == 404


# ---------------------------------------------------------------------------
# Scoring Engine Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_score_empty_response_returns_zero(client: AsyncClient):
    """An empty response (no answers) returns score=0 and empty matches."""
    headers = await auth_headers(client, "score_empty@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id)
    await activate_survey(client, headers, survey_id)

    # Create an assessment rule that matches score 0
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Zero Rule", min_score=0, max_score=0),
        headers=headers,
    )
    # Create one that doesn't match score 0
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="High Rule", min_score=5, max_score=20),
        headers=headers,
    )

    response_id = await submit_response(client, survey_id)

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 0.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "Zero Rule" in matching_names
    assert "High Rule" not in matching_names


@pytest.mark.asyncio
async def test_score_total_scope_sums_all_options(client: AsyncClient):
    """Total scope sums assessment_value across all selected options."""
    headers = await auth_headers(client, "score_total@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    q1_id = await create_question(client, headers, survey_id, group_id, code="Q1")
    q2_id = await create_question(client, headers, survey_id, group_id, code="Q2")

    # Q1 option A: assessment_value=3
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q1_id}/options",
        json={"code": "A", "title": "A", "sort_order": 1, "assessment_value": 3},
        headers=headers,
    )
    # Q2 option B: assessment_value=7
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q2_id}/options",
        json={"code": "B", "title": "B", "sort_order": 1, "assessment_value": 7},
        headers=headers,
    )

    await activate_survey(client, headers, survey_id)

    # Submit with both options selected
    response_id = await submit_response(
        client, survey_id,
        answers=[
            {"question_id": q1_id, "value": "A"},
            {"question_id": q2_id, "value": "B"},
        ],
    )

    # Assessment that matches score=10 (3+7)
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Match10", min_score=10, max_score=10),
        headers=headers,
    )
    # Assessment that doesn't match
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="NoMatch", min_score=11, max_score=20),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 10.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "Match10" in matching_names
    assert "NoMatch" not in matching_names


@pytest.mark.asyncio
async def test_score_overlapping_ranges_return_multiple_matches(client: AsyncClient):
    """Multiple overlapping assessment rules all match when score falls in their range."""
    headers = await auth_headers(client, "score_overlap@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q_id = await create_question(client, headers, survey_id, group_id, code="Q1")

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q_id}/options",
        json={"code": "A", "title": "A", "sort_order": 1, "assessment_value": 5},
        headers=headers,
    )

    await activate_survey(client, headers, survey_id)
    response_id = await submit_response(
        client, survey_id,
        answers=[{"question_id": q_id, "value": "A"}],
    )

    # Two overlapping ranges both containing 5
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Rule1", min_score=0, max_score=10),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Rule2", min_score=5, max_score=15),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Rule3", min_score=6, max_score=20),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 5.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "Rule1" in matching_names
    assert "Rule2" in matching_names
    assert "Rule3" not in matching_names  # 6-20, score=5 does not qualify


@pytest.mark.asyncio
async def test_score_boundary_conditions_inclusive(client: AsyncClient):
    """Boundary conditions: min_score == score and max_score == score both match."""
    headers = await auth_headers(client, "score_boundary@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q_id = await create_question(client, headers, survey_id, group_id, code="Q1")

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q_id}/options",
        json={"code": "A", "title": "A", "sort_order": 1, "assessment_value": 5},
        headers=headers,
    )

    await activate_survey(client, headers, survey_id)
    response_id = await submit_response(
        client, survey_id,
        answers=[{"question_id": q_id, "value": "A"}],
    )

    # Exact boundary match
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="ExactMin", min_score=5, max_score=100),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="ExactMax", min_score=0, max_score=5),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="JustMiss", min_score=6, max_score=10),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "ExactMin" in matching_names
    assert "ExactMax" in matching_names
    assert "JustMiss" not in matching_names


@pytest.mark.asyncio
async def test_score_group_scope_only_sums_group_questions(client: AsyncClient):
    """Group scope only counts options from questions in the specified group."""
    headers = await auth_headers(client, "score_group@example.com")
    survey_id = await create_survey(client, headers)
    group1_id = await create_group(client, headers, survey_id, title="Group 1")
    group2_id = await create_group(client, headers, survey_id, title="Group 2")

    q1_id = await create_question(client, headers, survey_id, group1_id, code="Q1")
    q2_id = await create_question(client, headers, survey_id, group2_id, code="Q2")

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q1_id}/options",
        json={"code": "A", "title": "A", "sort_order": 1, "assessment_value": 3},
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q2_id}/options",
        json={"code": "B", "title": "B", "sort_order": 1, "assessment_value": 7},
        headers=headers,
    )

    await activate_survey(client, headers, survey_id)
    response_id = await submit_response(
        client, survey_id,
        answers=[
            {"question_id": q1_id, "value": "A"},
            {"question_id": q2_id, "value": "B"},
        ],
    )

    # Group-scoped rule for group1 only (score should be 3, not 10)
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="Group1Match", scope="group", group_id=group1_id, min_score=3, max_score=3
        ),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="Group1NoMatch", scope="group", group_id=group1_id, min_score=10, max_score=10
        ),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    # Total score is 3+7=10
    assert float(data["score"]) == 10.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "Group1Match" in matching_names
    assert "Group1NoMatch" not in matching_names


@pytest.mark.asyncio
async def test_score_response_not_found_returns_404(client: AsyncClient):
    """Requesting score for non-existent response returns 404."""
    import uuid
    headers = await auth_headers(client, "score404@example.com")
    survey_id = await create_survey(client, headers)

    fake_response_id = str(uuid.uuid4())
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{fake_response_id}/assessment",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_score_survey_not_owned_returns_404(client: AsyncClient):
    """Requesting score for a survey not owned by current user returns 404."""
    headers1 = await auth_headers(client, "scoreown1@example.com")
    headers2 = await auth_headers(client, "scoreown2@example.com")
    survey_id = await create_survey(client, headers1)

    group_id = await create_group(client, headers1, survey_id)
    await create_question(client, headers1, survey_id, group_id)
    await activate_survey(client, headers1, survey_id)
    response_id = await submit_response(client, survey_id)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers2,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_score_no_matching_rules_returns_empty_list(client: AsyncClient):
    """When no assessment rules exist, matching_assessments is empty."""
    headers = await auth_headers(client, "score_nomatch@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q_id = await create_question(client, headers, survey_id, group_id, code="Q1")

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q_id}/options",
        json={"code": "A", "title": "A", "sort_order": 1, "assessment_value": 5},
        headers=headers,
    )
    await activate_survey(client, headers, survey_id)
    response_id = await submit_response(
        client, survey_id, answers=[{"question_id": q_id, "value": "A"}]
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 5.0
    assert data["matching_assessments"] == []
