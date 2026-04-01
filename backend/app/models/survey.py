import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Survey(Base):
    __tablename__ = "surveys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        sa.Text,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        default="draft",
        server_default=text("'draft'"),
        index=True,
    )
    welcome_message: Mapped[str | None] = mapped_column(
        sa.Text,
        nullable=True,
    )
    end_message: Mapped[str | None] = mapped_column(
        sa.Text,
        nullable=True,
    )
    default_language: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="en",
        server_default=text("'en'"),
    )
    settings: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        default=dict,
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

    user = relationship("User", back_populates="surveys")
