import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ParticipantCreate(BaseModel):
    email: str | None = None
    attributes: dict[str, Any] | None = None
    uses_remaining: int | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None


class ParticipantBatchCreate(BaseModel):
    items: list[ParticipantCreate]


class ParticipantUpdate(BaseModel):
    email: str | None = None
    attributes: dict[str, Any] | None = None
    uses_remaining: int | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    completed: bool | None = None


class ParticipantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    survey_id: uuid.UUID
    external_id: str | None
    email: str | None
    attributes: dict[str, Any] | None
    uses_remaining: int | None
    valid_from: datetime | None
    valid_until: datetime | None
    completed: bool
    created_at: datetime
    # token is intentionally excluded — only shown on creation via ParticipantCreateResponse


class ParticipantCreateResponse(ParticipantResponse):
    token: str


class ParticipantListResponse(BaseModel):
    items: list[ParticipantResponse]
    total: int
    page: int
    per_page: int
    pages: int
