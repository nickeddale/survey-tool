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
    question_id: str | None = None,
    subquestion_id: str | None = None,
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
    if question_id is not None:
        payload["question_id"] = question_id
    if subquestion_id is not None:
        payload["subquestion_id"] = subquestion_id
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


# ---------------------------------------------------------------------------
# Question Scope Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_assessment_question_scope(client: AsyncClient):
    """Creating an assessment with scope='question' and valid question_id returns 201."""
    headers = await auth_headers(client, "create_q_asmt@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id, code="Q1")

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(scope="question", question_id=question_id),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["scope"] == "question"
    assert data["question_id"] == question_id


@pytest.mark.asyncio
async def test_create_assessment_question_scope_missing_question_id_returns_422(client: AsyncClient):
    """scope='question' without question_id returns 422."""
    headers = await auth_headers(client, "q_scope_no_id@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(scope="question"),
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_assessment_total_scope_with_question_id_returns_422(client: AsyncClient):
    """scope='total' with question_id returns 422."""
    headers = await auth_headers(client, "total_with_qid@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id, code="Q1")

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(scope="total", question_id=question_id),
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_assessment_group_scope_with_question_id_returns_422(client: AsyncClient):
    """scope='group' with question_id returns 422."""
    headers = await auth_headers(client, "group_with_qid@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id, code="Q1")

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(scope="group", group_id=group_id, question_id=question_id),
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_score_question_scope_only_sums_target_question(client: AsyncClient):
    """Question scope only counts options from the specified question."""
    headers = await auth_headers(client, "score_question@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    q1_id = await create_question(client, headers, survey_id, group_id, code="Q1")
    q2_id = await create_question(client, headers, survey_id, group_id, code="Q2")

    # Q1 option: assessment_value=4
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q1_id}/options",
        json={"code": "A", "title": "A", "sort_order": 1, "assessment_value": 4},
        headers=headers,
    )
    # Q2 option: assessment_value=6
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q2_id}/options",
        json={"code": "B", "title": "B", "sort_order": 1, "assessment_value": 6},
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

    # Question-scoped rule for q1 only (score for q1 is 4, not 10)
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="Q1Match", scope="question", question_id=q1_id, min_score=4, max_score=4
        ),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="Q1NoMatch", scope="question", question_id=q1_id, min_score=10, max_score=10
        ),
        headers=headers,
    )
    # Total scope rule should still see score=10
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="TotalMatch", scope="total", min_score=10, max_score=10
        ),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    # Total score is 4+6=10
    assert float(data["score"]) == 10.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "Q1Match" in matching_names
    assert "Q1NoMatch" not in matching_names
    assert "TotalMatch" in matching_names


@pytest.mark.asyncio
async def test_score_question_scope_unselected_question_returns_zero(client: AsyncClient):
    """Question scope returns score=0 when the target question has no answer."""
    headers = await auth_headers(client, "score_q_unsel@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    q1_id = await create_question(client, headers, survey_id, group_id, code="Q1")
    q2_id = await create_question(client, headers, survey_id, group_id, code="Q2")

    # Q1 has an option, Q2 has an option; response only answers Q1
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q1_id}/options",
        json={"code": "A", "title": "A", "sort_order": 1, "assessment_value": 5},
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q2_id}/options",
        json={"code": "B", "title": "B", "sort_order": 1, "assessment_value": 8},
        headers=headers,
    )

    await activate_survey(client, headers, survey_id)
    response_id = await submit_response(
        client, survey_id,
        answers=[{"question_id": q1_id, "value": "A"}],
    )

    # Assessment scoped to Q2 (unanswered) that matches 0
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="Q2ZeroMatch", scope="question", question_id=q2_id, min_score=0, max_score=0
        ),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="Q2NoMatch", scope="question", question_id=q2_id, min_score=8, max_score=8
        ),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "Q2ZeroMatch" in matching_names
    assert "Q2NoMatch" not in matching_names


