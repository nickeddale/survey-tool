"""Create surveys table.

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-01 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

# Reuse the existing survey_status ENUM — do not re-create it.
survey_status = postgresql.ENUM(
    "draft", "active", "closed", "archived",
    name="survey_status",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "surveys",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "status",
            survey_status,
            nullable=False,
            server_default=sa.text("'draft'::survey_status"),
        ),
        sa.Column("welcome_message", sa.Text, nullable=True),
        sa.Column("end_message", sa.Text, nullable=True),
        sa.Column(
            "default_language",
            sa.String(10),
            nullable=False,
            server_default=sa.text("'en'"),
        ),
        sa.Column("settings", JSONB, nullable=True),
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
        op.f("ix_surveys_user_id"), "surveys", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_surveys_status"), "surveys", ["status"], unique=False
    )
    op.create_index(
        op.f("ix_surveys_title"), "surveys", ["title"], unique=False
    )
    op.create_index(
        "idx_surveys_user_id_status", "surveys", ["user_id", "status"], unique=False
    )


def downgrade() -> None:
    op.drop_index("idx_surveys_user_id_status", table_name="surveys")
    op.drop_index(op.f("ix_surveys_title"), table_name="surveys")
    op.drop_index(op.f("ix_surveys_status"), table_name="surveys")
    op.drop_index(op.f("ix_surveys_user_id"), table_name="surveys")
    op.drop_table("surveys")
