"""Fix title column lengths: increase surveys.title and question_groups.title from VARCHAR(255) to VARCHAR(500).

Revision ID: 0022
Revises: 0021
Create Date: 2026-04-11 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "surveys",
        "title",
        existing_type=sa.String(255),
        type_=sa.String(500),
        nullable=False,
    )
    op.alter_column(
        "question_groups",
        "title",
        existing_type=sa.String(255),
        type_=sa.String(500),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "question_groups",
        "title",
        existing_type=sa.String(500),
        type_=sa.String(255),
        nullable=False,
    )
    op.alter_column(
        "surveys",
        "title",
        existing_type=sa.String(500),
        type_=sa.String(255),
        nullable=False,
    )
