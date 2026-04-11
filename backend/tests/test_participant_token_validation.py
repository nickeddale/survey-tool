"""Tests for participant token validation during response submission (ISS-097)."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant import Participant
from app.models.survey import Survey
from app.models.user import User

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_and_login(client: AsyncClient, email: str) -> dict:
    await client.post(
        REGISTER_URL,
        json={"email": email, "password": "securepassword123", "name": "Test User"},
    )
    resp = await client.post(
        LOGIN_URL, json={"email": email, "password": "securepassword123"}
    )
    assert resp.status_code == 200
    return resp.json()


async def auth_headers(client: AsyncClient, email: str) -> dict:
    tokens = await register_and_login(client, email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_active_survey(client: AsyncClient, email: str) -> tuple[str, str, dict]:
    """Create a user, survey, add a question group + question, activate; return (survey_id, question_id, headers)."""
    headers = await auth_headers(client, email)

    # Create survey
    resp = await client.post(SURVEYS_URL, json={"title": "Participant Test Survey"}, headers=headers)
    assert resp.status_code == 201
    survey_id = resp.json()["id"]

    # Add group
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1"},
        headers=headers,
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]

    # Add question
    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Question 1", "question_type": "short_text"},
        headers=headers,
    )
    assert q_resp.status_code == 201
    question_id = q_resp.json()["id"]

    # Activate
    act_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert act_resp.status_code == 200

    return survey_id, question_id, headers


async def create_participant(
    session: AsyncSession,
    survey_id: str,
    token: str = "valid-token-123",
    uses_remaining: int | None = None,
    valid_from: datetime | None = None,
    valid_until: datetime | None = None,
    completed: bool = False,
    attributes: dict | None = None,
) -> Participant:
    participant = Participant(
        survey_id=uuid.UUID(survey_id),
        token=token,
        uses_remaining=uses_remaining,
        valid_from=valid_from,
        valid_until=valid_until,
        completed=completed,
        attributes=attributes or {},
    )
    session.add(participant)
    await session.flush()
    await session.refresh(participant)
    return participant


# ---------------------------------------------------------------------------
# Anonymous response (survey without participants)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_anonymous_response_allowed_on_survey_without_participants(client: AsyncClient):
    """Survey with no participants allows anonymous response submission."""
    survey_id, _, _ = await create_active_survey(client, "anon1@example.com")

    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert resp.status_code == 201
    body = resp.json()
    assert body["participant_id"] is None


@pytest.mark.asyncio
async def test_anonymous_response_with_token_on_survey_without_participants(client: AsyncClient):
    """Providing a token when survey has no participants is silently ignored (treated as anonymous)."""
    survey_id, _, _ = await create_active_survey(client, "anon2@example.com")

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "some-token"},
    )
    # Should succeed since no participants exist in the survey
    assert resp.status_code == 201
    body = resp.json()
    assert body["participant_id"] is None


# ---------------------------------------------------------------------------
# Valid token — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_creates_response_and_links_participant(
    client: AsyncClient, session: AsyncSession
):
    """Valid token on participant survey creates response linked to participant."""
    survey_id, _, _ = await create_active_survey(client, "valid1@example.com")

    participant = await create_participant(
        session, survey_id, token="good-token", uses_remaining=5
    )
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "good-token"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["participant_id"] == str(participant.id)


@pytest.mark.asyncio
async def test_valid_token_decrements_uses_remaining(
    client: AsyncClient, session: AsyncSession
):
    """Submitting a valid token decrements uses_remaining by 1."""
    survey_id, _, _ = await create_active_survey(client, "decrement1@example.com")
    await create_participant(session, survey_id, token="decrement-token", uses_remaining=3)
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "decrement-token"},
    )
    assert resp.status_code == 201

    # Verify uses_remaining was decremented
    result = await session.execute(
        select(Participant).where(Participant.token == "decrement-token")
    )
    updated_participant = result.scalar_one()
    assert updated_participant.uses_remaining == 2


@pytest.mark.asyncio
async def test_valid_token_unlimited_uses(client: AsyncClient, session: AsyncSession):
    """Participant with uses_remaining=None (unlimited) can always respond."""
    survey_id, _, _ = await create_active_survey(client, "unlimited1@example.com")
    await create_participant(session, survey_id, token="unlimited-token", uses_remaining=None)
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "unlimited-token"},
    )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Missing / invalid token errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_token_on_participant_survey_returns_403(
    client: AsyncClient, session: AsyncSession
):
    """Missing token when survey has participants returns 403 FORBIDDEN."""
    survey_id, _, _ = await create_active_survey(client, "missing1@example.com")
    await create_participant(session, survey_id, token="some-token")
    await session.commit()

    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_invalid_token_returns_403(client: AsyncClient, session: AsyncSession):
    """Non-existent token returns 403 FORBIDDEN."""
    survey_id, _, _ = await create_active_survey(client, "invalid1@example.com")
    await create_participant(session, survey_id, token="real-token")
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "wrong-token"},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"


# ---------------------------------------------------------------------------
# Token time window errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expired_token_returns_403(client: AsyncClient, session: AsyncSession):
    """Token with valid_until in the past returns 403 FORBIDDEN."""
    survey_id, _, _ = await create_active_survey(client, "expired1@example.com")
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    await create_participant(
        session, survey_id, token="expired-token", valid_until=past
    )
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "expired-token"},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_token_not_yet_valid_returns_403(client: AsyncClient, session: AsyncSession):
    """Token with valid_from in the future returns 403 FORBIDDEN."""
    survey_id, _, _ = await create_active_survey(client, "future1@example.com")
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    await create_participant(
        session, survey_id, token="future-token", valid_from=future
    )
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "future-token"},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_token_within_valid_window_succeeds(client: AsyncClient, session: AsyncSession):
    """Token with valid_from in past and valid_until in future succeeds."""
    survey_id, _, _ = await create_active_survey(client, "window1@example.com")
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    await create_participant(
        session, survey_id, token="windowed-token", valid_from=past, valid_until=future
    )
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "windowed-token"},
    )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# uses_remaining exhausted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_uses_remaining_zero_returns_403(client: AsyncClient, session: AsyncSession):
    """Participant with uses_remaining=0 returns 403 FORBIDDEN."""
    survey_id, _, _ = await create_active_survey(client, "exhausted1@example.com")
    await create_participant(session, survey_id, token="exhausted-token", uses_remaining=0)
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "exhausted-token"},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"


# ---------------------------------------------------------------------------
# completed=True errors
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_completed_participant_returns_403(client: AsyncClient, session: AsyncSession):
    """Participant with completed=True returns 403 FORBIDDEN."""
    survey_id, _, _ = await create_active_survey(client, "done1@example.com")
    await create_participant(
        session, survey_id, token="done-token", completed=True
    )
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "done-token"},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"


# ---------------------------------------------------------------------------
# Completing a response sets participant.completed = True
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_completing_response_sets_participant_completed(
    client: AsyncClient, session: AsyncSession
):
    """Completing a response marks the linked participant as completed=True."""
    survey_id, _, _ = await create_active_survey(client, "complete1@example.com")
    participant = await create_participant(
        session, survey_id, token="complete-token", uses_remaining=1
    )
    await session.commit()

    # Create the response
    create_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "complete-token"},
    )
    assert create_resp.status_code == 201
    response_id = create_resp.json()["id"]

    # Complete the response
    patch_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
        json={"status": "complete"},
    )
    assert patch_resp.status_code == 200

    # Verify participant.completed is now True
    await session.refresh(participant)
    assert participant.completed is True


# ---------------------------------------------------------------------------
# RESPONDENT attribute piping
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_respondent_attributes_available_via_participant(
    client: AsyncClient, session: AsyncSession
):
    """Participant attributes are linked to the response via participant_id."""
    survey_id, _, _ = await create_active_survey(client, "pipe1@example.com")
    participant = await create_participant(
        session,
        survey_id,
        token="pipe-token",
        attributes={"language": "en", "region": "US"},
    )
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "pipe-token"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["participant_id"] == str(participant.id)


# ---------------------------------------------------------------------------
# Security: participant_token must not appear in response body
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_participant_token_not_in_response_body(
    client: AsyncClient, session: AsyncSession
):
    """The participant_token must never be echoed back in the response body."""
    survey_id, _, _ = await create_active_survey(client, "security1@example.com")
    await create_participant(
        session, survey_id, token="secret-token-xyz", uses_remaining=5
    )
    await session.commit()

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"participant_token": "secret-token-xyz"},
    )
    assert resp.status_code == 201
    body_text = resp.text
    assert "secret-token-xyz" not in body_text
    assert "participant_token" not in body_text


# --------------------------------------------------------------------------- #
# API key scope enforcement on participant write endpoints (SEC-ISS-217)
# --------------------------------------------------------------------------- #

KEYS_URL = "/api/v1/auth/keys"


async def _create_api_key(client: AsyncClient, headers: dict, scopes: list | None) -> str:
    payload: dict = {"name": "Test Key"}
    if scopes is not None:
        payload["scopes"] = scopes
    resp = await client.post(KEYS_URL, json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()["key"]


async def _jwt_headers(client: AsyncClient, email: str) -> dict:
    await client.post(
        REGISTER_URL,
        json={"email": email, "password": "securepassword123", "name": "Test User"},
    )
    resp = await client.post(LOGIN_URL, json={"email": email, "password": "securepassword123"})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _create_survey(client: AsyncClient, headers: dict) -> str:
    resp = await client.post(SURVEYS_URL, json={"title": "Part Scope Test"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_create_participant_jwt_auth_returns_201(client: AsyncClient):
    """JWT-authenticated requests bypass scope enforcement."""
    headers = await _jwt_headers(client, "scope_part_jwt@example.com")
    survey_id = await _create_survey(client, headers)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants",
        json={"email": "p@example.com"},
        headers=headers,
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_participant_api_key_with_scope_returns_201(client: AsyncClient):
    """API key with surveys:write scope can create participants."""
    headers = await _jwt_headers(client, "scope_part_write@example.com")
    survey_id = await _create_survey(client, headers)
    api_key = await _create_api_key(client, headers, scopes=["surveys:write"])

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants",
        json={"email": "p@example.com"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_participant_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without surveys:write scope cannot create participants."""
    headers = await _jwt_headers(client, "scope_part_noscp@example.com")
    survey_id = await _create_survey(client, headers)
    api_key = await _create_api_key(client, headers, scopes=["surveys:read"])

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants",
        json={"email": "p@example.com"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"
    assert "message" in body["detail"]


@pytest.mark.asyncio
async def test_delete_participant_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without surveys:write scope cannot delete participants."""
    headers = await _jwt_headers(client, "scope_part_del@example.com")
    survey_id = await _create_survey(client, headers)

    create_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants",
        json={"email": "todelete@example.com"},
        headers=headers,
    )
    participant_id = create_resp.json()["id"]

    api_key = await _create_api_key(client, headers, scopes=[])
    resp = await client.delete(
        f"{SURVEYS_URL}/{survey_id}/participants/{participant_id}",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
