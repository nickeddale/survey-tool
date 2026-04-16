"""Email open and click tracking endpoints.

These endpoints are embedded in email bodies (tracking pixel and click-through
redirect). They require no authentication as they are accessed by email clients
and recipients who follow links in emails.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.email_invitation import EmailInvitation
from app.models.participant import Participant
from app.utils.errors import NotFoundError

# Transparent 1x1 GIF (43 bytes)
_TRACKING_PIXEL = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
    b"!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)

router = APIRouter(prefix="/email/track", tags=["email-tracking"])


def _parse_invitation_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Email invitation not found")


@router.get(
    "/open/{invitation_id}",
    summary="Email open tracking pixel",
    description=(
        "Returns a transparent 1x1 GIF and records the first open time for the invitation. "
        "No authentication required — this endpoint is embedded in HTML emails."
    ),
    response_class=Response,
    responses={
        200: {"content": {"image/gif": {}}, "description": "Transparent 1x1 tracking pixel"},
        404: {"description": "Invitation not found"},
    },
)
async def track_open(
    invitation_id: str,
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Record email open on first access and return a transparent 1x1 GIF."""
    parsed_id = _parse_invitation_id(invitation_id)

    result = await session.execute(
        select(EmailInvitation).where(EmailInvitation.id == parsed_id)
    )
    invitation = result.scalar_one_or_none()
    if invitation is None:
        raise NotFoundError("Email invitation not found")

    # Record only the first open
    if invitation.opened_at is None:
        invitation.opened_at = datetime.now(timezone.utc)
        await session.flush()

    return Response(
        content=_TRACKING_PIXEL,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@router.get(
    "/click/{invitation_id}",
    summary="Email click-through tracking redirect",
    description=(
        "Records the first click time for the invitation and redirects to the survey link. "
        "No authentication required — this endpoint is embedded in HTML emails."
    ),
    responses={
        302: {"description": "Redirect to survey URL"},
        404: {"description": "Invitation not found"},
    },
)
async def track_click(
    invitation_id: str,
    session: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Record email click on first access and redirect to the survey."""
    parsed_id = _parse_invitation_id(invitation_id)

    result = await session.execute(
        select(EmailInvitation).where(EmailInvitation.id == parsed_id)
    )
    invitation = result.scalar_one_or_none()
    if invitation is None:
        raise NotFoundError("Email invitation not found")

    # Record only the first click
    if invitation.clicked_at is None:
        invitation.clicked_at = datetime.now(timezone.utc)
        await session.flush()

    # Build the survey link with the participant token
    survey_link = f"{settings.frontend_url.rstrip('/')}/s/{invitation.survey_id}"
    if invitation.participant_id is not None:
        part_result = await session.execute(
            select(Participant).where(Participant.id == invitation.participant_id)
        )
        participant = part_result.scalar_one_or_none()
        if participant is not None and participant.token:
            survey_link = f"{survey_link}?token={participant.token}"

    return RedirectResponse(url=survey_link, status_code=302)
