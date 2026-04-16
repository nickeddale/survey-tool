"""Add subquestion scope to assessments.

Adds 'subquestion' value to assessment_scope enum and adds nullable subquestion_id
FK column to the assessments table for per-row scoring of matrix questions.

Revision ID: 0026
Revises: 0025
Create Date: 2026-04-16 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'subquestion' to the assessment_scope enum.
    # ALTER TYPE ADD VALUE cannot run inside a transaction block in PostgreSQL,
    # so we use AUTOCOMMIT mode via a raw connection.
    # We also check pg_enum first for idempotency (asyncpg doesn't support
    # ALTER TYPE ADD VALUE IF NOT EXISTS).
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = 'subquestion'
                      AND enumtypid = 'assessment_scope'::regtype
                ) THEN
                    ALTER TYPE assessment_scope ADD VALUE 'subquestion';
                END IF;
            END $$;
            """
        )
    )

    # Add nullable subquestion_id FK column to assessments table
    op.add_column(
        "assessments",
        sa.Column(
            "subquestion_id",
            UUID(as_uuid=True),
            sa.ForeignKey("questions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_assessments_subquestion_id", "assessments", ["subquestion_id"])


def downgrade() -> None:
    op.drop_index("ix_assessments_subquestion_id", table_name="assessments")
    op.drop_column("assessments", "subquestion_id")
    # Note: PostgreSQL does not support removing enum values.
    # Downgrade leaves 'subquestion' in the enum but removes the column.