# --------------------------------------------------------------------------- #
# API key scope enforcement on assessment write endpoints (SEC-ISS-217)
# --------------------------------------------------------------------------- #

KEYS_URL = "/api/v1/auth/keys"


async def _create_api_key(client: AsyncClient, headers: dict, scopes: list | None) -> str:
    payload: dict = {"name": "Test Key"}
    if scopes is not None:
        payload["scopes"] = scopes
    resp = await client.post(KEYS_URL, json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()["key"]


def _scope_test_assessment_payload() -> dict:
    return {"name": "Band A", "scope": "total", "min_score": 0, "max_score": 10, "message": "Ok"}


@pytest.mark.asyncio
async def test_create_assessment_jwt_auth_returns_201(client: AsyncClient):
    """JWT-authenticated requests bypass scope enforcement."""
    headers = await auth_headers(client, "scope_asmt_jwt@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=_scope_test_assessment_payload(),
        headers=headers,
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_assessment_api_key_with_scope_returns_201(client: AsyncClient):
    """API key with surveys:write scope can create assessments."""
    headers = await auth_headers(client, "scope_asmt_write@example.com")
    survey_id = await create_survey(client, headers)
    api_key = await _create_api_key(client, headers, scopes=["surveys:write"])

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=_scope_test_assessment_payload(),
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_assessment_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without surveys:write scope cannot create assessments."""
    headers = await auth_headers(client, "scope_asmt_noscp@example.com")
    survey_id = await create_survey(client, headers)
    api_key = await _create_api_key(client, headers, scopes=["surveys:read"])

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=_scope_test_assessment_payload(),
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"
    assert "message" in body["detail"]


@pytest.mark.asyncio
async def test_delete_assessment_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without surveys:write scope cannot delete assessments."""
    headers = await auth_headers(client, "scope_asmt_del@example.com")
    survey_id = await create_survey(client, headers)

    create_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=_scope_test_assessment_payload(),
        headers=headers,
    )
    assessment_id = create_resp.json()["id"]

    api_key = await _create_api_key(client, headers, scopes=[])
    resp = await client.delete(
        f"{SURVEYS_URL}/{survey_id}/assessments/{assessment_id}",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Subquestion Scope Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_assessment_subquestion_scope_returns_201(client: AsyncClient):
    """Creating an assessment with scope='subquestion', question_id and subquestion_id returns 201."""
    headers = await auth_headers(client, "create_subq_asmt@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id, code="Q1")
    subquestion_id = await create_question(client, headers, survey_id, group_id, code="SQ1")

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            scope="subquestion",
            question_id=question_id,
            subquestion_id=subquestion_id,
        ),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["scope"] == "subquestion"
    assert data["question_id"] == question_id
    assert data["subquestion_id"] == subquestion_id


@pytest.mark.asyncio
async def test_create_assessment_subquestion_scope_missing_question_id_returns_422(client: AsyncClient):
    """scope='subquestion' without question_id returns 422."""
    headers = await auth_headers(client, "subq_no_qid@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    subquestion_id = await create_question(client, headers, survey_id, group_id, code="SQ1")

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(scope="subquestion", subquestion_id=subquestion_id),
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_assessment_subquestion_scope_missing_subquestion_id_returns_422(client: AsyncClient):
    """scope='subquestion' without subquestion_id returns 422."""
    headers = await auth_headers(client, "subq_no_sqid@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    question_id = await create_question(client, headers, survey_id, group_id, code="Q1")

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(scope="subquestion", question_id=question_id),
        headers=headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_assessment_non_subquestion_scope_with_subquestion_id_returns_422(client: AsyncClient):
    """scope='total' with subquestion_id returns 422."""
    headers = await auth_headers(client, "total_with_sqid@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    subquestion_id = await create_question(client, headers, survey_id, group_id, code="SQ1")

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(scope="total", subquestion_id=subquestion_id),
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Matrix Scoring Tests
# ---------------------------------------------------------------------------


async def create_matrix_question(
    client: AsyncClient, headers: dict, survey_id: str, group_id: str,
    question_type: str = "matrix_single", code: str = "MAT1"
) -> str:
    """Create a matrix question and return its ID."""
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Matrix Question", "question_type": question_type, "code": code},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_subquestion(
    client: AsyncClient, headers: dict, survey_id: str, group_id: str,
    parent_id: str, code: str, sort_order: int = 1
) -> str:
    """Create a subquestion row via the group questions endpoint with parent_id."""
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={
            "title": f"Row {code}",
            "question_type": "matrix_single",
            "code": code,
            "parent_id": parent_id,
            "sort_order": sort_order,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.json()
    return resp.json()["id"]


async def create_matrix_answer_option(
    client: AsyncClient, headers: dict, survey_id: str, question_id: str,
    code: str, assessment_value: int
) -> str:
    """Create an answer option on a matrix parent question."""
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{question_id}/options",
        json={"code": code, "title": code, "sort_order": 1, "assessment_value": assessment_value},
        headers=headers,
    )
    assert resp.status_code == 201, resp.json()
    return resp.json()["id"]


async def submit_matrix_response(
    client: AsyncClient, survey_id: str, question_id: str, matrix_value: dict
) -> str:
    """Submit a response with a matrix answer dict."""
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [{"question_id": question_id, "value": matrix_value}]},
    )
    assert resp.status_code == 201, resp.json()
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_score_matrix_single_total_scope_sums_all_rows(client: AsyncClient):
    """matrix_single answers contribute to total scope: SQ001→A1(val=3), SQ002→A2(val=5), total=8."""
    headers = await auth_headers(client, "score_mat_single_total@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    mat_id = await create_matrix_question(client, headers, survey_id, group_id, "matrix_single", "MAT1")
    sq1_id = await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ001", 1)
    sq2_id = await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ002", 2)

    # Answer options on parent question
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A1", 3)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A2", 5)

    await activate_survey(client, headers, survey_id)
    response_id = await submit_matrix_response(
        client, survey_id, mat_id, {"SQ001": "A1", "SQ002": "A2"}
    )

    # Assessment matching total=8
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalMatch", min_score=8, max_score=8),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalNoMatch", min_score=9, max_score=20),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 8.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "TotalMatch" in matching_names
    assert "TotalNoMatch" not in matching_names


@pytest.mark.asyncio
async def test_score_matrix_single_question_scope_sums_question(client: AsyncClient):
    """matrix_single question scope: sum of all selected options across rows."""
    headers = await auth_headers(client, "score_mat_single_qscope@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    mat_id = await create_matrix_question(client, headers, survey_id, group_id, "matrix_single", "MAT1")
    await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ001", 1)
    await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ002", 2)

    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A1", 3)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A2", 5)

    await activate_survey(client, headers, survey_id)
    response_id = await submit_matrix_response(
        client, survey_id, mat_id, {"SQ001": "A1", "SQ002": "A2"}
    )

    # Question-scoped rule for mat_id: score = 3+5 = 8
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="QMatch", scope="question", question_id=mat_id, min_score=8, max_score=8),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="QNoMatch", scope="question", question_id=mat_id, min_score=9, max_score=20),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 8.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "QMatch" in matching_names
    assert "QNoMatch" not in matching_names


