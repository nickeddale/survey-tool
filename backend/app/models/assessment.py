import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, Numeric, String, text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

assessment_scope = ENUM(
    "total",
    "group",
    "question",
    name="assessment_scope",
    create_type=False,
)


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    survey_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    scope: Mapped[str] = mapped_column(
        assessment_scope,
        nullable=False,
    )
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    min_score: Mapped[float] = mapped_column(
        Numeric(precision=10, scale=2),
        nullable=False,
    )
    max_score: Mapped[float] = mapped_column(
        Numeric(precision=10, scale=2),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(
        sa.Text,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    survey = relationship(
        "Survey",
        lazy="raise",
    )
    group = relationship(
        "QuestionGroup",
        lazy="raise",
    )
    question = relationship(
        "Question",
        lazy="raise",
    )
