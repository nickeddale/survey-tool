"""Service logic for completing survey responses with relevance-aware validation."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.participant import Participant
from app.models.question_group import QuestionGroup
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey
from app.services.expressions.relevance import evaluate_relevance
from app.services.expressions.resolver import build_expression_context
from app.services.quota_service import evaluate_and_enforce_quotas
from app.services.response_crud_service import _validate_answers
from app.utils.errors import AnswerValidationError, ConflictError, NotFoundError, UnprocessableError


async def _complete_response_core(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
) -> Response:
    """Core logic for completing a survey response (without webhook dispatch).

    Loads the response with its answers, evaluates relevance expressions to determine
    which questions are visible, validates only visible question answers, enforces quotas,
    then marks the response complete. Webhook dispatch is handled by the calling layer
    (response_service.complete_response) to preserve mock-patchable behavior.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey.
        response_id: The UUID of the response to complete.

    Raises:
        NotFoundError: If the response does not exist for this survey.
        UnprocessableError: If the survey is not in 'active' status.
        ConflictError: If the response is already complete.
        UnprocessableError: If the response is disqualified.
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

    if response.survey.status != "active":
        raise UnprocessableError(
            f"Survey is not accepting responses: status is '{response.survey.status}'"
        )

    if response.status == "complete":
        raise ConflictError("Response is already complete")

    if response.status == "disqualified":
        raise UnprocessableError("Cannot complete a disqualified response")

    # Load the linked participant (if any) for expression context and completion tracking
    linked_participant: Participant | None = None
    if response.participant_id is not None:
        participant_result = await session.execute(
            select(Participant).where(Participant.id == response.participant_id)
        )
        linked_participant = participant_result.scalar_one_or_none()

    # Build expression context from current answers (with participant for RESPONDENT.* piping)
    expression_context = build_expression_context(response, participant=linked_participant)

    # Evaluate relevance to determine visible vs. hidden questions
    survey = response.survey
    relevance_result = evaluate_relevance(survey, answers=expression_context)

    visible_question_ids = relevance_result.visible_question_ids

    # Build answer lookup dict (question_id -> value) for quota condition evaluation
    answer_lookup = {ra.question_id: ra.value for ra in response.answers}

    # Evaluate and enforce quotas (must happen before completion but after relevance)
    quota_result = await evaluate_and_enforce_quotas(
        session=session,
        survey_id=survey_id,
        response_id=response_id,
        answer_lookup=answer_lookup,
    )
    # quota_result.disqualified will only be True if no ForbiddenError was raised
    # (terminate quotas raise immediately); hide_question quotas restrict visible ids
    if quota_result.hidden_question_ids:
        visible_question_ids = visible_question_ids - quota_result.hidden_question_ids

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

    # Mark the participant as completed (if linked)
    if linked_participant is not None:
        linked_participant.completed = True
        session.add(linked_participant)
        await session.flush()

    await session.refresh(response)
    return response
