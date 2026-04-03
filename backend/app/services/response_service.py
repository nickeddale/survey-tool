"""Service layer for survey response creation and management."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.answer_option import AnswerOption
from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey
from app.services.validators import validate_answer
from app.services.expressions.relevance import evaluate_relevance
from app.services.expressions.resolver import build_expression_context
from app.utils.errors import AnswerValidationError, ConflictError, NotFoundError, UnprocessableError


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
        # For create_response, all questions are visible (no relevance filtering yet)
        all_question_ids = {a["question_id"] for a in answers}
        validation_errors = await _validate_answers(
            session, answers, survey_id, visible_question_ids=all_question_ids
        )
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


async def complete_response(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
) -> Response:
    """Complete a survey response after relevance-aware validation.

    Loads the response with its answers (and each answer's question), evaluates
    relevance expressions to determine which questions are visible, then validates
    only visible question answers. On success, sets status='complete' and
    completed_at=now(). Answers for hidden questions are preserved but not validated.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey.
        response_id: The UUID of the response to complete.

    Raises:
        NotFoundError: If the response does not exist for this survey.
        ConflictError: If the response is already complete.
        AnswerValidationError: If any visible answers fail validation (422, all errors).
    """
    # Load the response with its answers, each answer's question (and question's group),
    # plus the survey with its groups and their questions for relevance evaluation.
    result = await session.execute(
        select(Response)
        .where(Response.id == response_id, Response.survey_id == survey_id)
        .options(
            selectinload(Response.answers).selectinload(ResponseAnswer.question),
            selectinload(Response.survey).selectinload(Survey.groups).selectinload(
                QuestionGroup.questions
            ),
        )
    )
    response = result.scalar_one_or_none()

    if response is None:
        raise NotFoundError("Response not found")

    if response.status == "complete":
        raise ConflictError("Response is already complete")

    if response.status == "disqualified":
        raise UnprocessableError("Cannot complete a disqualified response")

    # Build expression context from current answers
    expression_context = build_expression_context(response, participant=None)

    # Evaluate relevance to determine visible vs. hidden questions
    survey = response.survey
    relevance_result = evaluate_relevance(survey, answers=expression_context)

    visible_question_ids = relevance_result.visible_question_ids

    # Build the list of current answers as dicts for validation
    answer_dicts = [
        {"question_id": ra.question_id, "value": ra.value}
        for ra in response.answers
    ]

    # Also need to validate that all visible required questions have answers.
    # Collect the set of question_ids that have answers submitted.
    answered_question_ids = {ra.question_id for ra in response.answers}

    # For each visible question in the survey, check if required ones are answered.
    # We need to validate required-but-unanswered questions too, not just submitted ones.
    # Build a list of "virtual" answers for required visible questions with no answer.
    for group in survey.groups:
        for question in group.questions:
            if question.id in visible_question_ids and question.id not in answered_question_ids:
                # Add a virtual "no answer" entry so _validate_answers can check required
                answer_dicts.append({"question_id": question.id, "value": None})

    # Validate only visible questions
    validation_errors = await _validate_answers(
        session, answer_dicts, survey_id, visible_question_ids=visible_question_ids
    )
    if validation_errors:
        raise AnswerValidationError(
            message="One or more answers failed validation",
            errors=validation_errors,
        )

    # Mark complete
    response.status = "complete"
    response.completed_at = datetime.now(timezone.utc)
    session.add(response)
    await session.flush()
    await session.refresh(response)
    return response


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
