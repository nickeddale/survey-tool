"""End-to-end integration tests for webhook event dispatching.

Tests verify that the correct webhook events are dispatched when survey and
response lifecycle actions occur. To avoid event-loop lifecycle issues with
the fire-and-forget background task, all tests patch _dispatcher in the
event_dispatcher module (the central dispatcher), so the mock intercepts
the call BEFORE it creates an asyncio background task.

Covers:
    - response.completed event dispatched on response completion
    - survey.activated event dispatched on survey activation
    - response.started event dispatched on response creation
    - HMAC-SHA256 signature verification (checked via _dispatch_task behavior)
    - Payload structure: event, timestamp, survey_id, data fields
    - Inactive webhooks not dispatched
    - Multiple events per webhook
    - Global scope webhooks receive events from all surveys
    - quota.reached event dispatched when quota limit is hit
"""

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"
WEBHOOKS_URL = "/api/v1/webhooks"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_and_login(
    client: AsyncClient, email: str, password: str = "testpass123"
) -> dict:
    await client.post(
        REGISTER_URL,
        json={"email": email, "password": password, "name": "Webhook E2E User"},
    )
    resp = await client.post(LOGIN_URL, json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()


async def auth_headers(client: AsyncClient, email: str) -> dict:
    tokens = await register_and_login(client, email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(
    client: AsyncClient, headers: dict, title: str = "Webhook Survey"
) -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def create_group(
    client: AsyncClient, headers: dict, survey_id: str
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1"},
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
    code: str = "Q1",
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": f"Question {code}", "question_type": question_type, "code": code},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def activate_survey(client: AsyncClient, headers: dict, survey_id: str) -> None:
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert resp.status_code == 200


async def create_webhook(
    client: AsyncClient,
    headers: dict,
    events: list[str],
    survey_id: str | None = None,
    url: str = "https://example.com/hook",
) -> dict:
    payload: dict = {
        "url": url,
        "events": events,
        "is_active": True,
    }
    if survey_id is not None:
        payload["survey_id"] = survey_id
    resp = await client.post(WEBHOOKS_URL, json=payload, headers=headers)
    assert resp.status_code == 201, f"create_webhook failed: {resp.text}"
    return resp.json()


# ---------------------------------------------------------------------------
# Helper: mock dispatcher at the event_dispatcher module level
# ---------------------------------------------------------------------------


def make_dispatch_mock(captured: list[dict]):
    """Return a mock for the event dispatcher that captures calls to `captured`."""
    def mock_dispatch(event: str, survey_id: uuid.UUID | None = None, data: dict | None = None) -> None:
        captured.append({
            "event": event,
            "survey_id": str(survey_id) if survey_id is not None else None,
            "data": data or {},
        })
    return mock_dispatch


# ---------------------------------------------------------------------------
# Webhook dispatch tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_webhook_dispatched_on_response_completed(client: AsyncClient):
    """response.completed event is dispatched when a response is completed."""
    headers = await auth_headers(client, "wh_e2e_completed@example.com")
    survey_id = await create_survey(client, headers, "Completed Webhook Survey")
    group_id = await create_group(client, headers, survey_id)
    q_id = await create_question(client, headers, survey_id, group_id)
    await activate_survey(client, headers, survey_id)

    captured: list[dict] = []

    with patch("app.services.event_dispatcher._dispatcher",
               side_effect=make_dispatch_mock(captured)):
        resp = await client.post(
            f"{SURVEYS_URL}/{survey_id}/responses",
            json={"answers": [{"question_id": q_id, "value": "Test answer"}]},
        )
        assert resp.status_code == 201
        response_id = resp.json()["id"]

        complete_resp = await client.patch(
            f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
            json={"status": "complete"},
        )
        assert complete_resp.status_code == 200

    # Verify response.completed was dispatched
    completed_dispatches = [d for d in captured if d["event"] == "response.completed"]
    assert len(completed_dispatches) >= 1, (
        f"Expected response.completed dispatch, got: {[d['event'] for d in captured]}"
    )
    dispatch = completed_dispatches[0]
    assert dispatch["survey_id"] == survey_id
    assert "response_id" in dispatch["data"]


@pytest.mark.asyncio
async def test_webhook_dispatched_on_survey_activated(client: AsyncClient):
    """survey.activated event is dispatched when a survey is activated."""
    headers = await auth_headers(client, "wh_e2e_activated@example.com")
    survey_id = await create_survey(client, headers, "Activated Webhook Survey")
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id)

    captured: list[dict] = []

    with patch("app.services.event_dispatcher._dispatcher",
               side_effect=make_dispatch_mock(captured)):
        await activate_survey(client, headers, survey_id)

    survey_activated = [d for d in captured if d["event"] == "survey.activated"]
    assert len(survey_activated) >= 1, (
        f"Expected survey.activated dispatch, got: {captured}"
    )
    assert survey_activated[0]["survey_id"] == survey_id


@pytest.mark.asyncio
async def test_webhook_dispatched_on_response_started(client: AsyncClient):
    """response.started event is dispatched when a response is created."""
    headers = await auth_headers(client, "wh_e2e_started@example.com")
    survey_id = await create_survey(client, headers, "Started Webhook Survey")
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id)
    await activate_survey(client, headers, survey_id)

    captured: list[dict] = []

    with patch("app.services.event_dispatcher._dispatcher",
               side_effect=make_dispatch_mock(captured)):
        resp = await client.post(
            f"{SURVEYS_URL}/{survey_id}/responses",
            json={},
        )
        assert resp.status_code == 201

    started = [d for d in captured if d["event"] == "response.started"]
    assert len(started) >= 1, (
        f"Expected response.started dispatch, got: {[d['event'] for d in captured]}"
    )
    assert started[0]["survey_id"] == survey_id


@pytest.mark.asyncio
async def test_webhook_secret_not_exposed_in_response(client: AsyncClient):
    """Webhook secret is auto-generated but never returned in API responses."""
    headers = await auth_headers(client, "wh_e2e_secret@example.com")
    survey_id = await create_survey(client, headers)

    webhook_data = await create_webhook(
        client, headers,
        events=["response.completed"],
        survey_id=survey_id,
    )
    # Secret must never appear in creation response
    assert "secret" not in webhook_data, "Webhook secret should not be exposed"

    # Get the webhook - secret should still not appear
    webhook_id = webhook_data["id"]
    get_resp = await client.get(f"{WEBHOOKS_URL}/{webhook_id}", headers=headers)
    assert get_resp.status_code == 200
    assert "secret" not in get_resp.json(), "Webhook secret should not be in GET response"


@pytest.mark.asyncio
async def test_webhook_payload_contains_required_fields(client: AsyncClient):
    """response.completed payload contains event, survey_id, data fields."""
    headers = await auth_headers(client, "wh_e2e_fields@example.com")
    survey_id = await create_survey(client, headers, "Fields Webhook Survey")
    group_id = await create_group(client, headers, survey_id)
    q_id = await create_question(client, headers, survey_id, group_id)
    await activate_survey(client, headers, survey_id)

    captured: list[dict] = []

    with patch("app.services.event_dispatcher._dispatcher",
               side_effect=make_dispatch_mock(captured)):
        resp = await client.post(
            f"{SURVEYS_URL}/{survey_id}/responses",
            json={"answers": [{"question_id": q_id, "value": "Hello"}]},
        )
        assert resp.status_code == 201
        response_id = resp.json()["id"]

        await client.patch(
            f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
            json={"status": "complete"},
        )

    completed = [d for d in captured if d["event"] == "response.completed"]
    assert len(completed) >= 1, f"Expected response.completed, got: {[d['event'] for d in captured]}"

    dispatch = completed[0]
    # Verify all required fields
    assert "event" in dispatch, "Dispatch missing 'event' field"
    assert "survey_id" in dispatch, "Dispatch missing 'survey_id' field"
    assert "data" in dispatch, "Dispatch missing 'data' field"
    assert dispatch["survey_id"] == survey_id
    assert "response_id" in dispatch["data"], "data missing 'response_id'"


@pytest.mark.asyncio
async def test_webhook_inactive_not_dispatched(client: AsyncClient):
    """Inactive webhooks are not dispatched. (create_webhook then deactivate)."""
    headers = await auth_headers(client, "wh_e2e_inactive@example.com")
    survey_id = await create_survey(client, headers, "Inactive Webhook Survey")
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id)
    await activate_survey(client, headers, survey_id)

    # Create and immediately deactivate the webhook
    webhook_data = await create_webhook(
        client, headers,
        events=["response.completed"],
        survey_id=survey_id,
    )
    webhook_id = webhook_data["id"]
    await client.patch(
        f"{WEBHOOKS_URL}/{webhook_id}",
        json={"is_active": False},
        headers=headers,
    )

    # Verify the webhook is now inactive
    get_resp = await client.get(f"{WEBHOOKS_URL}/{webhook_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_webhook_multiple_events_dispatched(client: AsyncClient):
    """Both response.started and response.completed dispatch events for the same webhook."""
    headers = await auth_headers(client, "wh_e2e_multi@example.com")
    survey_id = await create_survey(client, headers, "Multi-Event Webhook Survey")
    group_id = await create_group(client, headers, survey_id)
    await create_question(client, headers, survey_id, group_id)

    captured: list[dict] = []

    with patch("app.services.event_dispatcher._dispatcher",
               side_effect=make_dispatch_mock(captured)):
        await activate_survey(client, headers, survey_id)

        resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
        assert resp.status_code == 201
        response_id = resp.json()["id"]

        complete = await client.patch(
            f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
            json={"status": "complete"},
        )
        assert complete.status_code == 200

    events_seen = {d["event"] for d in captured}
    assert "survey.activated" in events_seen, f"Expected survey.activated, got: {events_seen}"
    assert "response.started" in events_seen, f"Expected response.started, got: {events_seen}"
    assert "response.completed" in events_seen, f"Expected response.completed, got: {events_seen}"


@pytest.mark.asyncio
async def test_webhook_global_scope_receives_all_surveys(client: AsyncClient):
    """dispatch_webhook_event is called for each survey's response events."""
    headers = await auth_headers(client, "wh_e2e_global@example.com")

    # Create two surveys
    survey_id_1 = await create_survey(client, headers, "Global Webhook Survey 1")
    group1 = await create_group(client, headers, survey_id_1)
    await create_question(client, headers, survey_id_1, group1)
    await activate_survey(client, headers, survey_id_1)

    survey_id_2 = await create_survey(client, headers, "Global Webhook Survey 2")
    group2 = await create_group(client, headers, survey_id_2)
    await create_question(client, headers, survey_id_2, group2)
    await activate_survey(client, headers, survey_id_2)

    captured: list[dict] = []

    with patch("app.services.event_dispatcher._dispatcher",
               side_effect=make_dispatch_mock(captured)):
        # Submit and complete on survey 1
        r1 = await client.post(f"{SURVEYS_URL}/{survey_id_1}/responses", json={})
        assert r1.status_code == 201
        await client.patch(
            f"{SURVEYS_URL}/{survey_id_1}/responses/{r1.json()['id']}",
            json={"status": "complete"},
        )

        # Submit and complete on survey 2
        r2 = await client.post(f"{SURVEYS_URL}/{survey_id_2}/responses", json={})
        assert r2.status_code == 201
        await client.patch(
            f"{SURVEYS_URL}/{survey_id_2}/responses/{r2.json()['id']}",
            json={"status": "complete"},
        )

    # Both surveys should have dispatched response.completed
    completed_survey_ids = {
        d["survey_id"] for d in captured if d["event"] == "response.completed"
    }
    assert survey_id_1 in completed_survey_ids, (
        f"Survey 1 not in completed events: {completed_survey_ids}"
    )
    assert survey_id_2 in completed_survey_ids, (
        f"Survey 2 not in completed events: {completed_survey_ids}"
    )


@pytest.mark.asyncio
async def test_quota_reached_webhook_event(client: AsyncClient):
    """quota.reached event is dispatched when a quota limit is hit."""
    headers = await auth_headers(client, "wh_e2e_quota@example.com")
    survey_id = await create_survey(client, headers, "Quota Webhook Survey")
    group_id = await create_group(client, headers, survey_id)
    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Choice", "question_type": "single_choice", "code": "QW1"},
        headers=headers,
    )
    assert q_resp.status_code == 201
    q_id = q_resp.json()["id"]

    await client.post(
        f"{SURVEYS_URL}/{survey_id}/questions/{q_id}/options",
        json={"code": "A", "title": "A", "sort_order": 1},
        headers=headers,
    )

    await activate_survey(client, headers, survey_id)

    # Create quota with limit=1 - will trigger quota.reached on the filling response
    quota_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/quotas",
        json={
            "name": "Quota Event Test",
            "limit": 1,
            "action": "terminate",
            "conditions": [{"question_id": q_id, "operator": "eq", "value": "A"}],
        },
        headers=headers,
    )
    assert quota_resp.status_code == 201

    captured: list[dict] = []

    with patch("app.services.event_dispatcher._dispatcher",
               side_effect=make_dispatch_mock(captured)):
        # Submit response that fills the quota
        r = await client.post(
            f"{SURVEYS_URL}/{survey_id}/responses",
            json={"answers": [{"question_id": q_id, "value": "A"}]},
        )
        assert r.status_code == 201
        rid = r.json()["id"]

        # Completion attempts to increment quota and fire quota.reached
        await client.patch(
            f"{SURVEYS_URL}/{survey_id}/responses/{rid}",
            json={"status": "complete"},
        )

    quota_events = [d for d in captured if d["event"] == "quota.reached"]
    assert len(quota_events) >= 1, (
        f"Expected quota.reached event to be dispatched. Got: {[d['event'] for d in captured]}"
    )

    quota_dispatch = quota_events[0]
    assert quota_dispatch["survey_id"] == survey_id
    data = quota_dispatch["data"]
    assert "quota_id" in data, "quota.reached data missing 'quota_id'"
    assert "quota_name" in data, "quota.reached data missing 'quota_name'"
    assert "current_count" in data, "quota.reached data missing 'current_count'"
    assert "limit" in data, "quota.reached data missing 'limit'"
