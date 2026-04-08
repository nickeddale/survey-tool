"""Create quotas table.

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-03 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID

# revision identifiers, used by Alembic.
revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

# Reference the existing quota_action ENUM — do NOT create it here.
# Use dialect-specific ENUM (not sa.Enum) so create_type=False is reliably respected
# during op.create_table — sa.Enum(create_type=False) does not suppress CREATE TYPE.
quota_action = ENUM(
    "terminate",
    "hide_question",
    name="quota_action",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "quotas",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "survey_id",
            UUID(as_uuid=True),
            sa.ForeignKey("surveys.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("limit", sa.Integer(), nullable=False),
        sa.Column("action", quota_action, nullable=False),
        sa.Column("conditions", JSONB, nullable=True),
        sa.Column(
            "current_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
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
    op.create_index("ix_quotas_survey_id", "quotas", ["survey_id"])


def downgrade() -> None:
    op.drop_index("ix_quotas_survey_id", table_name="quotas")
    op.drop_table("quotas")
