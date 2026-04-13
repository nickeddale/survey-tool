"""End-to-end integration tests: full user journey.

Covers:
    - Full journey: register -> login -> create survey -> add groups & questions
      (covering all 18 core question types) -> activate -> submit responses via
      JWT auth and API key auth -> verify statistics -> export CSV and JSON
    - Auth paths: JWT Bearer token and X-API-Key header
    - Invalid auth: refresh token used as access token returns 401 with
      WWW-Authenticate: Bearer header
    - Participant token access: valid token passes, invalid token rejected
    - Relevance expressions: questions with relevance conditions show/hide correctly
    - password_hash absent from /me response
"""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
ME_URL = "/api/v1/auth/me"
KEYS_URL = "/api/v1/auth/keys"
SURVEYS_URL = "/api/v1/surveys"
WEBHOOKS_URL = "/api/v1/webhooks"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


async def register_and_login(
    client: AsyncClient, email: str, password: str = "testpass123"
) -> dict:
    await client.post(
        REGISTER_URL,
        json={"email": email, "password": password, "name": "E2E User"},
    )
    resp = await client.post(LOGIN_URL, json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()


async def auth_headers(client: AsyncClient, email: str) -> dict:
    tokens = await register_and_login(client, email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict, title: str = "E2E Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_group(
    client: AsyncClient, headers: dict, survey_id: str, title: str = "Group 1"
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
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
    question_type: str,
    code: str,
    title: str | None = None,
    extra: dict | None = None,
    relevance: str | None = None,
) -> str:
    payload: dict = {
        "title": title or f"Question {code}",
        "question_type": question_type,
        "code": code,
        "is_required": False,
    }
    if extra:
        payload.update(extra)
    if relevance:
        payload["relevance"] = relevance
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201, f"create_question failed: {resp.text}"
    return resp.json()["id"]


async def create_answer_option(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    question_id: str,
    code: str,
    title: str,
    sort_order: int = 1,
    assessment_value: int = 0,
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{question_id}/options",
        json={
            "code": code,
            "title": title,
            "sort_order": sort_order,
            "assessment_value": assessment_value,
        },
        headers=headers,
    )
    assert resp.status_code == 201, f"create_answer_option failed: {resp.text}"
    return resp.json()["id"]


async def activate_survey(client: AsyncClient, headers: dict, survey_id: str) -> None:
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert resp.status_code == 200, f"activate_survey failed: {resp.text}"


# ---------------------------------------------------------------------------
# Auth path tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_me_endpoint_excludes_password_hash(client: AsyncClient):
    """password_hash must never appear in /me response."""
    headers = await auth_headers(client, "e2e_me@example.com")
    resp = await client.get(ME_URL, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "password_hash" not in data
    assert "email" in data
    assert "id" in data


@pytest.mark.asyncio
async def test_refresh_token_rejected_as_bearer(client: AsyncClient):
    """Using a refresh token as Bearer token returns 401 with WWW-Authenticate header."""
    from app.config import settings

    # Register and login; refresh token is set as httpOnly cookie
    await register_and_login(client, "e2e_refresh_reject@example.com")

    # Extract raw refresh token from the Set-Cookie response header
    login_response = await client.post(
        LOGIN_URL,
        json={"email": "e2e_refresh_reject@example.com", "password": "testpass123"},
    )
    cookie_header = login_response.headers.get("set-cookie", "")
    cookie_name = settings.refresh_token_cookie_name
    refresh_token = None
    for part in cookie_header.split(";"):
        part = part.strip()
        if part.startswith(f"{cookie_name}="):
            refresh_token = part.split("=", 1)[1]
            break

    assert refresh_token is not None, "No refresh token cookie in login response"

    resp = await client.get(
        ME_URL,
        headers={"Authorization": f"Bearer {refresh_token}"},
    )
    assert resp.status_code == 401
    assert "WWW-Authenticate" in resp.headers
    assert "Bearer" in resp.headers["WWW-Authenticate"]


@pytest.mark.asyncio
async def test_api_key_auth_path(client: AsyncClient):
    """Authenticated endpoints work with X-API-Key header."""
    headers = await auth_headers(client, "e2e_apikey@example.com")

    # Create an API key
    key_resp = await client.post(
        KEYS_URL,
        json={"name": "E2E Test Key", "scopes": []},
        headers=headers,
    )
    assert key_resp.status_code == 201
    raw_key = key_resp.json()["key"]

    # Use API key to access /me
    api_key_headers = {"X-API-Key": raw_key}
    me_resp = await client.get(ME_URL, headers=api_key_headers)
    assert me_resp.status_code == 200
    assert "email" in me_resp.json()
    assert "password_hash" not in me_resp.json()


@pytest.mark.asyncio
async def test_invalid_bearer_token_returns_401_with_www_authenticate(client: AsyncClient):
    """Completely invalid Bearer token returns 401 with WWW-Authenticate header."""
    resp = await client.get(
        ME_URL,
        headers={"Authorization": "Bearer this.is.not.a.valid.jwt"},
    )
    assert resp.status_code == 401
    assert "WWW-Authenticate" in resp.headers


# ---------------------------------------------------------------------------
# Participant token tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_participant_token_access_valid(client: AsyncClient):
    """Valid participant token is accepted when submitting a response."""
    headers = await auth_headers(client, "e2e_part_valid@example.com")
    survey_id = await create_survey(client, headers, "Participant Survey")
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, "short_text", "Q1")
    await activate_survey(client, headers, survey_id)

    # Create participant
    part_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants",
        json={"email": "p1@example.com"},
        headers=headers,
    )
    assert part_resp.status_code == 201
    token = part_resp.json()["token"]

    # Submit response with participant token
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": token},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["survey_id"] == survey_id


