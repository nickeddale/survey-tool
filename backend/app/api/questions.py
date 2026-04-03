import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
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
from app.services.translation_service import merge_translations
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
)
async def create(
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


@router.get("", response_model=QuestionListResponse)
async def list_all(
    survey_id: str,
    group_id: str,
    page: int = 1,
    per_page: int = 50,
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
    start = (page - 1) * per_page
    end = start + per_page
    page_items = questions[start:end]

    return QuestionListResponse(
        items=[QuestionResponse.model_validate(q) for q in page_items],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/reorder", response_model=list[QuestionResponse])
async def reorder(
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


@router.get("/{question_id}", response_model=QuestionResponse)
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


@router.patch("/{question_id}", response_model=QuestionResponse)
async def patch(
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


@router.patch("/{question_id}/translations", response_model=QuestionResponse)
async def update_translations(
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

    question = await get_question_by_id(
        session,
        survey_id=parsed_survey_id,
        group_id=parsed_group_id,
        question_id=parsed_question_id,
        user_id=current_user.id,
    )
    if question is None:
        raise NotFoundError("Question not found")

    new_translations = merge_translations(
        question.translations or {},
        payload.lang,
        payload.translations,
    )
    question = await update_question(session, question, translations=new_translations)
    return QuestionResponse.model_validate(question)


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
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
)
async def create_subquestion_endpoint(
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
