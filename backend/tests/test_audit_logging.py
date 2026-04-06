"""Tests for the structured JSON audit logging system.

Covers:
- log_auth_event: login success, login failure
- log_survey_transition: draft->active, active->closed, closed->archived
- log_token_usage: participant token consumption

Two test strategies:
1. caplog-based: verifies JSON log entries are emitted with correct fields
   (requires propagate=True on the 'audit' logger)
2. mock/patch-based: verifies call-site integration (call count, arguments)
   at the module level where audit_service is imported
"""

import json
import logging
import uuid
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

VALID_USER = {
    "email": "audituser@example.com",
    "password": "auditpassword123",
    "name": "Audit User",
}


async def _register_and_login(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
    await client.post(REGISTER_URL, json={**VALID_USER, "email": email})
    resp = await client.post(LOGIN_URL, json={"email": email, "password": VALID_USER["password"]})
    assert resp.status_code == 200
    return resp.json()


async def _auth_headers(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
    tokens = await _register_and_login(client, email=email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


@pytest.fixture(autouse=True)
def ensure_audit_propagate():
    """Ensure the 'audit' logger has propagate=True so caplog captures entries."""
    audit_logger = logging.getLogger("audit")
    original = audit_logger.propagate
    audit_logger.propagate = True
    yield
    audit_logger.propagate = original


# ---------------------------------------------------------------------------
# audit_service unit tests (no HTTP)
# ---------------------------------------------------------------------------


def test_log_auth_event_success_emits_json(caplog):
    from app.services import audit_service

    with caplog.at_level(logging.INFO, logger="audit"):
        audit_service.log_auth_event(
            event_type="login_success",
            email="test@example.com",
            success=True,
            ip_address="127.0.0.1",
            user_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        )

    audit_records = [r for r in caplog.records if r.name == "audit"]
    assert len(audit_records) == 1
    entry = json.loads(audit_records[0].getMessage())
    assert entry["event_type"] == "login_success"
    assert entry["email"] == "test@example.com"
    assert entry["success"] is True
    assert entry["ip_address"] == "127.0.0.1"
    assert entry["user_id"] == "00000000-0000-0000-0000-000000000001"
    assert "timestamp" in entry


def test_log_auth_event_failure_emits_json(caplog):
    from app.services import audit_service

    with caplog.at_level(logging.INFO, logger="audit"):
        audit_service.log_auth_event(
            event_type="login_failure",
            email="bad@example.com",
            success=False,
            ip_address="10.0.0.1",
            user_id=None,
            detail="Invalid email or password",
        )

    audit_records = [r for r in caplog.records if r.name == "audit"]
    assert len(audit_records) == 1
    entry = json.loads(audit_records[0].getMessage())
    assert entry["event_type"] == "login_failure"
    assert entry["success"] is False
    assert entry["user_id"] is None
    assert entry["detail"] == "Invalid email or password"


def test_log_survey_transition_emits_json(caplog):
    from app.services import audit_service

    survey_id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    user_id = uuid.UUID("00000000-0000-0000-0000-000000000003")

    with caplog.at_level(logging.INFO, logger="audit"):
        audit_service.log_survey_transition(
            user_id=user_id,
            survey_id=survey_id,
            old_status="draft",
            new_status="active",
        )

    audit_records = [r for r in caplog.records if r.name == "audit"]
    assert len(audit_records) == 1
    entry = json.loads(audit_records[0].getMessage())
    assert entry["event_type"] == "survey_transition"
    assert entry["user_id"] == str(user_id)
    assert entry["survey_id"] == str(survey_id)
    assert entry["old_status"] == "draft"
    assert entry["new_status"] == "active"
    assert "timestamp" in entry


def test_log_token_usage_emits_json(caplog):
    from app.services import audit_service

    participant_id = uuid.UUID("00000000-0000-0000-0000-000000000004")
    survey_id = uuid.UUID("00000000-0000-0000-0000-000000000005")

    with caplog.at_level(logging.INFO, logger="audit"):
        audit_service.log_token_usage(
            participant_id=participant_id,
            survey_id=survey_id,
            token_prefix="abcd1234",
            uses_remaining=2,
        )

    audit_records = [r for r in caplog.records if r.name == "audit"]
    assert len(audit_records) == 1
    entry = json.loads(audit_records[0].getMessage())
    assert entry["event_type"] == "token_usage"
    assert entry["participant_id"] == str(participant_id)
    assert entry["survey_id"] == str(survey_id)
    assert entry["token_prefix"] == "abcd1234"
    assert entry["uses_remaining"] == 2


def test_log_token_usage_unlimited_emits_none(caplog):
    from app.services import audit_service

    with caplog.at_level(logging.INFO, logger="audit"):
        audit_service.log_token_usage(
            participant_id=uuid.uuid4(),
            survey_id=uuid.uuid4(),
            token_prefix="tok00000",
            uses_remaining=None,
        )

    audit_records = [r for r in caplog.records if r.name == "audit"]
    entry = json.loads(audit_records[0].getMessage())
    assert entry["uses_remaining"] is None


# ---------------------------------------------------------------------------
# Integration: login success audit via HTTP
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_success_emits_audit_log(client: AsyncClient, caplog):
    await client.post(REGISTER_URL, json=VALID_USER)

    with caplog.at_level(logging.INFO, logger="audit"):
        resp = await client.post(
            LOGIN_URL,
            json={"email": VALID_USER["email"], "password": VALID_USER["password"]},
        )

    assert resp.status_code == 200
    audit_records = [r for r in caplog.records if r.name == "audit"]
    assert len(audit_records) >= 1
    entry = json.loads(audit_records[-1].getMessage())
    assert entry["event_type"] == "login_success"
    assert entry["success"] is True
    assert entry["email"] == VALID_USER["email"]
    assert entry["user_id"] is not None


@pytest.mark.asyncio
async def test_login_failure_emits_audit_log(client: AsyncClient, caplog):
    await client.post(REGISTER_URL, json=VALID_USER)

    with caplog.at_level(logging.INFO, logger="audit"):
        resp = await client.post(
            LOGIN_URL,
            json={"email": VALID_USER["email"], "password": "wrongpassword"},
        )

    assert resp.status_code == 401
    audit_records = [r for r in caplog.records if r.name == "audit"]
    assert len(audit_records) >= 1
    entry = json.loads(audit_records[-1].getMessage())
    assert entry["event_type"] == "login_failure"
    assert entry["success"] is False
    assert entry["email"] == VALID_USER["email"]


@pytest.mark.asyncio
async def test_login_unknown_user_emits_audit_failure(client: AsyncClient, caplog):
    with caplog.at_level(logging.INFO, logger="audit"):
        resp = await client.post(
            LOGIN_URL,
            json={"email": "nobody@example.com", "password": "anything"},
        )

    assert resp.status_code == 401
    audit_records = [r for r in caplog.records if r.name == "audit"]
    assert len(audit_records) >= 1
    entry = json.loads(audit_records[-1].getMessage())
    assert entry["event_type"] == "login_failure"
    assert entry["success"] is False
    assert entry["user_id"] is None


# ---------------------------------------------------------------------------
# Integration: survey transition audit via mock patching
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_activate_survey_calls_log_survey_transition(client: AsyncClient):
    headers = await _auth_headers(client)

    # Create a survey
    create_resp = await client.post(SURVEYS_URL, json={"title": "Audit Survey"}, headers=headers)
    assert create_resp.status_code == 201
    survey_id = create_resp.json()["id"]

    # Add a question group + question so activation passes validation
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1", "sort_order": 1},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    question_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"code": "Q1", "title": "Question 1", "question_type": "short_text", "sort_order": 1},
        headers=headers,
    )
    assert question_resp.status_code == 201

    with patch("app.services.survey_service.audit_service") as mock_audit:
        resp = await client.post(
            f"{SURVEYS_URL}/{survey_id}/activate", headers=headers
        )
        assert resp.status_code == 200
        mock_audit.log_survey_transition.assert_called_once()
        call_kwargs = mock_audit.log_survey_transition.call_args
        assert call_kwargs.kwargs.get("old_status") == "draft" or call_kwargs.args[2] == "draft"
        assert call_kwargs.kwargs.get("new_status") == "active" or call_kwargs.args[3] == "active"


@pytest.mark.asyncio
async def test_close_survey_calls_log_survey_transition(client: AsyncClient):
    headers = await _auth_headers(client)

    create_resp = await client.post(SURVEYS_URL, json={"title": "Close Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1", "sort_order": 1},
        headers=headers,
    )
    group_id = group_resp.json()["id"]
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"code": "Q1", "title": "Question 1", "question_type": "short_text", "sort_order": 1},
        headers=headers,
    )
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)

    with patch("app.services.survey_service.audit_service") as mock_audit:
        resp = await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)
        assert resp.status_code == 200
        mock_audit.log_survey_transition.assert_called_once()
        call_kwargs = mock_audit.log_survey_transition.call_args
        assert call_kwargs.kwargs.get("old_status") == "active" or call_kwargs.args[2] == "active"
        assert call_kwargs.kwargs.get("new_status") == "closed" or call_kwargs.args[3] == "closed"


