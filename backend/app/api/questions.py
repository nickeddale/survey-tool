import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, pagination_params
from app.utils.pagination import PaginationParams
from app.limiter import RATE_LIMITS, limiter
from app.models.user import User
from app.schemas.question import (
    QuestionCreate,
    QuestionListResponse,
    QuestionReorderRequest,
    QuestionResponse,
    QuestionTranslationsUpdate,
    QuestionUpdate,
    SubquestionCreate,
)
from app.services.question_service import (
    create_question,
    create_subquestion,
    delete_question,
    get_question_by_id,
    list_questions,
    reorder_questions,
    update_question,
)
from app.services.translation_service import update_question_translations
from app.utils.errors import ConflictError, NotFoundError, UnprocessableError

router = APIRouter(
    prefix="/surveys/{survey_id}/groups/{group_id}/questions",
    tags=["questions"],
)

subquestions_router = APIRouter(
    prefix="/surveys/{survey_id}/questions/{question_id}/subquestions",
    tags=["questions"],
)


def _parse_uuid(value: str, label: str = "resource") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError(f"{label} not found")


@router.post(
    "",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a question",
    description="Add a new question to a question group. Supports all question types: text, numeric, boolean, single_choice, multiple_choice, rating, date, matrix, and ranking.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def create(
    request: Request,
    survey_id: str,
    group_id: str,
    payload: QuestionCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")

    try:
        question = await create_question(
            session,
            survey_id=parsed_survey_id,
            group_id=parsed_group_id,
            user_id=current_user.id,
            question_type=payload.question_type,
            title=payload.title,
            code=payload.code,
            description=payload.description,
            is_required=payload.is_required,
            sort_order=payload.sort_order,
            relevance=payload.relevance,
            validation=payload.validation,
            settings=payload.settings,
            parent_id=payload.parent_id,
        )
    except ValueError as exc:
        raise ConflictError(str(exc))
    except IntegrityError:
        raise ConflictError("A question with that code already exists in this survey")

    if question is None:
        raise NotFoundError("Survey or group not found")
    return QuestionResponse.model_validate(question)


@router.get(
    "",
    response_model=QuestionListResponse,
    summary="List questions in a group",
    description="Return a paginated list of questions in a question group, ordered by sort_order.",
)
async def list_all(
    survey_id: str,
    group_id: str,
    pagination: PaginationParams = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionListResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")

    questions = await list_questions(
        session,
        survey_id=parsed_survey_id,
        group_id=parsed_group_id,
        user_id=current_user.id,
    )
    if questions is None:
        raise NotFoundError("Survey or group not found")

    total = len(questions)
    page_items = questions[pagination.offset:pagination.offset + pagination.per_page]

    return QuestionListResponse(
        items=[QuestionResponse.model_validate(q) for q in page_items],
        total=total,
        page=pagination.page,
        per_page=pagination.per_page,
    )


@router.post(
    "/reorder",
    response_model=list[QuestionResponse],
    summary="Reorder questions",
    description="Update the sort_order and optionally the group assignment of multiple questions in a single request.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def reorder(
    request: Request,
    survey_id: str,
    group_id: str,
    payload: QuestionReorderRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[QuestionResponse]:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")

    items = [
        {
            "id": item.id,
            "sort_order": item.sort_order,
            "group_id": item.group_id,
        }
        for item in payload.items
    ]

    questions = await reorder_questions(
        session,
        survey_id=parsed_survey_id,
        group_id=parsed_group_id,
        user_id=current_user.id,
        items=items,
    )
    if questions is None:
        raise NotFoundError("Survey, group, or question IDs not found")
    return [QuestionResponse.model_validate(q) for q in questions]


@router.get(
    "/{question_id}",
    response_model=QuestionResponse,
    summary="Get a question",
    description="Return a single question by ID, including its answer options and subquestions.",
)
async def get_one(
    survey_id: str,
    group_id: str,
    question_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")
    parsed_question_id = _parse_uuid(question_id, "Question")

    question = await get_question_by_id(
        session,
        survey_id=parsed_survey_id,
        group_id=parsed_group_id,
        question_id=parsed_question_id,
        user_id=current_user.id,
    )
    if question is None:
        raise NotFoundError("Question not found")
    return QuestionResponse.model_validate(question)


@router.patch(
    "/{question_id}",
    response_model=QuestionResponse,
    summary="Update a question",
    description="Partially update a question's type, title, code, description, required flag, sort order, relevance, validation, or settings.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def patch(
    request: Request,
    survey_id: str,
    group_id: str,
    question_id: str,
    payload: QuestionUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionResponse:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")
    parsed_question_id = _parse_uuid(question_id, "Question")

    question = await get_question_by_id(
        session,
        survey_id=parsed_survey_id,
        group_id=parsed_group_id,
        question_id=parsed_question_id,
        user_id=current_user.id,
    )
    if question is None:
        raise NotFoundError("Question not found")

    update_fields = payload.model_dump(exclude_unset=True)
    question = await update_question(session, question, **update_fields)
    return QuestionResponse.model_validate(question)


@router.patch(
    "/{question_id}/translations",
    response_model=QuestionResponse,
    summary="Update question translations for a language",
    description="Merge translation overrides for the specified language into the question's translations store.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_translations(
    request: Request,
    survey_id: str,
    group_id: str,
    question_id: str,
    payload: QuestionTranslationsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionResponse:
    """Update translations for a specific language in a question."""
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")
    parsed_question_id = _parse_uuid(question_id, "Question")

    question = await update_question_translations(
        session, parsed_survey_id, parsed_group_id, parsed_question_id, current_user.id, payload.lang, payload.translations
    )
    return QuestionResponse.model_validate(question)


@router.delete(
    "/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a question",
    description="Permanently delete a question and all its answer options and subquestions.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def delete(
    request: Request,
    survey_id: str,
    group_id: str,
    question_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_group_id = _parse_uuid(group_id, "Group")
    parsed_question_id = _parse_uuid(question_id, "Question")

    question = await get_question_by_id(
        session,
        survey_id=parsed_survey_id,
        group_id=parsed_group_id,
        question_id=parsed_question_id,
        user_id=current_user.id,
    )
    if question is None:
        raise NotFoundError("Question not found")
    await delete_question(session, question)


@subquestions_router.post(
    "",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a subquestion for a matrix question",
    description="Add a subquestion (row) to a matrix-type parent question. Returns the parent question with the updated subquestions list.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def create_subquestion_endpoint(
    request: Request,
    survey_id: str,
    question_id: str,
    payload: SubquestionCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> QuestionResponse:
    """Create a subquestion (row) for a matrix parent question.

    Returns the parent question with the new subquestion included in the subquestions array.
    """
    parsed_survey_id = _parse_uuid(survey_id, "Survey")
    parsed_question_id = _parse_uuid(question_id, "Question")

    try:
        parent = await create_subquestion(
            session,
            survey_id=parsed_survey_id,
            question_id=parsed_question_id,
            user_id=current_user.id,
            title=payload.title,
            code=payload.code,
            description=payload.description,
            is_required=payload.is_required,
            sort_order=payload.sort_order,
        )
    except IntegrityError:
        raise ConflictError("A subquestion with that code already exists")

    if parent is None:
        raise NotFoundError("Question not found")
    return QuestionResponse.model_validate(parent)
