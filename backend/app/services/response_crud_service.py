"""CRUD helpers for survey responses: validation helpers, partial save, and status transitions."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.answer_option import AnswerOption
from app.models.participant import Participant
from app.models.question import Question
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey
from app.services.validators import validate_answer
from app.utils.errors import AnswerValidationError, ConflictError, ForbiddenError, NotFoundError, UnprocessableError


async def _check_survey_requires_participants(
    session: AsyncSession,
    survey_id: uuid.UUID,
) -> bool:
    """Return True if the survey has at least one Participant row, False otherwise.

    Surveys with participants require a valid token on response submission.
    Surveys with no participants allow anonymous responses.
    """
    result = await session.execute(
        select(Participant.id).where(Participant.survey_id == survey_id).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _validate_participant_token(
    session: AsyncSession,
    survey_id: uuid.UUID,
    token: str,
) -> Participant:
    """Validate a participant token and return the Participant row.

    Checks:
        - Token exists for the given survey
        - Current time is within valid_from/valid_until window (if set)
        - uses_remaining is None (unlimited) or > 0
        - completed is False

    Args:
        session: The async database session.
        survey_id: The UUID of the survey.
        token: The participant token string submitted with the response.

    Returns:
        The validated Participant ORM row.

    Raises:
        ForbiddenError: If the token is invalid, expired, exhausted, or already completed.
    """
    now = datetime.now(timezone.utc)

    result = await session.execute(
        select(Participant).where(
            Participant.token == token,
            Participant.survey_id == survey_id,
        )
    )
    participant = result.scalar_one_or_none()

    if participant is None:
        raise ForbiddenError("Invalid participant token")

    if participant.valid_from is not None and now < participant.valid_from:
        raise ForbiddenError("Participant token is not yet valid")

    if participant.valid_until is not None and now > participant.valid_until:
        raise ForbiddenError("Participant token has expired")

    if participant.uses_remaining is not None and participant.uses_remaining <= 0:
        raise ForbiddenError("Participant token has no remaining uses")

    if participant.completed:
        raise ForbiddenError("Participant has already completed this survey")

    return participant


async def _validate_answers(
    session: AsyncSession,
    answers: list[dict],
    survey_id: uuid.UUID,
    visible_question_ids: set[uuid.UUID],
) -> list[dict]:
    """Validate submitted answers against their question definitions.

    Only validates answers for questions in visible_question_ids.
    Answers for hidden questions are skipped (not validated, not errored).

    Fetches each question (scoped to the survey via question_group), retrieves its
    answer_options and subquestions, and calls validate_answer() for each visible one.
    Collects ALL errors across ALL visible questions before returning — never short-circuits.

    Args:
        visible_question_ids: Set of question UUIDs that are visible and should be validated.
                              Questions not in this set are skipped entirely.

    Returns:
        A list of error dicts with keys: question_code, field, message.
        An empty list means all visible answers are valid.
    """
    errors: list[dict] = []

    for answer in answers:
        question_id = answer["question_id"]

        # Skip validation for hidden questions — they are preserved but not checked.
        if question_id not in visible_question_ids:
            continue

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

        # Skip subquestions — their answers are stored on the parent question
        if question.parent_id is not None:
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


async def save_partial_response(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
    answers: list[dict],
) -> Response:
    """Save partial answers for a survey response without triggering completion validation.

    Upserts (insert or update) each answer using ON CONFLICT DO UPDATE on the
    (response_id, question_id) unique constraint. Multiple calls accumulate/overwrite
    answers; status remains 'incomplete'. No required-field or type validation is run.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey (used to scope the response lookup).
        response_id: The UUID of the response to update.
        answers: List of {'question_id': UUID, 'value': any} dicts to upsert.

    Raises:
        NotFoundError: If the response does not exist for this survey.
        UnprocessableError: If the response is complete or disqualified.
    """
    result = await session.execute(
        select(Response)
        .where(Response.id == response_id, Response.survey_id == survey_id)
        .options(selectinload(Response.answers))
    )
    response = result.scalar_one_or_none()

    if response is None:
        raise NotFoundError("Response not found")

    if response.status == "complete":
        raise UnprocessableError("Cannot save partial answers on a completed response")

    if response.status == "disqualified":
        raise UnprocessableError("Cannot save partial answers on a disqualified response")

    if answers:
        for answer in answers:
            stmt = (
                pg_insert(ResponseAnswer)
                .values(
                    id=uuid.uuid4(),
                    response_id=response_id,
                    question_id=answer["question_id"],
                    value=answer["value"],
                )
                .on_conflict_do_update(
                    constraint="uq_response_answers_response_question",
                    set_={"value": answer["value"]},
                )
            )
            await session.execute(stmt)

    # Update the response's updated_at timestamp
    response.updated_at = datetime.now(timezone.utc)
    session.add(response)
    await session.flush()

    # Reload the response with its updated answers
    await session.refresh(response)
    result2 = await session.execute(
        select(Response)
        .where(Response.id == response_id)
        .options(selectinload(Response.answers))
    )
    return result2.scalar_one()


async def get_response_with_answers(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
) -> Response:
    """Load a response with all its current answers for resume functionality.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey (used to scope the lookup).
        response_id: The UUID of the response to retrieve.

    Raises:
        NotFoundError: If the response does not exist for this survey.
    """
    result = await session.execute(
        select(Response)
        .where(Response.id == response_id, Response.survey_id == survey_id)
        .options(selectinload(Response.answers))
    )
    response = result.scalar_one_or_none()

    if response is None:
        raise NotFoundError("Response not found")

    return response


async def disqualify_response(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
) -> Response:
    """Disqualify a survey response (admin action).

    Transitions the response to 'disqualified' status. Valid transitions are:
    - incomplete -> disqualified
    - complete -> disqualified

    Invalid transitions (disqualified -> anything) raise UnprocessableError (422).

    Args:
        session: The async database session.
        survey_id: The UUID of the survey (used to scope the lookup).
        response_id: The UUID of the response to disqualify.

    Raises:
        NotFoundError: If the response does not exist for this survey.
        UnprocessableError: If the response is already disqualified (422).
    """
    result = await session.execute(
        select(Response).where(
            Response.id == response_id,
            Response.survey_id == survey_id,
        )
    )
    response = result.scalar_one_or_none()

    if response is None:
        raise NotFoundError("Response not found")

    if response.status == "disqualified":
        raise UnprocessableError("Response is already disqualified")

    response.status = "disqualified"
    session.add(response)
    await session.flush()
    await session.refresh(response)
    return response
