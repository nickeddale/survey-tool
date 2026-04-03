"""Response model representing a single survey submission.

A response ties together a survey, an optional participant, and the
collection of per-question answers (ResponseAnswer rows).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Response(Base):
    __tablename__ = "responses"

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
    participant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="incomplete",
        server_default=text("'incomplete'"),
        index=True,
    )
    ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
    )
    metadata_: Mapped[dict | None] = mapped_column(
        "metadata",
        JSONB,
        nullable=True,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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

    survey = relationship("Survey", lazy="raise")
    participant = relationship("Participant", back_populates="responses", lazy="raise")
    answers = relationship(
        "ResponseAnswer",
        back_populates="response",
        cascade="all, delete-orphan",
        lazy="raise",
    )
