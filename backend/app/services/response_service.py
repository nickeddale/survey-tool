"""Service layer for survey response creation and management.

This module is a re-export shim for backward compatibility. Public functions are
implemented in focused sub-modules:
  - response_crud_service: validation helpers, partial save, status transitions
  - response_submit_service: completion logic (_complete_response_core)
  - response_query_service: listing, detail retrieval, statistics

create_response and complete_response live here because they dispatch webhook
events via the event dispatcher, and test mocks patch the dispatcher via
app.services.event_dispatcher.set_dispatcher() or by patching
app.services.event_dispatcher._dispatcher.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant import Participant
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey
from app.services.event_dispatcher import get_dispatcher
from app.services.response_crud_service import (
    _check_survey_requires_participants,
    _validate_participant_token,
    _validate_answers,
    save_partial_response,
    get_response_with_answers,
    disqualify_response,
)
from app.services.response_submit_service import _complete_response_core
from app.services.response_query_service import (
    list_responses,
    get_response_detail,
    get_survey_statistics,
)
from app.utils.errors import AnswerValidationError, ConflictError, ForbiddenError, NotFoundError, UnprocessableError


async def create_response(
    session: AsyncSession,
    survey_id: uuid.UUID,
    ip_address: str | None = None,
    metadata: dict | None = None,
    answers: list[dict] | None = None,
    token: str | None = None,
) -> Response:
    """Create a new survey response.

    Verifies the survey exists and is active, validates all submitted answers,
    creates the Response record, and optionally bulk-inserts initial ResponseAnswer rows.

    If the survey has participants, a valid participant token must be provided.
    The token's uses_remaining is atomically decremented within the same transaction.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey to respond to.
        ip_address: The respondent's IP address (from request).
        metadata: Metadata dict (user-agent, referrer, etc.).
        answers: Optional list of {'question_id': UUID, 'value': any} dicts.
        token: Optional participant token string. Required when the survey has participants.

    Raises:
        NotFoundError: If the survey does not exist.
        UnprocessableError: If the survey is not in 'active' status.
        ForbiddenError: If the survey requires a participant token and none/invalid was given.
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

    # Participant token validation
    participant: Participant | None = None
    requires_participants = await _check_survey_requires_participants(session, survey_id)
    if requires_participants:
        if token is None:
            raise ForbiddenError("This survey requires a participant token")
        participant = await _validate_participant_token(session, survey_id, token)

        # Atomically decrement uses_remaining (only if it is not unlimited/None)
        if participant.uses_remaining is not None:
            stmt = (
                update(Participant)
                .where(
                    Participant.id == participant.id,
                    Participant.uses_remaining > 0,
                )
                .values(uses_remaining=Participant.uses_remaining - 1)
            )
            result2 = await session.execute(stmt)
            if result2.rowcount == 0:
                # Race condition: another request consumed the last use
                raise ForbiddenError("Participant token has no remaining uses")

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
        participant_id=participant.id if participant is not None else None,
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

    get_dispatcher()(
        event="response.started",
        survey_id=survey_id,
        data={
            "response_id": str(response.id),
            "survey_id": str(survey_id),
            "started_at": response.started_at.isoformat() if response.started_at else None,
        },
    )

    return response


async def complete_response(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
) -> Response:
    """Complete a survey response after relevance-aware validation.

    Delegates core logic to response_submit_service._complete_response_core,
    then dispatches the response.completed webhook event.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey.
        response_id: The UUID of the response to complete.

    Raises:
        NotFoundError: If the response does not exist for this survey.
        ConflictError: If the response is already complete.
        AnswerValidationError: If any visible answers fail validation (422, all errors).
    """
    response = await _complete_response_core(session, survey_id, response_id)

    get_dispatcher()(
        event="response.completed",
        survey_id=survey_id,
        data={
            "response_id": str(response.id),
            "survey_id": str(survey_id),
            "completed_at": response.completed_at.isoformat() if response.completed_at else None,
        },
    )

    return response


__all__ = [
    "create_response",
    "complete_response",
    "save_partial_response",
    "get_response_with_answers",
    "disqualify_response",
    "list_responses",
    "get_response_detail",
    "get_survey_statistics",
]
