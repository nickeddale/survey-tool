"""CRUD endpoints for survey assessments and scoring engine."""

import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, pagination_params, require_scope
from app.utils.pagination import PaginationParams
from app.limiter import RATE_LIMITS, limiter
from app.models.assessment import Assessment
from app.models.response import Response
from app.models.survey import Survey
from app.models.user import User
from app.schemas.assessment import (
    AssessmentCreate,
    AssessmentListResponse,
    AssessmentResponse,
    AssessmentScoreResponse,
    AssessmentSummaryResponse,
    AssessmentUpdate,
)
from app.services.assessment_service import compute_assessment_summary, compute_score
from app.utils.errors import NotFoundError, UnprocessableError

router = APIRouter(prefix="/surveys", tags=["assessments"])


def _parse_survey_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Survey not found")


def _parse_assessment_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Assessment not found")


def _parse_response_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Response not found")


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


async def _get_assessment_or_404(
    session: AsyncSession, assessment_id: uuid.UUID, survey_id: uuid.UUID
) -> Assessment:
    """Fetch an assessment by id scoped to a survey; raise 404 if not found."""
    result = await session.execute(
        select(Assessment).where(
            Assessment.id == assessment_id,
            Assessment.survey_id == survey_id,
        )
    )
    assessment = result.scalar_one_or_none()
    if assessment is None:
        raise NotFoundError("Assessment not found")
    return assessment


async def _get_response_or_404(
    session: AsyncSession, response_id: uuid.UUID, survey_id: uuid.UUID
) -> Response:
    """Fetch a response by id scoped to a survey; raise 404 if not found."""
    result = await session.execute(
        select(Response).where(
            Response.id == response_id,
            Response.survey_id == survey_id,
        )
    )
    response = result.scalar_one_or_none()
    if response is None:
        raise NotFoundError("Response not found")
    return response


