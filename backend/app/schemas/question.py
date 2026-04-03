import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator

from app.models.question import VALID_QUESTION_TYPES
from app.schemas.answer_option import AnswerOptionResponse


class QuestionCreate(BaseModel):
    question_type: str
    title: str
    code: str | None = None
    description: str | None = None
    is_required: bool = False
    sort_order: int | None = None
    relevance: str | None = None
    validation: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    parent_id: uuid.UUID | None = None

    @field_validator("question_type")
    @classmethod
    def validate_question_type(cls, v: str) -> str:
        if v not in VALID_QUESTION_TYPES:
            raise ValueError(
                f"question_type must be one of: {', '.join(VALID_QUESTION_TYPES)}"
            )
        return v


class QuestionUpdate(BaseModel):
    question_type: str | None = None
    title: str | None = None
    code: str | None = None
    description: str | None = None
    is_required: bool | None = None
    sort_order: int | None = None
    relevance: str | None = None
    validation: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None

    @field_validator("question_type")
    @classmethod
    def validate_question_type(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_QUESTION_TYPES:
            raise ValueError(
                f"question_type must be one of: {', '.join(VALID_QUESTION_TYPES)}"
            )
        return v


class QuestionTranslationsUpdate(BaseModel):
    lang: str
    translations: dict[str, str | None]


class QuestionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    group_id: uuid.UUID
    parent_id: uuid.UUID | None
    question_type: str
    code: str
    title: str
    description: str | None
    is_required: bool
    sort_order: int
    relevance: str | None
    validation: dict[str, Any] | None
    settings: dict[str, Any] | None
    translations: dict[str, Any] = {}
    created_at: datetime
    subquestions: list["QuestionResponse"] = []
    answer_options: list[AnswerOptionResponse] = []


# Resolve forward reference for self-referential subquestions
QuestionResponse.model_rebuild()


class SubquestionCreate(BaseModel):
    title: str
    code: str | None = None
    description: str | None = None
    is_required: bool = False
    sort_order: int | None = None


class QuestionReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int
    group_id: uuid.UUID | None = None


class QuestionReorderRequest(BaseModel):
    items: list[QuestionReorderItem]


class QuestionListResponse(BaseModel):
    items: list[QuestionResponse]
    total: int
    page: int
    per_page: int
