import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.question_group import QuestionGroup
from app.models.survey import Survey
from app.services.survey_service import check_survey_editable


async def _verify_survey_ownership(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Return True if the survey exists and belongs to user_id."""
    result = await session.execute(
        select(Survey.id).where(
            Survey.id == survey_id,
            Survey.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _get_owned_survey(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Survey | None:
    """Fetch the survey if owned by user_id, else return None."""
    result = await session.execute(
        select(Survey).where(
            Survey.id == survey_id,
            Survey.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def _next_sort_order(
    session: AsyncSession,
    survey_id: uuid.UUID,
) -> int:
    """Return max(sort_order) + 1 for the given survey, or 1 if no groups exist."""
    result = await session.execute(
        select(func.coalesce(func.max(QuestionGroup.sort_order), 0)).where(
            QuestionGroup.survey_id == survey_id
        )
    )
    return result.scalar_one() + 1


async def create_group(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str,
    description: str | None = None,
    sort_order: int | None = None,
    relevance: str | None = None,
) -> QuestionGroup | None:
    """Create a new question group scoped to a survey. Returns None if survey not found/owned.
    Raises 422 if survey is not in draft status."""
    survey = await _get_owned_survey(session, survey_id, user_id)
    if survey is None:
        return None
    check_survey_editable(survey)

    if sort_order is None:
        sort_order = await _next_sort_order(session, survey_id)

    group = QuestionGroup(
        survey_id=survey_id,
        title=title,
        description=description,
        sort_order=sort_order,
        relevance=relevance,
    )
    session.add(group)
    await session.flush()

    # Reload with questions eagerly loaded
    result = await session.execute(
        select(QuestionGroup)
        .where(QuestionGroup.id == group.id)
        .options(selectinload(QuestionGroup.questions))
    )
    return result.scalar_one()


async def get_group_by_id(
    session: AsyncSession,
    survey_id: uuid.UUID,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
) -> QuestionGroup | None:
    """Get a group by id, enforcing survey ownership. Returns None if not found or wrong owner."""
    result = await session.execute(
        select(QuestionGroup)
        .join(Survey, Survey.id == QuestionGroup.survey_id)
        .where(
            QuestionGroup.id == group_id,
            QuestionGroup.survey_id == survey_id,
            Survey.user_id == user_id,
        )
        .options(selectinload(QuestionGroup.questions))
    )
    return result.scalar_one_or_none()


async def list_groups(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[QuestionGroup] | None:
    """List groups for a survey ordered by sort_order. Returns None if survey not found/owned."""
    if not await _verify_survey_ownership(session, survey_id, user_id):
        return None

    result = await session.execute(
        select(QuestionGroup)
        .where(QuestionGroup.survey_id == survey_id)
        .order_by(QuestionGroup.sort_order)
        .options(selectinload(QuestionGroup.questions))
    )
    return list(result.scalars().all())


async def update_group(
    session: AsyncSession,
    group: QuestionGroup,
    **kwargs,
) -> QuestionGroup:
    """Update only the provided fields of a group. Raises 422 if survey is not in draft status."""
    survey_result = await session.execute(
        select(Survey).where(Survey.id == group.survey_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is not None:
        check_survey_editable(survey)
    for field, value in kwargs.items():
        if value is not None:
            setattr(group, field, value)

    session.add(group)
    await session.flush()

    # Reload with questions eagerly loaded
    result = await session.execute(
        select(QuestionGroup)
        .where(QuestionGroup.id == group.id)
        .options(selectinload(QuestionGroup.questions))
    )
    return result.scalar_one()


async def delete_group(
    session: AsyncSession,
    group: QuestionGroup,
) -> None:
    """Delete a group (cascade to questions handled by DB FK). Raises 422 if survey is not in draft status."""
    survey_result = await session.execute(
        select(Survey).where(Survey.id == group.survey_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is not None:
        check_survey_editable(survey)
    await session.delete(group)
    await session.flush()


async def reorder_groups(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    order: list[dict],
) -> list[QuestionGroup] | None:
    """Bulk-update sort_order for groups. Returns None if survey not found/owned.

    Validates all group IDs belong to this survey before issuing any updates.
    order is a list of {"id": uuid, "sort_order": int}.
    """
    if not await _verify_survey_ownership(session, survey_id, user_id):
        return None

    group_ids = [item["id"] for item in order]

    # Fetch all referenced groups in one query, verifying they all belong to this survey
    result = await session.execute(
        select(QuestionGroup).where(
            QuestionGroup.id.in_(group_ids),
            QuestionGroup.survey_id == survey_id,
        )
    )
    groups = {g.id: g for g in result.scalars().all()}

    # Reject if any requested ID is not found in this survey
    if len(groups) != len(order):
        return None  # Caller should treat as 400/422

    for item in order:
        groups[item["id"]].sort_order = item["sort_order"]
        session.add(groups[item["id"]])

    await session.flush()

    # Return updated groups ordered by sort_order
    result2 = await session.execute(
        select(QuestionGroup)
        .where(QuestionGroup.survey_id == survey_id)
        .order_by(QuestionGroup.sort_order)
        .options(selectinload(QuestionGroup.questions))
    )
    return list(result2.scalars().all())
