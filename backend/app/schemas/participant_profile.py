import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ParticipantProfileCreate(BaseModel):
    email: str = Field(description="Primary email address — must be globally unique.")
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    organization: str | None = None
    attributes: dict[str, Any] | None = None
    tags: list[str] | None = None


class ParticipantProfileBatchCreate(BaseModel):
    items: list[ParticipantProfileCreate]


class ParticipantProfileUpdate(BaseModel):
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    organization: str | None = None
    attributes: dict[str, Any] | None = None
    tags: list[str] | None = None


class SurveyParticipationSummary(BaseModel):
    """Per-survey participation entry shown in profile detail."""

    model_config = ConfigDict(from_attributes=True)

    survey_id: uuid.UUID
    participant_id: uuid.UUID
    completed: bool
    created_at: datetime


class ParticipantProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str | None
    last_name: str | None
    phone: str | None
    organization: str | None
    attributes: dict[str, Any] | None
    tags: list[str] | None
    created_at: datetime
    updated_at: datetime


class ParticipantProfileDetailResponse(ParticipantProfileResponse):
    """Profile with survey participation history."""

    survey_history: list[SurveyParticipationSummary] = []


class ParticipantProfileListResponse(BaseModel):
    items: list[ParticipantProfileResponse]
    total: int
    page: int
    per_page: int
    pages: int