@pytest.mark.asyncio
async def test_score_matrix_single_subquestion_scope_returns_row_score(client: AsyncClient):
    """matrix_single subquestion scope: SQ001→A1(val=3), SQ002→A2(val=5); SQ001 score=3."""
    headers = await auth_headers(client, "score_mat_single_sqscope@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    mat_id = await create_matrix_question(client, headers, survey_id, group_id, "matrix_single", "MAT1")
    sq1_id = await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ001", 1)
    sq2_id = await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ002", 2)

    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A1", 3)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A2", 5)

    await activate_survey(client, headers, survey_id)
    response_id = await submit_matrix_response(
        client, survey_id, mat_id, {"SQ001": "A1", "SQ002": "A2"}
    )

    # Subquestion-scoped rule for SQ001: score = 3
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="SQ1Match", scope="subquestion", question_id=mat_id,
            subquestion_id=sq1_id, min_score=3, max_score=3
        ),
        headers=headers,
    )
    # SQ001 scoped rule that does NOT match (score=3 not in 5-10)
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="SQ1NoMatch", scope="subquestion", question_id=mat_id,
            subquestion_id=sq1_id, min_score=5, max_score=10
        ),
        headers=headers,
    )
    # SQ002 scoped rule: score = 5
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="SQ2Match", scope="subquestion", question_id=mat_id,
            subquestion_id=sq2_id, min_score=5, max_score=5
        ),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    # Total score is 3 + 5 = 8
    assert float(data["score"]) == 8.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "SQ1Match" in matching_names
    assert "SQ1NoMatch" not in matching_names
    assert "SQ2Match" in matching_names


