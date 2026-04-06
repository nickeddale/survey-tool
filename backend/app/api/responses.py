"""Public endpoint for submitting survey responses."""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.limiter import RATE_LIMITS, limiter
from app.models.user import User
from app.schemas.response import (
    ResponseCreate,
    ResponseDetail,
    ResponseListResponse,
    ResponseResponse,
    ResponseStatusUpdate,
    ResponseSummary,
    ResponseUpdate,
    SurveyStatisticsResponse,
)
from app.services.export_service import (
    build_csv_headers,
    build_json_export,
    generate_csv_stream,
    get_responses_for_export,
)
from app.services.response_service import (
    complete_response,
    create_response,
    disqualify_response,
    get_response_detail,
    get_response_with_answers,
    get_survey_statistics,
    list_responses,
    save_partial_response,
)
from app.utils.errors import ForbiddenError, NotFoundError, UnprocessableError

router = APIRouter(prefix="/surveys", tags=["responses"])


def _parse_survey_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Survey not found")


def _parse_response_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Response not found")


def _extract_ip(request: Request) -> str | None:
    """Extract the client IP address from X-Forwarded-For or direct connection."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For may contain a comma-separated list; take the first entry
        return forwarded_for.split(",")[0].strip()
    client = request.client
    if client is not None:
        return client.host
    return None


def _extract_metadata(request: Request) -> dict:
    """Extract relevant request metadata (user-agent, referrer)."""
    return {
        "user_agent": request.headers.get("User-Agent"),
        "referrer": request.headers.get("Referer"),
    }


@router.get(
    "/{survey_id}/statistics",
    response_model=SurveyStatisticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get aggregate statistics for a survey",
    description=(
        "Return aggregate statistics for a survey including total/complete/incomplete/"
        "disqualified response counts, completion rate, average completion time, "
        "and per-question summaries. Requires authentication."
    ),
)
async def get_survey_statistics_endpoint(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyStatisticsResponse:
    """Return aggregate statistics for a survey. Requires authentication.

    Survey must be owned by the authenticated user; returns 404 otherwise.
    Returns total/complete/incomplete/disqualified response counts, completion rate,
    average completion time, and per-question summaries.
    """
    parsed_survey_id = _parse_survey_id(survey_id)

    stats = await get_survey_statistics(
        session,
        survey_id=parsed_survey_id,
        user_id=current_user.id,
    )
    return SurveyStatisticsResponse(**stats)


@router.get(
    "/{survey_id}/responses",
    response_model=ResponseListResponse,
    status_code=status.HTTP_200_OK,
    summary="List responses for a survey",
    description="Return a paginated, filterable list of responses for a survey. Supports filtering by status, date range, and sorting. Requires authentication.",
)
async def list_survey_responses(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    started_after: datetime | None = Query(default=None),
    started_before: datetime | None = Query(default=None),
    completed_after: datetime | None = Query(default=None),
    completed_before: datetime | None = Query(default=None),
    sort_by: Literal["started_at", "completed_at", "status"] = Query(default="started_at"),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
) -> ResponseListResponse:
    """List responses for a survey with filtering and pagination. Requires authentication."""
    parsed_survey_id = _parse_survey_id(survey_id)

    responses, total = await list_responses(
        session,
        survey_id=parsed_survey_id,
        user_id=current_user.id,
        status=status_filter,
        started_after=started_after,
        started_before=started_before,
        completed_after=completed_after,
        completed_before=completed_before,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )

    items = [ResponseSummary.model_validate(r) for r in responses]
    pages = max(1, (total + per_page - 1) // per_page)

    return ResponseListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post(
    "/{survey_id}/responses",
    response_model=ResponseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new survey response",
    description="Create a new response for a survey. Public endpoint — no authentication required. Optionally supply a participant token and initial answers.",
)
@limiter.limit(RATE_LIMITS["response_submit"])
async def submit_response(
    survey_id: str,
    payload: ResponseCreate,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> ResponseResponse:
    """Start a new survey response. Public endpoint — no authentication required."""
    parsed_id = _parse_survey_id(survey_id)
    ip = _extract_ip(request)
    meta = _extract_metadata(request)

    answers = [
        {"question_id": a.question_id, "value": a.value}
        for a in payload.answers
    ]

    response = await create_response(
        session,
        survey_id=parsed_id,
        ip_address=ip,
        metadata=meta,
        answers=answers if answers else None,
        token=payload.participant_token,
    )
    return ResponseResponse.model_validate(response)


@router.get(
    "/{survey_id}/responses/export",
    status_code=status.HTTP_200_OK,
    summary="Export survey responses as CSV or JSON",
    description="Download all responses for a survey as a CSV or JSON file. Supports column selection and date range filters. Requires authentication.",
)
async def export_survey_responses(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    format: Literal["csv", "json"] = Query(default="csv"),
    columns: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    started_after: datetime | None = Query(default=None),
    started_before: datetime | None = Query(default=None),
    completed_after: datetime | None = Query(default=None),
    completed_before: datetime | None = Query(default=None),
):
    """Export all responses for a survey as CSV (default) or JSON.

    Requires authentication. Survey must be owned by the authenticated user;
    returns 404 otherwise (no ownership oracle).

    Query parameters:
        format: 'csv' (default) or 'json'
        columns: comma-separated list of question codes to include (default: all)
        status: filter by response status
        started_after/before: datetime range filters for started_at
        completed_after/before: datetime range filters for completed_at

    CSV format:
        - One row per response
        - Metadata columns: response_id, status, started_at, completed_at, ip_address
        - Question columns: question codes as headers (matrix: Q5_SQ001 style)
        - Multi-value answers (multiple_choice) are comma-joined within the cell

    JSON format:
        - Array of response objects with 'answers' dict keyed by question code
    """
    if format not in ("csv", "json"):
        raise HTTPException(status_code=400, detail="Invalid format. Must be 'csv' or 'json'.")

    parsed_survey_id = _parse_survey_id(survey_id)

    # Parse columns filter
    column_list: list[str] | None = None
    if columns is not None:
        column_list = [c.strip() for c in columns.split(",") if c.strip()]

    responses = await get_responses_for_export(
        session,
        survey_id=parsed_survey_id,
        user_id=current_user.id,
        status=status_filter,
        started_after=started_after,
        started_before=started_before,
        completed_after=completed_after,
        completed_before=completed_before,
    )

    headers = build_csv_headers(responses, columns=column_list)

    if format == "json":
        data = build_json_export(responses, headers)
        filename = f"survey_{survey_id}_responses.json"
        return JSONResponse(
            content=data,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    # Default: CSV
    filename = f"survey_{survey_id}_responses.csv"
    return StreamingResponse(
        generate_csv_stream(responses, headers),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get(
    "/{survey_id}/responses/{response_id}/detail",
    response_model=ResponseDetail,
    status_code=status.HTTP_200_OK,
    summary="Get enriched response detail",
    description="Return full response detail with answers enriched with question metadata. Requires authentication.",
)
async def get_response_detail_endpoint(
    survey_id: str,
    response_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ResponseDetail:
    """Retrieve full response detail with enriched answer data. Requires authentication.

    Returns all answers enriched with question metadata (code, title, type).
    Choice questions include selected_option_title. Matrix answers include subquestion_label.
    Survey must be owned by the authenticated user; returns 404 otherwise (no ownership oracle).

    Requires responses:read scope for API key authentication.
    """
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_response_id = _parse_response_id(response_id)

    detail = await get_response_detail(
        session,
        survey_id=parsed_survey_id,
        response_id=parsed_response_id,
        user_id=current_user.id,
    )
    return ResponseDetail(**detail)


@router.get(
    "/{survey_id}/responses/{response_id}",
    response_model=ResponseResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a survey response",
    description="Retrieve a response with its current answers. Public endpoint used for resume functionality.",
)
async def get_response(
    survey_id: str,
    response_id: str,
    session: AsyncSession = Depends(get_db),
) -> ResponseResponse:
    """Retrieve a survey response with its current answers for resume functionality. Public endpoint."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_response_id = _parse_response_id(response_id)

    response = await get_response_with_answers(
        session,
        survey_id=parsed_survey_id,
        response_id=parsed_response_id,
    )
    return ResponseResponse.model_validate(response)


