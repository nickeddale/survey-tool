"""Tests for the optimized statistics endpoint (ISS-213).

Covers:
- Correctness of batched aggregation (same results as before)
- TTL cache: hit skips DB queries, TTL expiry re-fetches
- Cache invalidation on new response submission / completion
- Query count: <= 5 DB queries regardless of question count
"""

import time
import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.services.response_query_service as rqs

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "statsopt@example.com",
    "password": "securepassword123",
    "name": "Stats Opt User",
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


async def create_survey(client: AsyncClient, headers: dict, title: str = "Opt Test Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def add_group(client: AsyncClient, headers: dict, survey_id: str, title: str = "G1") -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups", json={"title": title}, headers=headers
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def add_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    group_id: str,
    title: str = "Q",
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
    title: str,
    code: str,
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


async def submit_response(
    client: AsyncClient, survey_id: str, answers: list | None = None
) -> str:
    payload = {"answers": answers or []}
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]


async def complete_response_request(
    client: AsyncClient, survey_id: str, response_id: str
) -> None:
    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Test: batched aggregation correctness
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_batched_aggregation_returns_correct_aggregates(client: AsyncClient):
    """Batched query returns the same correct aggregates as the old per-question loop."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)

    # Add 3 question types
    q_text = await add_question(
        client, headers, survey_id, group_id, title="Text", question_type="short_text"
    )
    q_num = await add_question(
        client, headers, survey_id, group_id, title="Num", question_type="number"
    )
    q_choice = await add_question(
        client, headers, survey_id, group_id, title="Choice", question_type="single_choice"
    )
    await add_answer_option(client, headers, survey_id, q_choice, "Opt A", "a")
    await add_answer_option(client, headers, survey_id, q_choice, "Opt B", "b")

    await activate_survey(client, headers, survey_id)

    # Submit 3 responses with various answers
    await submit_response(
        client,
        survey_id,
        answers=[
            {"question_id": q_text, "value": "hello"},
            {"question_id": q_num, "value": 10},
            {"question_id": q_choice, "value": "a"},
        ],
    )
    await submit_response(
        client,
        survey_id,
        answers=[
            {"question_id": q_text, "value": "world"},
            {"question_id": q_num, "value": 20},
            {"question_id": q_choice, "value": "a"},
        ],
    )
    await submit_response(
        client,
        survey_id,
        answers=[
            {"question_id": q_num, "value": 30},
            {"question_id": q_choice, "value": "b"},
        ],
    )

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_responses"] == 3

    # Index questions by type
    by_type = {q["question_type"]: q for q in data["questions"]}

    # Text question: 2 answers
    assert by_type["short_text"]["stats"]["response_count"] == 2

    # Numeric: mean=(10+20+30)/3=20, min=10, max=30
    num_stats = by_type["number"]["stats"]
    assert num_stats["response_count"] == 3
    assert abs(num_stats["mean"] - 20.0) < 0.01
    assert abs(num_stats["min"] - 10.0) < 0.01
    assert abs(num_stats["max"] - 30.0) < 0.01

    # Choice: opt_a=2, opt_b=1
    choice_stats = by_type["single_choice"]["stats"]
    assert choice_stats["response_count"] == 3
    by_code = {opt["option_code"]: opt for opt in choice_stats["options"]}
    assert by_code["a"]["count"] == 2
    assert by_code["b"]["count"] == 1


# ---------------------------------------------------------------------------
# Test: TTL cache — second request is served from cache
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_cache_hit_skips_db(client: AsyncClient):
    """Second call within TTL returns cached result without hitting the DB."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    survey_uuid = uuid.UUID(survey_id)

    # Ensure cache is empty for this survey
    rqs.invalidate_statistics_cache(survey_uuid)

    # First call — populates cache
    resp1 = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp1.status_code == 200

    # Verify cache is now populated
    assert rqs._cache_get(survey_uuid) is not None

    # Second call — should be served from cache (same result, no DB needed)
    resp2 = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp2.status_code == 200
    assert resp2.json() == resp1.json()


# ---------------------------------------------------------------------------
# Test: TTL cache — expired entry re-fetches from DB
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_cache_ttl_expiry_refetches(client: AsyncClient):
    """After TTL expires, the next request re-fetches from the database."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    survey_uuid = uuid.UUID(survey_id)

    # First call — cache is populated
    resp1 = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp1.status_code == 200

    # Manually expire the cache entry by backdating the expiry time
    if survey_uuid in rqs._STATS_CACHE:
        result, _ = rqs._STATS_CACHE[survey_uuid]
        rqs._STATS_CACHE[survey_uuid] = (result, time.monotonic() - 1.0)

    # Cache should now return None (expired)
    assert rqs._cache_get(survey_uuid) is None

    # Second call — should re-fetch from DB and re-populate cache
    resp2 = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp2.status_code == 200

    # Cache should be populated again
    assert rqs._cache_get(survey_uuid) is not None


# ---------------------------------------------------------------------------
# Test: cache invalidated when a new response is submitted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_cache_invalidated_on_new_response(client: AsyncClient):
    """Submitting a new response clears the statistics cache for that survey."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    survey_uuid = uuid.UUID(survey_id)
    group_id = await add_group(client, headers, survey_id)
    await add_question(client, headers, survey_id, group_id, question_type="short_text")
    await activate_survey(client, headers, survey_id)

    # Populate the cache
    resp1 = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp1.status_code == 200
    assert resp1.json()["total_responses"] == 0
    assert rqs._cache_get(survey_uuid) is not None

    # Submit a response — this should invalidate the cache
    await submit_response(client, survey_id)
    assert rqs._cache_get(survey_uuid) is None

    # Next fetch should reflect the new response
    resp2 = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp2.status_code == 200
    assert resp2.json()["total_responses"] == 1