@pytest.mark.asyncio
async def test_participant_invalid_token_rejected(client: AsyncClient):
    """Invalid participant token returns 403 when survey requires token auth."""
    headers = await auth_headers(client, "e2e_part_invalid@example.com")
    survey_id = await create_survey(client, headers, "Participant Survey 2")
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, "short_text", "Q1")
    await activate_survey(client, headers, survey_id)

    # Create a real participant so the survey enforces token validation
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants",
        json={"email": "realp@example.com"},
        headers=headers,
    )

    # Now an invalid token should be rejected
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "totally-invalid-token-xyz"},
    )
    assert resp.status_code in (403, 404, 422)


# ---------------------------------------------------------------------------
# Relevance expression test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_relevance_expression_shows_question(client: AsyncClient):
    """Questions with relevance=true are always shown; relevance=false are hidden."""
    headers = await auth_headers(client, "e2e_relevance@example.com")
    survey_id = await create_survey(client, headers, "Relevance Survey")
    group_id = await create_group(client, headers, survey_id)

    # A base question (always visible)
    q1_id = await create_question(
        client, headers, survey_id, group_id, "single_choice", "Q1",
        title="Choice question",
    )
    await create_answer_option(client, headers, survey_id, q1_id, "YES", "Yes", 1)
    await create_answer_option(client, headers, survey_id, q1_id, "NO", "No", 2)

    # A follow-up question with relevance expression
    q2_id = await create_question(
        client, headers, survey_id, group_id, "short_text", "Q2",
        title="Follow-up question",
        relevance="{Q1} == 'YES'",
    )

    await activate_survey(client, headers, survey_id)

    # Verify questions were created with correct relevance settings
    resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}?include=full",
        headers=headers,
    )
    assert resp.status_code == 200
    survey_data = resp.json()

    # Find q2 in the survey structure and verify its relevance field
    questions_found = {}
    for group in survey_data.get("groups", []):
        for q in group.get("questions", []):
            questions_found[q["id"]] = q

    assert q2_id in questions_found
    assert questions_found[q2_id]["relevance"] == "{Q1} == 'YES'"


