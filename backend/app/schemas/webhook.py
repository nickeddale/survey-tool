import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.ssrf_protection import is_safe_url


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
    url: str = Field(max_length=2048, description="HTTPS (or HTTP) endpoint URL that will receive webhook payloads.", example="https://example.com/hooks/survey")
    events: list[VALID_EVENTS] = Field(description="List of event types to subscribe to.", example=["response.completed", "survey.activated"])
    survey_id: uuid.UUID | None = Field(default=None, description="Optional survey UUID to scope events to a single survey. Null means all surveys.")
    is_active: bool = Field(default=True, description="Whether this webhook is active and will receive deliveries.")

    @field_validator("url")
    @classmethod
    def validate_url_format(cls, v: str) -> str:
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("url must start with http:// or https://")
        if not is_safe_url(v):
            raise ValueError(
                "url targets a private, loopback, or reserved address and is not allowed"
            )
        return v

    @field_validator("events")
    @classmethod
    def events_non_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("events must be a non-empty list")
        return v


class WebhookUpdate(BaseModel):
    url: str | None = Field(default=None, max_length=2048)
    events: list[VALID_EVENTS] | None = None
    survey_id: uuid.UUID | None = None
    is_active: bool | None = None

    @field_validator("url")
    @classmethod
    def validate_url_format(cls, v: str | None) -> str | None:
        if v is not None and not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("url must start with http:// or https://")
        if v is not None and not is_safe_url(v):
            raise ValueError(
                "url targets a private, loopback, or reserved address and is not allowed"
            )
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


class WebhookCreateResponse(WebhookResponse):
    """Returned on webhook creation. Secret is generated server-side and never exposed."""


class WebhookListResponse(BaseModel):
    items: list[WebhookResponse]
    total: int
    page: int
    per_page: int
    pages: int
