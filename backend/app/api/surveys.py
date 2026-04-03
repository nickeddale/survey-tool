import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.survey import (
    SurveyCloneRequest,
    SurveyCreate,
    SurveyExportResponse,
    SurveyFullResponse,
    SurveyImportRequest,
    SurveyListResponse,
    SurveyResponse,
    SurveyTranslationsUpdate,
    SurveyUpdate,
)
from app.services.export_service import (
    clone_survey,
    export_survey,
    import_survey,
)
from app.services.survey_service import (
    activate_survey,
    archive_survey,
    close_survey,
    create_survey,
    delete_survey,
    get_survey_by_id,
    get_survey_full_by_id,
    list_surveys,
    update_survey,
)
from app.services.translation_service import (
    apply_survey_translations,
    merge_translations,
)
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/surveys", tags=["surveys"])


def _parse_survey_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Survey not found")


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
    lang: str | None = Query(None, description="Language code for translated content (e.g. 'fr')"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyFullResponse:
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_full_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise NotFoundError("Survey not found")

    validated = SurveyFullResponse.model_validate(survey)

    if lang and lang != survey.default_language:
        survey_dict = validated.model_dump()
        translated_dict = apply_survey_translations(survey_dict, lang)
        return SurveyFullResponse.model_validate(translated_dict)

    return validated


@router.patch("/{survey_id}", response_model=SurveyResponse)
async def patch(
    survey_id: str,
    payload: SurveyUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise NotFoundError("Survey not found")

    update_fields = payload.model_dump(exclude_unset=True)
    survey = await update_survey(session, survey, **update_fields)
    return SurveyResponse.model_validate(survey)


@router.patch("/{survey_id}/translations", response_model=SurveyResponse)
async def update_translations(
    survey_id: str,
    payload: SurveyTranslationsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    """Update translations for a specific language in a survey."""
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise NotFoundError("Survey not found")

    new_translations = merge_translations(
        survey.translations or {},
        payload.lang,
        payload.translations,
    )
    survey = await update_survey(session, survey, translations=new_translations)
    return SurveyResponse.model_validate(survey)


@router.delete("/{survey_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise NotFoundError("Survey not found")
    await delete_survey(session, survey)


@router.post("/{survey_id}/activate", response_model=SurveyResponse)
async def activate(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise NotFoundError("Survey not found")
    survey = await activate_survey(session, survey)
    return SurveyResponse.model_validate(survey)


@router.post("/{survey_id}/close", response_model=SurveyResponse)
async def close(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise NotFoundError("Survey not found")
    survey = await close_survey(session, survey)
    return SurveyResponse.model_validate(survey)


@router.post("/{survey_id}/archive", response_model=SurveyResponse)
async def archive(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise NotFoundError("Survey not found")
    survey = await archive_survey(session, survey)
    return SurveyResponse.model_validate(survey)


@router.post(
    "/{survey_id}/clone",
    response_model=SurveyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def clone(
    survey_id: str,
    payload: SurveyCloneRequest = SurveyCloneRequest(),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    parsed_id = _parse_survey_id(survey_id)
    new_survey = await clone_survey(session, parsed_id, current_user.id, title=payload.title)
    return SurveyResponse.model_validate(new_survey)


@router.get("/{survey_id}/export", response_model=SurveyExportResponse)
async def export(
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyExportResponse:
    parsed_id = _parse_survey_id(survey_id)
    data = await export_survey(session, parsed_id, current_user.id)
    return SurveyExportResponse(**data)


@router.post(
    "/import",
    response_model=SurveyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_survey_endpoint(
    payload: SurveyImportRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    new_survey = await import_survey(
        session, current_user.id, payload.data, title=payload.title
    )
    return SurveyResponse.model_validate(new_survey)
