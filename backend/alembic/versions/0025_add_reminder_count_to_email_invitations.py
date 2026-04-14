"""Add reminder_count column to email_invitations table.

Revision ID: 0025
Revises: 0024
Create Date: 2026-04-13 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_invitations",
        sa.Column(
            "reminder_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("email_invitations", "reminder_count")
