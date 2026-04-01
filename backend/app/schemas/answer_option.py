import uuid
from datetime import datetime

from pydantic import BaseModel


class AnswerOptionCreate(BaseModel):
    title: str
    code: str | None = None
    sort_order: int | None = None
    assessment_value: int = 0


class AnswerOptionUpdate(BaseModel):
    title: str | None = None
    code: str | None = None
    sort_order: int | None = None
    assessment_value: int | None = None


class AnswerOptionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    question_id: uuid.UUID
    code: str
    title: str
    sort_order: int
    assessment_value: int
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
