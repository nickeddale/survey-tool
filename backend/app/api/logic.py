"""Logic validation API router.

Provides:
    POST /surveys/{id}/logic/validate-expression
        Validates expression syntax and semantic correctness against
        the question codes of a given survey.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.survey import Survey
from app.models.user import User
from app.services.expression_engine import (
    ExpressionError,
    ExpressionWarning,
    validate_expression,
)
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/surveys", tags=["logic"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ValidateExpressionRequest(BaseModel):
    """Request body for the validate-expression endpoint.

    Attributes:
        expression:         The expression string to validate.
        question_code:      Optional code of the question this expression
                            belongs to.  When supplied, it is used to detect
                            forward references: variables whose sort_order is
                            >= the sort_order of this question are flagged.
    """

    expression: str
    question_code: str | None = None


class ExpressionErrorSchema(BaseModel):
    """A single validation error."""

    message: str
    position: int
    code: Literal[
        "SYNTAX_ERROR",
        "UNKNOWN_VARIABLE",
        "TYPE_MISMATCH",
        "UNSUPPORTED_FUNCTION",
        "FORWARD_REFERENCE",
    ]


class ExpressionWarningSchema(BaseModel):
    """A single validation warning."""

    message: str
    position: int
    code: str


class ValidateExpressionResponse(BaseModel):
    """Response body for the validate-expression endpoint.

    Attributes:
        parsed_variables: Variable names (question codes) found in the
                          expression, in order of first occurrence.
        errors:           Validation errors (syntax + semantic).
        warnings:         Advisory warnings (non-fatal).
    """

    parsed_variables: list[str]
    errors: list[ExpressionErrorSchema]
    warnings: list[ExpressionWarningSchema]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_survey_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Survey not found")


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post(
    "/{survey_id}/logic/validate-expression",
    response_model=ValidateExpressionResponse,
    status_code=status.HTTP_200_OK,
)
async def validate_expression_endpoint(
    survey_id: str,
    payload: ValidateExpressionRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ValidateExpressionResponse:
    """Validate an expression against a survey's question codes.

    Returns parsed_variables (list of variable names found), errors (with
    message/position/code), and warnings.  The response is always 200 OK;
    validation failures are expressed in the errors list, not via HTTP errors.

    Error codes:
        SYNTAX_ERROR         – lexer or parser failure
        UNKNOWN_VARIABLE     – references a question code not in this survey
        TYPE_MISMATCH        – operand type incompatibility (reserved)
        UNSUPPORTED_FUNCTION – function name not in the built-in registry
        FORWARD_REFERENCE    – references a question that appears later in
                               the survey than the current question
    """
    parsed_survey_id = _parse_survey_uuid(survey_id)

    # ------------------------------------------------------------------
    # Verify survey ownership — single query, 404 covers both missing
    # and unauthorized cases to avoid leaking existence.
    # ------------------------------------------------------------------
    survey_row = await session.execute(
        select(Survey.id).where(
            Survey.id == parsed_survey_id,
            Survey.user_id == current_user.id,
        )
    )
    if survey_row.scalar_one_or_none() is None:
        raise NotFoundError("Survey not found")

    # ------------------------------------------------------------------
    # Fetch question codes + sort_orders using a column projection to
    # avoid ORM relationship traversal (which raises MissingGreenlet in
    # async SQLAlchemy when lazy="raise").
    # ------------------------------------------------------------------
    rows_result = await session.execute(
        select(Question.code, Question.sort_order)
        .join(QuestionGroup, Question.group_id == QuestionGroup.id)
        .where(QuestionGroup.survey_id == parsed_survey_id)
        .order_by(Question.sort_order)
    )
    rows = rows_result.all()

    known_variables: list[str] = [row.code for row in rows]
    question_sort_orders: dict[str, int] = {row.code: row.sort_order for row in rows}

    # ------------------------------------------------------------------
    # Determine the sort_order of the question whose expression we are
    # validating (needed for forward-reference detection).
    # ------------------------------------------------------------------
    current_sort_order: int | None = None
    if payload.question_code is not None:
        current_sort_order = question_sort_orders.get(payload.question_code)

    # ------------------------------------------------------------------
    # Run validation
    # ------------------------------------------------------------------
    validation_result = validate_expression(
        expression=payload.expression,
        known_variables=known_variables,
        question_sort_orders=question_sort_orders,
        current_sort_order=current_sort_order,
    )

    return ValidateExpressionResponse(
        parsed_variables=validation_result.parsed_variables,
        errors=[
            ExpressionErrorSchema(
                message=e.message,
                position=e.position,
                code=e.code,
            )
            for e in validation_result.errors
        ],
        warnings=[
            ExpressionWarningSchema(
                message=w.message,
                position=w.position,
                code=w.code,
            )
            for w in validation_result.warnings
        ],
    )
