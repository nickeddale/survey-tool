"""Tests for GET /api/v1/surveys/{id}/statistics endpoint."""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "statsuser@example.com",
    "password": "securepassword123",
    "name": "Stats User",
}

OTHER_USER = {
    "email": "otheruser_stats@example.com",
    "password": "securepassword123",
    "name": "Other Stats User",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_and_login(client: AsyncClient, user: dict = VALID_USER) -> dict:
    await client.post(REGISTER_URL, json=user)
    response = await client.post(
        LOGIN_URL, json={"email": user["email"], "password": user["password"]}
    )
    assert response.status_code == 200
    return response.json()


async def auth_headers(client: AsyncClient, user: dict = VALID_USER) -> dict:
    tokens = await register_and_login(client, user)
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
    title: str = "Question",
    question_type: str = "short_text",
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


async def activate_survey(client: AsyncClient, headers: dict, survey_id: str) -> None:
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert resp.status_code == 200


async def submit_response(client: AsyncClient, survey_id: str, answers: list | None = None) -> str:
    payload = {"answers": answers or []}
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]


async def complete_response_request(client: AsyncClient, survey_id: str, response_id: str) -> None:
    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Tests: authentication
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_requires_auth(client: AsyncClient):
    """Unauthenticated request returns 403 (no credentials provided)."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_statistics_non_owner_returns_404(client: AsyncClient):
    """Another user's survey returns 404 (no ownership oracle)."""
    owner_headers = await auth_headers(client, VALID_USER)
    other_headers = await auth_headers(client, OTHER_USER)

    survey_id = await create_survey(client, owner_headers)

    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/statistics", headers=other_headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_statistics_invalid_survey_id_returns_404(client: AsyncClient):
    """Non-existent survey returns 404."""
    headers = await auth_headers(client)
    import uuid
    fake_id = str(uuid.uuid4())

    resp = await client.get(f"{SURVEYS_URL}/{fake_id}/statistics", headers=headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests: empty survey (no responses)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_empty_survey_returns_zeros(client: AsyncClient):
    """Survey with no responses returns all zero counts and null avg time."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["survey_id"] == survey_id
    assert data["total_responses"] == 0
    assert data["complete_responses"] == 0
    assert data["incomplete_responses"] == 0
    assert data["disqualified_responses"] == 0
    assert data["completion_rate"] == 0.0
    assert data["average_completion_time_seconds"] is None
    assert data["questions"] == []


# ---------------------------------------------------------------------------
# Tests: response count aggregation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_counts_responses_by_status(client: AsyncClient):
    """Verify total, complete, incomplete, and disqualified counts."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    await add_question(client, headers, survey_id, group_id, question_type="short_text")
    await activate_survey(client, headers, survey_id)

    # Create 2 incomplete responses
    await submit_response(client, survey_id)
    await submit_response(client, survey_id)

    # Create 1 complete response (no required questions, so completion succeeds)
    r3 = await submit_response(client, survey_id)
    await complete_response_request(client, survey_id, r3)

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["total_responses"] == 3
    assert data["complete_responses"] == 1
    assert data["incomplete_responses"] == 2
    assert data["disqualified_responses"] == 0
    assert abs(data["completion_rate"] - 1 / 3) < 0.001


@pytest.mark.asyncio
async def test_statistics_disqualified_responses(client: AsyncClient):
    """Disqualified response is counted under disqualified_responses."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    await add_question(client, headers, survey_id, group_id, question_type="short_text")
    await activate_survey(client, headers, survey_id)

    r1 = await submit_response(client, survey_id)

    # Disqualify the response
    disq_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{r1}/status",
        json={"status": "disqualified"},
        headers=headers,
    )
    assert disq_resp.status_code == 200

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["total_responses"] == 1
    assert data["disqualified_responses"] == 1
    assert data["incomplete_responses"] == 0
    assert data["complete_responses"] == 0


# ---------------------------------------------------------------------------
# Tests: completion rate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_completion_rate_100_percent(client: AsyncClient):
    """All complete responses yields 100% completion rate."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    await add_question(client, headers, survey_id, group_id, question_type="short_text")
    await activate_survey(client, headers, survey_id)

    r1 = await submit_response(client, survey_id)
    await complete_response_request(client, survey_id, r1)

    r2 = await submit_response(client, survey_id)
    await complete_response_request(client, survey_id, r2)

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    data = resp.json()
    assert data["total_responses"] == 2
    assert data["complete_responses"] == 2
    assert data["completion_rate"] == 1.0


# ---------------------------------------------------------------------------
# Tests: response schema fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_response_has_required_fields(client: AsyncClient):
    """Response body contains all required top-level fields."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    required_keys = {
        "survey_id",
        "total_responses",
        "complete_responses",
        "incomplete_responses",
        "disqualified_responses",
        "completion_rate",
        "average_completion_time_seconds",
        "questions",
    }
    assert required_keys.issubset(data.keys())


# ---------------------------------------------------------------------------
# Tests: per-question statistics — text questions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_text_question_response_count(client: AsyncClient):
    """Text question stats include response_count."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    q_id = await add_question(client, headers, survey_id, group_id, title="Q Text", question_type="short_text")
    await activate_survey(client, headers, survey_id)

    # Submit 2 responses with answers
    r1 = await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": "hello"}])
    r2 = await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": "world"}])

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert len(data["questions"]) == 1
    q_stats = data["questions"][0]
    assert q_stats["question_id"] == q_id
    assert q_stats["question_type"] == "short_text"
    assert q_stats["stats"]["response_count"] == 2
    assert q_stats["stats"]["question_type"] == "short_text"


# ---------------------------------------------------------------------------
# Tests: per-question statistics — choice questions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_choice_question_option_counts(client: AsyncClient):
    """Choice question stats include count and percentage per option."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    q_id = await add_question(
        client, headers, survey_id, group_id, title="Q Choice", question_type="single_choice"
    )
    await add_answer_option(client, headers, survey_id, q_id, title="Option A", code="opt_a")
    await add_answer_option(client, headers, survey_id, q_id, title="Option B", code="opt_b")
    await activate_survey(client, headers, survey_id)

    # 2 responses choose opt_a, 1 chooses opt_b
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": "opt_a"}])
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": "opt_a"}])
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": "opt_b"}])

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    q_stats = data["questions"][0]
    assert q_stats["question_type"] == "single_choice"
    stats = q_stats["stats"]
    assert stats["response_count"] == 3

    options_by_code = {opt["option_code"]: opt for opt in stats["options"]}
    assert options_by_code["opt_a"]["count"] == 2
    assert abs(options_by_code["opt_a"]["percentage"] - 66.67) < 0.1
    assert options_by_code["opt_b"]["count"] == 1
    assert abs(options_by_code["opt_b"]["percentage"] - 33.33) < 0.1


# ---------------------------------------------------------------------------
# Tests: per-question statistics — rating questions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_rating_question_average_and_distribution(client: AsyncClient):
    """Rating question stats include average and distribution."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    q_id = await add_question(
        client, headers, survey_id, group_id, title="Q Rating", question_type="rating"
    )
    await activate_survey(client, headers, survey_id)

    # Submit responses with rating values 3, 4, 5
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": 3}])
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": 4}])
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": 5}])

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    q_stats = data["questions"][0]
    assert q_stats["question_type"] == "rating"
    stats = q_stats["stats"]
    assert stats["response_count"] == 3
    assert abs(stats["average"] - 4.0) < 0.01
    # Distribution should have entries for 3, 4, 5
    dist_by_val = {entry["value"]: entry["count"] for entry in stats["distribution"]}
    assert dist_by_val["3"] == 1
    assert dist_by_val["4"] == 1
    assert dist_by_val["5"] == 1


