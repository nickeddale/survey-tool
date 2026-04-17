"""Add participant_profiles table and profile_id FK on participants.

Revision ID: 0027
Revises: 0026
Create Date: 2026-04-17 00:00:00.000000
"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "participant_profiles",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("first_name", sa.String(255), nullable=True),
        sa.Column("last_name", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(100), nullable=True),
        sa.Column("organization", sa.String(255), nullable=True),
        sa.Column("attributes", JSONB, nullable=True),
        sa.Column("tags", ARRAY(sa.String), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_participant_profiles_email", "participant_profiles", ["email"])

    op.add_column(
        "participants",
        sa.Column(
            "profile_id",
            UUID(as_uuid=True),
            sa.ForeignKey("participant_profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_participants_profile_id", "participants", ["profile_id"])


def downgrade() -> None:
    op.drop_index("ix_participants_profile_id", table_name="participants")
    op.drop_column("participants", "profile_id")
    op.drop_index("ix_participant_profiles_email", table_name="participant_profiles")
    op.drop_table("participant_profiles")