@router.post(
    "/{survey_id}/assessments",
    response_model=AssessmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an assessment rule",
    description="Define a scoring band for a survey. When a response's score falls within the min/max range, the associated message is returned.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def create_assessment(
    request: Request,
    survey_id: str,
    payload: AssessmentCreate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Create an assessment rule for a survey."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    if payload.scope == "group" and payload.group_id is None:
        raise UnprocessableError("group_id is required when scope is 'group'.")
    if payload.scope != "group" and payload.group_id is not None:
        raise UnprocessableError("group_id must be null when scope is not 'group'.")
    if payload.scope in ("question", "subquestion") and payload.question_id is None:
        raise UnprocessableError("question_id is required when scope is 'question' or 'subquestion'.")
    if payload.scope not in ("question", "subquestion") and payload.question_id is not None:
        raise UnprocessableError("question_id must be null when scope is not 'question' or 'subquestion'.")
    if payload.scope == "subquestion" and payload.subquestion_id is None:
        raise UnprocessableError("subquestion_id is required when scope is 'subquestion'.")
    if payload.scope != "subquestion" and payload.subquestion_id is not None:
        raise UnprocessableError("subquestion_id must be null when scope is not 'subquestion'.")

    assessment = Assessment(
        id=uuid.uuid4(),
        survey_id=parsed_survey_id,
        name=payload.name,
        scope=payload.scope,
        group_id=payload.group_id,
        question_id=payload.question_id,
        subquestion_id=payload.subquestion_id,
        min_score=payload.min_score,
        max_score=payload.max_score,
        message=payload.message,
    )
    session.add(assessment)
    await session.flush()
    await session.refresh(assessment)
    return AssessmentResponse.model_validate(assessment)


@router.get(
    "/{survey_id}/assessments",
    response_model=AssessmentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List assessment rules for a survey",
    description="Return a paginated list of assessment scoring bands for a survey.",
)
async def list_assessments(
    survey_id: str,
    pagination: PaginationParams = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AssessmentListResponse:
    """List assessment rules for a survey with pagination."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    count_result = await session.execute(
        select(func.count()).select_from(Assessment).where(
            Assessment.survey_id == parsed_survey_id
        )
    )
    total = count_result.scalar_one()

    items_result = await session.execute(
        select(Assessment)
        .where(Assessment.survey_id == parsed_survey_id)
        .order_by(Assessment.created_at.asc())
        .offset(pagination.offset)
        .limit(pagination.per_page)
    )
    items = list(items_result.scalars().all())

    pages = max(1, (total + pagination.per_page - 1) // pagination.per_page)

    return AssessmentListResponse(
        items=[AssessmentResponse.model_validate(a) for a in items],
        total=total,
        page=pagination.page,
        per_page=pagination.per_page,
        pages=pages,
    )


@router.get(
    "/{survey_id}/assessments/summary",
    response_model=AssessmentSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get aggregate assessment summary for a survey",
    description="Compute scores for all completed responses and return aggregate statistics: average score, min/max, and distribution across assessment bands.",
)
async def get_assessment_summary(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AssessmentSummaryResponse:
    """Return aggregate assessment statistics across all completed responses."""
    parsed_survey_id = _parse_survey_id(survey_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)

    try:
        return await compute_assessment_summary(session, parsed_survey_id)
    except ValueError:
        raise NotFoundError("No assessment rules defined for this survey")


@router.get(
    "/{survey_id}/assessments/{assessment_id}",
    response_model=AssessmentResponse,
    status_code=status.HTTP_200_OK,
    summary="Get an assessment rule",
    description="Return a single assessment scoring band by ID.",
)
async def get_assessment(
    survey_id: str,
    assessment_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Get a single assessment rule by ID."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_assessment_id = _parse_assessment_id(assessment_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    assessment = await _get_assessment_or_404(session, parsed_assessment_id, parsed_survey_id)
    return AssessmentResponse.model_validate(assessment)


@router.patch(
    "/{survey_id}/assessments/{assessment_id}",
    response_model=AssessmentResponse,
    status_code=status.HTTP_200_OK,
    summary="Update an assessment rule",
    description="Partially update an assessment rule's name, scope, score range, or feedback message.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_assessment(
    request: Request,
    survey_id: str,
    assessment_id: str,
    payload: AssessmentUpdate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Partially update an assessment rule."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_assessment_id = _parse_assessment_id(assessment_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    assessment = await _get_assessment_or_404(session, parsed_assessment_id, parsed_survey_id)

    update_fields = payload.model_dump(exclude_unset=True)

    # Determine effective scope after applying any update
    effective_scope = update_fields.get("scope", assessment.scope)
    effective_group_id = update_fields.get("group_id", assessment.group_id)
    effective_question_id = update_fields.get("question_id", assessment.question_id)
    effective_subquestion_id = update_fields.get("subquestion_id", assessment.subquestion_id)

    if effective_scope == "group" and effective_group_id is None:
        raise UnprocessableError("group_id is required when scope is 'group'.")
    if effective_scope != "group" and effective_group_id is not None:
        raise UnprocessableError("group_id must be null when scope is not 'group'.")
    if effective_scope in ("question", "subquestion") and effective_question_id is None:
        raise UnprocessableError("question_id is required when scope is 'question' or 'subquestion'.")
    if effective_scope not in ("question", "subquestion") and effective_question_id is not None:
        raise UnprocessableError("question_id must be null when scope is not 'question' or 'subquestion'.")
    if effective_scope == "subquestion" and effective_subquestion_id is None:
        raise UnprocessableError("subquestion_id is required when scope is 'subquestion'.")
    if effective_scope != "subquestion" and effective_subquestion_id is not None:
        raise UnprocessableError("subquestion_id must be null when scope is not 'subquestion'.")

    for field, value in update_fields.items():
        setattr(assessment, field, value)

    await session.flush()
    await session.refresh(assessment)
    return AssessmentResponse.model_validate(assessment)


@router.delete(
    "/{survey_id}/assessments/{assessment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an assessment rule",
    description="Permanently delete an assessment scoring band from a survey.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def delete_assessment(
    request: Request,
    survey_id: str,
    assessment_id: str,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Delete an assessment rule."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_assessment_id = _parse_assessment_id(assessment_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    assessment = await _get_assessment_or_404(session, parsed_assessment_id, parsed_survey_id)
    await session.delete(assessment)
    await session.flush()


@router.get(
    "/{survey_id}/responses/{response_id}/assessment",
    response_model=AssessmentScoreResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute assessment score for a response",
    description="Calculate the total score for a response from answer option values and return all matching assessment bands.",
)
async def get_response_assessment(
    survey_id: str,
    response_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AssessmentScoreResponse:
    """Compute the assessment score for a response and return matching rules."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_response_id = _parse_response_id(response_id)
    await _get_survey_or_404(session, parsed_survey_id, current_user.id)
    await _get_response_or_404(session, parsed_response_id, parsed_survey_id)

    result = await compute_score(session, parsed_survey_id, parsed_response_id)
    return result