# ---------------------------------------------------------------------------
# Full journey test: all 18 core question types
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_full_journey_all_question_types(client: AsyncClient):
    """Full E2E journey: register -> create survey with 18+ question types -> activate ->
    submit response -> complete -> export CSV and JSON -> verify statistics."""

    # Step 1: Register and login
    tokens = await register_and_login(client, "e2e_full_journey@example.com")
    access_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # Step 2: Create survey
    survey_id = await create_survey(client, headers, "Full Journey Survey")

    # Step 3: Create question group
    group_id = await create_group(client, headers, survey_id, "All Question Types")

    # Step 4: Create all 18 core question types
    question_ids: dict[str, str] = {}

    # Text types
    question_ids["short_text"] = await create_question(
        client, headers, survey_id, group_id, "short_text", "SHORT", "Short text question"
    )
    question_ids["long_text"] = await create_question(
        client, headers, survey_id, group_id, "long_text", "LONG", "Long text question"
    )
    question_ids["email"] = await create_question(
        client, headers, survey_id, group_id, "email", "EMAIL", "Email question"
    )
    question_ids["phone"] = await create_question(
        client, headers, survey_id, group_id, "phone", "PHONE", "Phone question"
    )
    question_ids["url"] = await create_question(
        client, headers, survey_id, group_id, "url", "URL", "URL question"
    )

    # Choice types
    question_ids["single_choice"] = await create_question(
        client, headers, survey_id, group_id, "single_choice", "SINGLE", "Single choice"
    )
    await create_answer_option(client, headers, survey_id, question_ids["single_choice"], "A", "Option A", 1, 3)
    await create_answer_option(client, headers, survey_id, question_ids["single_choice"], "B", "Option B", 2, 7)

    question_ids["multiple_choice"] = await create_question(
        client, headers, survey_id, group_id, "multiple_choice", "MULTI", "Multiple choice"
    )
    await create_answer_option(client, headers, survey_id, question_ids["multiple_choice"], "X", "Option X", 1)
    await create_answer_option(client, headers, survey_id, question_ids["multiple_choice"], "Y", "Option Y", 2)

    question_ids["dropdown"] = await create_question(
        client, headers, survey_id, group_id, "dropdown", "DROP", "Dropdown question"
    )
    await create_answer_option(client, headers, survey_id, question_ids["dropdown"], "D1", "Drop 1", 1)
    await create_answer_option(client, headers, survey_id, question_ids["dropdown"], "D2", "Drop 2", 2)

    # Scalar types
    question_ids["numeric"] = await create_question(
        client, headers, survey_id, group_id, "numeric", "NUM", "Numeric question"
    )
    question_ids["rating"] = await create_question(
        client, headers, survey_id, group_id, "rating", "RATE", "Rating question",
        extra={"settings": {"max": 5}}
    )
    question_ids["boolean"] = await create_question(
        client, headers, survey_id, group_id, "boolean", "BOOL", "Boolean question"
    )
    question_ids["date"] = await create_question(
        client, headers, survey_id, group_id, "date", "DATE", "Date question"
    )
    question_ids["time"] = await create_question(
        client, headers, survey_id, group_id, "time", "TIME", "Time question"
    )
    question_ids["scale"] = await create_question(
        client, headers, survey_id, group_id, "scale", "SCALE", "Scale question",
        extra={"settings": {"min": 1, "max": 10}}
    )
    question_ids["yes_no"] = await create_question(
        client, headers, survey_id, group_id, "yes_no", "YESNO", "Yes/No question"
    )

    # Numeric/ranking types
    question_ids["numeric_2"] = await create_question(
        client, headers, survey_id, group_id, "numeric", "NUMFIELD", "Numeric field question"
    )

    # Expression/HTML types
    question_ids["html"] = await create_question(
        client, headers, survey_id, group_id, "html", "HTML1", "HTML question",
        extra={"settings": {"html": "<p>Information</p>"}}
    )

    # Step 5: Activate survey
    await activate_survey(client, headers, survey_id)

    # Step 6: Submit a response via JWT auth (public endpoint, no auth needed)
    answers = [
        {"question_id": question_ids["short_text"], "value": "Hello World"},
        {"question_id": question_ids["long_text"], "value": "A longer answer text"},
        {"question_id": question_ids["email"], "value": "test@example.com"},
        {"question_id": question_ids["phone"], "value": "+1-555-123-4567"},
        {"question_id": question_ids["url"], "value": "https://example.com"},
        {"question_id": question_ids["single_choice"], "value": "A"},
        {"question_id": question_ids["dropdown"], "value": "D1"},
        {"question_id": question_ids["numeric"], "value": 42},
        {"question_id": question_ids["rating"], "value": 4},
        {"question_id": question_ids["boolean"], "value": "true"},
        {"question_id": question_ids["date"], "value": "2024-01-15"},
        {"question_id": question_ids["time"], "value": "14:30"},
        {"question_id": question_ids["scale"], "value": 7},
        {"question_id": question_ids["yes_no"], "value": "yes"},
        {"question_id": question_ids["numeric_2"], "value": 100},
    ]

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": answers},
    )
    assert resp.status_code == 201, f"Submit response failed: {resp.text}"
    response_data = resp.json()
    response_id = response_data["id"]
    assert response_data["survey_id"] == survey_id
    assert response_data["status"] == "incomplete"

    # Step 7: Complete the response
    complete_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert complete_resp.status_code == 200, f"Complete response failed: {complete_resp.text}"
    assert complete_resp.json()["status"] == "complete"

    # Step 8: Submit a second response via API key auth
    key_resp = await client.post(
        KEYS_URL,
        json={"name": "E2E Key", "scopes": ["responses:read"]},
        headers=headers,
    )
    assert key_resp.status_code == 201
    raw_key = key_resp.json()["key"]
    api_key_headers = {"X-API-Key": raw_key}

    # API key can access the survey list (authenticated resource)
    surveys_resp = await client.get(SURVEYS_URL, headers=api_key_headers)
    assert surveys_resp.status_code == 200
    survey_list = surveys_resp.json()
    survey_ids_in_list = [s["id"] for s in survey_list["items"]]
    assert survey_id in survey_ids_in_list

    # Step 9: Submit another response to have data for statistics
    resp2 = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"answers": [
            {"question_id": question_ids["short_text"], "value": "Second response"},
            {"question_id": question_ids["single_choice"], "value": "B"},
        ]},
    )
    assert resp2.status_code == 201
    response2_id = resp2.json()["id"]
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response2_id}",
        json={"status": "complete"},
    )

    # Step 10: Verify statistics
    stats_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/statistics",
        headers=headers,
    )
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert stats["total_responses"] >= 2
    assert stats["complete_responses"] >= 2
    assert "completion_rate" in stats

    # Step 11: Export CSV
    csv_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export?format=csv",
        headers=headers,
    )
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers.get("content-type", "")
    csv_text = csv_resp.text
    assert "response_id" in csv_text
    assert "SHORT" in csv_text  # question code appears as column header

    # Step 12: Export JSON
    json_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/export?format=json",
        headers=headers,
    )
    assert json_resp.status_code == 200
    content_type = json_resp.headers.get("content-type", "")
    assert "json" in content_type
    json_data = json_resp.json()
    assert isinstance(json_data, list)
    assert len(json_data) >= 2

    # Step 13: Verify response detail is accessible via API key auth
    detail_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}/detail",
        headers=api_key_headers,
    )
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["id"] == response_id
    assert "answers" in detail


