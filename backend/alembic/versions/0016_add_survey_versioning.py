"""Add survey versioning: version column to surveys, survey_versions table.

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-06 00:00:00.000000

Adds:
- surveys.version (INTEGER, NOT NULL, server_default=1)
- survey_versions table (id, survey_id FK, version, snapshot JSONB, created_at)
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add version column to surveys table
    op.add_column(
        "surveys",
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )

    # Create survey_versions table
    op.create_table(
        "survey_versions",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "survey_id",
            UUID(as_uuid=True),
            sa.ForeignKey("surveys.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "snapshot",
            JSONB(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("survey_versions")
    op.drop_column("surveys", "version")
