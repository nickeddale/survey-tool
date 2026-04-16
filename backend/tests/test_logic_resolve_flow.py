"""Tests for POST /api/v1/surveys/{id}/logic/resolve-flow.

Covers:
- Unauthenticated request → 200 (public endpoint, no auth required)
- Survey not found → 404
- Invalid survey_id format → 404
- current_question_id referencing unknown question id → 404
- Circular relevance expression → 422
- Basic forward navigation (current_question_id provided)
- Backward navigation
- current_question_id=None returns first visible question
- End of survey: next_question_id is null
- Hidden questions skipped in navigation
- visible_questions / hidden_questions populated correctly
- visible_groups / hidden_groups populated correctly
- piped_texts populated (substitutions applied)
- validation_results contains per-question output
- Response structure (all required fields present)
"""

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

_user_counter = 0


def _unique_email(prefix: str = "flow") -> str:
    global _user_counter
    _user_counter += 1
    return f"{prefix}_{_user_counter}@example.com"


async def register_and_login(client: AsyncClient, email: str | None = None) -> dict:
    if email is None:
        email = _unique_email()
    await client.post(
        REGISTER_URL,
        json={"email": email, "password": "securepassword123", "name": "Flow User"},
    )
    response = await client.post(
        LOGIN_URL,
        json={"email": email, "password": "securepassword123"},
    )
    assert response.status_code == 200
    return response.json()


async def auth_headers(client: AsyncClient, email: str | None = None) -> dict:
    tokens = await register_and_login(client, email=email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict, title: str = "Flow Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_group(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    title: str = "Group 1",
    sort_order: int = 1,
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": title, "sort_order": sort_order},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    group_id: str,
    code: str,
    sort_order: int = 1,
    title: str = "A question",
    relevance: str | None = None,
) -> dict:
    payload: dict = {
        "question_type": "short_text",
        "title": title,
        "code": code,
        "sort_order": sort_order,
    }
    if relevance is not None:
        payload["relevance"] = relevance
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


def resolve_url(survey_id: str) -> str:
    return f"{SURVEYS_URL}/{survey_id}/logic/resolve-flow"


def answer_input(question_id: str, value: object) -> dict:
    """Build a single answer input object in the format the API expects."""
    return {"question_id": question_id, "value": value}


# --------------------------------------------------------------------------- #
# Authentication / Authorization
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_unauthenticated_request_returns_200(client: AsyncClient):
    """No auth token → 200 with valid flow response (public endpoint)."""
    # Create a survey as an authenticated user to get a real survey_id
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)

    # Call without any auth headers
    response = await client.post(
        resolve_url(survey_id),
        json={"answers": []},
    )
    assert response.status_code == 200
    body = response.json()
    assert "next_question_id" in body
    assert "visible_questions" in body
    assert "hidden_questions" in body
    assert body["next_question_id"] == q1["id"]


@pytest.mark.asyncio
async def test_survey_not_found_returns_404(client: AsyncClient):
    """Non-existent survey → 404."""
    headers = await auth_headers(client)
    response = await client.post(
        resolve_url("00000000-0000-0000-0000-000000000001"),
        json={"answers": []},
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_survey_owned_by_other_user_returns_200(client: AsyncClient):
    """Survey owned by a different user → 200 (public endpoint, no ownership check)."""
    headers_owner = await auth_headers(client, email=_unique_email("owner"))
    survey_id = await create_survey(client, headers_owner)

    headers_other = await auth_headers(client, email=_unique_email("other"))
    response = await client.post(
        resolve_url(survey_id),
        json={"answers": []},
        headers=headers_other,
    )
    assert response.status_code == 200
    body = response.json()
    assert "next_question_id" in body


@pytest.mark.asyncio
async def test_invalid_survey_id_format_returns_404(client: AsyncClient):
    """Non-UUID survey_id → 404."""
    headers = await auth_headers(client)
    response = await client.post(
        f"{SURVEYS_URL}/not-a-uuid/logic/resolve-flow",
        json={"answers": []},
        headers=headers,
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# Invalid current_question_id
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_unknown_current_question_id_returns_404(client: AsyncClient):
    """current_question_id referencing a non-existent UUID → 404."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [], "current_question_id": "00000000-0000-0000-0000-000000000099"},
        headers=headers,
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# Response structure
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_response_has_required_fields(client: AsyncClient):
    """Response always contains all required fields."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": []},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert "next_question_id" in body
    assert "visible_questions" in body
    assert "hidden_questions" in body
    assert "visible_groups" in body
    assert "hidden_groups" in body
    assert "piped_texts" in body
    assert "validation_results" in body

    assert isinstance(body["visible_questions"], list)
    assert isinstance(body["hidden_questions"], list)
    assert isinstance(body["visible_groups"], list)
    assert isinstance(body["hidden_groups"], list)
    assert isinstance(body["piped_texts"], dict)
    assert isinstance(body["validation_results"], dict)


# --------------------------------------------------------------------------- #
# current_question_id=None → first visible question
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_no_current_question_id_returns_first_visible(client: AsyncClient):
    """When current_question_id is None, next_question_id is the first visible question."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": []},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["next_question_id"] == q1["id"]


@pytest.mark.asyncio
async def test_no_current_question_id_empty_survey_returns_null(client: AsyncClient):
    """Survey with no questions → next_question_id is null."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": []},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["next_question_id"] is None


