"""Logic validation and flow resolution API router.

Provides:
    POST /surveys/{id}/logic/validate-expression
        Validates expression syntax and semantic correctness against
        the question codes of a given survey.

    POST /surveys/{id}/logic/resolve-flow
        Resolves the survey navigation flow given a set of answers,
        an optional current question, and a direction (forward/backward).
"""

import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.limiter import RATE_LIMITS, limiter
from app.dependencies import get_current_user
from app.models.answer_option import AnswerOption
from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.survey import Survey
from app.models.user import User
from app.services.expression_engine import (
    ExpressionError,
    ExpressionWarning,
    validate_expression,
)
from app.services.expressions.flow import (
    NavigationPosition,
    get_first_visible_question,
    get_next_question,
    get_previous_question,
    build_ordered_pairs,
)
from app.services.expressions.piping import pipe_all, PipingError
from app.services.expressions.relevance import (
    CircularRelevanceError,
    evaluate_relevance,
)
from app.utils.errors import NotFoundError, UnprocessableError

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
    summary="Validate a relevance expression",
    description=(
        "Validate the syntax and semantics of an expression against a survey's question codes. "
        "Always returns 200; validation failures are reported in the errors list, not as HTTP errors."
    ),
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def validate_expression_endpoint(
    request: Request,
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


# ---------------------------------------------------------------------------
# Resolve-flow schemas
# ---------------------------------------------------------------------------


class AnswerInput(BaseModel):
    """A single answer value sent by the frontend.

    Attributes:
        question_id: UUID of the question (as a string).
        value:       The answer value for that question.
    """

    question_id: str
    value: Any = None


class ResolveFlowRequest(BaseModel):
    """Request body for the resolve-flow endpoint.

    Attributes:
        answers:             List of {question_id, value} answer objects sent
                             by the frontend, keyed by question UUID.
        current_question_id: Optional UUID of the question the user is currently
                             on. When None, the response navigates to the first
                             visible question.
        direction:           Navigation direction — 'forward' (default) or 'backward'.
    """

    answers: List[AnswerInput] = []
    current_question_id: Optional[str] = None
    direction: Literal["forward", "backward"] = "forward"


class ResolveFlowResponse(BaseModel):
    """Response body for the resolve-flow endpoint.

    Attributes:
        next_question_id:   UUID of the next question to display, or null when
                            at the end (forward) or beginning (backward) of survey.
        visible_questions:  UUIDs of all currently visible questions.
        hidden_questions:   UUIDs of all currently hidden questions.
        visible_groups:     UUIDs (as strings) of currently visible groups.
        hidden_groups:      UUIDs (as strings) of currently hidden groups.
        piped_texts:        Dict of piped text entries for all questions/options.
        validation_results: Per-question relevance expression validation output.
    """

    next_question_id: Optional[str]
    visible_questions: List[str]
    hidden_questions: List[str]
    visible_groups: List[str]
    hidden_groups: List[str]
    piped_texts: Dict[str, str]
    validation_results: Dict[str, Any]


# ---------------------------------------------------------------------------
# Resolve-flow route
# ---------------------------------------------------------------------------


@router.post(
    "/{survey_id}/logic/resolve-flow",
    response_model=ResolveFlowResponse,
    status_code=status.HTTP_200_OK,
    summary="Resolve survey navigation flow",
    description=(
        "Compute visible/hidden questions and groups, the next question to display, "
        "piped text substitutions, and per-question relevance validation for a given answer state."
    ),
)
@limiter.limit(RATE_LIMITS["default_mutating"])
async def resolve_flow_endpoint(
    request: Request,
    survey_id: str,
    payload: ResolveFlowRequest,
    session: AsyncSession = Depends(get_db),
) -> ResolveFlowResponse:
    """Resolve the survey navigation flow for a given answer state.

    Computes:
      - Which questions and groups are currently visible or hidden (relevance).
      - The next question to display (based on direction and current_question_id).
      - Piped texts for all question titles, descriptions, and answer option labels.
      - Per-question relevance expression validation results.

    This endpoint performs no database writes.

    Returns 422 if a circular relevance expression is detected.
    Returns 404 if current_question_id references an unknown question UUID, or if
    the survey does not exist.
    """
    parsed_survey_id = _parse_survey_uuid(survey_id)

    # ------------------------------------------------------------------
    # Load survey with full eager-load chain in a single query.
    # ------------------------------------------------------------------
    result = await session.execute(
        select(Survey)
        .where(Survey.id == parsed_survey_id)
        .options(
            selectinload(Survey.groups).selectinload(QuestionGroup.questions).selectinload(Question.answer_options)
        )
    )
    survey = result.scalar_one_or_none()
    if survey is None:
        raise NotFoundError("Survey not found")

    # ------------------------------------------------------------------
    # Build id <-> code maps from the survey for answer conversion and
    # navigation lookups.
    # ------------------------------------------------------------------
    question_id_to_code: Dict[uuid.UUID, str] = {}
    question_code_to_id: Dict[str, uuid.UUID] = {}
    question_code_to_group_id: Dict[str, uuid.UUID] = {}

    for group in survey.groups:
        for question in group.questions:
            if question.parent_id is None:  # top-level only
                question_id_to_code[question.id] = question.code
                question_code_to_id[question.code] = question.id
                question_code_to_group_id[question.code] = group.id

    # ------------------------------------------------------------------
    # Convert the incoming list of {question_id (UUID), value} answer
    # objects into the code-keyed dict that the expression engine expects.
    # Answers for unknown question IDs are silently skipped.
    # ------------------------------------------------------------------
    answers: Dict[str, Any] = {}
    for answer_input in payload.answers:
        try:
            qid = uuid.UUID(answer_input.question_id)
        except ValueError:
            continue
        code = question_id_to_code.get(qid)
        if code is not None:
            answers[code] = answer_input.value

    # ------------------------------------------------------------------
    # Evaluate relevance to determine visible/hidden sets.
    # CircularRelevanceError → HTTP 422.
    # ------------------------------------------------------------------
    try:
        relevance_result = evaluate_relevance(survey, answers=answers)
    except CircularRelevanceError as exc:
        raise UnprocessableError(
            f"Circular reference detected in relevance expressions: {' -> '.join(exc.cycle)}"
        ) from exc

    # ------------------------------------------------------------------
    # Resolve navigation position.
    # ------------------------------------------------------------------
    next_question_id_str: Optional[str] = None

    if payload.current_question_id is None:
        # Start at the first visible question.
        pos = get_first_visible_question(survey, answers=answers)
        if pos is not None:
            next_question_id_str = str(pos.question_id)
    else:
        # Validate current_question_id — accept UUID string.
        try:
            current_qid = uuid.UUID(payload.current_question_id)
        except ValueError:
            raise NotFoundError(
                f"Question with id '{payload.current_question_id}' not found in this survey"
            )

        if current_qid not in question_id_to_code:
            raise NotFoundError(
                f"Question with id '{payload.current_question_id}' not found in this survey"
            )

        current_code = question_id_to_code[current_qid]
        current_group_id = question_code_to_group_id[current_code]
        current_pos = NavigationPosition(
            group_id=current_group_id,
            question_id=current_qid,
        )

        if payload.direction == "forward":
            next_pos = get_next_question(survey, current_pos, answers=answers)
        else:
            next_pos = get_previous_question(survey, current_pos, answers=answers)

        if next_pos is not None:
            next_question_id_str = str(next_pos.question_id)

    # ------------------------------------------------------------------
    # Collect visible/hidden question UUIDs and group UUID strings.
    # ------------------------------------------------------------------
    visible_questions = [
        str(qid)
        for qid in relevance_result.visible_question_ids
        if qid in question_id_to_code
    ]
    hidden_questions = [
        str(qid)
        for qid in relevance_result.hidden_question_ids
        if qid in question_id_to_code
    ]
    visible_groups = [str(gid) for gid in relevance_result.visible_group_ids]
    hidden_groups = [str(gid) for gid in relevance_result.hidden_group_ids]

    # ------------------------------------------------------------------
    # Apply piping to all top-level questions and their answer options.
    # ------------------------------------------------------------------
    all_questions: List[Any] = []
    for group in survey.groups:
        all_questions.extend(group.questions)

    try:
        piped_texts = pipe_all(all_questions, answers)
    except (PipingError, Exception):
        # If piping fails for any reason, fall back to unmodified question texts
        # so the survey remains usable rather than returning a 500.
        piped_texts = {}
        for question in all_questions:
            if getattr(question, "parent_id", None) is not None:
                continue
            piped_texts[f"{question.code}_title"] = question.title or ""
            piped_texts[f"{question.code}_description"] = question.description or ""
            for option in getattr(question, "answer_options", None) or []:
                piped_texts[f"{question.code}_{option.code}_title"] = option.title or ""

    # ------------------------------------------------------------------
    # Validate each question's relevance expression and collect results.
    # Build known_variables and sort_orders for forward-reference detection.
    # ------------------------------------------------------------------
    all_question_codes: List[str] = []
    all_sort_orders: Dict[str, int] = {}
    for group in survey.groups:
        for question in group.questions:
            if question.parent_id is None:
                all_question_codes.append(question.code)
                all_sort_orders[question.code] = question.sort_order

    validation_results: Dict[str, Any] = {}
    for group in survey.groups:
        for question in group.questions:
            if question.parent_id is not None:
                continue
            if question.relevance is None:
                validation_results[str(question.id)] = {
                    "parsed_variables": [],
                    "errors": [],
                    "warnings": [],
                }
                continue
            try:
                vr = validate_expression(
                    expression=question.relevance,
                    known_variables=all_question_codes,
                    question_sort_orders=all_sort_orders,
                    current_sort_order=all_sort_orders.get(question.code),
                )
                validation_results[str(question.id)] = {
                    "parsed_variables": vr.parsed_variables,
                    "errors": [
                        {"message": e.message, "position": e.position, "code": e.code}
                        for e in vr.errors
                    ],
                    "warnings": [
                        {"message": w.message, "position": w.position, "code": w.code}
                        for w in vr.warnings
                    ],
                }
            except Exception as exc:
                validation_results[str(question.id)] = {
                    "parsed_variables": [],
                    "errors": [{"message": str(exc), "position": 0, "code": "EVALUATION_ERROR"}],
                    "warnings": [],
                }

    return ResolveFlowResponse(
        next_question_id=next_question_id_str,
        visible_questions=visible_questions,
        hidden_questions=hidden_questions,
        visible_groups=visible_groups,
        hidden_groups=hidden_groups,
        piped_texts=piped_texts,
        validation_results=validation_results,
    )