# ---------------------------------------------------------------------------
# Tests: per-question statistics — numeric questions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_numeric_question_aggregates(client: AsyncClient):
    """Numeric question stats include mean, median, min, max."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    q_id = await add_question(
        client, headers, survey_id, group_id, title="Q Number", question_type="number"
    )
    await activate_survey(client, headers, survey_id)

    # Submit responses with values 10, 20, 30
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": 10}])
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": 20}])
    await submit_response(client, survey_id, answers=[{"question_id": q_id, "value": 30}])

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    q_stats = data["questions"][0]
    assert q_stats["question_type"] == "number"
    stats = q_stats["stats"]
    assert stats["response_count"] == 3
    assert abs(stats["mean"] - 20.0) < 0.01
    assert abs(stats["median"] - 20.0) < 0.01
    assert abs(stats["min"] - 10.0) < 0.01
    assert abs(stats["max"] - 30.0) < 0.01


@pytest.mark.asyncio
async def test_statistics_numeric_question_no_responses_returns_nulls(client: AsyncClient):
    """Numeric question with no answers returns null aggregates."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    q_id = await add_question(
        client, headers, survey_id, group_id, title="Q Number", question_type="number"
    )
    await activate_survey(client, headers, survey_id)

    # Submit a response with no answers
    await submit_response(client, survey_id)

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    q_stats = data["questions"][0]
    stats = q_stats["stats"]
    assert stats["response_count"] == 0
    assert stats["mean"] is None
    assert stats["median"] is None
    assert stats["min"] is None
    assert stats["max"] is None


# ---------------------------------------------------------------------------
# Tests: multiple question types in one survey
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_multiple_question_types(client: AsyncClient):
    """Survey with multiple question types returns stats for each."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    q_text = await add_question(client, headers, survey_id, group_id, title="Text Q", question_type="short_text")
    q_rating = await add_question(client, headers, survey_id, group_id, title="Rating Q", question_type="rating")
    q_num = await add_question(client, headers, survey_id, group_id, title="Num Q", question_type="number")
    await activate_survey(client, headers, survey_id)

    # Submit 1 response with answers for all questions
    await submit_response(
        client,
        survey_id,
        answers=[
            {"question_id": q_text, "value": "hello"},
            {"question_id": q_rating, "value": 4},
            {"question_id": q_num, "value": 42},
        ],
    )

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert len(data["questions"]) == 3

    types_found = {q["question_type"] for q in data["questions"]}
    assert "short_text" in types_found
    assert "rating" in types_found
    assert "number" in types_found
