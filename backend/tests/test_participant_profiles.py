"""Tests for participant profile CRUD, batch create, list filters,
profile detail with history, assignment via from-profiles endpoint,
auto-populate from response submission, and delete SET NULL behavior.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant import Participant
from app.models.participant_profile import ParticipantProfile
from app.models.survey import Survey

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"
PROFILES_URL = "/api/v1/participant-profiles"

VALID_USER = {
    "email": "profileuser@example.com",
    "password": "securepassword123",
    "name": "Profile User",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_and_login(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
    await client.post(REGISTER_URL, json={**VALID_USER, "email": email})
    resp = await client.post(
        LOGIN_URL, json={"email": email, "password": VALID_USER["password"]}
    )
    assert resp.status_code == 200
    return resp.json()


async def auth_headers(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
    tokens = await register_and_login(client, email=email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict, title: str = "Test Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def activate_survey(client: AsyncClient, headers: dict, survey_id: str) -> None:
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert resp.status_code == 200


async def add_question(client: AsyncClient, headers: dict, survey_id: str) -> str:
    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups", json={"title": "G1"}, headers=headers
    )
    assert group_resp.status_code == 201
    group_id = group_resp.json()["id"]
    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text"},
        headers=headers,
    )
    assert q_resp.status_code == 201
    return q_resp.json()["id"]


# ---------------------------------------------------------------------------
# Profile CRUD Tests
# ---------------------------------------------------------------------------


async def test_create_profile_success_returns_201(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.post(
        PROFILES_URL,
        json={"email": "alice@example.com", "first_name": "Alice"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "alice@example.com"
    assert data["first_name"] == "Alice"
    assert "id" in data


async def test_create_profile_duplicate_email_returns_409(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(
        PROFILES_URL, json={"email": "dup@example.com"}, headers=headers
    )
    resp = await client.post(
        PROFILES_URL, json={"email": "dup@example.com"}, headers=headers
    )
    assert resp.status_code == 409


async def test_create_profile_unauthenticated_returns_401(client: AsyncClient):
    resp = await client.post(PROFILES_URL, json={"email": "x@example.com"})
    assert resp.status_code == 401


async def test_batch_create_profiles_success_returns_201(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.post(
        f"{PROFILES_URL}/batch",
        json={
            "items": [
                {"email": "batch1@example.com"},
                {"email": "batch2@example.com"},
            ]
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data) == 2
    emails = {d["email"] for d in data}
    assert emails == {"batch1@example.com", "batch2@example.com"}


async def test_batch_create_profiles_duplicate_email_returns_409(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(PROFILES_URL, json={"email": "existing@example.com"}, headers=headers)
    resp = await client.post(
        f"{PROFILES_URL}/batch",
        json={"items": [{"email": "existing@example.com"}]},
        headers=headers,
    )
    assert resp.status_code == 409


async def test_list_profiles_returns_200(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(PROFILES_URL, json={"email": "list1@example.com"}, headers=headers)
    await client.post(PROFILES_URL, json={"email": "list2@example.com"}, headers=headers)
    resp = await client.get(PROFILES_URL, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data["total"] >= 2


async def test_list_profiles_filter_by_email(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(PROFILES_URL, json={"email": "filter_me@example.com"}, headers=headers)
    await client.post(PROFILES_URL, json={"email": "other_filter@example.com"}, headers=headers)
    resp = await client.get(PROFILES_URL, params={"email": "filter_me"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert all("filter_me" in item["email"] for item in data["items"])


async def test_list_profiles_filter_by_name(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(
        PROFILES_URL,
        json={"email": "namefilt@example.com", "first_name": "Uniquename"},
        headers=headers,
    )
    resp = await client.get(PROFILES_URL, params={"name": "Uniquename"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) >= 1
    assert any(item["first_name"] == "Uniquename" for item in data["items"])


async def test_list_profiles_filter_by_tag(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(
        PROFILES_URL,
        json={"email": "tagfilt@example.com", "tags": ["vip", "region-us"]},
        headers=headers,
    )
    await client.post(
        PROFILES_URL,
        json={"email": "notagfilt@example.com", "tags": ["region-us"]},
        headers=headers,
    )
    resp = await client.get(PROFILES_URL, params={"tag": "vip"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    vip_emails = [item["email"] for item in data["items"]]
    assert "tagfilt@example.com" in vip_emails
    assert "notagfilt@example.com" not in vip_emails


async def test_get_profile_returns_200(client: AsyncClient):
    headers = await auth_headers(client)
    created = (
        await client.post(PROFILES_URL, json={"email": "getme@example.com"}, headers=headers)
    ).json()
    resp = await client.get(f"{PROFILES_URL}/{created['id']}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "getme@example.com"
    assert "survey_history" in resp.json()


async def test_get_profile_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client)
    resp = await client.get(f"{PROFILES_URL}/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 404


async def test_update_profile_returns_200(client: AsyncClient):
    headers = await auth_headers(client)
    created = (
        await client.post(PROFILES_URL, json={"email": "update@example.com"}, headers=headers)
    ).json()
    resp = await client.patch(
        f"{PROFILES_URL}/{created['id']}",
        json={"first_name": "Updated", "organization": "Acme"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["first_name"] == "Updated"
    assert data["organization"] == "Acme"


async def test_delete_profile_returns_204(client: AsyncClient):
    headers = await auth_headers(client)
    created = (
        await client.post(PROFILES_URL, json={"email": "delete@example.com"}, headers=headers)
    ).json()
    resp = await client.delete(f"{PROFILES_URL}/{created['id']}", headers=headers)
    assert resp.status_code == 204


async def test_delete_profile_sets_null_on_participants(
    client: AsyncClient, session: AsyncSession
):
    """Deleting a profile must SET NULL profile_id on linked participants (not delete them)."""
    headers = await auth_headers(client)

    # Create profile
    profile_resp = await client.post(
        PROFILES_URL, json={"email": "setnull@example.com"}, headers=headers
    )
    assert profile_resp.status_code == 201
    profile_id = profile_resp.json()["id"]

    # Create survey
    survey_id = await create_survey(client, headers)

    # Assign profile to survey
    assign_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants/from-profiles",
        json={"profile_ids": [profile_id]},
        headers=headers,
    )
    assert assign_resp.status_code == 201
    participant_id = assign_resp.json()[0]["id"]

    # Delete the profile
    del_resp = await client.delete(f"{PROFILES_URL}/{profile_id}", headers=headers)
    assert del_resp.status_code == 204

    # Participant should still exist with profile_id = NULL
    result = await session.execute(
        select(Participant).where(Participant.id == uuid.UUID(participant_id))
    )
    participant = result.scalar_one_or_none()
    assert participant is not None
    assert participant.profile_id is None


# ---------------------------------------------------------------------------
# Assignment (from-profiles) Tests
# ---------------------------------------------------------------------------


async def test_assign_from_profiles_creates_participants(client: AsyncClient):
    headers = await auth_headers(client)
    p1 = (await client.post(PROFILES_URL, json={"email": "assign1@example.com"}, headers=headers)).json()
    p2 = (await client.post(PROFILES_URL, json={"email": "assign2@example.com"}, headers=headers)).json()
    survey_id = await create_survey(client, headers)

    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants/from-profiles",
        json={"profile_ids": [p1["id"], p2["id"]]},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data) == 2
    # Each participant should have a token and profile_id set
    for item in data:
        assert item["token"] is not None
        assert item["email"] in {"assign1@example.com", "assign2@example.com"}


async def test_assign_from_profiles_missing_profile_returns_404(client: AsyncClient):
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants/from-profiles",
        json={"profile_ids": [str(uuid.uuid4())]},
        headers=headers,
    )
    assert resp.status_code == 404


async def test_assign_from_profiles_profile_id_set_on_participant(
    client: AsyncClient, session: AsyncSession
):
    headers = await auth_headers(client)
    profile = (await client.post(PROFILES_URL, json={"email": "proflink@example.com"}, headers=headers)).json()
    survey_id = await create_survey(client, headers)

    assign_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants/from-profiles",
        json={"profile_ids": [profile["id"]]},
        headers=headers,
    )
    assert assign_resp.status_code == 201
    participant_id = assign_resp.json()[0]["id"]

    result = await session.execute(
        select(Participant).where(Participant.id == uuid.UUID(participant_id))
    )
    participant = result.scalar_one_or_none()
    assert participant is not None
    assert str(participant.profile_id) == profile["id"]


# ---------------------------------------------------------------------------
# Profile detail with survey history
# ---------------------------------------------------------------------------


async def test_get_profile_survey_history(client: AsyncClient, session: AsyncSession):
    headers = await auth_headers(client)
    profile = (await client.post(PROFILES_URL, json={"email": "history@example.com"}, headers=headers)).json()
    survey_id = await create_survey(client, headers)

    # Assign profile to survey
    await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants/from-profiles",
        json={"profile_ids": [profile["id"]]},
        headers=headers,
    )

    resp = await client.get(f"{PROFILES_URL}/{profile['id']}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["survey_history"]) == 1
    assert data["survey_history"][0]["survey_id"] == survey_id


# ---------------------------------------------------------------------------
# Auto-populate from response submission
# ---------------------------------------------------------------------------


async def test_auto_populate_profile_on_token_response(
    client: AsyncClient, session: AsyncSession
):
    """When a participant with email uses their token, a profile should be auto-created."""
    headers = await auth_headers(client)
    survey_id = await create_survey(client, headers)
    await add_question(client, headers, survey_id)
    await activate_survey(client, headers, survey_id)

    # Create a participant with an email
    part_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/participants",
        json={"email": "autoprofile@example.com"},
        headers=headers,
    )
    assert part_resp.status_code == 201
    token = part_resp.json()["token"]

    # Submit a response using the token
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/responses",
        json={"token": token},
    )
    assert resp.status_code == 201

    # Profile should now exist
    profile_result = await session.execute(
        select(ParticipantProfile).where(
            ParticipantProfile.email == "autoprofile@example.com"
        )
    )
    profile = profile_result.scalar_one_or_none()
    assert profile is not None
    assert profile.email == "autoprofile@example.com"

    # Participant should be linked to the profile
    participant_result = await session.execute(
        select(Participant).where(Participant.email == "autoprofile@example.com")
    )
    participant = participant_result.scalar_one_or_none()
    assert participant is not None
    assert participant.profile_id == profile.id
