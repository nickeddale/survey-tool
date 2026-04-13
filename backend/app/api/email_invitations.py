"""CRUD endpoints for email invitations."""

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, pagination_params, require_scope
from app.utils.pagination import PaginationParams
from app.limiter import RATE_LIMITS, limiter
from app.models.survey import Survey
from app.models.user import User
from app.schemas.email_invitation import (
    EmailInvitationBatchCreate,
    EmailInvitationCreate,
    EmailInvitationListResponse,
    EmailInvitationResponse,
)
from app.services import email_invitation_service
from app.utils.errors import NotFoundError
from sqlalchemy import select

router = APIRouter(prefix="/surveys", tags=["email-invitations"])


def _parse_survey_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Survey not found")


def _parse_invitation_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Email invitation not found")


async def _get_survey_or_404(
    session: AsyncSession, survey_id: uuid.UUID, user_id: uuid.UUID
) -> Survey:
    """Fetch a survey verifying ownership; raise 404 if not found or not owned."""
    result = await session.execute(
        select(Survey).where(
            Survey.id == survey_id,
            Survey.user_id == user_id,
        )
    )
    survey = result.scalar_one_or_none()
    if survey is None:
        raise NotFoundError("Survey not found")
    return survey


@router.post(
    "/{survey_id}/email-invitations",
    response_model=EmailInvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a single email invitation",
    description="Send an email invitation to a single recipient. Creates a participant if one does not already exist for that email.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def send_invitation(
    request: Request,
    survey_id: str,
    payload: EmailInvitationCreate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> EmailInvitationResponse:
    """Send a single email invitation for a survey."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    invitation = await email_invitation_service.send_invitation(
        session=session,
        survey_id=parsed_survey_id,
        recipient_email=str(payload.recipient_email),
        recipient_name=payload.recipient_name,
        subject=payload.subject,
        invitation_type=payload.invitation_type or "invite",
        custom_message=payload.custom_message,
    )
    return EmailInvitationResponse.model_validate(invitation)


@router.post(
    "/{survey_id}/email-invitations/batch",
    status_code=status.HTTP_200_OK,
    summary="Send batch email invitations",
    description="Send email invitations to multiple recipients. Creates participants as needed.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def send_batch_invitations(
    request: Request,
    survey_id: str,
    payload: EmailInvitationBatchCreate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Send batch email invitations for a survey."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    items = [item.model_dump() for item in payload.items]
    summary = await email_invitation_service.send_batch_invitations(
        session=session,
        survey_id=parsed_survey_id,
        items=items,
        subject=payload.subject,
    )
    return summary


@router.get(
    "/{survey_id}/email-invitations",
    response_model=EmailInvitationListResponse,
    status_code=status.HTTP_200_OK,
    summary="List email invitations",
    description="Return a paginated list of email invitations for a survey with optional filters.",
)
async def list_invitations(
    survey_id: str,
    pagination: PaginationParams = Depends(pagination_params),
    status_filter: str | None = Query(None, alias="status"),
    recipient_email: str | None = Query(None),
    invitation_type: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:read")),
    session: AsyncSession = Depends(get_db),
) -> EmailInvitationListResponse:
    """List email invitations for a survey with pagination and optional filters."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    result = await email_invitation_service.list_invitations(
        session=session,
        survey_id=parsed_survey_id,
        pagination=pagination,
        status=status_filter,
        recipient_email=recipient_email,
        invitation_type=invitation_type,
    )
    return EmailInvitationListResponse(
        items=[EmailInvitationResponse.model_validate(i) for i in result["items"]],
        total=result["total"],
        page=result["page"],
        per_page=result["per_page"],
        pages=result["pages"],
    )


@router.get(
    "/{survey_id}/email-invitations/{invitation_id}",
    response_model=EmailInvitationResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a single email invitation",
    description="Return a single email invitation by ID.",
)
async def get_invitation(
    survey_id: str,
    invitation_id: str,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:read")),
    session: AsyncSession = Depends(get_db),
) -> EmailInvitationResponse:
    """Get an email invitation by ID."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_invitation_id = _parse_invitation_id(invitation_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    invitation = await email_invitation_service.get_invitation(
        session=session,
        invitation_id=parsed_invitation_id,
        survey_id=parsed_survey_id,
    )
    return EmailInvitationResponse.model_validate(invitation)


@router.delete(
    "/{survey_id}/email-invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an email invitation",
    description="Permanently delete an email invitation record.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def delete_invitation(
    request: Request,
    survey_id: str,
    invitation_id: str,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Delete an email invitation."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_invitation_id = _parse_invitation_id(invitation_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    await email_invitation_service.delete_invitation(
        session=session,
        invitation_id=parsed_invitation_id,
        survey_id=parsed_survey_id,
    )


@router.get(
    "/{survey_id}/email-invitations/stats",
    status_code=status.HTTP_200_OK,
    summary="Email invitation aggregate statistics",
    description=(
        "Return aggregate delivery statistics for all email invitations for a survey. "
        "Includes total sent, delivered, bounced, failed, open rate, click rate, "
        "and a breakdown by invitation_type."
    ),
)
async def get_invitation_stats(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:read")),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Return aggregate email invitation statistics for a survey."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    return await email_invitation_service.get_invitation_stats(
        session=session,
        survey_id=parsed_survey_id,
    )


@router.post(
    "/{survey_id}/email-invitations/{invitation_id}/resend",
    response_model=EmailInvitationResponse,
    status_code=status.HTTP_200_OK,
    summary="Resend a failed email invitation",
    description="Resend a failed email invitation. Returns 400 if the invitation status is not 'failed'.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def resend_invitation(
    request: Request,
    survey_id: str,
    invitation_id: str,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> EmailInvitationResponse:
    """Resend a failed email invitation."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_invitation_id = _parse_invitation_id(invitation_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    invitation = await email_invitation_service.resend_invitation(
        session=session,
        invitation_id=parsed_invitation_id,
        survey_id=parsed_survey_id,
    )
    return EmailInvitationResponse.model_validate(invitation)
