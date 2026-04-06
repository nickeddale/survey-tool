"""CRUD endpoints for survey participants."""

import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.participant import Participant
from app.models.survey import Survey
from app.models.user import User
from app.schemas.participant import (
    ParticipantBatchCreate,
    ParticipantCreate,
    ParticipantCreateResponse,
    ParticipantListResponse,
    ParticipantResponse,
    ParticipantUpdate,
)
from app.utils.errors import ConflictError, NotFoundError

router = APIRouter(prefix="/surveys", tags=["participants"])


def _parse_survey_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Survey not found")


def _parse_participant_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Participant not found")


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


async def _get_participant_or_404(
    session: AsyncSession, participant_id: uuid.UUID, survey_id: uuid.UUID
) -> Participant:
    """Fetch a participant by id scoped to a survey; raise 404 if not found."""
    result = await session.execute(
        select(Participant).where(
            Participant.id == participant_id,
            Participant.survey_id == survey_id,
        )
    )
    participant = result.scalar_one_or_none()
    if participant is None:
        raise NotFoundError("Participant not found")
    return participant


def _build_participant(
    survey_id: uuid.UUID,
    payload: ParticipantCreate,
    token: str,
) -> Participant:
    return Participant(
        id=uuid.uuid4(),
        survey_id=survey_id,
        token=token,
        email=payload.email,
        attributes=payload.attributes,
        uses_remaining=payload.uses_remaining,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        completed=False,
    )


@router.post(
    "/{survey_id}/participants",
    response_model=ParticipantCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a participant for a survey",
    description="Add a pre-registered participant to a survey. A unique access token is generated and returned only at creation time.",
)
async def create_participant(
    survey_id: str,
    payload: ParticipantCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ParticipantCreateResponse:
    """Create a single participant for a survey. Returns token only on creation."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    token = secrets.token_urlsafe(24)
    participant = _build_participant(parsed_survey_id, payload, token)
    session.add(participant)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError("A participant with this token already exists")
    await session.refresh(participant)
    return ParticipantCreateResponse.model_validate(participant)


@router.post(
    "/{survey_id}/participants/batch",
    response_model=list[ParticipantCreateResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Batch-create participants for a survey",
    description="Create multiple participants in a single request. Each participant gets a unique token returned only at creation time.",
)
async def create_participants_batch(
    survey_id: str,
    payload: ParticipantBatchCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[ParticipantCreateResponse]:
    """Create multiple participants for a survey in a single request."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    participants = []
    for item in payload.items:
        token = secrets.token_urlsafe(24)
        participant = _build_participant(parsed_survey_id, item, token)
        session.add(participant)
        participants.append(participant)

    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError("One or more participants have a duplicate token")

    for p in participants:
        await session.refresh(p)

    return [ParticipantCreateResponse.model_validate(p) for p in participants]


@router.get(
    "/{survey_id}/participants",
    response_model=ParticipantListResponse,
    status_code=status.HTTP_200_OK,
    summary="List participants for a survey",
    description="Return a paginated list of participants with optional filters for completion status, email, and current validity.",
)
async def list_participants(
    survey_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    completed: bool | None = Query(None),
    email: str | None = Query(None),
    valid: bool | None = Query(None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ParticipantListResponse:
    """List participants for a survey with optional filters and pagination.

    Filters:
    - completed: filter by completed status
    - email: filter by exact email match
    - valid: filter to participants who are currently valid
      (valid_from IS NULL OR valid_from <= NOW()) AND
      (valid_until IS NULL OR valid_until >= NOW()) AND
      (uses_remaining IS NULL OR uses_remaining > 0) AND
      (completed = false)
    """
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    conditions = [Participant.survey_id == parsed_survey_id]

    if completed is not None:
        conditions.append(Participant.completed == completed)

    if email is not None:
        conditions.append(Participant.email == email)

    if valid is True:
        now = datetime.now(timezone.utc)
        conditions.append(
            and_(
                or_(Participant.valid_from.is_(None), Participant.valid_from <= now),
                or_(Participant.valid_until.is_(None), Participant.valid_until >= now),
                or_(Participant.uses_remaining.is_(None), Participant.uses_remaining > 0),
                Participant.completed == False,  # noqa: E712
            )
        )
    elif valid is False:
        now = datetime.now(timezone.utc)
        # "not valid" means at least one validity condition fails
        conditions.append(
            or_(
                and_(Participant.valid_from.is_not(None), Participant.valid_from > now),
                and_(Participant.valid_until.is_not(None), Participant.valid_until < now),
                and_(Participant.uses_remaining.is_not(None), Participant.uses_remaining <= 0),
                Participant.completed == True,  # noqa: E712
            )
        )

    where_clause = and_(*conditions)

    count_result = await session.execute(
        select(func.count()).select_from(Participant).where(where_clause)
    )
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    items_result = await session.execute(
        select(Participant)
        .where(where_clause)
        .order_by(Participant.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    items = list(items_result.scalars().all())

    pages = max(1, (total + per_page - 1) // per_page)

    return ParticipantListResponse(
        items=[ParticipantResponse.model_validate(p) for p in items],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get(
    "/{survey_id}/participants/{participant_id}",
    response_model=ParticipantResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a participant",
    description="Return a participant by ID. The participant token is not included in this response.",
)
async def get_participant(
    survey_id: str,
    participant_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ParticipantResponse:
    """Get a participant by ID. Token is NOT returned in this response."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_participant_id = _parse_participant_id(participant_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    participant = await _get_participant_or_404(session, parsed_participant_id, parsed_survey_id)
    return ParticipantResponse.model_validate(participant)


@router.patch(
    "/{survey_id}/participants/{participant_id}",
    response_model=ParticipantResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a participant",
    description="Partially update a participant's email, attributes, usage limits, validity window, or completed status.",
)
async def update_participant(
    survey_id: str,
    participant_id: str,
    payload: ParticipantUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ParticipantResponse:
    """Partially update a participant."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_participant_id = _parse_participant_id(participant_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    participant = await _get_participant_or_404(session, parsed_participant_id, parsed_survey_id)

    update_fields = payload.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(participant, field, value)

    await session.flush()
    await session.refresh(participant)
    return ParticipantResponse.model_validate(participant)


@router.delete(
    "/{survey_id}/participants/{participant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a participant",
    description="Permanently delete a participant from a survey.",
)
async def delete_participant(
    survey_id: str,
    participant_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Delete a participant."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_participant_id = _parse_participant_id(participant_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    participant = await _get_participant_or_404(session, parsed_participant_id, parsed_survey_id)
    await session.delete(participant)
    await session.flush()