@pytest.mark.asyncio
async def test_score_matrix_multiple_total_scope_sums_multi_select_rows(client: AsyncClient):
    """matrix_multiple total scope: SQ001→[A1,A2](3+5=8), total=8."""
    headers = await auth_headers(client, "score_mat_multi_total@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    mat_id = await create_matrix_question(
        client, headers, survey_id, group_id, "matrix_multiple", "MAT1"
    )
    # For matrix_multiple subquestions, use same question_type as parent
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={
            "title": "Row SQ001",
            "question_type": "matrix_multiple",
            "code": "SQ001",
            "parent_id": mat_id,
            "sort_order": 1,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.json()
    sq1_id = resp.json()["id"]

    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A1", 3)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A2", 5)

    await activate_survey(client, headers, survey_id)
    # SQ001 selects both A1 and A2
    response_id = await submit_matrix_response(
        client, survey_id, mat_id, {"SQ001": ["A1", "A2"]}
    )

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalMatch", min_score=8, max_score=8),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalNoMatch", min_score=9, max_score=20),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 8.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "TotalMatch" in matching_names
    assert "TotalNoMatch" not in matching_names


@pytest.mark.asyncio
async def test_score_matrix_multiple_subquestion_scope_sums_row_selections(client: AsyncClient):
    """matrix_multiple subquestion scope: SQ001→[A1,A2](3+5=8), SQ001 score=8."""
    headers = await auth_headers(client, "score_mat_multi_sqscope@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    mat_id = await create_matrix_question(
        client, headers, survey_id, group_id, "matrix_multiple", "MAT1"
    )
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={
            "title": "Row SQ001",
            "question_type": "matrix_multiple",
            "code": "SQ001",
            "parent_id": mat_id,
            "sort_order": 1,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.json()
    sq1_id = resp.json()["id"]

    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A1", 3)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "A2", 5)

    await activate_survey(client, headers, survey_id)
    response_id = await submit_matrix_response(
        client, survey_id, mat_id, {"SQ001": ["A1", "A2"]}
    )

    # Subquestion-scoped rule for SQ001: score = 3+5 = 8
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="SQ1Match", scope="subquestion", question_id=mat_id,
            subquestion_id=sq1_id, min_score=8, max_score=8
        ),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="SQ1NoMatch", scope="subquestion", question_id=mat_id,
            subquestion_id=sq1_id, min_score=9, max_score=20
        ),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 8.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "SQ1Match" in matching_names
    assert "SQ1NoMatch" not in matching_names


