import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.question_group import QuestionGroupResponse


class SurveyVersionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    survey_id: uuid.UUID
    version: int
    snapshot: dict[str, Any]
    created_at: datetime


class SurveyVersionListResponse(BaseModel):
    items: list[SurveyVersionResponse]
    total: int
    page: int
    per_page: int


class SurveyCreate(BaseModel):
    title: str
    description: str | None = None
    status: str = "draft"
    welcome_message: str | None = None
    end_message: str | None = None
    default_language: str = "en"
    settings: dict[str, Any] | None = None


class SurveyUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    welcome_message: str | None = None
    end_message: str | None = None
    default_language: str | None = None
    settings: dict[str, Any] | None = None


class SurveyTranslationsUpdate(BaseModel):
    lang: str
    translations: dict[str, str | None]


class SurveyResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    description: str | None
    status: str
    welcome_message: str | None
    end_message: str | None
    default_language: str
    settings: dict[str, Any] | None
    translations: dict[str, Any] = {}
    version: int
    created_at: datetime
    updated_at: datetime


class SurveyFullResponse(SurveyResponse):
    groups: list[QuestionGroupResponse] = []
    questions: list = []
    options: list = []


class SurveyListResponse(BaseModel):
    items: list[SurveyResponse]
    total: int
    page: int
    per_page: int


# ---------------------------------------------------------------------------
# Clone / Export / Import schemas
# ---------------------------------------------------------------------------


class SurveyCloneRequest(BaseModel):
    title: str | None = None


class SurveyExportAnswerOption(BaseModel):
    code: str
    title: str
    sort_order: int
    assessment_value: int
    translations: dict[str, Any] = {}


class SurveyExportQuestion(BaseModel):
    code: str
    question_type: str
    title: str
    description: str | None = None
    is_required: bool = False
    sort_order: int = 1
    relevance: str | None = None
    validation: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    translations: dict[str, Any] = {}
    answer_options: list[SurveyExportAnswerOption] = []
    subquestions: list["SurveyExportQuestion"] = []


SurveyExportQuestion.model_rebuild()


class SurveyExportGroup(BaseModel):
    title: str
    description: str | None = None
    sort_order: int = 1
    relevance: str | None = None
    translations: dict[str, Any] = {}
    questions: list[SurveyExportQuestion] = []


class SurveyExportResponse(BaseModel):
    title: str
    description: str | None = None
    status: str
    welcome_message: str | None = None
    end_message: str | None = None
    default_language: str = "en"
    settings: dict[str, Any] | None = None
    translations: dict[str, Any] = {}
    groups: list[SurveyExportGroup] = []


class SurveyImportRequest(BaseModel):
    title: str | None = None
    data: dict[str, Any]
