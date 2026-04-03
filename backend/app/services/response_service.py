"""Service layer for survey response creation and management."""

import statistics
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import asc, desc, extract, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.answer_option import AnswerOption
from app.models.participant import Participant
from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey
from app.services.validators import validate_answer
from app.services.expressions.relevance import evaluate_relevance
from app.services.expressions.resolver import build_expression_context
from app.services.quota_service import evaluate_and_enforce_quotas
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


async def list_responses(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str | None = None,
    started_after: datetime | None = None,
    started_before: datetime | None = None,
    completed_after: datetime | None = None,
    completed_before: datetime | None = None,
    sort_by: Literal["started_at", "completed_at", "status"] = "started_at",
    sort_order: Literal["asc", "desc"] = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Response], int]:
    """List responses for a survey with optional filtering and sorting.

    Enforces survey ownership: the survey must exist AND belong to the authenticated
    user — both missing and unauthorized surveys return NotFoundError (no 404-oracle).

    Args:
        session: The async database session.
        survey_id: The UUID of the survey to list responses for.
        user_id: The UUID of the authenticated user (ownership check).
        status: Optional filter by response status.
        started_after: Optional filter: responses started after this datetime.
        started_before: Optional filter: responses started before this datetime.
        completed_after: Optional filter: responses completed after this datetime.
        completed_before: Optional filter: responses completed before this datetime.
        sort_by: Column to sort by (started_at, completed_at, status).
        sort_order: Sort direction (asc or desc).
        page: Page number (1-indexed).
        per_page: Number of items per page.

    Returns:
        A tuple of (list of Response objects, total count matching filters).

    Raises:
        NotFoundError: If the survey does not exist or does not belong to user_id.
    """
    # Validate survey existence AND ownership in a single query
    survey_result = await session.execute(
        select(Survey).where(Survey.id == survey_id, Survey.user_id == user_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is None:
        raise NotFoundError("Survey not found")

    # Build base WHERE conditions for responses
    conditions = [Response.survey_id == survey_id]

    if status is not None:
        conditions.append(Response.status == status)
    if started_after is not None:
        conditions.append(Response.started_at > started_after)
    if started_before is not None:
        conditions.append(Response.started_at < started_before)
    if completed_after is not None:
        conditions.append(Response.completed_at > completed_after)
    if completed_before is not None:
        conditions.append(Response.completed_at < completed_before)

    # Separate COUNT(*) query for accurate total (not affected by LIMIT/OFFSET)
    count_result = await session.execute(
        select(func.count()).select_from(Response).where(*conditions)
    )
    total = count_result.scalar_one()

    # Determine sort column and direction
    sort_column_map = {
        "started_at": Response.started_at,
        "completed_at": Response.completed_at,
        "status": Response.status,
    }
    sort_col = sort_column_map[sort_by]
    order_fn = asc if sort_order == "asc" else desc
    order_expr = order_fn(sort_col)

    # Paginated data query
    offset = (page - 1) * per_page
    data_result = await session.execute(
        select(Response)
        .where(*conditions)
        .order_by(order_expr)
        .limit(per_page)
        .offset(offset)
    )
    responses = list(data_result.scalars().all())

    return responses, total


async def get_response_detail(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    """Load a response with fully enriched answer data for the authenticated detail endpoint.

    Verifies survey ownership (survey.user_id == user_id) in a single joined query.
    Returns 404 for both not-found and wrong-owner cases to avoid ownership leakage.

    Eagerly loads answers → question → answer_options and answers → question → subquestions
    to avoid N+1 queries.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey.
        response_id: The UUID of the response.
        user_id: The UUID of the authenticated user (ownership check).

    Returns:
        A dict suitable for constructing a ResponseDetail schema.

    Raises:
        NotFoundError: If the response/survey does not exist or the survey is not owned by user_id.
    """
    from app.schemas.response import ResponseAnswerDetail, ResponseDetail

    # Single query joining Response -> Survey, enforcing ownership
    result = await session.execute(
        select(Response)
        .join(Survey, Response.survey_id == Survey.id)
        .where(
            Response.id == response_id,
            Response.survey_id == survey_id,
            Survey.user_id == user_id,
        )
        .options(
            selectinload(Response.answers).selectinload(ResponseAnswer.question).selectinload(
                Question.answer_options
            ),
            selectinload(Response.answers).selectinload(ResponseAnswer.question).selectinload(
                Question.subquestions
            ),
        )
    )
    response = result.scalar_one_or_none()

    if response is None:
        raise NotFoundError("Response not found")

    # Build enriched answer list
    enriched_answers: list[ResponseAnswerDetail] = []
    for answer in response.answers:
        question = answer.question
        raw_value = answer.value

        # Resolve selected_option_title for choice questions
        selected_option_title: str | None = None
        choice_types = {"single_choice", "dropdown", "image_picker"}
        if question.question_type in choice_types and raw_value is not None:
            # raw_value is a string (option code) for single-choice questions
            option_code = str(raw_value)
            for opt in question.answer_options:
                if opt.code == option_code:
                    selected_option_title = opt.title
                    break

        # Resolve subquestion_label for matrix questions
        subquestion_label: str | None = None
        matrix_types = {"matrix", "matrix_single", "matrix_multiple", "matrix_dropdown", "matrix_dynamic"}
        if question.question_type in matrix_types and question.parent_id is not None:
            # This question IS a subquestion — use its own title as the label
            subquestion_label = question.title

        # Build values list for multiple-choice answers
        values: list[Any] | None = None
        if question.question_type == "multiple_choice" and isinstance(raw_value, list):
            values = raw_value

        enriched_answers.append(
            ResponseAnswerDetail(
                question_id=question.id,
                question_code=question.code,
                question_title=question.title,
                question_type=question.question_type,
                value=raw_value,
                values=values,
                selected_option_title=selected_option_title,
                subquestion_label=subquestion_label,
            )
        )

    return {
        "id": response.id,
        "status": response.status,
        "started_at": response.started_at,
        "completed_at": response.completed_at,
        "ip_address": response.ip_address,
        "metadata": response.metadata_,
        "participant_id": response.participant_id,
        "answers": enriched_answers,
    }


async def get_survey_statistics(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    """Compute aggregate statistics for a survey and its questions.

    Enforces survey ownership via a single JOIN query (survey.user_id == user_id).
    Returns 404 for both missing surveys and unauthorized access to avoid leaking existence.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey.
        user_id: The UUID of the authenticated user (ownership check).

    Returns:
        A dict suitable for constructing a SurveyStatisticsResponse schema.

    Raises:
        NotFoundError: If the survey does not exist or is not owned by user_id.
    """
    # Verify survey ownership
    survey_result = await session.execute(
        select(Survey).where(Survey.id == survey_id, Survey.user_id == user_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is None:
        raise NotFoundError("Survey not found")

    # --- Response count aggregations by status ---
    status_counts_result = await session.execute(
        select(Response.status, func.count().label("cnt"))
        .where(Response.survey_id == survey_id)
        .group_by(Response.status)
    )
    status_map: dict[str, int] = {}
    for row in status_counts_result:
        status_map[row.status] = row.cnt

    total_responses = sum(status_map.values())
    complete_responses = status_map.get("complete", 0)
    incomplete_responses = status_map.get("incomplete", 0)
    disqualified_responses = status_map.get("disqualified", 0)

    completion_rate = (complete_responses / total_responses) if total_responses > 0 else 0.0

    # --- Average completion time (seconds) for complete responses ---
    avg_time_result = await session.execute(
        select(
            func.avg(
                extract("epoch", Response.completed_at) - extract("epoch", Response.started_at)
            )
        ).where(
            Response.survey_id == survey_id,
            Response.status == "complete",
            Response.completed_at.is_not(None),
        )
    )
    avg_time_seconds: float | None = avg_time_result.scalar_one_or_none()

    # --- Per-question statistics ---
    # Fetch all questions in the survey (via question_group join), ordered for consistency
    questions_result = await session.execute(
        select(Question)
        .join(QuestionGroup, Question.group_id == QuestionGroup.id)
        .where(QuestionGroup.survey_id == survey_id)
        .order_by(QuestionGroup.sort_order, Question.sort_order)
    )
    questions = list(questions_result.scalars().all())

    # Categorize question types
    CHOICE_TYPES = {"single_choice", "dropdown", "image_picker", "yes_no"}
    MULTI_CHOICE_TYPES = {"multiple_choice"}
    NUMERIC_TYPES = {"number", "numeric", "scale"}
    RATING_TYPES = {"rating"}
    # All others treated as text (short_text, long_text, huge_text, email, phone, url, date, time, datetime, etc.)

    question_stats_list = []

    for question in questions:
        qtype = question.question_type
        question_id = question.id

        # Fetch all answers for this question from the survey's responses
        answers_result = await session.execute(
            select(ResponseAnswer.value)
            .join(Response, ResponseAnswer.response_id == Response.id)
            .where(
                Response.survey_id == survey_id,
                ResponseAnswer.question_id == question_id,
                ResponseAnswer.value.is_not(None),
            )
        )
        raw_values = [row[0] for row in answers_result.fetchall()]
        response_count = len(raw_values)

        if qtype in CHOICE_TYPES:
            # Single-value choice: value is a string (option code)
            # Fetch answer options for percentage calculation
            options_result = await session.execute(
                select(AnswerOption)
                .where(AnswerOption.question_id == question_id)
                .order_by(AnswerOption.sort_order)
            )
            answer_options = list(options_result.scalars().all())
            option_map = {opt.code: opt.title for opt in answer_options}

            # Count occurrences per option code
            code_counts: dict[str, int] = {}
            for val in raw_values:
                code = str(val)
                code_counts[code] = code_counts.get(code, 0) + 1

            # Build options list (include all defined options, even those with 0 responses)
            options_out = []
            total_choice = response_count if response_count > 0 else 1
            for opt in answer_options:
                cnt = code_counts.get(opt.code, 0)
                options_out.append({
                    "option_code": opt.code,
                    "option_title": opt.title,
                    "count": cnt,
                    "percentage": round(cnt / total_choice * 100, 2),
                })
            # Include any coded responses for options not in answer_options
            for code, cnt in code_counts.items():
                if code not in option_map:
                    options_out.append({
                        "option_code": code,
                        "option_title": None,
                        "count": cnt,
                        "percentage": round(cnt / total_choice * 100, 2),
                    })

            stats = {
                "question_type": qtype,
                "response_count": response_count,
                "options": options_out,
            }

        elif qtype in MULTI_CHOICE_TYPES:
            # Multiple choice: value is a list of codes
            options_result = await session.execute(
                select(AnswerOption)
                .where(AnswerOption.question_id == question_id)
                .order_by(AnswerOption.sort_order)
            )
            answer_options = list(options_result.scalars().all())
            option_map = {opt.code: opt.title for opt in answer_options}

            code_counts = {}
            total_selections = 0
            for val in raw_values:
                if isinstance(val, list):
                    for code in val:
                        c = str(code)
                        code_counts[c] = code_counts.get(c, 0) + 1
                        total_selections += 1
                elif val is not None:
                    c = str(val)
                    code_counts[c] = code_counts.get(c, 0) + 1
                    total_selections += 1

            options_out = []
            total_denom = total_selections if total_selections > 0 else 1
            for opt in answer_options:
                cnt = code_counts.get(opt.code, 0)
                options_out.append({
                    "option_code": opt.code,
                    "option_title": opt.title,
                    "count": cnt,
                    "percentage": round(cnt / total_denom * 100, 2),
                })
            for code, cnt in code_counts.items():
                if code not in option_map:
                    options_out.append({
                        "option_code": code,
                        "option_title": None,
                        "count": cnt,
                        "percentage": round(cnt / total_denom * 100, 2),
                    })

            stats = {
                "question_type": qtype,
                "response_count": response_count,
                "options": options_out,
            }

        elif qtype in NUMERIC_TYPES:
            # Numeric: compute mean, median, min, max Python-side
            numeric_vals: list[float] = []
            for val in raw_values:
                try:
                    numeric_vals.append(float(val))
                except (TypeError, ValueError):
                    pass

            if numeric_vals:
                mean_val = sum(numeric_vals) / len(numeric_vals)
                median_val = statistics.median(numeric_vals)
                min_val = min(numeric_vals)
                max_val = max(numeric_vals)
            else:
                mean_val = median_val = min_val = max_val = None

            stats = {
                "question_type": qtype,
                "response_count": len(numeric_vals),
                "mean": mean_val,
                "median": median_val,
                "min": min_val,
                "max": max_val,
            }

        elif qtype in RATING_TYPES:
            # Rating: compute average and distribution
            numeric_vals = []
            dist_counts: dict[str, int] = {}
            for val in raw_values:
                s = str(val)
                dist_counts[s] = dist_counts.get(s, 0) + 1
                try:
                    numeric_vals.append(float(val))
                except (TypeError, ValueError):
                    pass

            average = sum(numeric_vals) / len(numeric_vals) if numeric_vals else None
            distribution = [
                {"value": k, "count": v}
                for k, v in sorted(dist_counts.items(), key=lambda x: x[0])
            ]

            stats = {
                "question_type": qtype,
                "response_count": response_count,
                "average": average,
                "distribution": distribution,
            }

        else:
            # Text and all other types: just count responses
            stats = {
                "question_type": qtype,
                "response_count": response_count,
            }

        question_stats_list.append({
            "question_id": question.id,
            "question_code": question.code,
            "question_title": question.title,
            "question_type": qtype,
            "stats": stats,
        })

    return {
        "survey_id": survey_id,
        "total_responses": total_responses,
        "complete_responses": complete_responses,
        "incomplete_responses": incomplete_responses,
        "disqualified_responses": disqualified_responses,
        "completion_rate": round(completion_rate, 4),
        "average_completion_time_seconds": avg_time_seconds,
        "questions": question_stats_list,
    }


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
