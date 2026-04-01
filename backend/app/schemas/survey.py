import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


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
    created_at: datetime
    updated_at: datetime


class SurveyFullResponse(SurveyResponse):
    groups: list = []
    questions: list = []
    options: list = []


class SurveyListResponse(BaseModel):
    items: list[SurveyResponse]
    total: int
    page: int
    per_page: int
