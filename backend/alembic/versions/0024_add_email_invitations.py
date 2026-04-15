"""Add email_invitations table for tracking survey participant email invitations.

Revision ID: 0024
Revises: 0023
Create Date: 2026-04-13 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_invitations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "survey_id",
            UUID(as_uuid=True),
            sa.ForeignKey("surveys.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "participant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("participants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("recipient_email", sa.String(255), nullable=False),
        sa.Column("recipient_name", sa.String(255), nullable=True),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clicked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "attempt_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "invitation_type",
            sa.String(50),
            nullable=False,
            server_default=sa.text("'invite'"),
        ),
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

    # Index on survey_id (for FK lookups)
    op.create_index(
        op.f("ix_email_invitations_survey_id"),
        "email_invitations",
        ["survey_id"],
        unique=False,
    )

    # Index on participant_id (for FK lookups)
    op.create_index(
        op.f("ix_email_invitations_participant_id"),
        "email_invitations",
        ["participant_id"],
        unique=False,
    )

    # Index on recipient_email (for lookup by email)
    op.create_index(
        op.f("ix_email_invitations_recipient_email"),
        "email_invitations",
        ["recipient_email"],
        unique=False,
    )

    # Index on status (for filtering by delivery status)
    op.create_index(
        op.f("ix_email_invitations_status"),
        "email_invitations",
        ["status"],
        unique=False,
    )

    # Composite index on (survey_id, status) for filtered queries
    op.create_index(
        "idx_email_invitations_survey_id_status",
        "email_invitations",
        ["survey_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_email_invitations_survey_id_status", table_name="email_invitations")
    op.drop_index(op.f("ix_email_invitations_status"), table_name="email_invitations")
    op.drop_index(op.f("ix_email_invitations_recipient_email"), table_name="email_invitations")
    op.drop_index(op.f("ix_email_invitations_participant_id"), table_name="email_invitations")
    op.drop_index(op.f("ix_email_invitations_survey_id"), table_name="email_invitations")
    op.drop_table("email_invitations")