# --------------------------------------------------------------------------- #
# Forward navigation
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_forward_navigation_returns_next_question(client: AsyncClient):
    """current_question_id=Q1, direction=forward → next_question_id=Q2."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    q2 = await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)
    await create_question(client, headers, survey_id, group_id, code="Q3", sort_order=3)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [], "current_question_id": q1["id"], "direction": "forward"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["next_question_id"] == q2["id"]


@pytest.mark.asyncio
async def test_forward_at_last_question_returns_null(client: AsyncClient):
    """current_question_id=last question, direction=forward → next_question_id is null."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    q2 = await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [], "current_question_id": q2["id"], "direction": "forward"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["next_question_id"] is None


# --------------------------------------------------------------------------- #
# Backward navigation
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_backward_navigation_returns_previous_question(client: AsyncClient):
    """current_question_id=Q3, direction=backward → next_question_id=Q2."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    q2 = await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)
    q3 = await create_question(client, headers, survey_id, group_id, code="Q3", sort_order=3)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [], "current_question_id": q3["id"], "direction": "backward"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["next_question_id"] == q2["id"]


@pytest.mark.asyncio
async def test_backward_at_first_question_returns_null(client: AsyncClient):
    """current_question_id=first question, direction=backward → next_question_id is null."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [], "current_question_id": q1["id"], "direction": "backward"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["next_question_id"] is None


# --------------------------------------------------------------------------- #
# Skip logic / relevance
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_hidden_question_skipped_in_forward_navigation(client: AsyncClient):
    """Hidden question is skipped when navigating forward."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    # Q2 is hidden when Q1 != 'yes'
    await create_question(
        client, headers, survey_id, group_id, code="Q2", sort_order=2,
        relevance="{Q1} == 'yes'",
    )
    q3 = await create_question(client, headers, survey_id, group_id, code="Q3", sort_order=3)

    # With Q1 = 'no', Q2 is hidden → skip from Q1 to Q3
    response = await client.post(
        resolve_url(survey_id),
        json={
            "answers": [answer_input(q1["id"], "no")],
            "current_question_id": q1["id"],
            "direction": "forward",
        },
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["next_question_id"] == q3["id"]


@pytest.mark.asyncio
async def test_visible_and_hidden_questions_populated(client: AsyncClient):
    """visible_questions and hidden_questions reflect relevance evaluation."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    q2 = await create_question(
        client, headers, survey_id, group_id, code="Q2", sort_order=2,
        relevance="{Q1} == 'yes'",
    )
    q3 = await create_question(client, headers, survey_id, group_id, code="Q3", sort_order=3)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [answer_input(q1["id"], "no")]},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()

    assert q1["id"] in body["visible_questions"]
    assert q3["id"] in body["visible_questions"]
    assert q2["id"] in body["hidden_questions"]
    assert q2["id"] not in body["visible_questions"]


@pytest.mark.asyncio
async def test_visible_groups_populated(client: AsyncClient):
    """visible_groups and hidden_groups reflect group relevance."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id, title="Group 1", sort_order=1)
    await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": []},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()

    # Group 1 has no relevance expression, so it's always visible
    assert len(body["visible_groups"]) == 1
    assert len(body["hidden_groups"]) == 0
    # The group id should be a valid UUID string
    assert body["visible_groups"][0] == group_id


# --------------------------------------------------------------------------- #
# Piped texts
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_piped_texts_populated(client: AsyncClient):
    """piped_texts contains entries for all questions."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(
        client, headers, survey_id, group_id, code="Q1", sort_order=1, title="Hello {Q1}!"
    )

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [answer_input(q1["id"], "World")]},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()

    # piped_texts should contain Q1_title and Q1_description
    assert "Q1_title" in body["piped_texts"]
    assert body["piped_texts"]["Q1_title"] == "Hello World!"


