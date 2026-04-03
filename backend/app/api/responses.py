"""Public endpoint for submitting survey responses."""

import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.response import ResponseCreate, ResponseResponse, ResponseStatusUpdate, ResponseUpdate
from app.services.response_service import complete_response, create_response, disqualify_response
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


@router.post(
    "/{survey_id}/responses",
    response_model=ResponseResponse,
    status_code=status.HTTP_201_CREATED,
)
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
    )
    return ResponseResponse.model_validate(response)


@router.patch(
    "/{survey_id}/responses/{response_id}",
    response_model=ResponseResponse,
    status_code=status.HTTP_200_OK,
)
async def update_response(
    survey_id: str,
    response_id: str,
    payload: ResponseUpdate,
    session: AsyncSession = Depends(get_db),
) -> ResponseResponse:
    """Update a survey response. Triggers completion flow when status='complete'."""
    parsed_survey_id = _parse_survey_id(survey_id)
    parsed_response_id = _parse_response_id(response_id)

    if payload.status == "complete":
        response = await complete_response(
            session,
            survey_id=parsed_survey_id,
            response_id=parsed_response_id,
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
)
async def update_response_status(
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
