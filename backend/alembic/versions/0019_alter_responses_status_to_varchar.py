"""Alter responses.status column from response_status ENUM to VARCHAR(20).

Revision ID: 0019
Revises: 0018
Create Date: 2026-04-09 00:00:00.000000

Background: Migration 0010 created responses.status as the response_status ENUM type,
but the SQLAlchemy model (app/models/response.py) declares it as String(20). Any
INSERT/UPDATE that passes a plain Python string fails with:
  column "status" is of type response_status but expression is of type character varying

This migration aligns the DB column with the model by converting the column to VARCHAR(20).
All valid ENUM values ('incomplete', 'complete', 'disqualified') are valid VARCHAR values,
so no data transformation is needed beyond the type cast.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Alter responses.status from response_status ENUM to VARCHAR(20), idempotently.
    # Only apply if the column is currently of type response_status.
    conn.exec_driver_sql(
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_attribute a
                JOIN pg_class c ON a.attrelid = c.oid
                JOIN pg_type t ON a.atttypid = t.oid
                WHERE c.relname = 'responses'
                  AND a.attname = 'status'
                  AND t.typname = 'response_status'
            ) THEN
                ALTER TABLE responses
                    ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
                ALTER TABLE responses
                    ALTER COLUMN status SET DEFAULT 'incomplete';
            END IF;
        END $$
        """
    )


def downgrade() -> None:
    conn = op.get_bind()

    # Reverse: convert VARCHAR(20) back to response_status ENUM, idempotently.
    # Only apply if the column is currently VARCHAR (not already response_status ENUM).
    conn.exec_driver_sql(
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_attribute a
                JOIN pg_class c ON a.attrelid = c.oid
                JOIN pg_type t ON a.atttypid = t.oid
                WHERE c.relname = 'responses'
                  AND a.attname = 'status'
                  AND t.typname = 'varchar'
            ) THEN
                ALTER TABLE responses
                    ALTER COLUMN status TYPE response_status USING status::response_status;
                ALTER TABLE responses
                    ALTER COLUMN status SET DEFAULT 'incomplete'::response_status;
            END IF;
        END $$
        """
    )
