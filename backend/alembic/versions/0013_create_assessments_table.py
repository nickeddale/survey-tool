"""Create assessments table.

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-03 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM, UUID

# revision identifiers, used by Alembic.
revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

# Reference the existing assessment_scope ENUM — do NOT create it here.
# Use dialect-specific ENUM (not sa.Enum) so create_type=False is reliably respected
# during op.create_table — sa.Enum(create_type=False) does not suppress CREATE TYPE.
assessment_scope = ENUM(
    "total",
    "group",
    name="assessment_scope",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "assessments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "survey_id",
            UUID(as_uuid=True),
            sa.ForeignKey("surveys.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("scope", assessment_scope, nullable=False),
        sa.Column(
            "group_id",
            UUID(as_uuid=True),
            sa.ForeignKey("question_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("min_score", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("max_score", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
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
    op.create_index("ix_assessments_survey_id", "assessments", ["survey_id"])
    op.create_index("ix_assessments_group_id", "assessments", ["group_id"])


def downgrade() -> None:
    op.drop_index("ix_assessments_group_id", table_name="assessments")
    op.drop_index("ix_assessments_survey_id", table_name="assessments")
    op.drop_table("assessments")
