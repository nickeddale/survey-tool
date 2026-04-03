"""Service layer for survey response creation and management."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.answer_option import AnswerOption
from app.models.question import Question
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey
from app.services.validators import validate_answer
from app.utils.errors import AnswerValidationError, ConflictError, NotFoundError, UnprocessableError


async def _validate_answers(
    session: AsyncSession,
    answers: list[dict],
    survey_id: uuid.UUID,
) -> list[dict]:
    """Validate all submitted answers against their question definitions.

    Fetches each question (scoped to the survey via question_group), retrieves its
    answer_options and subquestions, and calls validate_answer() for each.
    Collects ALL errors across ALL questions before returning — never short-circuits.

    Returns:
        A list of error dicts with keys: question_code, field, message.
        An empty list means all answers are valid.
    """
    errors: list[dict] = []

    for answer in answers:
        question_id = answer["question_id"]

        # Fetch the Question, joining through question_group to enforce survey ownership
        result = await session.execute(
            select(Question)
            .join(Question.group)
            .where(
                Question.id == question_id,
                Question.group.has(survey_id=survey_id),
            )
        )
        question = result.scalar_one_or_none()

        if question is None:
            # Unknown question_id for this survey — skip (handled elsewhere or silently ignored)
            errors.append({
                "question_code": str(question_id),
                "field": "question_id",
                "message": f"Question {question_id} not found in this survey",
            })
            continue

        # Fetch answer_options for this question
        ao_result = await session.execute(
            select(AnswerOption).where(AnswerOption.question_id == question_id)
        )
        answer_options = list(ao_result.scalars().all())

        # Fetch subquestions (child questions) for this question
        sq_result = await session.execute(
            select(Question).where(Question.parent_id == question_id)
        )
        subquestions = list(sq_result.scalars().all())

        # Call the answer validator
        validation_errors = validate_answer(
            answer,
            question,
            answer_options=answer_options,
            subquestions=subquestions,
        )

        for ve in validation_errors:
            errors.append({
                "question_code": question.code,
                "field": ve.field,
                "message": ve.message,
            })

    return errors


async def create_response(
    session: AsyncSession,
    survey_id: uuid.UUID,
    ip_address: str | None = None,
    metadata: dict | None = None,
    answers: list[dict] | None = None,
) -> Response:
    """Create a new survey response.

    Verifies the survey exists and is active, validates all submitted answers,
    creates the Response record, and optionally bulk-inserts initial ResponseAnswer rows.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey to respond to.
        ip_address: The respondent's IP address (from request).
        metadata: Metadata dict (user-agent, referrer, etc.).
        answers: Optional list of {'question_id': UUID, 'value': any} dicts.

    Raises:
        NotFoundError: If the survey does not exist.
        UnprocessableError: If the survey is not in 'active' status.
        AnswerValidationError: If any answers fail validation (422, collects ALL errors).
        ConflictError: If a duplicate question_id appears in initial answers.
    """
    # Look up the survey by id (public — no user_id check)
    result = await session.execute(
        select(Survey).where(Survey.id == survey_id)
    )
    survey = result.scalar_one_or_none()

    if survey is None:
        raise NotFoundError("Survey not found")

    if survey.status != "active":
        raise UnprocessableError(
            f"Survey is not accepting responses: status is '{survey.status}'"
        )

    # Validate all answers before persisting anything
    if answers:
        validation_errors = await _validate_answers(session, answers, survey_id)
        if validation_errors:
            raise AnswerValidationError(
                message="One or more answers failed validation",
                errors=validation_errors,
            )

    response = Response(
        survey_id=survey_id,
        status="incomplete",
        ip_address=ip_address,
        metadata_=metadata or {},
        started_at=datetime.now(timezone.utc),
    )
    session.add(response)
    await session.flush()  # get the response.id assigned

    if answers:
        # Detect duplicate question_ids before hitting the DB constraint
        seen_question_ids: set[uuid.UUID] = set()
        for answer in answers:
            qid = answer["question_id"]
            if qid in seen_question_ids:
                raise ConflictError(
                    f"Duplicate question_id in answers: {qid}"
                )
            seen_question_ids.add(qid)

        answer_rows = [
            ResponseAnswer(
                response_id=response.id,
                question_id=answer["question_id"],
                value=answer["value"],
            )
            for answer in answers
        ]
        session.add_all(answer_rows)
        try:
            await session.flush()
        except IntegrityError as exc:
            await session.rollback()
            raise ConflictError(
                "Duplicate question_id in answers"
            ) from exc

    await session.refresh(response)
    return response