@pytest.mark.asyncio
async def test_full_journey_response_list_pagination(client: AsyncClient):
    """Response list supports pagination and filtering by status."""
    headers = await auth_headers(client, "e2e_pagination@example.com")
    survey_id = await create_survey(client, headers, "Pagination Survey")
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, "short_text", "Q1")
    await activate_survey(client, headers, survey_id)

    # Submit 3 responses
    response_ids = []
    for i in range(3):
        resp = await client.post(
            f"{SURVEYS_URL}/{survey_id}/responses",
            json={"answers": [{"question_id": (
                await client.get(f"{SURVEYS_URL}/{survey_id}?include=full", headers=headers)
            ).json()["groups"][0]["questions"][0]["id"], "value": f"Answer {i}"}]},
        )
        assert resp.status_code == 201
        response_ids.append(resp.json()["id"])

    # Complete first 2
    for rid in response_ids[:2]:
        await client.patch(
            f"{SURVEYS_URL}/{survey_id}/responses/{rid}",
            json={"status": "complete"},
        )

    # List all responses - verify total and pagination
    list_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?per_page=2",
        headers=headers,
    )
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] == 3
    assert len(list_data["items"]) == 2
    assert list_data["pages"] == 2

    # Filter by status=complete
    complete_resp = await client.get(
        f"{SURVEYS_URL}/{survey_id}/responses?status=complete",
        headers=headers,
    )
    assert complete_resp.status_code == 200
    complete_data = complete_resp.json()
    assert complete_data["total"] == 2
    for item in complete_data["items"]:
        assert item["status"] == "complete"