@pytest.mark.asyncio
async def test_score_mixed_matrix_and_single_choice_total_scope(client: AsyncClient):
    """Mixed survey: matrix_single + single_choice both contribute to total score."""
    headers = await auth_headers(client, "score_mixed_total@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # Single choice question: select A1 (val=4)
    sc_id = await create_question(client, headers, survey_id, group_id, code="SC1")
    await create_answer_option(client, headers, survey_id, sc_id, "A1", 4)

    # Matrix single question: SQ001→B1(val=6)
    mat_id = await create_matrix_question(client, headers, survey_id, group_id, "matrix_single", "MAT1")
    await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ001", 1)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "B1", 6)

    await activate_survey(client, headers, survey_id)
    # Submit with both single_choice and matrix answers
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={
            "answers": [
                {"question_id": sc_id, "value": "A1"},
                {"question_id": mat_id, "value": {"SQ001": "B1"}},
            ]
        },
    )
    assert resp.status_code == 201
    response_id = resp.json()["id"]

    # Total should be 4 + 6 = 10
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalMatch", min_score=10, max_score=10),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalNoMatch", min_score=11, max_score=20),
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
    assert "TotalMatch" in matching_names
    assert "TotalNoMatch" not in matching_names


async def create_matrix_question_with_settings(
    client: AsyncClient, headers: dict, survey_id: str, group_id: str,
    question_type: str, code: str, settings: dict
) -> str:
    """Create a matrix question without settings (to pass creation-time validation),
    returning its ID. Settings are applied separately via PATCH after subquestions/options
    are added, using patch_question_settings().
    """
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={
            "title": "Matrix Question",
            "question_type": question_type,
            "code": code,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.json()
    return resp.json()["id"]


async def patch_question_settings(
    client: AsyncClient, headers: dict, survey_id: str, group_id: str,
    question_id: str, settings: dict
) -> None:
    """Apply settings to a question via PATCH after it has been fully populated."""
    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions/{question_id}",
        json={"settings": settings},
        headers=headers,
    )
    assert resp.status_code == 200, resp.json()


@pytest.mark.asyncio
async def test_score_matrix_dropdown_total_scope_only_scorable_columns_contribute(client: AsyncClient):
    """matrix_dropdown: only scorable column types (dropdown/radio/rating/checkbox) contribute to score.

    Setup:
      - Columns (answer options): "COL_DD" (dropdown type, assessment_value=0),
        "COL_TEXT" (text type, assessment_value=0),
        "OPT_A" (assessment_value=3, a valid dropdown choice),
        "OPT_B" (assessment_value=5, a valid dropdown choice)
      - column_types = {"COL_DD": "dropdown", "COL_TEXT": "text"}
      - Answer: SQ001→{COL_DD: "OPT_A", COL_TEXT: "hello"}, SQ002→{COL_DD: "OPT_B", COL_TEXT: "world"}
    Expected: only COL_DD column values score → OPT_A(3) + OPT_B(5) = 8
    """
    headers = await auth_headers(client, "score_mat_dd_scorable@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    mat_id = await create_matrix_question_with_settings(
        client, headers, survey_id, group_id,
        question_type="matrix_dropdown",
        code="MAT1",
        settings={},
    )
    sq1_id = await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ001", 1)
    sq2_id = await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ002", 2)

    # Column definitions (answer options) — COL_DD and COL_TEXT are column names
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "COL_DD", 0)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "COL_TEXT", 0)
    # Scorable choices for the COL_DD dropdown column (assessment_value assigned)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "OPT_A", 3)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "OPT_B", 5)

    # Apply settings after subquestions and options are in place
    await patch_question_settings(
        client, headers, survey_id, group_id, mat_id,
        {"column_types": {"COL_DD": "dropdown", "COL_TEXT": "text"}},
    )

    await activate_survey(client, headers, survey_id)
    response_id = await submit_matrix_response(
        client, survey_id, mat_id,
        {
            "SQ001": {"COL_DD": "OPT_A", "COL_TEXT": "hello"},
            "SQ002": {"COL_DD": "OPT_B", "COL_TEXT": "world"},
        },
    )

    # Assessment matching total=8 (only scorable COL_DD column contributes)
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalMatch", min_score=8, max_score=8),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalNoMatch", min_score=9, max_score=20),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 8.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "TotalMatch" in matching_names
    assert "TotalNoMatch" not in matching_names