@router.patch(
    "/{survey_id}/responses/{response_id}",
    response_model=ResponseResponse,
    status_code=status.HTTP_200_OK,
    summary="Update or complete a survey response",
    description=(
        "Update answer values or mark a response as complete. "
        "Set status='complete' to trigger completion validation. "
        "Omit status to perform a partial save without validation. Public endpoint."
    ),
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_response(
    request: Request,
    survey_id: str,
    response_id: str,
    payload: ResponseUpdate,
    session: AsyncSession = Depends(get_db),
) -> ResponseResponse:
    """Update a survey response.

    - status='complete': triggers completion validation and marks response complete.
    - status=None with answers: performs a partial save (upsert answers, no validation).
    """
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_response_id = _parse_response_id(response_id)

    if payload.status == "complete":
        response = await complete_response(
            session,
            survey_id=parsed_survey_id,
            response_id=parsed_response_id,
        )
    elif payload.status is None:
        answers = [
            {"question_id": a.question_id, "value": a.value}
            for a in payload.answers
        ]
        response = await save_partial_response(
            session,
            survey_id=parsed_survey_id,
            response_id=parsed_response_id,
            answers=answers,
        )
    else:
        raise UnprocessableError(
            f"Unsupported status value: '{payload.status}'. Only 'complete' is accepted."
        )

    return ResponseResponse.model_validate(response)


@router.patch(
    "/{survey_id}/responses/{response_id}/status",
    response_model=ResponseResponse,
    status_code=status.HTTP_200_OK,
    summary="Update response status (admin)",
    description="Admin endpoint to set a response status to 'disqualified'. Requires authentication.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_response_status(
    request: Request,
    survey_id: str,
    response_id: str,
    payload: ResponseStatusUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ResponseResponse:
    """Admin endpoint to update response status. Requires authentication.

    Only 'disqualified' is accepted as a target status via this endpoint.
    Invalid status values return 422.
    """
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_response_id = _parse_response_id(response_id)

    if payload.status != "disqualified":
        raise UnprocessableError(
            f"Invalid status transition: only 'disqualified' is accepted. Got '{payload.status}'."
        )

    response = await disqualify_response(
        session,
        survey_id=parsed_survey_id,
        response_id=parsed_response_id,
    )
    return ResponseResponse.model_validate(response)
