"""Initial extensions and ENUM types.

Revision ID: 0001
Revises:
Create Date: 2026-04-01 00:00:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable uuid-ossp extension for UUID generation helpers.
    # gen_random_uuid() (from pgcrypto / built-in in PG 13+) is used for PKs,
    # but uuid-ossp provides uuid_generate_v4() as an alternative.
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # Create ENUM type: survey_status
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'survey_status') THEN
                CREATE TYPE survey_status AS ENUM (
                    'draft',
                    'active',
                    'closed',
                    'archived'
                );
            END IF;
        END
        $$;
        """
    )

    # Create ENUM type: response_status
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'response_status') THEN
                CREATE TYPE response_status AS ENUM (
                    'incomplete',
                    'complete',
                    'disqualified'
                );
            END IF;
        END
        $$;
        """
    )

    # Create ENUM type: quota_action
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quota_action') THEN
                CREATE TYPE quota_action AS ENUM (
                    'terminate',
                    'hide_question'
                );
            END IF;
        END
        $$;
        """
    )

    # Create ENUM type: assessment_scope
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assessment_scope') THEN
                CREATE TYPE assessment_scope AS ENUM (
                    'total',
                    'group'
                );
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP TYPE IF EXISTS assessment_scope")
    op.execute("DROP TYPE IF EXISTS quota_action")
    op.execute("DROP TYPE IF EXISTS response_status")
    op.execute("DROP TYPE IF EXISTS survey_status")
    op.execute('DROP EXTENSION IF EXISTS "uuid-ossp"')
