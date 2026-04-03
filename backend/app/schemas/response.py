import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, model_validator


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


class ResponseStatusUpdate(BaseModel):
    status: str


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


class ResponseSummary(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    status: str
    started_at: datetime
    completed_at: datetime | None
    ip_address: str | None
    participant_id: uuid.UUID | None


class ResponseListResponse(BaseModel):
    items: list[ResponseSummary]
    total: int
    page: int
    per_page: int
    pages: int


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
    answers: list[ResponseAnswerResponse] = []

    @model_validator(mode="before")
    @classmethod
    def _extract_answers_safely(cls, data: Any) -> Any:
        """Convert ORM Response to dict, safely handling un-loaded answers relationship."""
        if not isinstance(data, dict):
            # ORM object — extract all fields manually to avoid lazy='raise' on answers
            try:
                answers = list(data.answers)
            except Exception:
                answers = []
            return {
                "id": data.id,
                "survey_id": data.survey_id,
                "participant_id": data.participant_id,
                "status": data.status,
                "ip_address": data.ip_address,
                "metadata_": data.metadata_,
                "started_at": data.started_at,
                "completed_at": data.completed_at,
                "created_at": data.created_at,
                "updated_at": data.updated_at,
                "answers": answers,
            }
        return data


# ---------------------------------------------------------------------------
# Response detail schemas (authenticated, enriched)
# ---------------------------------------------------------------------------


class ResponseAnswerDetail(BaseModel):
    """Enriched answer schema including question metadata and resolved labels."""

    question_id: uuid.UUID
    question_code: str
    question_title: str
    question_type: str
    value: Any
    values: list[Any] | None = None
    selected_option_title: str | None = None
    subquestion_label: str | None = None


class ResponseDetail(BaseModel):
    """Full response detail with enriched answers. Returned by authenticated detail endpoint."""

    id: uuid.UUID
    status: str
    started_at: datetime
    completed_at: datetime | None
    ip_address: str | None
    metadata: dict[str, Any] | None
    participant_id: uuid.UUID | None
    answers: list[ResponseAnswerDetail]
