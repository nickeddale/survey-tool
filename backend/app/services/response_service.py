"""Service layer for survey response creation and management."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey
from app.utils.errors import ConflictError, NotFoundError, UnprocessableError


async def create_response(
    session: AsyncSession,
    survey_id: uuid.UUID,
    ip_address: str | None = None,
    metadata: dict | None = None,
    answers: list[dict] | None = None,
) -> Response:
    """Create a new survey response.

    Verifies the survey exists and is active, creates the Response record,
    and optionally bulk-inserts initial ResponseAnswer rows.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey to respond to.
        ip_address: The respondent's IP address (from request).
        metadata: Metadata dict (user-agent, referrer, etc.).
        answers: Optional list of {'question_id': UUID, 'value': any} dicts.

    Raises:
        NotFoundError: If the survey does not exist.
        UnprocessableError: If the survey is not in 'active' status.
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