@pytest.mark.asyncio
async def test_piped_texts_empty_when_no_placeholders(client: AsyncClient):
    """piped_texts entry is unchanged when title has no placeholders."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    await create_question(
        client, headers, survey_id, group_id, code="Q1", sort_order=1, title="Plain title"
    )

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": []},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["piped_texts"]["Q1_title"] == "Plain title"


# --------------------------------------------------------------------------- #
# Validation results
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_validation_results_populated_for_all_questions(client: AsyncClient):
    """validation_results contains an entry for each top-level question."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    q2 = await create_question(
        client, headers, survey_id, group_id, code="Q2", sort_order=2,
        relevance="{Q1} == 'yes'",
    )

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": []},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()

    assert q1["id"] in body["validation_results"]
    assert q2["id"] in body["validation_results"]

    # Q1 has no relevance expression → empty errors/warnings
    assert body["validation_results"][q1["id"]]["errors"] == []

    # Q2 has a valid relevance expression using Q1 → no errors
    assert body["validation_results"][q2["id"]]["errors"] == []
    assert "Q1" in body["validation_results"][q2["id"]]["parsed_variables"]


# --------------------------------------------------------------------------- #
# Circular relevance → 422
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_circular_relevance_returns_422(client: AsyncClient):
    """Circular relevance expressions → 422 UnprocessableError."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    # Q1 depends on Q2, Q2 depends on Q1 → circular
    await create_question(
        client, headers, survey_id, group_id, code="Q1", sort_order=1,
        relevance="{Q2} == 'yes'",
    )
    await create_question(
        client, headers, survey_id, group_id, code="Q2", sort_order=2,
        relevance="{Q1} == 'yes'",
    )

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": []},
        headers=headers,
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------- #
# Default direction is forward
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_default_direction_is_forward(client: AsyncClient):
    """When direction is not specified, it defaults to forward."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(client, headers, survey_id, group_id, code="Q1", sort_order=1)
    q2 = await create_question(client, headers, survey_id, group_id, code="Q2", sort_order=2)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [], "current_question_id": q1["id"]},  # no direction
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["next_question_id"] == q2["id"]


# --------------------------------------------------------------------------- #
# Multi-group survey
# --------------------------------------------------------------------------- #


# --------------------------------------------------------------------------- #
# Piping error graceful degradation
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_piping_error_in_title_returns_200_not_500(client: AsyncClient):
    """Survey with an invalid piping expression in a question title → 200 with fallback texts."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    # Title contains a broken piping expression: {invalid syntax!!!}
    # This should not cause a 500 — endpoint must degrade gracefully.
    q1 = await create_question(
        client, headers, survey_id, group_id, code="Q1", sort_order=1,
        title="Hello {!!!invalid!!!}",
    )

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [], "current_question_id": None},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    # piped_texts must still be present and contain an entry for Q1
    assert "piped_texts" in body
    assert "Q1_title" in body["piped_texts"]


@pytest.mark.asyncio
async def test_piping_expression_with_answer_substitution_returns_200(client: AsyncClient):
    """Valid piping expression in question title with matching answer → 200, substituted text."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(
        client, headers, survey_id, group_id, code="Q1", sort_order=1, title="Name?"
    )
    q2 = await create_question(
        client, headers, survey_id, group_id, code="Q2", sort_order=2,
        title="Hello {Q1}, how are you?",
    )

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [answer_input(q1["id"], "Alice")]},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["piped_texts"]["Q2_title"] == "Hello Alice, how are you?"


@pytest.mark.asyncio
async def test_navigation_across_groups(client: AsyncClient):
    """Forward navigation correctly moves from last question in group 1 to first in group 2."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group1_id = await create_group(client, headers, survey_id, title="Group 1", sort_order=1)
    group2_id = await create_group(client, headers, survey_id, title="Group 2", sort_order=2)
    q1 = await create_question(client, headers, survey_id, group1_id, code="Q1", sort_order=1)
    q2 = await create_question(client, headers, survey_id, group2_id, code="Q2", sort_order=1)

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [], "current_question_id": q1["id"], "direction": "forward"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["next_question_id"] == q2["id"]


# --------------------------------------------------------------------------- #
# ISS-210: 500 error when numeric field is cleared
# --------------------------------------------------------------------------- #


async def create_numeric_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    group_id: str,
    code: str,
    sort_order: int = 1,
    title: str = "A numeric question",
    relevance: str | None = None,
) -> dict:
    """Create a numeric question (question_type='number')."""
    payload: dict = {
        "question_type": "number",
        "title": title,
        "code": code,
        "sort_order": sort_order,
    }
    if relevance is not None:
        payload["relevance"] = relevance
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.asyncio
async def test_cleared_numeric_field_in_comparison_returns_200(client: AsyncClient):
    """ISS-210: {Q2} > 100 with Q2='' (cleared numeric field) must return 200, not 500."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    q1 = await create_numeric_question(
        client, headers, survey_id, group_id, code="Q2", sort_order=1,
        title="Enter a number",
    )
    q2 = await create_question(
        client, headers, survey_id, group_id, code="Q3", sort_order=2,
        title="Shown when Q2 > 100",
        relevance="{Q2} > 100",
    )

    # Submit with empty string value for the numeric question (simulates clearing the field)
    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [answer_input(q1["id"], "")]},
        headers=headers,
    )
    assert response.status_code == 200, (
        f"Expected 200 but got {response.status_code}: {response.text}"
    )
    body = response.json()
    # Q3 depends on {Q2} > 100; with Q2='', the expression should evaluate to False → Q3 hidden
    assert q2["id"] in body["hidden_questions"]
    assert q2["id"] not in body["visible_questions"]


