"""Create question_groups table.

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-01 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "question_groups",
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
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("relevance", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        op.f("ix_question_groups_survey_id"),
        "question_groups",
        ["survey_id"],
        unique=False,
    )
    op.create_index(
        "idx_question_groups_survey_id_sort",
        "question_groups",
        ["survey_id", "sort_order"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_question_groups_survey_id_sort", table_name="question_groups")
    op.drop_index(op.f("ix_question_groups_survey_id"), table_name="question_groups")
    op.drop_table("question_groups")
