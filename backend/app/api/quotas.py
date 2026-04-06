"""CRUD endpoints for survey quotas."""

import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, pagination_params
from app.utils.pagination import PaginationParams
from app.limiter import RATE_LIMITS, limiter
from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.quota import Quota
from app.models.survey import Survey
from app.models.user import User
from app.schemas.quota import (
    QuotaCreate,
    QuotaListResponse,
    QuotaResponse,
    QuotaUpdate,
)
from app.utils.errors import NotFoundError, ValidationError

router = APIRouter(prefix="/surveys", tags=["quotas"])


def _parse_survey_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Survey not found")


def _parse_quota_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Quota not found")


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


async def _get_quota_or_404(
    session: AsyncSession, quota_id: uuid.UUID, survey_id: uuid.UUID
) -> Quota:
    """Fetch a quota by id scoped to a survey; raise 404 if not found."""
    result = await session.execute(
        select(Quota).where(
            Quota.id == quota_id,
            Quota.survey_id == survey_id,
        )
    )
    quota = result.scalar_one_or_none()
    if quota is None:
        raise NotFoundError("Quota not found")
    return quota


async def _validate_condition_question_ids(
    session: AsyncSession,
    survey_id: uuid.UUID,
    conditions: list,
) -> None:
    """Validate that all question_ids in conditions belong to the survey.

    Collects all invalid question_id errors before raising.
    """
    if not conditions:
        return

    question_ids = [c.question_id for c in conditions]

    # Find which question_ids actually exist in this survey (via question_groups join)
    result = await session.execute(
        select(Question.id).join(
            QuestionGroup, Question.group_id == QuestionGroup.id
        ).where(
            QuestionGroup.survey_id == survey_id,
            Question.id.in_(question_ids),
        )
    )
    found_ids = set(result.scalars().all())

    errors = []
    for condition in conditions:
        if condition.question_id not in found_ids:
            errors.append(
                f"question_id {condition.question_id} does not belong to this survey"
            )

    if errors:
        raise ValidationError("; ".join(errors))


@router.post(
    "/{survey_id}/quotas",
    response_model=QuotaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a quota for a survey",
    description="Define a response quota with conditions and an action taken when the limit is reached.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def create_quota(
    request: Request,
    survey_id: str,
    payload: QuotaCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuotaResponse:
    """Create a quota for a survey."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    await _validate_condition_question_ids(session, parsed_survey_id, payload.conditions)

    quota = Quota(
        id=uuid.uuid4(),
        survey_id=parsed_survey_id,
        name=payload.name,
        limit=payload.limit,
        action=payload.action,
        conditions=[c.model_dump(mode="json") for c in payload.conditions],
        current_count=0,
        is_active=payload.is_active,
    )
    session.add(quota)
    await session.flush()
    await session.refresh(quota)
    return QuotaResponse.model_validate(quota)


@router.get(
    "/{survey_id}/quotas",
    response_model=QuotaListResponse,
    status_code=status.HTTP_200_OK,
    summary="List quotas for a survey",
    description="Return a paginated list of quota rules for a survey.",
)
async def list_quotas(
    survey_id: str,
    pagination: PaginationParams = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuotaListResponse:
    """List quotas for a survey with pagination."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    count_result = await session.execute(
        select(func.count()).select_from(Quota).where(Quota.survey_id == parsed_survey_id)
    )
    total = count_result.scalar_one()

    items_result = await session.execute(
        select(Quota)
        .where(Quota.survey_id == parsed_survey_id)
        .order_by(Quota.created_at.asc())
        .offset(pagination.offset)
        .limit(pagination.per_page)
    )
    items = list(items_result.scalars().all())

    pages = max(1, (total + pagination.per_page - 1) // pagination.per_page)

    return QuotaListResponse(
        items=[QuotaResponse.model_validate(q) for q in items],
        total=total,
        page=pagination.page,
        per_page=pagination.per_page,
        pages=pages,
    )


@router.get(
    "/{survey_id}/quotas/{quota_id}",
    response_model=QuotaResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a quota",
    description="Return a single quota rule by ID.",
)
async def get_quota(
    survey_id: str,
    quota_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuotaResponse:
    """Get a quota by ID."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_quota_id = _parse_quota_id(quota_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    quota = await _get_quota_or_404(session, parsed_quota_id, parsed_survey_id)
    return QuotaResponse.model_validate(quota)


@router.patch(
    "/{survey_id}/quotas/{quota_id}",
    response_model=QuotaResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a quota",
    description="Partially update a quota's name, limit, action, conditions, or active status.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_quota(
    request: Request,
    survey_id: str,
    quota_id: str,
    payload: QuotaUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuotaResponse:
    """Partially update a quota."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_quota_id = _parse_quota_id(quota_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    quota = await _get_quota_or_404(session, parsed_quota_id, parsed_survey_id)

    update_fields = payload.model_dump(exclude_unset=True)

    if "conditions" in update_fields and payload.conditions is not None:
        await _validate_condition_question_ids(session, parsed_survey_id, payload.conditions)
        update_fields["conditions"] = [
            c.model_dump(mode="json") for c in payload.conditions
        ]

    for field, value in update_fields.items():
        setattr(quota, field, value)

    await session.flush()
    await session.refresh(quota)
    return QuotaResponse.model_validate(quota)


@router.delete(
    "/{survey_id}/quotas/{quota_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a quota",
    description="Permanently delete a quota rule from a survey.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def delete_quota(
    request: Request,
    survey_id: str,
    quota_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Delete a quota."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_quota_id = _parse_quota_id(quota_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    quota = await _get_quota_or_404(session, parsed_quota_id, parsed_survey_id)
    await session.delete(quota)
    await session.flush()
