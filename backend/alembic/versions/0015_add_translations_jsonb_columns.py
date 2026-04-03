"""Add translations JSONB columns to surveys, question_groups, questions, and answer_options.

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-03 00:00:00.000000

Translations structure: {"fr": {"title": "...", "description": "..."}, "es": {...}}
For surveys, also includes welcome_message and end_message.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add translations JSONB column to surveys
    op.add_column(
        "surveys",
        sa.Column(
            "translations",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )

    # Add translations JSONB column to question_groups
    op.add_column(
        "question_groups",
        sa.Column(
            "translations",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )

    # Add translations JSONB column to questions
    op.add_column(
        "questions",
        sa.Column(
            "translations",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )

    # Add translations JSONB column to answer_options
    op.add_column(
        "answer_options",
        sa.Column(
            "translations",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("answer_options", "translations")
    op.drop_column("questions", "translations")
    op.drop_column("question_groups", "translations")
    op.drop_column("surveys", "translations")
