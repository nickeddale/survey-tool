"""Create answer_options table.

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-01 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "answer_options",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "question_id",
            UUID(as_uuid=True),
            sa.ForeignKey("questions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column(
            "sort_order",
            sa.Integer,
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "assessment_value",
            sa.Integer,
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "question_id",
            "code",
            name="uq_answer_options_question_code",
        ),
    )
    op.create_index(
        op.f("ix_answer_options_question_id"),
        "answer_options",
        ["question_id"],
        unique=False,
    )
    op.create_index(
        "idx_answer_options_question_id_sort",
        "answer_options",
        ["question_id", "sort_order"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_answer_options_question_id_sort", table_name="answer_options")
    op.drop_index(op.f("ix_answer_options_question_id"), table_name="answer_options")
    op.drop_table("answer_options")
