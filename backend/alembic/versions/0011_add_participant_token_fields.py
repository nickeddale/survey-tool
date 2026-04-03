"""Add token, email, uses_remaining, valid_from, valid_until, completed to participants.

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-03 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("token", sa.String(255), nullable=True),
    )
    op.add_column(
        "participants",
        sa.Column("email", sa.String(255), nullable=True),
    )
    op.add_column(
        "participants",
        sa.Column("uses_remaining", sa.Integer(), nullable=True),
    )
    op.add_column(
        "participants",
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "participants",
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "participants",
        sa.Column(
            "completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_participants_token",
        "participants",
        ["token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_participants_token", table_name="participants")
    op.drop_column("participants", "completed")
    op.drop_column("participants", "valid_until")
    op.drop_column("participants", "valid_from")
    op.drop_column("participants", "uses_remaining")
    op.drop_column("participants", "email")
    op.drop_column("participants", "token")
