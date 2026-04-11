import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.question import VALID_QUESTION_TYPES
from app.schemas.answer_option import AnswerOptionResponse


class QuestionCreate(BaseModel):
    question_type: str = Field(description="Question type. One of: text, numeric, boolean, single_choice, multiple_choice, rating, date, matrix, ranking.", example="single_choice")
    title: str = Field(min_length=1, max_length=500, description="Question text shown to respondents.", example="How satisfied are you with our service?")
    code: str | None = Field(default=None, max_length=100, description="Short unique identifier used in expressions and exports.", example="Q1")
    description: str | None = Field(default=None, max_length=5000, description="Optional sub-text displayed below the question title.")
    is_required: bool = Field(default=False, description="Whether the question must be answered before the response can be completed.")
    sort_order: int | None = Field(default=None, description="Display order within the group. Auto-assigned if omitted.", example=1)
    relevance: str | None = Field(default=None, max_length=2000, description="Expression that must evaluate to true for this question to be shown.", example="Q1 == 'yes'")
    validation: dict[str, Any] | None = Field(default=None, description="Optional validation rules as a JSON object.")
    settings: dict[str, Any] | None = Field(default=None, description="Optional question-level display settings as a JSON object.")
    parent_id: uuid.UUID | None = Field(default=None, description="Parent question ID for subquestions in matrix questions.")

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
    title: str | None = Field(default=None, min_length=1, max_length=500)
    code: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=5000)
    is_required: bool | None = None
    sort_order: int | None = None
    relevance: str | None = Field(default=None, max_length=2000)
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
    title: str = Field(max_length=500)
    code: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=5000)
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
