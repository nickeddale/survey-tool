"""Add matrix, matrix_dropdown, matrix_dynamic question types.

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-02 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

# The full set of valid question types after this migration.
NEW_VALID_QUESTION_TYPES = (
    "short_text",
    "long_text",
    "single_choice",
    "multiple_choice",
    "dropdown",
    "rating",
    "scale",
    "matrix_single",
    "matrix_multiple",
    "matrix",
    "matrix_dropdown",
    "matrix_dynamic",
    "date",
    "time",
    "datetime",
    "file_upload",
    "number",
    "email",
    "phone",
    "url",
    "yes_no",
)

# The previous set (before this migration).
OLD_VALID_QUESTION_TYPES = (
    "short_text",
    "long_text",
    "single_choice",
    "multiple_choice",
    "dropdown",
    "rating",
    "scale",
    "matrix_single",
    "matrix_multiple",
    "date",
    "time",
    "datetime",
    "file_upload",
    "number",
    "email",
    "phone",
    "url",
    "yes_no",
)


def _constraint_values(types: tuple) -> str:
    return ", ".join(repr(t) for t in types)


def upgrade() -> None:
    # Drop the existing check constraint and recreate it with the new types.
    op.drop_constraint("ck_questions_question_type", "questions", type_="check")
    op.create_check_constraint(
        "ck_questions_question_type",
        "questions",
        f"question_type IN ({_constraint_values(NEW_VALID_QUESTION_TYPES)})",
    )


def downgrade() -> None:
    op.drop_constraint("ck_questions_question_type", "questions", type_="check")
    op.create_check_constraint(
        "ck_questions_question_type",
        "questions",
        f"question_type IN ({_constraint_values(OLD_VALID_QUESTION_TYPES)})",
    )
