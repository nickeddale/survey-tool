"""Tests for email invitation CRUD endpoints.

Tests cover:
    - Send single invitation (201 with EmailInvitationResponse)
    - Send creates participant if none exists
    - Send reuses existing participant
    - Batch send returns summary counts
    - List with pagination
    - List filtered by status/email/type
    - Get single invitation
    - Get 404 for wrong survey
    - Delete invitation
    - Delete 404 for wrong survey
    - Resend failed invitation
    - Resend returns 400 if status is not failed
    - Survey ownership isolation (other user's survey returns 404)
    - Unauthenticated requests return 401/403
    - API key scope enforcement
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant import Participant

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"
KEYS_URL = "/api/v1/auth/keys"


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


def invitations_url(survey_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/email-invitations"


async def _create_api_key(client: AsyncClient, headers: dict, scopes: list | None) -> str:
    payload: dict = {"name": "Test Key"}
    if scopes is not None:
        payload["scopes"] = scopes
    resp = await client.post(KEYS_URL, json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()["key"]


# ---------------------------------------------------------------------------
# Send single invitation tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_invitation_returns_201(client: AsyncClient):
    headers = await auth_headers(client, "send_inv@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "recipient@example.com"},
            headers=headers,
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["recipient_email"] == "recipient@example.com"
    assert data["survey_id"] == survey_id
    assert "id" in data
    assert "status" in data
    assert "attempt_count" in data
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_send_invitation_creates_participant(client: AsyncClient, session: AsyncSession):
    headers = await auth_headers(client, "create_part@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "newparticipant@example.com"},
            headers=headers,
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["participant_id"] is not None

    # Verify participant created in DB
    result = await session.execute(
        select(Participant).where(Participant.email == "newparticipant@example.com")
    )
    participant = result.scalar_one_or_none()
    assert participant is not None
    assert participant.token is not None


@pytest.mark.asyncio
async def test_send_invitation_reuses_existing_participant(client: AsyncClient, session: AsyncSession):
    headers = await auth_headers(client, "reuse_part@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp1 = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "existing@example.com"},
            headers=headers,
        )
        resp2 = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "existing@example.com"},
            headers=headers,
        )

    assert resp1.status_code == 201
    assert resp2.status_code == 201
    assert resp1.json()["participant_id"] == resp2.json()["participant_id"]

    result = await session.execute(
        select(Participant).where(Participant.email == "existing@example.com")
    )
    participants = result.scalars().all()
    assert len(participants) == 1


@pytest.mark.asyncio
async def test_send_invitation_with_name_and_subject(client: AsyncClient):
    headers = await auth_headers(client, "named_inv@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            invitations_url(survey_id),
            json={
                "recipient_email": "named@example.com",
                "recipient_name": "Jane Doe",
                "subject": "Custom Subject",
                "invitation_type": "reminder",
            },
            headers=headers,
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["recipient_name"] == "Jane Doe"
    assert data["subject"] == "Custom Subject"
    assert data["invitation_type"] == "reminder"


@pytest.mark.asyncio
async def test_send_invitation_status_is_sent_when_smtp_disabled(client: AsyncClient):
    """When smtp_enabled=False, email_service logs but does not raise — status should be 'sent'."""
    headers = await auth_headers(client, "smtp_dis@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.post(
        invitations_url(survey_id),
        json={"recipient_email": "smtp_disabled@example.com"},
        headers=headers,
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "sent"


@pytest.mark.asyncio
async def test_send_invitation_survey_link_contains_token(client: AsyncClient, session: AsyncSession):
    """The survey link built for the invitation should include the participant token."""
    headers = await auth_headers(client, "link_check@example.com")
    survey_id = await create_survey(client, headers)

    captured_calls = []

    async def mock_send_email(to, subject, html_body, text_body=""):
        captured_calls.append({"to": to, "html_body": html_body})

    with patch(
        "app.services.email_invitation_service.email_service.send_email",
        side_effect=mock_send_email,
    ):
        resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "linkcheck@example.com"},
            headers=headers,
        )

    assert resp.status_code == 201
    assert len(captured_calls) == 1
    html = captured_calls[0]["html_body"]
    assert survey_id in html
    assert "token=" in html


# ---------------------------------------------------------------------------
# Batch send tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_batch_send_returns_summary(client: AsyncClient):
    headers = await auth_headers(client, "batch_inv@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            f"{invitations_url(survey_id)}/batch",
            json={
                "items": [
                    {"recipient_email": "b1@example.com"},
                    {"recipient_email": "b2@example.com"},
                    {"recipient_email": "b3@example.com"},
                ]
            },
            headers=headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "sent" in data
    assert "failed" in data
    assert "skipped" in data
    assert data["sent"] == 3
    assert data["failed"] == 0
    assert data["skipped"] == 0


@pytest.mark.asyncio
async def test_batch_send_skips_duplicates(client: AsyncClient):
    headers = await auth_headers(client, "batch_dup@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            f"{invitations_url(survey_id)}/batch",
            json={
                "items": [
                    {"recipient_email": "dup@example.com"},
                    {"recipient_email": "dup@example.com"},
                    {"recipient_email": "unique@example.com"},
                ]
            },
            headers=headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["sent"] == 2
    assert data["skipped"] == 1


@pytest.mark.asyncio
async def test_batch_send_with_custom_subject(client: AsyncClient):
    headers = await auth_headers(client, "batch_subj@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            f"{invitations_url(survey_id)}/batch",
            json={
                "items": [{"recipient_email": "bs@example.com"}],
                "subject": "Custom Batch Subject",
            },
            headers=headers,
        )

    assert resp.status_code == 200
    assert resp.json()["sent"] == 1


# ---------------------------------------------------------------------------
# List tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_invitations_returns_200(client: AsyncClient):
    headers = await auth_headers(client, "list_inv@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        for i in range(3):
            await client.post(
                invitations_url(survey_id),
                json={"recipient_email": f"r{i}@example.com"},
                headers=headers,
            )

    resp = await client.get(invitations_url(survey_id), headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3
    assert data["page"] == 1
    assert "pages" in data
    assert "per_page" in data


@pytest.mark.asyncio
async def test_list_invitations_pagination(client: AsyncClient):
    headers = await auth_headers(client, "page_inv@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        for i in range(5):
            await client.post(
                invitations_url(survey_id),
                json={"recipient_email": f"pi{i}@example.com"},
                headers=headers,
            )

    resp = await client.get(f"{invitations_url(survey_id)}?page=1&per_page=2", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["pages"] == 3


@pytest.mark.asyncio
async def test_list_invitations_filter_by_status(client: AsyncClient):
    headers = await auth_headers(client, "filt_stat@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "sent@example.com"},
            headers=headers,
        )

    resp = await client.get(
        f"{invitations_url(survey_id)}?status=sent", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    for item in data["items"]:
        assert item["status"] == "sent"


@pytest.mark.asyncio
async def test_list_invitations_filter_by_email(client: AsyncClient):
    headers = await auth_headers(client, "filt_email@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "specific@example.com"},
            headers=headers,
        )
        await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "other@example.com"},
            headers=headers,
        )

    resp = await client.get(
        f"{invitations_url(survey_id)}?recipient_email=specific@example.com",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["recipient_email"] == "specific@example.com"


@pytest.mark.asyncio
async def test_list_invitations_filter_by_type(client: AsyncClient):
    headers = await auth_headers(client, "filt_type@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "invite@example.com", "invitation_type": "invite"},
            headers=headers,
        )
        await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "remind@example.com", "invitation_type": "reminder"},
            headers=headers,
        )

    resp = await client.get(
        f"{invitations_url(survey_id)}?invitation_type=reminder",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["invitation_type"] == "reminder"


# ---------------------------------------------------------------------------
# Get detail tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_invitation_returns_200(client: AsyncClient):
    headers = await auth_headers(client, "get_inv@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        create_resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "getme@example.com"},
            headers=headers,
        )

    invitation_id = create_resp.json()["id"]
    resp = await client.get(
        f"{invitations_url(survey_id)}/{invitation_id}", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == invitation_id
    assert data["recipient_email"] == "getme@example.com"


@pytest.mark.asyncio
async def test_get_invitation_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "get404_inv@example.com")
    survey_id = await create_survey(client, headers)
    fake_id = str(uuid.uuid4())

    resp = await client.get(
        f"{invitations_url(survey_id)}/{fake_id}", headers=headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_invitation_wrong_survey_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "get_ws_inv@example.com")
    survey_id1 = await create_survey(client, headers, title="Survey 1")
    survey_id2 = await create_survey(client, headers, title="Survey 2")

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        create_resp = await client.post(
            invitations_url(survey_id1),
            json={"recipient_email": "ws@example.com"},
            headers=headers,
        )

    invitation_id = create_resp.json()["id"]
    resp = await client.get(
        f"{invitations_url(survey_id2)}/{invitation_id}", headers=headers
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Delete tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_invitation_returns_204(client: AsyncClient):
    headers = await auth_headers(client, "del_inv@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        create_resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "delme@example.com"},
            headers=headers,
        )

    invitation_id = create_resp.json()["id"]
    del_resp = await client.delete(
        f"{invitations_url(survey_id)}/{invitation_id}", headers=headers
    )
    assert del_resp.status_code == 204

    get_resp = await client.get(
        f"{invitations_url(survey_id)}/{invitation_id}", headers=headers
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_invitation_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "del404_inv@example.com")
    survey_id = await create_survey(client, headers)
    fake_id = str(uuid.uuid4())

    resp = await client.delete(
        f"{invitations_url(survey_id)}/{fake_id}", headers=headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_invitation_wrong_survey_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "del_ws_inv@example.com")
    survey_id1 = await create_survey(client, headers, title="Survey A")
    survey_id2 = await create_survey(client, headers, title="Survey B")

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        create_resp = await client.post(
            invitations_url(survey_id1),
            json={"recipient_email": "delws@example.com"},
            headers=headers,
        )

    invitation_id = create_resp.json()["id"]
    resp = await client.delete(
        f"{invitations_url(survey_id2)}/{invitation_id}", headers=headers
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Resend tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resend_failed_invitation(client: AsyncClient):
    """Resend a failed invitation — should succeed and return updated invitation."""
    headers = await auth_headers(client, "resend_inv@example.com")
    survey_id = await create_survey(client, headers)

    # Force send to fail first time, succeed on resend
    call_count = 0

    async def mock_send_fail_then_succeed(to, subject, html_body, text_body=""):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise Exception("SMTP temporarily unavailable")

    with patch(
        "app.services.email_invitation_service.email_service.send_email",
        side_effect=mock_send_fail_then_succeed,
    ):
        create_resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "failme@example.com"},
            headers=headers,
        )

    assert create_resp.status_code == 201
    assert create_resp.json()["status"] == "failed"
    invitation_id = create_resp.json()["id"]

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resend_resp = await client.post(
            f"{invitations_url(survey_id)}/{invitation_id}/resend",
            headers=headers,
        )

    assert resend_resp.status_code == 200
    data = resend_resp.json()
    assert data["status"] == "sent"


@pytest.mark.asyncio
async def test_resend_non_failed_invitation_returns_400(client: AsyncClient):
    """Attempting to resend a non-failed invitation should return 400."""
    headers = await auth_headers(client, "resend400_inv@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        create_resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "alreadysent@example.com"},
            headers=headers,
        )

    assert create_resp.json()["status"] == "sent"
    invitation_id = create_resp.json()["id"]

    resp = await client.post(
        f"{invitations_url(survey_id)}/{invitation_id}/resend",
        headers=headers,
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Survey ownership isolation tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_invitation_other_user_survey_returns_404(client: AsyncClient):
    headers1 = await auth_headers(client, "iso1_inv@example.com")
    headers2 = await auth_headers(client, "iso2_inv@example.com")

    survey_id = await create_survey(client, headers1)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "iso@example.com"},
            headers=headers2,
        )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_invitations_other_user_survey_returns_404(client: AsyncClient):
    headers1 = await auth_headers(client, "isolist1_inv@example.com")
    headers2 = await auth_headers(client, "isolist2_inv@example.com")

    survey_id = await create_survey(client, headers1)

    resp = await client.get(invitations_url(survey_id), headers=headers2)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Unauthenticated access tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_invitation_unauthenticated_returns_401_or_403(client: AsyncClient):
    headers = await auth_headers(client, "unauth_inv@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.post(
        invitations_url(survey_id),
        json={"recipient_email": "unauth@example.com"},
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_invitations_unauthenticated_returns_401_or_403(client: AsyncClient):
    headers = await auth_headers(client, "unauthlist_inv@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.get(invitations_url(survey_id))
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# API key scope enforcement tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_send_invitation_jwt_auth_returns_201(client: AsyncClient):
    """JWT-authenticated requests bypass scope enforcement."""
    headers = await auth_headers(client, "scope_jwt_inv@example.com")
    survey_id = await create_survey(client, headers)

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "jwt@example.com"},
            headers=headers,
        )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_send_invitation_api_key_with_scope_returns_201(client: AsyncClient):
    """API key with surveys:write scope can send invitations."""
    headers = await auth_headers(client, "scope_write_inv@example.com")
    survey_id = await create_survey(client, headers)
    api_key = await _create_api_key(client, headers, scopes=["surveys:write"])

    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "scope@example.com"},
            headers={"X-API-Key": api_key},
        )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_send_invitation_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without surveys:write scope cannot send invitations."""
    headers = await auth_headers(client, "scope_noscp_inv@example.com")
    survey_id = await create_survey(client, headers)
    api_key = await _create_api_key(client, headers, scopes=["surveys:read"])

    resp = await client.post(
        invitations_url(survey_id),
        json={"recipient_email": "noscp@example.com"},
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_list_invitations_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without surveys:read scope cannot list invitations."""
    headers = await auth_headers(client, "scope_noread_inv@example.com")
    survey_id = await create_survey(client, headers)
    api_key = await _create_api_key(client, headers, scopes=[])

    resp = await client.get(
        invitations_url(survey_id),
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
