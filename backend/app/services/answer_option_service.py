import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer_option import AnswerOption
from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.survey import Survey
from app.services.survey_service import check_survey_editable


async def _verify_question_ownership(
    session: AsyncSession,
    survey_id: uuid.UUID,
    question_id: uuid.UUID,
    user_id: uuid.UUID,
) -> bool:
    """Return True if question exists and belongs to the given survey owned by user."""
    result = await session.execute(
        select(Question.id)
        .join(QuestionGroup, QuestionGroup.id == Question.group_id)
        .join(Survey, Survey.id == QuestionGroup.survey_id)
        .where(
            Question.id == question_id,
            QuestionGroup.survey_id == survey_id,
            Survey.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def _next_sort_order(
    session: AsyncSession,
    question_id: uuid.UUID,
) -> int:
    """Return max(sort_order) + 1 for the given question, or 1 if no options exist."""
    result = await session.execute(
        select(func.coalesce(func.max(AnswerOption.sort_order), 0)).where(
            AnswerOption.question_id == question_id
        )
    )
    return result.scalar_one() + 1


async def _next_code(
    session: AsyncSession,
    question_id: uuid.UUID,
) -> str:
    """Generate next Ax code (A1, A2...) unique within the question scope."""
    result = await session.execute(
        select(AnswerOption.code).where(AnswerOption.question_id == question_id)
    )
    existing_codes = set(result.scalars().all())

    n = 1
    while True:
        candidate = f"A{n}"
        if candidate not in existing_codes:
            return candidate
        n += 1


async def _get_survey_for_question(
    session: AsyncSession,
    survey_id: uuid.UUID,
) -> Survey | None:
    """Fetch the survey by id."""
    result = await session.execute(
        select(Survey).where(Survey.id == survey_id)
    )
    return result.scalar_one_or_none()


async def create_answer_option(
    session: AsyncSession,
    survey_id: uuid.UUID,
    question_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str,
    code: str | None = None,
    sort_order: int | None = None,
    assessment_value: int = 0,
) -> AnswerOption | None:
    """Create a new answer option. Returns None if question/survey not found or not owned.
    Raises 422 if survey is not in draft status."""
    if not await _verify_question_ownership(session, survey_id, question_id, user_id):
        return None

    survey = await _get_survey_for_question(session, survey_id)
    if survey is not None:
        check_survey_editable(survey)

    if code is None:
        code = await _next_code(session, question_id)

    if sort_order is None:
        sort_order = await _next_sort_order(session, question_id)

    option = AnswerOption(
        question_id=question_id,
        code=code,
        title=title,
        sort_order=sort_order,
        assessment_value=assessment_value,
    )
    session.add(option)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise

    result = await session.execute(
        select(AnswerOption).where(AnswerOption.id == option.id)
    )
    return result.scalar_one()


async def list_answer_options(
    session: AsyncSession,
    survey_id: uuid.UUID,
    question_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[AnswerOption] | None:
    """List answer options for a question ordered by sort_order. Returns None if not found/owned."""
    if not await _verify_question_ownership(session, survey_id, question_id, user_id):
        return None

    result = await session.execute(
        select(AnswerOption)
        .where(AnswerOption.question_id == question_id)
        .order_by(AnswerOption.sort_order)
    )
    return list(result.scalars().all())


async def get_answer_option_by_id(
    session: AsyncSession,
    survey_id: uuid.UUID,
    question_id: uuid.UUID,
    option_id: uuid.UUID,
    user_id: uuid.UUID,
) -> AnswerOption | None:
    """Get an answer option by id, enforcing ownership via survey→group→question chain."""
    result = await session.execute(
        select(AnswerOption)
        .join(Question, Question.id == AnswerOption.question_id)
        .join(QuestionGroup, QuestionGroup.id == Question.group_id)
        .join(Survey, Survey.id == QuestionGroup.survey_id)
        .where(
            AnswerOption.id == option_id,
            AnswerOption.question_id == question_id,
            QuestionGroup.survey_id == survey_id,
            Survey.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def update_answer_option(
    session: AsyncSession,
    option: AnswerOption,
    **kwargs,
) -> AnswerOption:
    """Update only the provided fields of an answer option. Raises 422 if survey is not in draft status."""
    survey_result = await session.execute(
        select(Survey)
        .join(Question, Question.id == option.question_id)
        .join(QuestionGroup, QuestionGroup.id == Question.group_id)
        .where(QuestionGroup.survey_id == Survey.id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is not None:
        check_survey_editable(survey)
    for field, value in kwargs.items():
        setattr(option, field, value)

    session.add(option)
    await session.flush()

    result = await session.execute(
        select(AnswerOption).where(AnswerOption.id == option.id)
    )
    return result.scalar_one()


async def delete_answer_option(
    session: AsyncSession,
    option: AnswerOption,
) -> None:
    """Delete an answer option. Raises 422 if survey is not in draft status."""
    survey_result = await session.execute(
        select(Survey)
        .join(QuestionGroup, QuestionGroup.survey_id == Survey.id)
        .join(Question, Question.group_id == QuestionGroup.id)
        .where(Question.id == option.question_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is not None:
        check_survey_editable(survey)
    await session.delete(option)
    await session.flush()


async def reorder_answer_options(
    session: AsyncSession,
    survey_id: uuid.UUID,
    question_id: uuid.UUID,
    user_id: uuid.UUID,
    items: list[dict],
) -> list[AnswerOption] | None:
    """Bulk-update sort_order for answer options of a question.

    items is a list of {"id": uuid, "sort_order": int}.
    Returns None if survey/question not found/owned or any option ID is invalid.
    Pre-validates all IDs before issuing any UPDATEs.
    """
    if not await _verify_question_ownership(session, survey_id, question_id, user_id):
        return None

    option_ids = [item["id"] for item in items]

    # Fetch all referenced options, verifying they belong to this question (owned by user)
    result = await session.execute(
        select(AnswerOption)
        .join(Question, Question.id == AnswerOption.question_id)
        .join(QuestionGroup, QuestionGroup.id == Question.group_id)
        .join(Survey, Survey.id == QuestionGroup.survey_id)
        .where(
            AnswerOption.id.in_(option_ids),
            AnswerOption.question_id == question_id,
            QuestionGroup.survey_id == survey_id,
            Survey.user_id == user_id,
        )
    )
    options = {o.id: o for o in result.scalars().all()}

    # Reject if any requested ID is not found / not owned by user
    if len(options) != len(items):
        return None

    for item in items:
        opt = options[item["id"]]
        opt.sort_order = item["sort_order"]
        session.add(opt)

    await session.flush()

    # Return updated options ordered by sort_order
    result2 = await session.execute(
        select(AnswerOption)
        .where(AnswerOption.question_id == question_id)
        .order_by(AnswerOption.sort_order)
    )
    return list(result2.scalars().all())
