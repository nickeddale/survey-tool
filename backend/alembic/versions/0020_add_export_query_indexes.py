"""Add composite indexes to optimize chunked CSV export queries.

Revision ID: 0020
Revises: 0019
Create Date: 2026-04-10 00:00:00.000000

Background: The chunked export query paginates responses with:
  WHERE survey_id = ? [AND status = ?] [AND completed_at > ?] ...
  ORDER BY started_at ASC, id ASC
  LIMIT ? OFFSET ?

Composite indexes on (survey_id, started_at) and (survey_id, completed_at)
allow Postgres to satisfy both the WHERE predicate and the ORDER BY with a
single index scan, eliminating the sort step for the common export pattern.

The single-column ix_responses_survey_id index already exists from migration
0010. The idx_responses_survey_id_status index also already exists. This
migration adds the missing date-range composite indexes.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Composite index on (survey_id, started_at) — supports ORDER BY started_at
    # in the paginated export query with survey_id filter.
    conn.exec_driver_sql(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE tablename = 'responses'
                  AND indexname = 'idx_responses_survey_id_started_at'
            ) THEN
                CREATE INDEX idx_responses_survey_id_started_at
                    ON responses (survey_id, started_at ASC);
            END IF;
        END $$
        """
    )

    # Composite index on (survey_id, completed_at) — supports completed_after /
    # completed_before date range filters combined with the survey_id WHERE clause.
    conn.exec_driver_sql(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE tablename = 'responses'
                  AND indexname = 'idx_responses_survey_id_completed_at'
            ) THEN
                CREATE INDEX idx_responses_survey_id_completed_at
                    ON responses (survey_id, completed_at ASC);
            END IF;
        END $$
        """
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.exec_driver_sql(
        "DROP INDEX IF EXISTS idx_responses_survey_id_completed_at"
    )
    conn.exec_driver_sql(
        "DROP INDEX IF EXISTS idx_responses_survey_id_started_at"
    )
