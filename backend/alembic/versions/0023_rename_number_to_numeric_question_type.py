"""Rename question type 'number' to 'numeric'.

Revision ID: 0023
Revises: 0022
Create Date: 2026-04-12 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

# The full set of valid question types after this migration.
NEW_VALID_QUESTION_TYPES = (
    "short_text",
    "long_text",
    "huge_text",
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
    "numeric",
    "email",
    "phone",
    "url",
    "yes_no",
    "boolean",
    "ranking",
    "image_picker",
    "expression",
    "html",
)

# The previous set (before this migration) — 'number' instead of 'numeric',
# and without the types added only to the Python model after migration 0009.
OLD_VALID_QUESTION_TYPES = (
    "short_text",
    "long_text",
    "huge_text",
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
    "boolean",
    "ranking",
    "image_picker",
    "expression",
    "html",
)


def _constraint_values(types: tuple) -> str:
    return ", ".join(repr(t) for t in types)


def upgrade() -> None:
    # Rename any existing rows using the old type name.
    op.execute(
        sa.text(
            "UPDATE questions SET question_type = 'numeric' WHERE question_type = 'number'"
        )
    )
    # Drop and recreate the check constraint with 'numeric' in place of 'number'.
    op.drop_constraint("ck_questions_question_type", "questions", type_="check")
    op.create_check_constraint(
        "ck_questions_question_type",
        "questions",
        f"question_type IN ({_constraint_values(NEW_VALID_QUESTION_TYPES)})",
    )


def downgrade() -> None:
    # Reverse the data rename.
    op.execute(
        sa.text(
            "UPDATE questions SET question_type = 'number' WHERE question_type = 'numeric'"
        )
    )
    # Restore the constraint with 'number'.
    op.drop_constraint("ck_questions_question_type", "questions", type_="check")
    op.create_check_constraint(
        "ck_questions_question_type",
        "questions",
        f"question_type IN ({_constraint_values(OLD_VALID_QUESTION_TYPES)})",
    )
