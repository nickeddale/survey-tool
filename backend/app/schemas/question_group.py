import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from app.schemas.question import QuestionResponse


class QuestionGroupCreate(BaseModel):
    title: str
    description: str | None = None
    sort_order: int | None = None
    relevance: str | None = None


class QuestionGroupUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    sort_order: int | None = None
    relevance: str | None = None


class QuestionGroupResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    survey_id: uuid.UUID
    title: str
    description: str | None
    sort_order: int
    relevance: str | None
    created_at: datetime
    questions: list["QuestionResponse"] = []


class QuestionGroupReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class QuestionGroupReorderRequest(BaseModel):
    order: list[QuestionGroupReorderItem]


# Resolve forward reference
from app.schemas.question import QuestionResponse  # noqa: E402
QuestionGroupResponse.model_rebuild()
