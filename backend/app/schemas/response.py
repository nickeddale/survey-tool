import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------


class AnswerInput(BaseModel):
    question_id: uuid.UUID
    value: Any = None


class ResponseCreate(BaseModel):
    answers: list[AnswerInput] = []


class ResponseUpdate(BaseModel):
    status: str | None = None
    answers: list[AnswerInput] = []


# ---------------------------------------------------------------------------
# Output schemas
# ---------------------------------------------------------------------------


class ResponseAnswerResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    response_id: uuid.UUID
    question_id: uuid.UUID
    value: Any
    created_at: datetime


class ResponseResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    survey_id: uuid.UUID
    participant_id: uuid.UUID | None
    status: str
    ip_address: str | None
    metadata_: dict[str, Any] | None
    started_at: datetime
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
