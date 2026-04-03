"""Create participants, responses, and response_answers tables.

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-03 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

# Reuse the existing response_status ENUM — do not re-create it.
response_status = postgresql.ENUM(
    "incomplete", "complete", "disqualified",
    name="response_status",
    create_type=False,
)


def upgrade() -> None:
    # ------------------------------------------------------------------
    # participants table
    # ------------------------------------------------------------------
    op.create_table(
        "participants",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "survey_id",
            UUID(as_uuid=True),
            sa.ForeignKey("surveys.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column(
            "attributes",
            JSONB,
            nullable=True,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        op.f("ix_participants_survey_id"), "participants", ["survey_id"], unique=False
    )
    op.create_index(
        op.f("ix_participants_external_id"), "participants", ["external_id"], unique=False
    )

    # ------------------------------------------------------------------
    # responses table
    # ------------------------------------------------------------------
    op.create_table(
        "responses",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "survey_id",
            UUID(as_uuid=True),
            sa.ForeignKey("surveys.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "participant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("participants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            response_status,
            nullable=False,
            server_default=sa.text("'incomplete'::response_status"),
        ),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column(
            "metadata",
            JSONB,
            nullable=True,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index(
        op.f("ix_responses_survey_id"), "responses", ["survey_id"], unique=False
    )
    op.create_index(
        op.f("ix_responses_participant_id"), "responses", ["participant_id"], unique=False
    )
    op.create_index(
        op.f("ix_responses_status"), "responses", ["status"], unique=False
    )
    op.create_index(
        "idx_responses_survey_id_status", "responses", ["survey_id", "status"], unique=False
    )

    # ------------------------------------------------------------------
    # response_answers table
    # ------------------------------------------------------------------
    op.create_table(
        "response_answers",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "response_id",
            UUID(as_uuid=True),
            sa.ForeignKey("responses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "question_id",
            UUID(as_uuid=True),
            sa.ForeignKey("questions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "answer_type",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'answer'"),
        ),
        sa.Column("value", JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "response_id",
            "question_id",
            name="uq_response_answers_response_question",
        ),
    )
    op.create_index(
        op.f("ix_response_answers_response_id"),
        "response_answers",
        ["response_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_response_answers_question_id"),
        "response_answers",
        ["question_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_response_answers_answer_type"),
        "response_answers",
        ["answer_type"],
        unique=False,
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_index(op.f("ix_response_answers_answer_type"), table_name="response_answers")
    op.drop_index(op.f("ix_response_answers_question_id"), table_name="response_answers")
    op.drop_index(op.f("ix_response_answers_response_id"), table_name="response_answers")
    op.drop_table("response_answers")

    op.drop_index("idx_responses_survey_id_status", table_name="responses")
    op.drop_index(op.f("ix_responses_status"), table_name="responses")
    op.drop_index(op.f("ix_responses_participant_id"), table_name="responses")
    op.drop_index(op.f("ix_responses_survey_id"), table_name="responses")
    op.drop_table("responses")

    op.drop_index(op.f("ix_participants_external_id"), table_name="participants")
    op.drop_index(op.f("ix_participants_survey_id"), table_name="participants")
    op.drop_table("participants")
