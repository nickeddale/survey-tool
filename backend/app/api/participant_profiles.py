"""CRUD endpoints for participant profiles (shared contact database)."""

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, pagination_params, require_scope
from app.utils.pagination import PaginationParams
from app.limiter import RATE_LIMITS, limiter
from app.models.user import User
from app.schemas.participant_profile import (
    ParticipantProfileBatchCreate,
    ParticipantProfileCreate,
    ParticipantProfileDetailResponse,
    ParticipantProfileListResponse,
    ParticipantProfileResponse,
    ParticipantProfileUpdate,
)
from app.services.participant_profile_service import (
    batch_create_profiles,
    create_profile,
    delete_profile,
    get_profile_with_history,
    list_profiles,
    update_profile,
)
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/participant-profiles", tags=["participant-profiles"])


def _parse_profile_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Participant profile not found")


@router.post(
    "",
    response_model=ParticipantProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a participant profile",
    description="Create a new profile in the shared contact database. Email must be globally unique.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def create_participant_profile(
    request: Request,
    payload: ParticipantProfileCreate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> ParticipantProfileResponse:
    profile = await create_profile(session, payload)
    return ParticipantProfileResponse.model_validate(profile)


@router.post(
    "/batch",
    response_model=list[ParticipantProfileResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Batch-create participant profiles",
    description="Create multiple profiles in a single request. Fails if any email is already taken.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def batch_create_participant_profiles(
    request: Request,
    payload: ParticipantProfileBatchCreate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> list[ParticipantProfileResponse]:
    profiles = await batch_create_profiles(session, payload.items)
    return [ParticipantProfileResponse.model_validate(p) for p in profiles]


@router.get(
    "",
    response_model=ParticipantProfileListResponse,
    status_code=status.HTTP_200_OK,
    summary="List participant profiles",
    description="Return a paginated list of profiles with optional filters.",
)
async def list_participant_profiles(
    pagination: PaginationParams = Depends(pagination_params),
    email: str | None = Query(None),
    name: str | None = Query(None),
    organization: str | None = Query(None),
    tag: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ParticipantProfileListResponse:
    items, total = await list_profiles(
        session,
        page=pagination.page,
        per_page=pagination.per_page,
        email=email,
        name=name,
        tag=tag,
        organization=organization,
    )
    pages = max(1, (total + pagination.per_page - 1) // pagination.per_page)
    return ParticipantProfileListResponse(
        items=[ParticipantProfileResponse.model_validate(p) for p in items],
        total=total,
        page=pagination.page,
        per_page=pagination.per_page,
        pages=pages,
    )


@router.get(
    "/{profile_id}",
    response_model=ParticipantProfileDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a participant profile",
    description="Return a profile with its cross-survey participation history.",
)
async def get_participant_profile(
    profile_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ParticipantProfileDetailResponse:
    parsed_id = _parse_profile_id(profile_id)
    profile, history = await get_profile_with_history(session, parsed_id)
    result = ParticipantProfileDetailResponse.model_validate(profile)
    result.survey_history = history
    return result


@router.patch(
    "/{profile_id}",
    response_model=ParticipantProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a participant profile",
    description="Partially update a profile's fields.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_participant_profile(
    request: Request,
    profile_id: str,
    payload: ParticipantProfileUpdate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> ParticipantProfileResponse:
    parsed_id = _parse_profile_id(profile_id)
    profile = await update_profile(session, parsed_id, payload)
    return ParticipantProfileResponse.model_validate(profile)


@router.delete(
    "/{profile_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a participant profile",
    description="Delete a profile. Linked per-survey participants have their profile_id set to NULL.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def delete_participant_profile(
    request: Request,
    profile_id: str,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> None:
    parsed_id = _parse_profile_id(profile_id)
    await delete_profile(session, parsed_id)
