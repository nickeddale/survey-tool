"""Add composite indexes to optimize statistics endpoint queries.

Revision ID: 0021
Revises: 0020
Create Date: 2026-04-10 00:00:00.000000

Background: The statistics endpoint previously issued N+1 queries — one per
question — each filtering response_answers by (question_id, survey_id via join).
After refactoring to a single batched GROUP BY query, the critical access
pattern is:

  SELECT question_id, array_agg(value)
  FROM response_answers
  JOIN responses ON responses.id = response_answers.response_id
  WHERE responses.survey_id = :sid
    AND response_answers.value IS NOT NULL
  GROUP BY question_id

A composite index on response_answers(question_id, response_id) supports the
join lookup, while a partial index on responses(survey_id) WHERE status = 'complete'
accelerates the average-completion-time subquery.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Composite index on response_answers(question_id, response_id).
    # Supports the batched GROUP BY query joining response_answers -> responses
    # on response_id, filtering by question_id.
    conn.exec_driver_sql(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE tablename = 'response_answers'
                  AND indexname = 'idx_response_answers_question_id_response_id'
            ) THEN
                CREATE INDEX idx_response_answers_question_id_response_id
                    ON response_answers (question_id, response_id);
            END IF;
        END $$
        """
    )

    # Partial index on responses(survey_id) WHERE status = 'complete'.
    # Accelerates the AVG(epoch(completed_at) - epoch(started_at)) subquery
    # that filters on survey_id AND status = 'complete'.
    conn.exec_driver_sql(
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE tablename = 'responses'
                  AND indexname = 'idx_responses_survey_id_status_complete'
            ) THEN
                CREATE INDEX idx_responses_survey_id_status_complete
                    ON responses (survey_id)
                    WHERE status = 'complete';
            END IF;
        END $$
        """
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.exec_driver_sql(
        "DROP INDEX IF EXISTS idx_responses_survey_id_status_complete"
    )
    conn.exec_driver_sql(
        "DROP INDEX IF EXISTS idx_response_answers_question_id_response_id"
    )
