import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AnswerOptionCreate(BaseModel):
    title: str = Field(max_length=500, description="Answer option label displayed to respondents.", example="Strongly Agree")
    code: str | None = Field(default=None, max_length=100, description="Short identifier used in exports and expressions.", example="A1")
    sort_order: int | None = Field(default=None, description="Display order within the question. Auto-assigned if omitted.", example=1)
    assessment_value: int = Field(default=0, description="Numeric score value used for assessment calculations.", example=5)


class AnswerOptionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    code: str | None = Field(default=None, max_length=100)
    sort_order: int | None = None
    assessment_value: int | None = None


class AnswerOptionTranslationsUpdate(BaseModel):
    lang: str
    translations: dict[str, str | None]


class AnswerOptionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    question_id: uuid.UUID
    code: str
    title: str
    sort_order: int
    assessment_value: int
    translations: dict[str, Any] = {}
    created_at: datetime


class AnswerOptionReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class AnswerOptionReorderRequest(BaseModel):
    items: list[AnswerOptionReorderItem]


class AnswerOptionListResponse(BaseModel):
    items: list[AnswerOptionResponse]
    total: int
    page: int
    per_page: int
