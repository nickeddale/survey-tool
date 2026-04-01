import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.answer_option import (
    AnswerOptionCreate,
    AnswerOptionListResponse,
    AnswerOptionReorderRequest,
    AnswerOptionResponse,
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

router = APIRouter(
    prefix="/surveys/{survey_id}/questions/{question_id}/options",
    tags=["answer_options"],
)


def _parse_uuid(value: str, label: str = "resource") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{label} not found",
        )


@router.post(
    "",
    response_model=AnswerOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    survey_id: str,
    question_id: str,
    payload: AnswerOptionCreate,
    current_user: User = Depends(get_current_user),
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An option with that code already exists for this question",
        )

    if option is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey or question not found",
        )
    return AnswerOptionResponse.model_validate(option)


@router.get("", response_model=AnswerOptionListResponse)
async def list_all(
    survey_id: str,
    question_id: str,
    page: int = 1,
    per_page: int = 50,
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey or question not found",
        )

    total = len(options)
    start = (page - 1) * per_page
    end = start + per_page
    page_items = options[start:end]

    return AnswerOptionListResponse(
        items=[AnswerOptionResponse.model_validate(o) for o in page_items],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/reorder", response_model=list[AnswerOptionResponse])
async def reorder(
    survey_id: str,
    question_id: str,
    payload: AnswerOptionReorderRequest,
    current_user: User = Depends(get_current_user),
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey, question, or option IDs not found",
        )
    return [AnswerOptionResponse.model_validate(o) for o in options]


@router.get("/{option_id}", response_model=AnswerOptionResponse)
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Answer option not found",
        )
    return AnswerOptionResponse.model_validate(option)


@router.patch("/{option_id}", response_model=AnswerOptionResponse)
async def patch(
    survey_id: str,
    question_id: str,
    option_id: str,
    payload: AnswerOptionUpdate,
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Answer option not found",
        )

    update_fields = payload.model_dump(exclude_unset=True)
    try:
        option = await update_answer_option(session, option, **update_fields)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An option with that code already exists for this question",
        )
    return AnswerOptionResponse.model_validate(option)


@router.delete("/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    survey_id: str,
    question_id: str,
    option_id: str,
    current_user: User = Depends(get_current_user),
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Answer option not found",
        )
    await delete_answer_option(session, option)
