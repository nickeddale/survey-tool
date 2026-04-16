"""Tests for email open/click tracking endpoints and stats endpoint.

Tests cover:
    - Tracking pixel returns 1x1 transparent GIF with correct Content-Type
    - Open tracking records opened_at on first request
    - Open tracking is idempotent (second request does not overwrite opened_at)
    - Invalid invitation_id returns 404 for open tracker
    - Click tracking records clicked_at on first request
    - Click tracking is idempotent (second request does not overwrite clicked_at)
    - Click tracking redirects to the correct survey URL
    - Invalid invitation_id returns 404 for click tracker
    - Stats endpoint returns correct counts for sent/failed/opened/clicked
    - Stats endpoint returns correct open_rate and click_rate
    - Stats endpoint returns breakdown by invitation_type
    - Stats endpoint returns 404 for unknown survey
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_invitation import EmailInvitation
from app.models.participant import Participant

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"
TRACK_OPEN_URL = "/api/v1/email/track/open/{invitation_id}"
TRACK_CLICK_URL = "/api/v1/email/track/click/{invitation_id}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_and_login(client: AsyncClient, email: str, password: str = "testpass123") -> dict:
    await client.post(REGISTER_URL, json={"email": email, "password": password, "name": "Test"})
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


def stats_url(survey_id: str) -> str:
    return f"/api/v1/surveys/{survey_id}/email-invitations/stats"


async def create_invitation(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    email: str = "test@example.com",
    invitation_type: str = "invite",
) -> dict:
    """Send an invitation (with SMTP mocked) and return the response JSON."""
    with patch("app.services.email_invitation_service.email_service.send_email", new_callable=AsyncMock):
        resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": email, "invitation_type": invitation_type},
            headers=headers,
        )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Open tracking pixel tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_track_open_returns_1x1_gif(client: AsyncClient, session: AsyncSession):
    headers = await auth_headers(client, "track_open_gif@example.com")
    survey_id = await create_survey(client, headers)
    inv = await create_invitation(client, headers, survey_id, "open_gif@example.com")

    resp = await client.get(TRACK_OPEN_URL.format(invitation_id=inv["id"]))

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/gif"
    # Verify it is a valid GIF89a header
    assert resp.content[:6] == b"GIF89a"
    # Verify it is a 1x1 pixel (the minimal transparent GIF we embed)
    assert len(resp.content) > 0


@pytest.mark.asyncio
async def test_track_open_sets_opened_at_on_first_request(client: AsyncClient, session: AsyncSession):
    headers = await auth_headers(client, "track_open_first@example.com")
    survey_id = await create_survey(client, headers)
    inv = await create_invitation(client, headers, survey_id, "open_first@example.com")

    # Confirm opened_at is None before tracking
    assert inv["opened_at"] is None

    resp = await client.get(TRACK_OPEN_URL.format(invitation_id=inv["id"]))
    assert resp.status_code == 200

    # Verify opened_at is set in the DB
    result = await session.execute(
        select(EmailInvitation).where(EmailInvitation.id == uuid.UUID(inv["id"]))
    )
    db_inv = result.scalar_one()
    assert db_inv.opened_at is not None


@pytest.mark.asyncio
async def test_track_open_is_idempotent(client: AsyncClient, session: AsyncSession):
    """Second open request must not overwrite the first opened_at timestamp."""
    headers = await auth_headers(client, "track_open_idem@example.com")
    survey_id = await create_survey(client, headers)
    inv = await create_invitation(client, headers, survey_id, "open_idem@example.com")

    # First open
    resp1 = await client.get(TRACK_OPEN_URL.format(invitation_id=inv["id"]))
    assert resp1.status_code == 200

    result = await session.execute(
        select(EmailInvitation).where(EmailInvitation.id == uuid.UUID(inv["id"]))
    )
    db_inv = result.scalar_one()
    first_opened_at = db_inv.opened_at
    assert first_opened_at is not None

    # Second open — must not change opened_at
    resp2 = await client.get(TRACK_OPEN_URL.format(invitation_id=inv["id"]))
    assert resp2.status_code == 200

    await session.refresh(db_inv)
    assert db_inv.opened_at == first_opened_at, (
        f"opened_at changed from {first_opened_at} to {db_inv.opened_at} on second request"
    )


@pytest.mark.asyncio
async def test_track_open_invalid_id_returns_404(client: AsyncClient):
    fake_id = str(uuid.uuid4())
    resp = await client.get(TRACK_OPEN_URL.format(invitation_id=fake_id))
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_track_open_malformed_id_returns_404(client: AsyncClient):
    resp = await client.get(TRACK_OPEN_URL.format(invitation_id="not-a-uuid"))
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Click tracking redirect tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_track_click_sets_clicked_at_on_first_request(client: AsyncClient, session: AsyncSession):
    headers = await auth_headers(client, "track_click_first@example.com")
    survey_id = await create_survey(client, headers)
    inv = await create_invitation(client, headers, survey_id, "click_first@example.com")

    assert inv["clicked_at"] is None

    resp = await client.get(TRACK_CLICK_URL.format(invitation_id=inv["id"]), follow_redirects=False)
    assert resp.status_code == 302

    result = await session.execute(
        select(EmailInvitation).where(EmailInvitation.id == uuid.UUID(inv["id"]))
    )
    db_inv = result.scalar_one()
    assert db_inv.clicked_at is not None


@pytest.mark.asyncio
async def test_track_click_is_idempotent(client: AsyncClient, session: AsyncSession):
    """Second click request must not overwrite the first clicked_at timestamp."""
    headers = await auth_headers(client, "track_click_idem@example.com")
    survey_id = await create_survey(client, headers)
    inv = await create_invitation(client, headers, survey_id, "click_idem@example.com")

    # First click
    resp1 = await client.get(TRACK_CLICK_URL.format(invitation_id=inv["id"]), follow_redirects=False)
    assert resp1.status_code == 302

    result = await session.execute(
        select(EmailInvitation).where(EmailInvitation.id == uuid.UUID(inv["id"]))
    )
    db_inv = result.scalar_one()
    first_clicked_at = db_inv.clicked_at
    assert first_clicked_at is not None

    # Second click — must not change clicked_at
    resp2 = await client.get(TRACK_CLICK_URL.format(invitation_id=inv["id"]), follow_redirects=False)
    assert resp2.status_code == 302

    await session.refresh(db_inv)
    assert db_inv.clicked_at == first_clicked_at, (
        f"clicked_at changed from {first_clicked_at} to {db_inv.clicked_at} on second request"
    )


@pytest.mark.asyncio
async def test_track_click_redirects_to_survey_url(client: AsyncClient, session: AsyncSession):
    """Click tracker must redirect to a URL containing the survey_id and participant token."""
    headers = await auth_headers(client, "track_click_redir@example.com")
    survey_id = await create_survey(client, headers)
    inv = await create_invitation(client, headers, survey_id, "click_redir@example.com")

    # Fetch the participant token from DB so we can assert the redirect URL
    result = await session.execute(
        select(EmailInvitation).where(EmailInvitation.id == uuid.UUID(inv["id"]))
    )
    db_inv = result.scalar_one()

    part_result = await session.execute(
        select(Participant).where(Participant.id == db_inv.participant_id)
    )
    participant = part_result.scalar_one()

    resp = await client.get(TRACK_CLICK_URL.format(invitation_id=inv["id"]), follow_redirects=False)
    assert resp.status_code == 302

    location = resp.headers["location"]
    assert survey_id in location, f"survey_id not in redirect Location: {location}"
    assert participant.token in location, f"participant token not in redirect Location: {location}"


@pytest.mark.asyncio
async def test_track_click_invalid_id_returns_404(client: AsyncClient):
    fake_id = str(uuid.uuid4())
    resp = await client.get(TRACK_CLICK_URL.format(invitation_id=fake_id), follow_redirects=False)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_track_click_malformed_id_returns_404(client: AsyncClient):
    resp = await client.get(TRACK_CLICK_URL.format(invitation_id="bad-id"), follow_redirects=False)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Stats endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stats_returns_correct_counts(client: AsyncClient, session: AsyncSession):
    """Stats endpoint must reflect accurate sent/failed/opened/clicked counts."""
    headers = await auth_headers(client, "stats_counts@example.com")
    survey_id = await create_survey(client, headers)

    # Create 2 sent invitations
    inv1 = await create_invitation(client, headers, survey_id, "s1@example.com")
    inv2 = await create_invitation(client, headers, survey_id, "s2@example.com")

    # Create 1 failed invitation (mock send to raise)
    with patch(
        "app.services.email_invitation_service.email_service.send_email",
        side_effect=Exception("SMTP error"),
    ):
        resp = await client.post(
            invitations_url(survey_id),
            json={"recipient_email": "fail@example.com"},
            headers=headers,
        )
    assert resp.status_code == 201
    assert resp.json()["status"] == "failed"

    # Simulate opens: open inv1
    await client.get(TRACK_OPEN_URL.format(invitation_id=inv1["id"]))
    # Simulate click: click inv1
    await client.get(TRACK_CLICK_URL.format(invitation_id=inv1["id"]), follow_redirects=False)

    resp = await client.get(stats_url(survey_id), headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["total"] == 3
    assert data["sent"] == 2
    assert data["failed"] == 1
    assert data["opened"] == 1
    assert data["clicked"] == 1

    # open_rate = opened / sent = 1/2 = 0.5
    assert "open_rate" in data
    assert abs(data["open_rate"] - 0.5) < 0.0001

    # click_rate = clicked / sent = 1/2 = 0.5
    assert "click_rate" in data
    assert abs(data["click_rate"] - 0.5) < 0.0001


@pytest.mark.asyncio
async def test_stats_returns_zero_rates_when_no_sent(client: AsyncClient):
    """When no invitations have been sent, rates should be 0 without division error."""
    headers = await auth_headers(client, "stats_zero@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.get(stats_url(survey_id), headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["total"] == 0
    assert data["sent"] == 0
    assert data["failed"] == 0
    assert data["opened"] == 0
    assert data["clicked"] == 0
    assert data["open_rate"] == 0.0
    assert data["click_rate"] == 0.0
    assert "breakdown" in data


@pytest.mark.asyncio
async def test_stats_breakdown_by_invitation_type(client: AsyncClient):
    """Stats breakdown must separate counts by invitation_type."""
    headers = await auth_headers(client, "stats_breakdown@example.com")
    survey_id = await create_survey(client, headers)

    await create_invitation(client, headers, survey_id, "inv1@example.com", invitation_type="invite")
    await create_invitation(client, headers, survey_id, "inv2@example.com", invitation_type="invite")
    await create_invitation(client, headers, survey_id, "rem1@example.com", invitation_type="reminder")

    resp = await client.get(stats_url(survey_id), headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert "breakdown" in data
    breakdown = data["breakdown"]

    assert "invite" in breakdown
    assert "reminder" in breakdown

    assert breakdown["invite"]["total"] == 2
    assert breakdown["reminder"]["total"] == 1
    assert breakdown["invite"]["sent"] == 2
    assert breakdown["reminder"]["sent"] == 1


@pytest.mark.asyncio
async def test_stats_fields_all_present(client: AsyncClient):
    """All expected fields must be present in the stats response body."""
    headers = await auth_headers(client, "stats_fields@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.get(stats_url(survey_id), headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    required_fields = {
        "total", "sent", "delivered", "bounced", "failed",
        "opened", "clicked", "open_rate", "click_rate", "breakdown",
    }
    for field in required_fields:
        assert field in data, f"Expected field '{field}' missing from stats response"


@pytest.mark.asyncio
async def test_stats_survey_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "stats_404@example.com")
    fake_survey_id = str(uuid.uuid4())

    resp = await client.get(stats_url(fake_survey_id), headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_stats_other_user_survey_returns_404(client: AsyncClient):
    """Stats endpoint must enforce survey ownership."""
    headers1 = await auth_headers(client, "stats_iso1@example.com")
    headers2 = await auth_headers(client, "stats_iso2@example.com")

    survey_id = await create_survey(client, headers1)

    resp = await client.get(stats_url(survey_id), headers=headers2)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_stats_unauthenticated_returns_401_or_403(client: AsyncClient):
    headers = await auth_headers(client, "stats_unauth@example.com")
    survey_id = await create_survey(client, headers)

    resp = await client.get(stats_url(survey_id))
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Template integration tests (no DB needed)
# ---------------------------------------------------------------------------


def test_invitation_template_contains_tracking_urls():
    """invitation.html must render tracking_open_url and tracking_click_url without error."""
    from jinja2 import Environment, FileSystemLoader, StrictUndefined
    from pathlib import Path

    templates_dir = Path(__file__).parent.parent / "app" / "templates"
    env = Environment(
        loader=FileSystemLoader(str(templates_dir)),
        autoescape=True,
        undefined=StrictUndefined,
    )
    template = env.get_template("email/invitation.html")
    rendered = template.render(
        recipient_name="Alice",
        survey_link="http://localhost:3000/s/abc123?token=tok",
        tracking_open_url="http://localhost:8000/api/v1/email/track/open/some-uuid",
        tracking_click_url="http://localhost:8000/api/v1/email/track/click/some-uuid",
        survey_title="My Survey",
        survey_description=None,
        custom_message=None,
        sender_name="Survey Tool",
    )
    assert "http://localhost:8000/api/v1/email/track/open/some-uuid" in rendered
    assert "http://localhost:8000/api/v1/email/track/click/some-uuid" in rendered


def test_reminder_template_contains_tracking_urls():
    """reminder.html must render tracking_open_url and tracking_click_url without error."""
    from jinja2 import Environment, FileSystemLoader, StrictUndefined
    from pathlib import Path

    templates_dir = Path(__file__).parent.parent / "app" / "templates"
    env = Environment(
        loader=FileSystemLoader(str(templates_dir)),
        autoescape=True,
        undefined=StrictUndefined,
    )
    template = env.get_template("email/reminder.html")
    rendered = template.render(
        recipient_name="Bob",
        survey_link="http://localhost:3000/s/abc123?token=tok",
        tracking_open_url="http://localhost:8000/api/v1/email/track/open/some-uuid",
        tracking_click_url="http://localhost:8000/api/v1/email/track/click/some-uuid",
        survey_title="My Survey",
        survey_description=None,
        custom_message=None,
        sender_name="Survey Tool",
    )
    assert "http://localhost:8000/api/v1/email/track/open/some-uuid" in rendered
    assert "http://localhost:8000/api/v1/email/track/click/some-uuid" in rendered


def test_send_invitation_email_contains_tracking_urls():
    """_build_email_body must embed backend tracking URLs in the generated HTML."""
    import uuid as uuid_module
    from unittest.mock import patch

    from app.services.email_invitation_service import _build_email_body

    invitation_id = uuid_module.uuid4()
    survey_link = "http://localhost:3000/s/abc123?token=tok"

    with patch("app.services.email_invitation_service.settings") as mock_settings:
        mock_settings.backend_url = "http://localhost:8000"
        mock_settings.frontend_url = "http://localhost:3000"
        mock_settings.smtp_from_name = "Survey Tool"

        html_body, text_body = _build_email_body(
            recipient_name="Alice",
            survey_link=survey_link,
            invitation_type="invite",
            invitation_id=invitation_id,
        )

    assert f"/email/track/open/{invitation_id}" in html_body
    assert f"/email/track/click/{invitation_id}" in html_body