@pytest.mark.asyncio
async def test_archive_survey_calls_log_survey_transition(client: AsyncClient):
    headers = await _auth_headers(client)

    create_resp = await client.post(SURVEYS_URL, json={"title": "Archive Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1", "sort_order": 1},
        headers=headers,
    )
    group_id = group_resp.json()["id"]
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"code": "Q1", "title": "Question 1", "question_type": "short_text", "sort_order": 1},
        headers=headers,
    )
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)

    with patch("app.services.survey_service.audit_service") as mock_audit:
        resp = await client.post(f"{SURVEYS_URL}/{survey_id}/archive", headers=headers)
        assert resp.status_code == 200
        mock_audit.log_survey_transition.assert_called_once()
        call_kwargs = mock_audit.log_survey_transition.call_args
        assert call_kwargs.kwargs.get("old_status") == "closed" or call_kwargs.args[2] == "closed"
        assert call_kwargs.kwargs.get("new_status") == "archived" or call_kwargs.args[3] == "archived"


# ---------------------------------------------------------------------------
# Integration: survey transition audit via caplog
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_activate_survey_emits_transition_log(client: AsyncClient, caplog):
    headers = await _auth_headers(client)

    create_resp = await client.post(SURVEYS_URL, json={"title": "Caplog Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1", "sort_order": 1},
        headers=headers,
    )
    group_id = group_resp.json()["id"]
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"code": "Q1", "title": "Q1 text", "question_type": "short_text", "sort_order": 1},
        headers=headers,
    )

    with caplog.at_level(logging.INFO, logger="audit"):
        resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)

    assert resp.status_code == 200
    audit_records = [r for r in caplog.records if r.name == "audit"]
    transition_entries = [
        json.loads(r.getMessage())
        for r in audit_records
        if json.loads(r.getMessage()).get("event_type") == "survey_transition"
    ]
    assert len(transition_entries) >= 1
    entry = transition_entries[-1]
    assert entry["old_status"] == "draft"
    assert entry["new_status"] == "active"
    assert entry["survey_id"] == survey_id


