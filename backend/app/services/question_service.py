import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.survey import Survey
from app.services.survey_service import check_survey_editable


def _with_subquestions():
    """Return selectinload options that eagerly load subquestions 2 levels deep."""
    return selectinload(Question.subquestions).selectinload(Question.subquestions)


async def _verify_group_ownership(
    session: AsyncSession,
    survey_id: uuid.UUID,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Return True if group exists, belongs to survey, and survey belongs to user."""
    result = await session.execute(
        select(QuestionGroup.id)
        .join(Survey, Survey.id == QuestionGroup.survey_id)
        .where(
            QuestionGroup.id == group_id,
            QuestionGroup.survey_id == survey_id,
            Survey.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _next_sort_order(
    session: AsyncSession,
    group_id: uuid.UUID,
) -> int:
    """Return max(sort_order) + 1 for the given group, or 1 if no questions exist."""
    result = await session.execute(
        select(func.coalesce(func.max(Question.sort_order), 0)).where(
            Question.group_id == group_id
        )
    )
    return result.scalar_one() + 1


async def _generate_question_code(
    session: AsyncSession,
    survey_id: uuid.UUID,
) -> str:
    """Generate next Qn code (Q1, Q2...) unique within the survey scope."""
    # Find all question codes in the survey (across all groups)
    result = await session.execute(
        select(Question.code)
        .join(QuestionGroup, QuestionGroup.id == Question.group_id)
        .where(
            QuestionGroup.survey_id == survey_id,
            Question.parent_id.is_(None),
        )
    )
    existing_codes = set(result.scalars().all())

    n = 1
    while True:
        candidate = f"Q{n}"
        if candidate not in existing_codes:
            return candidate
        n += 1


async def _generate_subquestion_code(
    session: AsyncSession,
    parent_id: uuid.UUID,
    parent_code: str,
) -> str:
    """Generate next subquestion code (parent_code_SQ001, _SQ002...) for a parent."""
    result = await session.execute(
        select(Question.code).where(Question.parent_id == parent_id)
    )
    existing_codes = set(result.scalars().all())

    n = 1
    while True:
        candidate = f"{parent_code}_SQ{n:03d}"
        if candidate not in existing_codes:
            return candidate
        n += 1


async def create_question(
    session: AsyncSession,
    survey_id: uuid.UUID,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    question_type: str,
    title: str,
    code: str | None = None,
    description: str | None = None,
    is_required: bool = False,
    sort_order: int | None = None,
    relevance: str | None = None,
    validation: dict | None = None,
    settings: dict | None = None,
    parent_id: uuid.UUID | None = None,
) -> Question | None:
    """Create a new question. Returns None if group/survey not found or not owned.
    Raises 422 if survey is not in draft status."""
    if not await _verify_group_ownership(session, survey_id, group_id, user_id):
        return None

    survey_result = await session.execute(
        select(Survey).where(Survey.id == survey_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is not None:
        check_survey_editable(survey)

    # Auto-generate code if not provided
    if code is None:
        if parent_id is not None:
            # Fetch parent to get its code
            parent_result = await session.execute(
                select(Question).where(Question.id == parent_id)
            )
            parent = parent_result.scalar_one_or_none()
            if parent is None:
                return None
            code = await _generate_subquestion_code(session, parent_id, parent.code)
        else:
            code = await _generate_question_code(session, survey_id)

    if sort_order is None:
        sort_order = await _next_sort_order(session, group_id)

    # Enforce code uniqueness within the survey
    existing = await session.execute(
        select(Question.id)
        .join(QuestionGroup, QuestionGroup.id == Question.group_id)
        .where(
            QuestionGroup.survey_id == survey_id,
            Question.code == code,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError(f"Question code '{code}' already exists in this survey")

    question = Question(
        group_id=group_id,
        parent_id=parent_id,
        question_type=question_type,
        code=code,
        title=title,
        description=description,
        is_required=is_required,
        sort_order=sort_order,
        relevance=relevance,
        validation=validation,
        settings=settings,
    )
    session.add(question)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise

    # Reload with subquestions eagerly loaded
    result = await session.execute(
        select(Question)
        .where(Question.id == question.id)
        .options(_with_subquestions())
    )
    return result.scalar_one()


async def get_question_by_id(
    session: AsyncSession,
    survey_id: uuid.UUID,
    group_id: uuid.UUID,
    question_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Question | None:
    """Get a question by id, enforcing ownership. Includes subquestions."""
    result = await session.execute(
        select(Question)
        .join(QuestionGroup, QuestionGroup.id == Question.group_id)
        .join(Survey, Survey.id == QuestionGroup.survey_id)
        .where(
            Question.id == question_id,
            Question.group_id == group_id,
            QuestionGroup.survey_id == survey_id,
            Survey.user_id == user_id,
        )
        .options(_with_subquestions())
    )
    return result.scalar_one_or_none()


async def list_questions(
    session: AsyncSession,
    survey_id: uuid.UUID,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[Question] | None:
    """List top-level questions for a group ordered by sort_order. Returns None if not found/owned."""
    if not await _verify_group_ownership(session, survey_id, group_id, user_id):
        return None

    result = await session.execute(
        select(Question)
        .where(
            Question.group_id == group_id,
            Question.parent_id.is_(None),
        )
        .order_by(Question.sort_order)
        .options(_with_subquestions())
    )
    return list(result.scalars().all())


async def update_question(
    session: AsyncSession,
    question: Question,
    **kwargs,
) -> Question:
    """Update only the provided fields of a question. Raises 422 if survey is not in draft status."""
    survey_result = await session.execute(
        select(Survey)
        .join(QuestionGroup, QuestionGroup.survey_id == Survey.id)
        .where(QuestionGroup.id == question.group_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is not None:
        check_survey_editable(survey)
    for field, value in kwargs.items():
        setattr(question, field, value)

    session.add(question)
    await session.flush()

    # Reload with subquestions
    result = await session.execute(
        select(Question)
        .where(Question.id == question.id)
        .options(_with_subquestions())
    )
    return result.scalar_one()


async def delete_question(
    session: AsyncSession,
    question: Question,
) -> None:
    """Delete a question (cascade to subquestions handled by DB FK and ORM cascade)."""
    await session.delete(question)
    await session.flush()


async def reorder_questions(
    session: AsyncSession,
    survey_id: uuid.UUID,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    items: list[dict],
) -> list[Question] | None:
    """Bulk-update sort_order and optionally move questions between groups.

    items is a list of {"id": uuid, "sort_order": int, "group_id": uuid|None}.
    Returns None if survey/group not found/owned or any question ID is invalid.
    Pre-validates all IDs before issuing any UPDATEs.
    """
    if not await _verify_group_ownership(session, survey_id, group_id, user_id):
        return None

    question_ids = [item["id"] for item in items]

    # Fetch all referenced questions, verifying they belong to this survey (owned by user)
    result = await session.execute(
        select(Question)
        .join(QuestionGroup, QuestionGroup.id == Question.group_id)
        .join(Survey, Survey.id == QuestionGroup.survey_id)
        .where(
            Question.id.in_(question_ids),
            QuestionGroup.survey_id == survey_id,
            Survey.user_id == user_id,
        )
    )
    questions = {q.id: q for q in result.scalars().all()}

    # Reject if any requested ID is not found / not owned by user
    if len(questions) != len(items):
        return None

    # Validate all target group_ids belong to this survey
    target_group_ids = {
        item["group_id"] for item in items if item.get("group_id") is not None
    }
    if target_group_ids:
        group_result = await session.execute(
            select(QuestionGroup.id)
            .join(Survey, Survey.id == QuestionGroup.survey_id)
            .where(
                QuestionGroup.id.in_(target_group_ids),
                QuestionGroup.survey_id == survey_id,
                Survey.user_id == user_id,
            )
        )
        valid_group_ids = set(group_result.scalars().all())
        if valid_group_ids != target_group_ids:
            return None

    for item in items:
        q = questions[item["id"]]
        q.sort_order = item["sort_order"]
        if item.get("group_id") is not None:
            q.group_id = item["group_id"]
        session.add(q)

    await session.flush()

    # Return updated questions for the original group ordered by sort_order
    result2 = await session.execute(
        select(Question)
        .where(Question.group_id == group_id)
        .order_by(Question.sort_order)
        .options(_with_subquestions())
    )
    return list(result2.scalars().all())
