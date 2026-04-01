"""Create questions table.

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-01 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

VALID_QUESTION_TYPES = (
    "short_text",
    "long_text",
    "single_choice",
    "multiple_choice",
    "dropdown",
    "rating",
    "scale",
    "matrix_single",
    "matrix_multiple",
    "date",
    "time",
    "datetime",
    "file_upload",
    "number",
    "email",
    "phone",
    "url",
    "yes_no",
)


def upgrade() -> None:
    op.create_table(
        "questions",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "group_id",
            UUID(as_uuid=True),
            sa.ForeignKey("question_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("questions.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "question_type",
            sa.String(50),
            nullable=False,
        ),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "is_required",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "sort_order",
            sa.Integer,
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("relevance", sa.Text, nullable=True),
        sa.Column("validation", JSONB(), nullable=True),
        sa.Column("settings", JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            f"question_type IN ({', '.join(repr(t) for t in VALID_QUESTION_TYPES)})",
            name="ck_questions_question_type",
        ),
    )
    op.create_index(
        op.f("ix_questions_group_id"),
        "questions",
        ["group_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_questions_parent_id"),
        "questions",
        ["parent_id"],
        unique=False,
    )
    op.create_index(
        "idx_questions_group_id_sort",
        "questions",
        ["group_id", "sort_order"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_questions_group_id_sort", table_name="questions")
    op.drop_index(op.f("ix_questions_parent_id"), table_name="questions")
    op.drop_index(op.f("ix_questions_group_id"), table_name="questions")
    op.drop_table("questions")
