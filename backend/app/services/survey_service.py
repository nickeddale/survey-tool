import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.survey import Survey, SurveyVersion
from app.services import audit_service
from app.services.event_dispatcher import get_dispatcher


async def create_survey(
    session: AsyncSession,
    user_id: uuid.UUID,
    title: str,
    description: str | None = None,
    status: str = "draft",
    welcome_message: str | None = None,
    end_message: str | None = None,
    default_language: str = "en",
    settings: dict | None = None,
) -> Survey:
    """Create a new survey in draft status."""
    survey = Survey(
        user_id=user_id,
        title=title,
        description=description,
        status=status,
        welcome_message=welcome_message,
        end_message=end_message,
        default_language=default_language,
        settings=settings,
    )
    session.add(survey)
    await session.flush()
    await session.refresh(survey)
    return survey


async def get_survey_by_id(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Survey | None:
    """Get a survey by id, enforcing user ownership (returns None if not found or wrong owner)."""
    result = await session.execute(
        select(Survey).where(
            Survey.id == survey_id,
            Survey.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_survey_full_by_id(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Survey | None:
    """Get a survey with eagerly-loaded groups and questions, enforcing user ownership."""
    from app.models.question import Question  # local import to avoid circular
    result = await session.execute(
        select(Survey)
        .options(
            selectinload(Survey.groups)
            .selectinload(QuestionGroup.questions)
            .selectinload(Question.subquestions),
            selectinload(Survey.groups)
            .selectinload(QuestionGroup.questions)
            .selectinload(Question.answer_options),
        )
        .where(
            Survey.id == survey_id,
            Survey.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_survey_full_public(
    session: AsyncSession,
    survey_id: uuid.UUID,
) -> Survey | None:
    """Get a survey with eagerly-loaded groups and questions. No user ownership check.

    Returns None only if the survey does not exist.
    Used by the public survey response endpoint — no authentication required.
    The caller is responsible for checking survey.status and returning an appropriate response.
    """
    result = await session.execute(
        select(Survey)
        .options(
            selectinload(Survey.groups)
            .selectinload(QuestionGroup.questions)
            .selectinload(Question.subquestions),
            selectinload(Survey.groups)
            .selectinload(QuestionGroup.questions)
            .selectinload(Question.answer_options),
        )
        .where(Survey.id == survey_id)
    )
    return result.scalar_one_or_none()


async def list_surveys(
    session: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    per_page: int = 20,
    status: str | None = None,
    search: str | None = None,
) -> tuple[list[Survey], int]:
    """List surveys for a user with pagination, optional status filter, and title search.

    Returns (items, total).
    """
    base_query = select(Survey).where(Survey.user_id == user_id)

    if status is not None:
        base_query = base_query.where(Survey.status == status)

    if search is not None:
        base_query = base_query.where(Survey.title.ilike(f"%{search}%"))

    # Count query
    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await session.execute(count_query)
    total = count_result.scalar_one()

    # Paginated fetch
    offset = (page - 1) * per_page
    items_query = (
        base_query
        .order_by(Survey.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    items_result = await session.execute(items_query)
    items = list(items_result.scalars().all())

    return items, total


def _build_survey_snapshot(survey: Survey) -> dict[str, Any]:
    """Build a JSON-serializable snapshot of the current survey state."""
    return {
        "id": str(survey.id),
        "user_id": str(survey.user_id),
        "title": survey.title,
        "description": survey.description,
        "status": survey.status,
        "welcome_message": survey.welcome_message,
        "end_message": survey.end_message,
        "default_language": survey.default_language,
        "settings": survey.settings,
        "translations": survey.translations,
        "version": survey.version,
        "created_at": survey.created_at.isoformat() if survey.created_at else None,
        "updated_at": survey.updated_at.isoformat() if survey.updated_at else None,
    }


async def update_survey(
    session: AsyncSession,
    survey: Survey,
    **kwargs,
) -> Survey:
    """Update only the provided fields of a survey. Raises 422 if survey is not in draft status."""
    check_survey_editable(survey)

    # Save snapshot of current state before applying changes
    snapshot = _build_survey_snapshot(survey)
    survey_version = SurveyVersion(
        id=uuid.uuid4(),
        survey_id=survey.id,
        version=survey.version,
        snapshot=snapshot,
    )
    session.add(survey_version)

    for field, value in kwargs.items():
        if value is not None:
            setattr(survey, field, value)

    survey.version = survey.version + 1
    survey.updated_at = datetime.now(timezone.utc)
    session.add(survey)
    await session.flush()
    await session.refresh(survey)
    return survey


async def get_survey_versions(
    session: AsyncSession,
    survey_id: uuid.UUID,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[SurveyVersion], int]:
    """Return paginated version history for a survey, ordered by version desc."""
    base_query = select(SurveyVersion).where(SurveyVersion.survey_id == survey_id)

    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await session.execute(count_query)
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    items_query = (
        base_query
        .order_by(SurveyVersion.version.desc())
        .offset(offset)
        .limit(per_page)
    )
    items_result = await session.execute(items_query)
    items = list(items_result.scalars().all())

    return items, total


def check_survey_editable(survey: Survey) -> None:
    """Raise HTTP 422 if the survey is not in draft status."""
    if survey.status != "draft":
        raise HTTPException(
            status_code=422,
            detail="Survey is not editable: only draft surveys can be modified",
        )


async def activate_survey(
    session: AsyncSession,
    survey: Survey,
    user_id: uuid.UUID | None = None,
) -> Survey:
    """Transition survey from draft -> active. Raises 422 if not draft or has no questions."""
    if survey.status != "draft":
        raise HTTPException(
            status_code=422,
            detail="Survey cannot be activated: it is not in draft status",
        )

    # Check survey has at least one question (not just groups)
    result = await session.execute(
        select(func.count(Question.id))
        .join(QuestionGroup, QuestionGroup.id == Question.group_id)
        .where(
            QuestionGroup.survey_id == survey.id,
            Question.parent_id.is_(None),
        )
    )
    question_count = result.scalar_one()
    if question_count == 0:
        raise HTTPException(
            status_code=422,
            detail="Survey cannot be activated: it has no questions",
        )

    old_status = survey.status
    survey.status = "active"
    survey.updated_at = datetime.now(timezone.utc)
    session.add(survey)
    await session.flush()
    await session.refresh(survey)

    audit_service.log_survey_transition(
        user_id=user_id if user_id is not None else survey.user_id,
        survey_id=survey.id,
        old_status=old_status,
        new_status=survey.status,
    )

    get_dispatcher()(
        event="survey.activated",
        survey_id=survey.id,
        data={
            "survey_id": str(survey.id),
            "title": survey.title,
            "status": survey.status,
        },
    )

    return survey


async def close_survey(
    session: AsyncSession,
    survey: Survey,
    user_id: uuid.UUID | None = None,
) -> Survey:
    """Transition survey from active -> closed. Raises 422 if not active."""
    if survey.status != "active":
        raise HTTPException(
            status_code=422,
            detail="Survey cannot be closed: it is not in active status",
        )

    old_status = survey.status
    survey.status = "closed"
    survey.updated_at = datetime.now(timezone.utc)
    session.add(survey)
    await session.flush()
    await session.refresh(survey)

    audit_service.log_survey_transition(
        user_id=user_id if user_id is not None else survey.user_id,
        survey_id=survey.id,
        old_status=old_status,
        new_status=survey.status,
    )

    get_dispatcher()(
        event="survey.closed",
        survey_id=survey.id,
        data={
            "survey_id": str(survey.id),
            "title": survey.title,
            "status": survey.status,
        },
    )

    return survey


async def archive_survey(
    session: AsyncSession,
    survey: Survey,
    user_id: uuid.UUID | None = None,
) -> Survey:
    """Transition survey from closed -> archived. Raises 422 if not closed."""
    if survey.status != "closed":
        raise HTTPException(
            status_code=422,
            detail="Survey cannot be archived: it is not in closed status",
        )

    old_status = survey.status
    survey.status = "archived"
    survey.updated_at = datetime.now(timezone.utc)
    session.add(survey)
    await session.flush()
    await session.refresh(survey)

    audit_service.log_survey_transition(
        user_id=user_id if user_id is not None else survey.user_id,
        survey_id=survey.id,
        old_status=old_status,
        new_status=survey.status,
    )

    return survey


async def delete_survey(
    session: AsyncSession,
    survey: Survey,
) -> None:
    """Delete a survey."""
    await session.delete(survey)
    await session.flush()