# ---------------------------------------------------------------------------
# Integration: token usage audit via mock patching
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_token_usage_calls_log_token_usage(client: AsyncClient):
    """Verify log_token_usage is called when a participant token is consumed."""
    headers = await _auth_headers(client)

    # Create and activate survey with a question
    create_resp = await client.post(SURVEYS_URL, json={"title": "Token Survey"}, headers=headers)
    survey_id = create_resp.json()["id"]

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1", "sort_order": 1},
        headers=headers,
    )
    group_id = group_resp.json()["id"]
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"code": "Q1", "title": "Question 1", "question_type": "short_text", "sort_order": 1},
        headers=headers,
    )
    await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)

    # Create a participant with uses_remaining (token is auto-generated by server)
    participant_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants",
        json={"uses_remaining": 3},
        headers=headers,
    )
    assert participant_resp.status_code == 201
    # Token is returned only at creation time
    participant_token = participant_resp.json()["token"]

    with patch("app.services.response_service.audit_service") as mock_audit:
        resp = await client.post(
            f"/api/v1/surveys/{survey_id}/responses",
            json={"participant_token": participant_token},
        )
        assert resp.status_code == 201
        mock_audit.log_token_usage.assert_called_once()
        call_kwargs = mock_audit.log_token_usage.call_args
        # Verify token_prefix is just the first 8 chars (never full token)
        prefix = call_kwargs.kwargs.get("token_prefix") or call_kwargs.args[2]
        assert prefix == participant_token[:8]
        # uses_remaining should be 2 (3 - 1)
        remaining = call_kwargs.kwargs.get("uses_remaining")
        if remaining is None and len(call_kwargs.args) > 3:
            remaining = call_kwargs.args[3]
        assert remaining == 2
