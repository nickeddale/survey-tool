"""Add user_id column to webhooks table.

Revision ID: 0018
Revises: 0017
Create Date: 2026-04-08 00:00:00.000000

Background: The webhooks table in some environments was created via a manual SQL
workaround that omitted the user_id column. Migration 0014 includes user_id in the
intended schema, but the manual workaround bypassed it. This migration adds user_id
idempotently so that affected environments are brought into alignment.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add user_id column idempotently — skip if already present (e.g. environments
    # where migration 0014 ran cleanly and created the column correctly).
    conn.exec_driver_sql(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'webhooks' AND column_name = 'user_id'
            ) THEN
                ALTER TABLE webhooks
                    ADD COLUMN user_id UUID NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE;
                CREATE INDEX ix_webhooks_user_id ON webhooks(user_id);
            END IF;
        END $$
        """
    )


def downgrade() -> None:
    conn = op.get_bind()

    # Drop index and column idempotently.
    conn.exec_driver_sql(
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'webhooks' AND column_name = 'user_id'
            ) THEN
                DROP INDEX IF EXISTS ix_webhooks_user_id;
                ALTER TABLE webhooks DROP COLUMN user_id;
            END IF;
        END $$
        """
    )