@pytest.mark.asyncio
async def test_score_matrix_dropdown_text_number_columns_produce_zero_score(client: AsyncClient):
    """matrix_dropdown: text-only columns are not scorable, so total score = 0.

    Setup:
      - Columns (answer options): "COL_TEXT" (text type, assessment_value=0)
      - column_types = {"COL_TEXT": "text"}
      - Even though an answer option "OPT_HI" with assessment_value=10 exists,
        cell values from text columns are not extracted for scoring.
    """
    headers = await auth_headers(client, "score_mat_dd_zero@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    mat_id = await create_matrix_question_with_settings(
        client, headers, survey_id, group_id,
        question_type="matrix_dropdown",
        code="MAT1",
        settings={},
    )
    sq1_id = await create_subquestion(client, headers, survey_id, group_id, mat_id, "SQ001", 1)

    # Column definition (answer option) — COL_TEXT is the column name
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "COL_TEXT", 0)
    # High-value option that should NOT be scored (column is text type)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "OPT_HI", 10)

    # Apply settings after subquestions and options are in place
    await patch_question_settings(
        client, headers, survey_id, group_id, mat_id,
        {"column_types": {"COL_TEXT": "text"}},
    )

    await activate_survey(client, headers, survey_id)
    # Submit: cell value "OPT_HI" is in a text column, so it won't be scored
    response_id = await submit_matrix_response(
        client, survey_id, mat_id,
        {"SQ001": {"COL_TEXT": "OPT_HI"}},
    )

    # Assessment matching total=0 (text column not scored)
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="ZeroMatch", min_score=0, max_score=0),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="ZeroNoMatch", min_score=1, max_score=20),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 0.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "ZeroMatch" in matching_names
    assert "ZeroNoMatch" not in matching_names


@pytest.mark.asyncio
async def test_score_matrix_dynamic_total_scope_sums_scorable_columns(client: AsyncClient):
    """matrix_dynamic: list-of-row-dicts scoring; only scorable columns contribute.

    Setup: question with column_types {col_rating: "rating", col_text: "text"}.
    Answer: [{"col_rating": "R3", "col_text": "foo"}, {"col_rating": "R5", "col_text": "bar"}]
    Expected: R3(val=3) + R5(val=5) = 8
    """
    headers = await auth_headers(client, "score_mat_dyn_total@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    mat_id = await create_matrix_question_with_settings(
        client, headers, survey_id, group_id,
        question_type="matrix_dynamic",
        code="MAT1",
        settings={"column_types": {"col_rating": "rating", "col_text": "text"}},
    )

    # Answer options on the question (represent column definitions)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "R3", 3)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "R5", 5)

    # Apply settings after options are in place
    await patch_question_settings(
        client, headers, survey_id, group_id, mat_id,
        {"column_types": {"col_rating": "rating", "col_text": "text"}},
    )

    await activate_survey(client, headers, survey_id)

    # Submit a list-of-rows answer (matrix_dynamic format)
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={
            "answers": [
                {
                    "question_id": mat_id,
                    "value": [
                        {"col_rating": "R3", "col_text": "foo"},
                        {"col_rating": "R5", "col_text": "bar"},
                    ],
                }
            ]
        },
    )
    assert resp.status_code == 201, resp.json()
    response_id = resp.json()["id"]

    # Assessment matching total=8
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalMatch", min_score=8, max_score=8),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="TotalNoMatch", min_score=9, max_score=20),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 8.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "TotalMatch" in matching_names
    assert "TotalNoMatch" not in matching_names


