import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


VALID_SCOPES = Literal["total", "group", "question"]


class AssessmentCreate(BaseModel):
    name: str = Field(description="Name of this assessment band.", example="High Risk")
    scope: VALID_SCOPES = Field(description="Whether the score is computed across the whole survey ('total'), a single group ('group'), or a single question ('question').", example="total")
    group_id: uuid.UUID | None = Field(default=None, description="Question group ID. Required when scope is 'group'.")
    question_id: uuid.UUID | None = Field(default=None, description="Question ID. Required when scope is 'question'.")
    min_score: Decimal = Field(description="Minimum score (inclusive) for this band to match.", example="0.00")
    max_score: Decimal = Field(description="Maximum score (inclusive) for this band to match.", example="30.00")
    message: str = Field(description="Feedback message shown when a response score falls in this band.", example="Your score indicates a high risk level. Please consult a specialist.")


class AssessmentUpdate(BaseModel):
    name: str | None = None
    scope: VALID_SCOPES | None = None
    group_id: uuid.UUID | None = None
    question_id: uuid.UUID | None = None
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
    question_id: uuid.UUID | None
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