@pytest.mark.asyncio
async def test_cleared_numeric_field_less_than_comparison_returns_200(client: AsyncClient):
    """ISS-210: {Q2} < 50 with Q2='' must return 200, not 500."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    q1 = await create_numeric_question(
        client, headers, survey_id, group_id, code="Q2", sort_order=1,
    )
    q2 = await create_question(
        client, headers, survey_id, group_id, code="Q3", sort_order=2,
        relevance="{Q2} < 50",
    )

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [answer_input(q1["id"], "")]},
        headers=headers,
    )
    assert response.status_code == 200, (
        f"Expected 200 but got {response.status_code}: {response.text}"
    )
    body = response.json()
    assert q2["id"] in body["hidden_questions"]


@pytest.mark.asyncio
async def test_numeric_field_with_valid_value_still_works(client: AsyncClient):
    """ISS-210: {Q2} > 100 with Q2=150 must still evaluate to True and show Q3."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    group_id = await create_group(client, headers, survey_id)

    q1 = await create_numeric_question(
        client, headers, survey_id, group_id, code="Q2", sort_order=1,
    )
    q2 = await create_question(
        client, headers, survey_id, group_id, code="Q3", sort_order=2,
        relevance="{Q2} > 100",
    )

    response = await client.post(
        resolve_url(survey_id),
        json={"answers": [answer_input(q1["id"], 150)]},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    # Q3 is visible because 150 > 100
    assert q2["id"] in body["visible_questions"]
    assert q2["id"] not in body["hidden_questions"]


# --------------------------------------------------------------------------- #
# Translation support: ?lang= query parameter
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_resolve_flow_without_lang_returns_default_texts(client: AsyncClient):
    """Without ?lang=, piped_texts contains the default-language question title."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers, title="Survey EN")
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(
        client, headers, survey_id, group_id, code="Q1", sort_order=1, title="Default Title"
    )

    # Add French translation for the question
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions/{q1['id']}/translations",
        json={"lang": "fr", "translations": {"title": "Titre Français"}},
        headers=headers,
    )

    response = await client.post(resolve_url(survey_id), json={"answers": []})
    assert response.status_code == 200
    body = response.json()
    assert body["piped_texts"]["Q1_title"] == "Default Title"


@pytest.mark.asyncio
async def test_resolve_flow_with_lang_returns_translated_question_title(client: AsyncClient):
    """?lang=fr makes piped_texts contain the French question title."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers, title="Survey EN")
    group_id = await create_group(client, headers, survey_id)
    q1 = await create_question(
        client, headers, survey_id, group_id, code="Q1", sort_order=1, title="Default Title"
    )

    # Add French translation for the question
    await client.patch(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions/{q1['id']}/translations",
        json={"lang": "fr", "translations": {"title": "Titre Français"}},
        headers=headers,
    )

    response = await client.post(resolve_url(survey_id) + "?lang=fr", json={"answers": []})
    assert response.status_code == 200
    body = response.json()
    assert body["piped_texts"]["Q1_title"] == "Titre Français"


@pytest.mark.asyncio
async def test_resolve_flow_with_lang_falls_back_when_no_translation(client: AsyncClient):
    """?lang=de falls back to default title when no German translation exists."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers, title="Survey EN")
    group_id = await create_group(client, headers, survey_id)
    await create_question(
        client, headers, survey_id, group_id, code="Q1", sort_order=1, title="Default Title"
    )

    # No German translations — should fall back to default
    response = await client.post(resolve_url(survey_id) + "?lang=de", json={"answers": []})
    assert response.status_code == 200
    body = response.json()
    assert body["piped_texts"]["Q1_title"] == "Default Title"
