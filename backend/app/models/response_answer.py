"""ResponseAnswer model storing a single question's answer within a response.

Each row captures the answer to one question (or subquestion) in a survey
response. The value is stored as JSONB to accommodate all question types:
strings, numbers, arrays (multi-select), booleans, null, etc.

Special answer variants (other text, comments) are stored as sibling rows
differentiated by the answer_type column.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Valid answer_type values:
#   "answer"  - the primary response value for the question
#   "other"   - free-text entered in the "other" option of a choice question
#   "comment" - free-text comment attached to any question
ANSWER_TYPE_ANSWER = "answer"
ANSWER_TYPE_OTHER = "other"
ANSWER_TYPE_COMMENT = "comment"


class ResponseAnswer(Base):
    __tablename__ = "response_answers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("responses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    answer_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=ANSWER_TYPE_ANSWER,
        server_default=text("'answer'"),
        index=True,
    )
    value: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    response = relationship("Response", back_populates="answers", lazy="raise")
    question = relationship("Question", lazy="raise")
