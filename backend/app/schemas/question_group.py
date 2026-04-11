import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from app.schemas.question import QuestionResponse


class QuestionGroupCreate(BaseModel):
    title: str = Field(max_length=500, description="Group title displayed as a section heading.", example="Demographic Information")
    description: str | None = Field(default=None, max_length=5000, description="Optional sub-text displayed below the group title.")
    sort_order: int | None = Field(default=None, description="Display order within the survey. Auto-assigned if omitted.", example=1)
    relevance: str | None = Field(default=None, max_length=2000, description="Expression that must evaluate to true for this group to be shown.", example="age >= 18")


class QuestionGroupUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
    sort_order: int | None = None
    relevance: str | None = Field(default=None, max_length=2000)


class QuestionGroupTranslationsUpdate(BaseModel):
    lang: str
    translations: dict[str, str | None]


class QuestionGroupResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    survey_id: uuid.UUID
    title: str
    description: str | None
    sort_order: int
    relevance: str | None
    translations: dict[str, Any] = {}
    created_at: datetime
    questions: list["QuestionResponse"] = []


class QuestionGroupListResponse(BaseModel):
    items: list[QuestionGroupResponse]
    total: int
    page: int
    per_page: int


class QuestionGroupReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class QuestionGroupReorderRequest(BaseModel):
    order: list[QuestionGroupReorderItem]


# Resolve forward reference
from app.schemas.question import QuestionResponse  # noqa: E402
QuestionGroupResponse.model_rebuild()