@pytest.mark.asyncio
async def test_score_matrix_dynamic_question_scope_and_no_subquestion_scores(client: AsyncClient):
    """matrix_dynamic: rows are scored without subquestion IDs.

    Verifies that question-scope assessment works correctly for matrix_dynamic,
    and that the total score reflects only scorable columns across all rows.
    (matrix_dynamic never populates subquestion_score_map since rows are user-defined.)

    Setup:
      - column_types: {"col_rating": "rating"}
      - Answer: [{"col_rating": "R3"}, {"col_rating": "R5"}] — two rows
    Expected total score: R3(3) + R5(5) = 8
    Question-scoped assessment matching 8 should match; one matching 0 should not.
    """
    headers = await auth_headers(client, "score_mat_dyn_qscope@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    mat_id = await create_matrix_question_with_settings(
        client, headers, survey_id, group_id,
        question_type="matrix_dynamic",
        code="MAT1",
        settings={},
    )

    await create_matrix_answer_option(client, headers, survey_id, mat_id, "R3", 3)
    await create_matrix_answer_option(client, headers, survey_id, mat_id, "R5", 5)

    # Apply settings after options are in place
    await patch_question_settings(
        client, headers, survey_id, group_id, mat_id,
        {"column_types": {"col_rating": "rating"}},
    )

    await activate_survey(client, headers, survey_id)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={
            "answers": [
                {
                    "question_id": mat_id,
                    "value": [{"col_rating": "R3"}, {"col_rating": "R5"}],
                }
            ]
        },
    )
    assert resp.status_code == 201, resp.json()
    response_id = resp.json()["id"]

    # Question-scoped assessment: should see score=8 for this question
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="QMatch", scope="question", question_id=mat_id, min_score=8, max_score=8
        ),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(
            name="QNoMatch", scope="question", question_id=mat_id, min_score=0, max_score=0
        ),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    # Total score is R3(3) + R5(5) = 8
    assert float(data["score"]) == 8.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "QMatch" in matching_names
    assert "QNoMatch" not in matching_names


# ---------------------------------------------------------------------------
# Assessment Summary Endpoint Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_summary_no_assessment_rules_returns_404(client: AsyncClient):
    """GET /assessments/summary returns 404 when no assessment rules are defined."""
    headers = await auth_headers(client, "summary_no_rules@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments/summary",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_summary_no_completed_responses_returns_empty_distribution(client: AsyncClient):
    """GET /assessments/summary with rules but no completed responses returns zero counts."""
    headers = await auth_headers(client, "summary_no_responses@example.com")
    survey_id = await create_survey(client, headers)

    # Create assessment rules
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Low", min_score=0, max_score=5),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="High", min_score=6, max_score=10),
        headers=headers,
    )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments/summary",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_responses"] == 0
    assert data["average_score"] is None
    assert data["min_score"] is None
    assert data["max_score"] is None
    assert len(data["bands"]) == 2
    for band in data["bands"]:
        assert band["count"] == 0
        assert band["percentage"] == 0.0

    # Verify no internal ORM fields leak
    assert "id" not in data
    assert "survey_id" not in data
    for band in data["bands"]:
        assert "id" not in band
        assert "survey_id" not in band


