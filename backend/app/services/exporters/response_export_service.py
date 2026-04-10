"""Shared query layer for fetching survey responses for export.

get_responses_for_export         – fetches all responses with eagerly loaded
                                   answers, questions, and subquestions.
get_responses_for_export_chunked – async generator yielding paginated chunks
                                   of Response objects for streaming export.

Used by both csv_exporter and json_exporter.
"""
import uuid
from datetime import datetime
from typing import AsyncIterator

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.question import Question
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey

_CHUNK_SIZE = 100


async def get_responses_for_export(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str | None = None,
    started_after: datetime | None = None,
    started_before: datetime | None = None,
    completed_after: datetime | None = None,
    completed_before: datetime | None = None,
) -> list[Response]:
    """Fetch all responses for a survey with eagerly loaded answers and question metadata.

    Enforces survey ownership via a JOIN to the surveys table in a single query
    (no fetch-then-check). Returns 404 for both missing and unauthorized surveys.

    All relationships (Response.answers, ResponseAnswer.question, Question.subquestions)
    are eagerly loaded to prevent MissingGreenlet errors from lazy loading.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey to export responses from.
        user_id: The UUID of the authenticated user (ownership check).
        status: Optional filter by response status.
        started_after: Optional filter: responses started after this datetime.
        started_before: Optional filter: responses started before this datetime.
        completed_after: Optional filter: responses completed after this datetime.
        completed_before: Optional filter: responses completed before this datetime.

    Returns:
        List of Response objects with answers, question, and subquestions eagerly loaded.

    Raises:
        HTTPException(404): If the survey does not exist or does not belong to user_id.
    """
    # Validate survey existence AND ownership in a single query
    survey_result = await session.execute(
        select(Survey).where(Survey.id == survey_id, Survey.user_id == user_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=404, detail="Survey not found")

    # Build WHERE conditions for responses
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

    result = await session.execute(
        select(Response)
        .where(*conditions)
        .order_by(Response.started_at.asc())
        .options(
            selectinload(Response.answers)
            .selectinload(ResponseAnswer.question)
            .selectinload(Question.subquestions)
        )
    )
    return list(result.scalars().all())


async def get_responses_for_export_chunked(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str | None = None,
    started_after: datetime | None = None,
    started_before: datetime | None = None,
    completed_after: datetime | None = None,
    completed_before: datetime | None = None,
    chunk_size: int = _CHUNK_SIZE,
) -> AsyncIterator[list[Response]]:
    """Async generator yielding paginated chunks of Response objects for streaming export.

    Uses LIMIT/OFFSET pagination with eagerly loaded answers per chunk to avoid
    loading all responses into memory at once. The session must remain open for
    the full duration of iteration (do not close the session between chunks).

    Each chunk uses selectinload to eagerly load all answer relationships within
    the same session scope, preventing DetachedInstanceError.

    Args:
        session: The async database session (must stay open for full iteration).
        survey_id: The UUID of the survey to export responses from.
        user_id: The UUID of the authenticated user (ownership check).
        status: Optional filter by response status.
        started_after: Optional filter: responses started after this datetime.
        started_before: Optional filter: responses started before this datetime.
        completed_after: Optional filter: responses completed after this datetime.
        completed_before: Optional filter: responses completed before this datetime.
        chunk_size: Number of responses per chunk (default: 100).

    Yields:
        Lists of Response objects with answers, question, and subquestions eagerly loaded.

    Raises:
        HTTPException(404): If the survey does not exist or does not belong to user_id.
    """
    # Validate survey existence AND ownership in a single query
    survey_result = await session.execute(
        select(Survey).where(Survey.id == survey_id, Survey.user_id == user_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=404, detail="Survey not found")

    # Build WHERE conditions for responses
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

    offset = 0
    while True:
        result = await session.execute(
            select(Response)
            .where(*conditions)
            .order_by(Response.started_at.asc(), Response.id.asc())
            .limit(chunk_size)
            .offset(offset)
            .options(
                selectinload(Response.answers)
                .selectinload(ResponseAnswer.question)
                .selectinload(Question.subquestions)
            )
        )
        chunk = list(result.scalars().all())
        if not chunk:
            break
        yield chunk
        if len(chunk) < chunk_size:
            # Last page — no need for another query
            break
        offset += chunk_size
