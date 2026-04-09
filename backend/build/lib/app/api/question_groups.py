import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, pagination_params
from app.utils.pagination import PaginationParams
from app.limiter import RATE_LIMITS, limiter
from app.models.user import User
from app.schemas.question_group import (
    QuestionGroupCreate,
    QuestionGroupListResponse,
    QuestionGroupReorderRequest,
    QuestionGroupResponse,
    QuestionGroupTranslationsUpdate,
    QuestionGroupUpdate,
)
from app.services.question_group_service import (
    create_group,
    delete_group,
    get_group_by_id,
    list_groups,
    reorder_groups,
    update_group,
)
from app.services.translation_service import update_group_translations
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/surveys/{survey_id}/groups", tags=["question_groups"])


def _parse_uuid(value: str, label: str = "resource") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError(f"{label} not found")


@router.post(
    "",
    response_model=QuestionGroupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a question group",
    description="Add a new question group (page/section) to a survey. Groups define the logical sections of a survey and can have relevance expressions.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def create(
    request: Request,
    survey_id: str,
    payload: QuestionGroupCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionGroupResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    group = await create_group(
        session,
        survey_id=parsed_survey_id,
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        sort_order=payload.sort_order,
        relevance=payload.relevance,
    )
    if group is None:
        raise NotFoundError("Survey not found")
    return QuestionGroupResponse.model_validate(group)


@router.get(
    "",
    response_model=QuestionGroupListResponse,
    summary="List question groups for a survey",
    description="Return a paginated list of question groups for a survey ordered by sort_order.",
)
async def list_all(
    survey_id: str,
    pagination: PaginationParams = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionGroupListResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    groups = await list_groups(session, survey_id=parsed_survey_id, user_id=current_user.id)
    if groups is None:
        raise NotFoundError("Survey not found")

    total = len(groups)
    page_items = groups[pagination.offset:pagination.offset + pagination.per_page]

    return QuestionGroupListResponse(
        items=[QuestionGroupResponse.model_validate(g) for g in page_items],
        total=total,
        page=pagination.page,
        per_page=pagination.per_page,
    )


@router.patch(
    "/reorder",
    response_model=list[QuestionGroupResponse],
    summary="Reorder question groups",
    description="Update the sort_order of multiple question groups in a single request.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def reorder(
    request: Request,
    survey_id: str,
    payload: QuestionGroupReorderRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[QuestionGroupResponse]:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    order = [{"id": item.id, "sort_order": item.sort_order} for item in payload.order]
    groups = await reorder_groups(
        session,
        survey_id=parsed_survey_id,
        user_id=current_user.id,
        order=order,
    )
    if groups is None:
        raise NotFoundError("Survey not found or group IDs do not belong to this survey")
    return [QuestionGroupResponse.model_validate(g) for g in groups]


@router.get(
    "/{group_id}",
    response_model=QuestionGroupResponse,
    summary="Get a question group",
    description="Return a single question group by ID, including its questions.",
)
async def get_one(
    survey_id: str,
    group_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionGroupResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")
    group = await get_group_by_id(
        session,
        survey_id=parsed_survey_id,
        group_id=parsed_group_id,
        user_id=current_user.id,
    )
    if group is None:
        raise NotFoundError("Group not found")
    return QuestionGroupResponse.model_validate(group)


@router.patch(
    "/{group_id}",
    response_model=QuestionGroupResponse,
    summary="Update a question group",
    description="Partially update a question group's title, description, sort order, or relevance expression.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def patch(
    request: Request,
    survey_id: str,
    group_id: str,
    payload: QuestionGroupUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionGroupResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")
    group = await get_group_by_id(
        session,
        survey_id=parsed_survey_id,
        group_id=parsed_group_id,
        user_id=current_user.id,
    )
    if group is None:
        raise NotFoundError("Group not found")
    update_fields = payload.model_dump(exclude_unset=True)
    group = await update_group(session, group, **update_fields)
    return QuestionGroupResponse.model_validate(group)


@router.patch(
    "/{group_id}/translations",
    response_model=QuestionGroupResponse,
    summary="Update question group translations for a language",
    description="Merge translation overrides for the specified language into the question group's translations store.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_translations(
    request: Request,
    survey_id: str,
    group_id: str,
    payload: QuestionGroupTranslationsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionGroupResponse:
    """Update translations for a specific language in a question group."""
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")
    group = await update_group_translations(
        session, parsed_survey_id, parsed_group_id, current_user.id, payload.lang, payload.translations
    )
    return QuestionGroupResponse.model_validate(group)


@router.delete(
    "/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a question group",
    description="Permanently delete a question group and all its questions and answer options.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def delete(
    request: Request,
    survey_id: str,
    group_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")
    group = await get_group_by_id(
        session,
        survey_id=parsed_survey_id,
        group_id=parsed_group_id,
        user_id=current_user.id,
    )
    if group is None:
        raise NotFoundError("Group not found")
    await delete_group(session, group)
