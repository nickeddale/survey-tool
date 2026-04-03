import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


VALID_EVENTS = Literal[
    "response.started",
    "response.completed",
    "survey.activated",
    "survey.closed",
    "quota.reached",
]

VALID_EVENT_VALUES = {
    "response.started",
    "response.completed",
    "survey.activated",
    "survey.closed",
    "quota.reached",
}


class WebhookCreate(BaseModel):
    url: str
    events: list[VALID_EVENTS]
    survey_id: uuid.UUID | None = None
    is_active: bool = True

    @field_validator("url")
    @classmethod
    def validate_url_format(cls, v: str) -> str:
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("url must start with http:// or https://")
        return v

    @field_validator("events")
    @classmethod
    def events_non_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("events must be a non-empty list")
        return v


class WebhookUpdate(BaseModel):
    url: str | None = None
    events: list[VALID_EVENTS] | None = None
    survey_id: uuid.UUID | None = None
    is_active: bool | None = None

    @field_validator("url")
    @classmethod
    def validate_url_format(cls, v: str | None) -> str | None:
        if v is not None and not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("url must start with http:// or https://")
        return v

    @field_validator("events")
    @classmethod
    def events_non_empty(cls, v: list | None) -> list | None:
        if v is not None and not v:
            raise ValueError("events must be a non-empty list")
        return v


class WebhookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    survey_id: uuid.UUID | None
    url: str
    events: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class WebhookListResponse(BaseModel):
    items: list[WebhookResponse]
    total: int
    page: int
    per_page: int
    pages: int
