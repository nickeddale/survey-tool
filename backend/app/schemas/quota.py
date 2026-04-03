import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, field_validator


VALID_OPERATORS = Literal["eq", "neq", "gt", "lt", "gte", "lte", "in", "contains"]
VALID_ACTIONS = Literal["terminate", "hide_question"]


class QuotaCondition(BaseModel):
    question_id: uuid.UUID
    operator: VALID_OPERATORS
    value: Any


class QuotaCreate(BaseModel):
    name: str
    limit: int
    action: VALID_ACTIONS
    conditions: list[QuotaCondition]
    is_active: bool = True

    @field_validator("conditions")
    @classmethod
    def conditions_non_empty(cls, v: list[QuotaCondition]) -> list[QuotaCondition]:
        if not v:
            raise ValueError("conditions must be a non-empty list")
        return v


class QuotaUpdate(BaseModel):
    name: str | None = None
    limit: int | None = None
    action: VALID_ACTIONS | None = None
    conditions: list[QuotaCondition] | None = None
    is_active: bool | None = None

    @field_validator("conditions")
    @classmethod
    def conditions_non_empty(cls, v: list[QuotaCondition] | None) -> list[QuotaCondition] | None:
        if v is not None and not v:
            raise ValueError("conditions must be a non-empty list")
        return v


class QuotaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    survey_id: uuid.UUID
    name: str
    limit: int
    action: str
    conditions: list[Any] | None
    current_count: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class QuotaListResponse(BaseModel):
    items: list[QuotaResponse]
    total: int
    page: int
    per_page: int
    pages: int
