import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, pagination_params, require_scope
from app.utils.pagination import PaginationParams
from app.limiter import RATE_LIMITS, limiter
from app.models.user import User
from app.schemas.answer_option import (
    AnswerOptionCreate,
    AnswerOptionListResponse,
    AnswerOptionReorderRequest,
    AnswerOptionResponse,
    AnswerOptionTranslationsUpdate,
    AnswerOptionUpdate,
)
from app.services.answer_option_service import (
    create_answer_option,
    delete_answer_option,
    get_answer_option_by_id,
    list_answer_options,
    reorder_answer_options,
    update_answer_option,
)
from app.services.translation_service import update_answer_option_translations
from app.utils.errors import ConflictError, NotFoundError

router = APIRouter(
    prefix="/surveys/{survey_id}/questions/{question_id}/options",
    tags=["answer_options"],
)


def _parse_uuid(value: str, label: str = "resource") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError(f"{label} not found")


@router.post(
    "",
    response_model=AnswerOptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an answer option",
    description="Add a new answer option to a choice or matrix question.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def create(
    request: Request,
    survey_id: str,
    question_id: str,
    payload: AnswerOptionCreate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> AnswerOptionResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_question_id = _parse_uuid(question_id, "Question")

    try:
        option = await create_answer_option(
            session,
            survey_id=parsed_survey_id,
            question_id=parsed_question_id,
            user_id=current_user.id,
            title=payload.title,
            code=payload.code,
            sort_order=payload.sort_order,
            assessment_value=payload.assessment_value,
        )
    except IntegrityError:
        raise ConflictError("An option with that code already exists for this question")

    if option is None:
        raise NotFoundError("Survey or question not found")
    return AnswerOptionResponse.model_validate(option)


@router.get(
    "",
    response_model=AnswerOptionListResponse,
    summary="List answer options for a question",
    description="Return a paginated list of answer options for a question, ordered by sort_order.",
)
async def list_all(
    survey_id: str,
    question_id: str,
    pagination: PaginationParams = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AnswerOptionListResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_question_id = _parse_uuid(question_id, "Question")

    options = await list_answer_options(
        session,
        survey_id=parsed_survey_id,
        question_id=parsed_question_id,
        user_id=current_user.id,
    )
    if options is None:
        raise NotFoundError("Survey or question not found")

    total = len(options)
    page_items = options[pagination.offset:pagination.offset + pagination.per_page]

    return AnswerOptionListResponse(
        items=[AnswerOptionResponse.model_validate(o) for o in page_items],
        total=total,
        page=pagination.page,
        per_page=pagination.per_page,
    )


@router.post(
    "/reorder",
    response_model=list[AnswerOptionResponse],
    summary="Reorder answer options",
    description="Update the sort_order of multiple answer options in a single request.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def reorder(
    request: Request,
    survey_id: str,
    question_id: str,
    payload: AnswerOptionReorderRequest,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> list[AnswerOptionResponse]:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_question_id = _parse_uuid(question_id, "Question")

    items = [
        {"id": item.id, "sort_order": item.sort_order}
        for item in payload.items
    ]

    options = await reorder_answer_options(
        session,
        survey_id=parsed_survey_id,
        question_id=parsed_question_id,
        user_id=current_user.id,
        items=items,
    )
    if options is None:
        raise NotFoundError("Survey, question, or option IDs not found")
    return [AnswerOptionResponse.model_validate(o) for o in options]


@router.get(
    "/{option_id}",
    response_model=AnswerOptionResponse,
    summary="Get an answer option",
    description="Return a single answer option by ID.",
)
async def get_one(
    survey_id: str,
    question_id: str,
    option_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AnswerOptionResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_question_id = _parse_uuid(question_id, "Question")
    parsed_option_id = _parse_uuid(option_id, "Option")

    option = await get_answer_option_by_id(
        session,
        survey_id=parsed_survey_id,
        question_id=parsed_question_id,
        option_id=parsed_option_id,
        user_id=current_user.id,
    )
    if option is None:
        raise NotFoundError("Answer option not found")
    return AnswerOptionResponse.model_validate(option)


@router.patch(
    "/{option_id}",
    response_model=AnswerOptionResponse,
    summary="Update an answer option",
    description="Partially update an answer option's title, code, sort order, or assessment value.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def patch(
    request: Request,
    survey_id: str,
    question_id: str,
    option_id: str,
    payload: AnswerOptionUpdate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> AnswerOptionResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_question_id = _parse_uuid(question_id, "Question")
    parsed_option_id = _parse_uuid(option_id, "Option")

    option = await get_answer_option_by_id(
        session,
        survey_id=parsed_survey_id,
        question_id=parsed_question_id,
        option_id=parsed_option_id,
        user_id=current_user.id,
    )
    if option is None:
        raise NotFoundError("Answer option not found")

    update_fields = payload.model_dump(exclude_unset=True)
    try:
        option = await update_answer_option(session, option, **update_fields)
    except IntegrityError:
        raise ConflictError("An option with that code already exists for this question")
    return AnswerOptionResponse.model_validate(option)


@router.patch(
    "/{option_id}/translations",
    response_model=AnswerOptionResponse,
    summary="Update answer option translations for a language",
    description="Merge translation overrides for the specified language into the answer option's translations store.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_translations(
    request: Request,
    survey_id: str,
    question_id: str,
    option_id: str,
    payload: AnswerOptionTranslationsUpdate,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> AnswerOptionResponse:
    """Update translations for a specific language in an answer option."""
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_question_id = _parse_uuid(question_id, "Question")
    parsed_option_id = _parse_uuid(option_id, "Option")

    option = await update_answer_option_translations(
        session, parsed_survey_id, parsed_question_id, parsed_option_id, current_user.id, payload.lang, payload.translations
    )
    return AnswerOptionResponse.model_validate(option)


@router.delete(
    "/{option_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an answer option",
    description="Permanently delete an answer option from a question.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def delete(
    request: Request,
    survey_id: str,
    question_id: str,
    option_id: str,
    current_user: User = Depends(get_current_user),
    _scope: None = Depends(require_scope("surveys:write")),
    session: AsyncSession = Depends(get_db),
) -> None:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_question_id = _parse_uuid(question_id, "Question")
    parsed_option_id = _parse_uuid(option_id, "Option")

    option = await get_answer_option_by_id(
        session,
        survey_id=parsed_survey_id,
        question_id=parsed_question_id,
        option_id=parsed_option_id,
        user_id=current_user.id,
    )
    if option is None:
        raise NotFoundError("Answer option not found")
    await delete_answer_option(session, option)
