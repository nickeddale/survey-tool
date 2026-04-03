import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


VALID_SCOPES = Literal["total", "group"]


class AssessmentCreate(BaseModel):
    name: str
    scope: VALID_SCOPES
    group_id: uuid.UUID | None = None
    min_score: Decimal
    max_score: Decimal
    message: str


class AssessmentUpdate(BaseModel):
    name: str | None = None
    scope: VALID_SCOPES | None = None
    group_id: uuid.UUID | None = None
    min_score: Decimal | None = None
    max_score: Decimal | None = None
    message: str | None = None


class AssessmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    survey_id: uuid.UUID
    name: str
    scope: str
    group_id: uuid.UUID | None
    min_score: Decimal
    max_score: Decimal
    message: str
    created_at: datetime
    updated_at: datetime


class AssessmentListResponse(BaseModel):
    items: list[AssessmentResponse]
    total: int
    page: int
    per_page: int
    pages: int


class AssessmentScoreResponse(BaseModel):
    score: Decimal
    matching_assessments: list[AssessmentResponse]
