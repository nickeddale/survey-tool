import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

VALID_QUESTION_TYPES = (
    "short_text",
    "long_text",
    "huge_text",
    "single_choice",
    "multiple_choice",
    "dropdown",
    "rating",
    "scale",
    "matrix_single",
    "matrix_multiple",
    "matrix",
    "matrix_dropdown",
    "matrix_dynamic",
    "date",
    "time",
    "datetime",
    "file_upload",
    "number",
    "email",
    "phone",
    "url",
    "yes_no",
    "boolean",
    "ranking",
    "image_picker",
    "expression",
    "html",
)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    question_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        sa.Text,
        nullable=True,
    )
    is_required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )
    relevance: Mapped[str | None] = mapped_column(
        sa.Text,
        nullable=True,
    )
    validation: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    settings: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    translations: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    group = relationship(
        "QuestionGroup",
        back_populates="questions",
        lazy="raise",
    )
    parent = relationship(
        "Question",
        remote_side="Question.id",
        back_populates="subquestions",
        foreign_keys="[Question.parent_id]",
        lazy="select",
    )
    subquestions = relationship(
        "Question",
        back_populates="parent",
        foreign_keys="[Question.parent_id]",
        cascade="all, delete-orphan",
        lazy="raise",
    )
    answer_options = relationship(
        "AnswerOption",
        back_populates="question",
        cascade="all, delete-orphan",
        lazy="raise",
    )
