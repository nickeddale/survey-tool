import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, pagination_params
from app.utils.pagination import PaginationParams
from app.limiter import RATE_LIMITS, limiter
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
    SurveyVersionListResponse,
    SurveyVersionResponse,
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
    get_survey_full_public,
    get_survey_versions,
    list_surveys,
    update_survey,
)
from app.services.translation_service import (
    apply_survey_translations,
    update_survey_translations,
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
    summary="Create a new survey",
    description="Create a new survey in draft status. The survey is owned by the authenticated user.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def create(
    request: Request,
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


@router.get(
    "",
    response_model=SurveyListResponse,
    summary="List surveys",
    description="Return a paginated list of surveys owned by the authenticated user. Supports filtering by status and keyword search.",
)
async def list_all(
    pagination: PaginationParams = Depends(pagination_params),
    status: str | None = Query(None),
    search: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyListResponse:
    items, total = await list_surveys(
        session,
        user_id=current_user.id,
        page=pagination.page,
        per_page=pagination.per_page,
        status=status,
        search=search,
    )
    return SurveyListResponse(
        items=[SurveyResponse.model_validate(s) for s in items],
        total=total,
        page=pagination.page,
        per_page=pagination.per_page,
    )


@router.get(
    "/{survey_id}",
    response_model=SurveyFullResponse,
    summary="Get a survey with all groups and questions",
    description="Return the full survey including all question groups, questions, and answer options. Pass `lang` to receive translated content.",
)
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


@router.get(
    "/{survey_id}/public",
    response_model=SurveyFullResponse,
    summary="Get a public active survey",
    description="Return the full survey including all question groups, questions, and answer options for active surveys. No authentication required.",
)
@limiter.limit(RATE_LIMITS["default_read"])
async def get_public(
    request: Request,
    survey_id: str,
    lang: str | None = Query(None, description="Language code for translated content (e.g. 'fr')"),
    session: AsyncSession = Depends(get_db),
) -> SurveyFullResponse:
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_full_public(session, parsed_id)
    if survey is None:
        raise NotFoundError("Survey not found")

    validated = SurveyFullResponse.model_validate(survey)

    if lang and lang != survey.default_language:
        survey_dict = validated.model_dump()
        translated_dict = apply_survey_translations(survey_dict, lang)
        return SurveyFullResponse.model_validate(translated_dict)

    return validated


@router.patch(
    "/{survey_id}",
    response_model=SurveyResponse,
    summary="Update a survey",
    description="Partially update survey metadata fields such as title, description, status, and settings.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def patch(
    request: Request,
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


@router.get(
    "/{survey_id}/versions",
    response_model=SurveyVersionListResponse,
    summary="List survey version history",
    description="Return a paginated list of historical snapshots for a survey. Each entry captures the full survey state at the time of a change.",
)
async def list_versions(
    survey_id: str,
    pagination: PaginationParams = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyVersionListResponse:
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise NotFoundError("Survey not found")

    items, total = await get_survey_versions(
        session, parsed_id, page=pagination.page, per_page=pagination.per_page
    )
    return SurveyVersionListResponse(
        items=[SurveyVersionResponse.model_validate(v) for v in items],
        total=total,
        page=pagination.page,
        per_page=pagination.per_page,
    )


@router.patch(
    "/{survey_id}/translations",
    response_model=SurveyResponse,
    summary="Update survey translations for a language",
    description="Merge translation overrides for the specified language into the survey's translations store.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def update_translations(
    request: Request,
    survey_id: str,
    payload: SurveyTranslationsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    """Update translations for a specific language in a survey."""
    parsed_id = _parse_survey_id(survey_id)
    survey = await update_survey_translations(
        session, parsed_id, current_user.id, payload.lang, payload.translations
    )
    return SurveyResponse.model_validate(survey)


@router.delete(
    "/{survey_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a survey",
    description="Permanently delete a survey and all associated data (groups, questions, responses, etc.).",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def delete(
    request: Request,
    survey_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    parsed_id = _parse_survey_id(survey_id)
    survey = await get_survey_by_id(session, parsed_id, current_user.id)
    if survey is None:
        raise NotFoundError("Survey not found")
    await delete_survey(session, survey)


@router.post(
    "/{survey_id}/activate",
    response_model=SurveyResponse,
    summary="Activate a survey",
    description="Transition a survey from draft to active status, making it available for respondents.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def activate(
    request: Request,
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


@router.post(
    "/{survey_id}/close",
    response_model=SurveyResponse,
    summary="Close a survey",
    description="Transition a survey to closed status. Closed surveys no longer accept new responses.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def close(
    request: Request,
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


@router.post(
    "/{survey_id}/archive",
    response_model=SurveyResponse,
    summary="Archive a survey",
    description="Transition a survey to archived status. Archived surveys are read-only and hidden from active listings.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def archive(
    request: Request,
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
    summary="Clone a survey",
    description="Create a deep copy of a survey including all groups, questions, and answer options. The clone starts in draft status.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def clone(
    request: Request,
    survey_id: str,
    payload: SurveyCloneRequest = SurveyCloneRequest(),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    parsed_id = _parse_survey_id(survey_id)
    new_survey = await clone_survey(session, parsed_id, current_user.id, title=payload.title)
    return SurveyResponse.model_validate(new_survey)


@router.get(
    "/{survey_id}/export",
    response_model=SurveyExportResponse,
    summary="Export a survey as a portable JSON structure",
    description="Return a portable JSON representation of the survey including all groups, questions, and answer options.",
)
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
    summary="Import a survey from an exported JSON structure",
    description="Create a new survey from an exported JSON payload. Useful for migrating surveys between environments.",
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def import_survey_endpoint(
    request: Request,
    payload: SurveyImportRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> SurveyResponse:
    new_survey = await import_survey(
        session, current_user.id, payload.data, title=payload.title
    )
    return SurveyResponse.model_validate(new_survey)
