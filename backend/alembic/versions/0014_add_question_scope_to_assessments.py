"""Add question scope to assessments.

Adds 'question' value to assessment_scope enum and adds nullable question_id
FK column to the assessments table.

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-09 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'question' to the assessment_scope enum.
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
                    WHERE enumlabel = 'question'
                      AND enumtypid = 'assessment_scope'::regtype
                ) THEN
                    ALTER TYPE assessment_scope ADD VALUE 'question';
                END IF;
            END $$;
            """
        )
    )

    # Add nullable question_id FK column to assessments table
    op.add_column(
        "assessments",
        sa.Column(
            "question_id",
            UUID(as_uuid=True),
            sa.ForeignKey("questions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_assessments_question_id", "assessments", ["question_id"])


def downgrade() -> None:
    op.drop_index("ix_assessments_question_id", table_name="assessments")
    op.drop_column("assessments", "question_id")
    # Note: PostgreSQL does not support removing enum values.
    # Downgrade leaves 'question' in the enum but removes the column.