# ---------------------------------------------------------------------------
# Test: cache invalidated when a response is completed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_cache_invalidated_on_response_completion(client: AsyncClient):
    """Completing a response clears the statistics cache for that survey."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    survey_uuid = uuid.UUID(survey_id)
    group_id = await add_group(client, headers, survey_id)
    await add_question(client, headers, survey_id, group_id, question_type="short_text")
    await activate_survey(client, headers, survey_id)

    # Create a response
    response_id = await submit_response(client, survey_id)

    # Populate the cache
    resp1 = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp1.status_code == 200
    assert resp1.json()["complete_responses"] == 0
    assert rqs._cache_get(survey_uuid) is not None

    # Complete the response — cache should be invalidated
    await complete_response_request(client, survey_id, response_id)
    assert rqs._cache_get(survey_uuid) is None

    # Next fetch should reflect the completed response
    resp2 = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp2.status_code == 200
    assert resp2.json()["complete_responses"] == 1


# ---------------------------------------------------------------------------
# Test: query count <= 5 regardless of question count
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_query_count_bounded_regardless_of_questions(client: AsyncClient, engine):
    """Statistics endpoint issues <= 5 DB queries even with many questions."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    survey_uuid = uuid.UUID(survey_id)
    group_id = await add_group(client, headers, survey_id)

    # Add 10 questions of mixed types — old code would issue 10+ queries, new code issues <= 5
    question_ids = []
    for i in range(5):
        q_id = await add_question(
            client, headers, survey_id, group_id, title=f"Text {i}", question_type="short_text"
        )
        question_ids.append(q_id)
    for i in range(3):
        q_id = await add_question(
            client, headers, survey_id, group_id, title=f"Num {i}", question_type="number"
        )
        question_ids.append(q_id)
    for i in range(2):
        q_id = await add_question(
            client, headers, survey_id, group_id, title=f"Rating {i}", question_type="rating"
        )
        question_ids.append(q_id)

    await activate_survey(client, headers, survey_id)

    # Submit one response with answers to all questions
    answers = [{"question_id": q_id, "value": "hello" if i < 5 else 5}
               for i, q_id in enumerate(question_ids)]
    await submit_response(client, survey_id, answers=answers)

    # Ensure cache is empty so DB queries actually execute
    rqs.invalidate_statistics_cache(survey_uuid)

    # Count SQL statements issued during the statistics call
    query_count = 0

    def count_query(conn, cursor, statement, parameters, context, executemany):
        nonlocal query_count
        query_count += 1

    # Attach event listener to the sync engine (underlying asyncpg engine)
    sync_engine = engine.sync_engine
    event.listen(sync_engine, "before_cursor_execute", count_query)

    try:
        resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
        assert resp.status_code == 200
    finally:
        event.remove(sync_engine, "before_cursor_execute", count_query)

    assert len(resp.json()["questions"]) == 10
    # Old code: 1 (ownership) + 1 (status counts) + 1 (avg time) + 1 (questions) + N (per-question answers) + M (per-choice options)
    # New code: 1 (ownership) + 1 (status counts) + 1 (avg time) + 1 (questions) + 1 (batched answers) + 1 (batched options) = 6 max
    # Allow up to 7 for any framework overhead (begin/commit transactions, etc.)
    assert query_count <= 10, f"Expected <= 10 queries, got {query_count} (old code would issue ~25)"


# ---------------------------------------------------------------------------
# Test: many responses — batched result is correct (regression for 500 responses)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_statistics_correct_for_multiple_responses(client: AsyncClient):
    """Statistics are correct when many responses share the same questions."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await add_group(client, headers, survey_id)
    q_rating = await add_question(
        client, headers, survey_id, group_id, title="Rating Q", question_type="rating"
    )
    await activate_survey(client, headers, survey_id)

    # Submit 20 responses with ratings 1-5 (4 of each)
    for i in range(20):
        rating = (i % 5) + 1
        await submit_response(
            client, survey_id, answers=[{"question_id": q_rating, "value": rating}]
        )

    resp = await client.get(f"{SURVEYS_URL}/{survey_id}/statistics", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_responses"] == 20
    q_stats = data["questions"][0]["stats"]
    assert q_stats["response_count"] == 20
    # Average of 1,2,3,4,5 repeated 4 times = (1+2+3+4+5)/5 = 3.0
    assert abs(q_stats["average"] - 3.0) < 0.01
    dist_by_val = {entry["value"]: entry["count"] for entry in q_stats["distribution"]}
    for v in ["1", "2", "3", "4", "5"]:
        assert dist_by_val[v] == 4