@pytest.mark.asyncio
async def test_summary_multiple_responses_across_bands(client: AsyncClient):
    """GET /assessments/summary aggregates scores from multiple completed responses."""
    headers = await auth_headers(client, "summary_multi@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    q_id = await create_question(client, headers, survey_id, group_id, code="Q1")
    # Option A = score 3, Option B = score 8
    await create_answer_option(client, headers, survey_id, q_id, "A", 3)
    await create_answer_option(client, headers, survey_id, q_id, "B", 8)

    await activate_survey(client, headers, survey_id)

    # Assessment bands
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Low", min_score=0, max_score=5),
        headers=headers,
    )
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="High", min_score=6, max_score=10),
        headers=headers,
    )

    # Submit 2 responses with score=3 (Low band), 1 response with score=8 (High band)
    for _ in range(2):
        response_id = await submit_response(
            client, survey_id, answers=[{"question_id": q_id, "value": "A"}]
        )
        # Mark complete
        await client.patch(
            f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/complete",
            json={},
        )

    response_id = await submit_response(
        client, survey_id, answers=[{"question_id": q_id, "value": "B"}]
    )
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/complete",
        json={},
    )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments/summary",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_responses"] == 3
    # Average: (3+3+8)/3 = 14/3 ≈ 4.666...
    assert data["average_score"] is not None
    assert abs(float(data["average_score"]) - (14 / 3)) < 0.01
    assert float(data["min_score"]) == 3.0
    assert float(data["max_score"]) == 8.0

    bands_by_name = {b["name"]: b for b in data["bands"]}
    assert bands_by_name["Low"]["count"] == 2
    assert abs(bands_by_name["Low"]["percentage"] - 66.7) < 1.0
    assert bands_by_name["High"]["count"] == 1
    assert abs(bands_by_name["High"]["percentage"] - 33.3) < 1.0

    # Band percentages should sum close to 100% (only exact for non-overlapping bands)
    total_pct = sum(b["percentage"] for b in data["bands"])
    assert abs(total_pct - 100.0) < 1.0


@pytest.mark.asyncio
async def test_summary_ignores_incomplete_responses(client: AsyncClient):
    """GET /assessments/summary only counts completed responses, not incomplete ones."""
    headers = await auth_headers(client, "summary_incomplete@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    q_id = await create_question(client, headers, survey_id, group_id, code="Q1")
    await create_answer_option(client, headers, survey_id, q_id, "A", 5)

    await activate_survey(client, headers, survey_id)

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Band", min_score=0, max_score=10),
        headers=headers,
    )

    # Submit one incomplete response (don't mark it complete)
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": "A"}])

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments/summary",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # Incomplete response should not be counted
    assert data["total_responses"] == 0
    assert data["average_score"] is None


@pytest.mark.asyncio
async def test_summary_wrong_owner_returns_404(client: AsyncClient):
    """GET /assessments/summary returns 404 for a survey not owned by the user."""
    headers1 = await auth_headers(client, "summown1@example.com")
    headers2 = await auth_headers(client, "summown2@example.com")
    survey_id = await create_survey(client, headers1)

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="Band"),
        headers=headers1,
    )

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/assessments/summary",
        headers=headers2,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_score_backward_compat_string_and_list_answers_unchanged(client: AsyncClient):
    """Backward compatibility: string and list answers still produce identical scores."""
    headers = await auth_headers(client, "score_backcompat@example.com")
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    # Single choice (string value)
    q1_id = await create_question(client, headers, survey_id, group_id, code="Q1")
    await create_answer_option(client, headers, survey_id, q1_id, "A", 3)

    # Multiple choice (list value)
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q2", "question_type": "multiple_choice", "code": "Q2"},
        headers=headers,
    )
    assert resp.status_code == 201
    q2_id = resp.json()["id"]
    await create_answer_option(client, headers, survey_id, q2_id, "B", 4)
    await create_answer_option(client, headers, survey_id, q2_id, "C", 5)

    await activate_survey(client, headers, survey_id)
    response_id = await submit_response(
        client, survey_id,
        answers=[
            {"question_id": q1_id, "value": "A"},
            {"question_id": q2_id, "value": ["B", "C"]},
        ],
    )

    # Total score = 3 + 4 + 5 = 12
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/assessments",
        json=assessment_payload(name="BackCompatMatch", min_score=12, max_score=12),
        headers=headers,
    )

    score_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/assessment",
        headers=headers,
    )
    assert score_resp.status_code == 200
    data = score_resp.json()
    assert float(data["score"]) == 12.0
    matching_names = [a["name"] for a in data["matching_assessments"]]
    assert "BackCompatMatch" in matching_names
