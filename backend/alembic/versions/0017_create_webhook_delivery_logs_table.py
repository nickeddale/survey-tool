"""Create webhook_delivery_logs table.

Revision ID: 0017
Revises: 0016
Create Date: 2026-04-06 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "webhook_delivery_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "webhook_id",
            UUID(as_uuid=True),
            sa.ForeignKey("webhooks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("delivery_id", UUID(as_uuid=True), nullable=False),
        sa.Column("event", sa.String(255), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("attempt_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("last_error", sa.Text, nullable=True),
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
    op.create_index("ix_webhook_delivery_logs_webhook_id", "webhook_delivery_logs", ["webhook_id"])
    op.create_index(
        "ix_webhook_delivery_logs_delivery_id",
        "webhook_delivery_logs",
        ["delivery_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_webhook_delivery_logs_delivery_id", table_name="webhook_delivery_logs")
    op.drop_index("ix_webhook_delivery_logs_webhook_id", table_name="webhook_delivery_logs")
    op.drop_table("webhook_delivery_logs")
