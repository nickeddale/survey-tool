import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.survey import (
    SurveyCreate,
    SurveyFullResponse,
    SurveyListResponse,
    SurveyResponse,
    SurveyUpdate,
)
from app.services.survey_service import (
    create_survey,
    delete_survey,
    get_survey_by_id,
    get_survey_full_by_id,
    list_surveys,
    update_survey,
)

router = APIRouter(prefix="/surveys", tags=["surveys"])


@router.post(
    "",
    response_model=SurveyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create(
    payload: SurveyCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    survey = await create_survey(
        session,
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        welcome_message=payload.welcome_message,
        end_message=payload.end_message,
        default_language=payload.default_language,
        settings=payload.settings,
    )
    return SurveyResponse.model_validate(survey)


@router.get("", response_model=SurveyListResponse)
async def list_all(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    search: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyListResponse:
    items, total = await list_surveys(
        session,
        user_id=current_user.id,
        page=page,
        per_page=per_page,
        status=status,
        search=search,
    )
    return SurveyListResponse(
        items=[SurveyResponse.model_validate(s) for s in items],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{survey_id}", response_model=SurveyFullResponse)
async def get_one(
    survey_id: str,
    include: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyFullResponse:
    try:
        parsed_id = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found",
        )

    survey = await get_survey_full_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found",
        )

    return SurveyFullResponse.model_validate(survey)


@router.patch("/{survey_id}", response_model=SurveyResponse)
async def patch(
    survey_id: str,
    payload: SurveyUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    try:
        parsed_id = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found",
        )

    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found",
        )

    update_fields = payload.model_dump(exclude_unset=True)
    survey = await update_survey(session, survey, **update_fields)
    return SurveyResponse.model_validate(survey)


@router.delete("/{survey_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    try:
        parsed_id = uuid.UUID(survey_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found",
        )

    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Survey not found",
        )

    await delete_survey(session, survey)
