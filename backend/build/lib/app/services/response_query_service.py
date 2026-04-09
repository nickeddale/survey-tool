"""Query services for survey responses: listing, detail retrieval, and statistics."""

import statistics
import uuid
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import asc, desc, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.answer_option import AnswerOption
from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey
from app.utils.errors import NotFoundError

# Question type categories for statistics computation
_CHOICE_TYPES = {"single_choice", "dropdown", "image_picker", "yes_no"}
_MULTI_CHOICE_TYPES = {"multiple_choice"}
_NUMERIC_TYPES = {"number", "numeric", "scale"}
_RATING_TYPES = {"rating"}


def _build_options_stats(
    raw_values: list,
    answer_options: list[AnswerOption],
    multi: bool = False,
) -> list:
    """Return [{option_code, option_title, count, percentage}] for choice questions."""
    option_map = {opt.code: opt.title for opt in answer_options}
    code_counts: dict[str, int] = {}
    total_denom = 0

    if multi:
        for val in raw_values:
            if isinstance(val, list):
                for code in val:
                    c = str(code)
                    code_counts[c] = code_counts.get(c, 0) + 1
                    total_denom += 1
            elif val is not None:
                c = str(val)
                code_counts[c] = code_counts.get(c, 0) + 1
                total_denom += 1
    else:
        for val in raw_values:
            code = str(val)
            code_counts[code] = code_counts.get(code, 0) + 1
        total_denom = len(raw_values)

    denom = total_denom if total_denom > 0 else 1
    options_out = []
    for opt in answer_options:
        cnt = code_counts.get(opt.code, 0)
        options_out.append({
            "option_code": opt.code,
            "option_title": opt.title,
            "count": cnt,
            "percentage": round(cnt / denom * 100, 2),
        })
    for code, cnt in code_counts.items():
        if code not in option_map:
            options_out.append({
                "option_code": code,
                "option_title": None,
                "count": cnt,
                "percentage": round(cnt / denom * 100, 2),
            })
    return options_out


def _compute_question_stats(
    qtype: str,
    raw_values: list,
    answer_options: list[AnswerOption],
) -> dict:
    """Compute statistics dict for a single question given its raw answer values."""
    response_count = len(raw_values)

    if qtype in _CHOICE_TYPES:
        options_out = _build_options_stats(raw_values, answer_options, multi=False)
        return {"question_type": qtype, "response_count": response_count, "options": options_out}

    if qtype in _MULTI_CHOICE_TYPES:
        options_out = _build_options_stats(raw_values, answer_options, multi=True)
        return {"question_type": qtype, "response_count": response_count, "options": options_out}

    if qtype in _NUMERIC_TYPES:
        numeric_vals: list[float] = []
        for val in raw_values:
            try:
                numeric_vals.append(float(val))
            except (TypeError, ValueError):
                pass
        if numeric_vals:
            mean_val: float | None = sum(numeric_vals) / len(numeric_vals)
            median_val: float | None = statistics.median(numeric_vals)
            min_val: float | None = min(numeric_vals)
            max_val: float | None = max(numeric_vals)
        else:
            mean_val = median_val = min_val = max_val = None
        return {
            "question_type": qtype,
            "response_count": len(numeric_vals),
            "mean": mean_val,
            "median": median_val,
            "min": min_val,
            "max": max_val,
        }

    if qtype in _RATING_TYPES:
        numeric_vals = []
        dist_counts: dict[str, int] = {}
        for val in raw_values:
            s = str(val)
            dist_counts[s] = dist_counts.get(s, 0) + 1
            try:
                numeric_vals.append(float(val))
            except (TypeError, ValueError):
                pass
        average = sum(numeric_vals) / len(numeric_vals) if numeric_vals else None
        distribution = [
            {"value": k, "count": v}
            for k, v in sorted(dist_counts.items(), key=lambda x: x[0])
        ]
        return {
            "question_type": qtype,
            "response_count": response_count,
            "average": average,
            "distribution": distribution,
        }

    return {"question_type": qtype, "response_count": response_count}


async def list_responses(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str | None = None,
    started_after: datetime | None = None,
    started_before: datetime | None = None,
    completed_after: datetime | None = None,
    completed_before: datetime | None = None,
    sort_by: Literal["started_at", "completed_at", "status"] = "started_at",
    sort_order: Literal["asc", "desc"] = "desc",
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Response], int]:
    """List responses for a survey with optional filtering and sorting.

    Enforces survey ownership — both missing and unauthorized surveys return
    NotFoundError (no 404-oracle). Returns (responses, total) tuple.

    Raises:
        NotFoundError: If the survey does not exist or does not belong to user_id.
    """
    # Validate survey existence AND ownership in a single query
    survey_result = await session.execute(
        select(Survey).where(Survey.id == survey_id, Survey.user_id == user_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is None:
        raise NotFoundError("Survey not found")

    # Build base WHERE conditions for responses
    conditions = [Response.survey_id == survey_id]

    if status is not None:
        conditions.append(Response.status == status)
    if started_after is not None:
        conditions.append(Response.started_at > started_after)
    if started_before is not None:
        conditions.append(Response.started_at < started_before)
    if completed_after is not None:
        conditions.append(Response.completed_at > completed_after)
    if completed_before is not None:
        conditions.append(Response.completed_at < completed_before)

    # Separate COUNT(*) query for accurate total (not affected by LIMIT/OFFSET)
    count_result = await session.execute(
        select(func.count()).select_from(Response).where(*conditions)
    )
    total = count_result.scalar_one()

    # Determine sort column and direction
    sort_column_map = {
        "started_at": Response.started_at,
        "completed_at": Response.completed_at,
        "status": Response.status,
    }
    sort_col = sort_column_map[sort_by]
    order_fn = asc if sort_order == "asc" else desc
    order_expr = order_fn(sort_col)

    # Paginated data query
    offset = (page - 1) * per_page
    data_result = await session.execute(
        select(Response)
        .where(*conditions)
        .order_by(order_expr)
        .limit(per_page)
        .offset(offset)
    )
    responses = list(data_result.scalars().all())

    return responses, total


_DETAIL_CHOICE_TYPES = {"single_choice", "dropdown", "image_picker"}
_DETAIL_MATRIX_TYPES = {"matrix", "matrix_single", "matrix_multiple", "matrix_dropdown", "matrix_dynamic"}


def _build_enriched_answer(answer: ResponseAnswer) -> "ResponseAnswerDetail":
    """Build a ResponseAnswerDetail from a ResponseAnswer ORM object (with question loaded)."""
    from app.schemas.response import ResponseAnswerDetail

    question = answer.question
    raw_value = answer.value

    selected_option_title: str | None = None
    if question.question_type in _DETAIL_CHOICE_TYPES and raw_value is not None:
        option_code = str(raw_value)
        for opt in question.answer_options:
            if opt.code == option_code:
                selected_option_title = opt.title
                break

    subquestion_label: str | None = None
    if question.question_type in _DETAIL_MATRIX_TYPES and question.parent_id is not None:
        subquestion_label = question.title

    values: list[Any] | None = None
    if question.question_type == "multiple_choice" and isinstance(raw_value, list):
        values = raw_value

    return ResponseAnswerDetail(
        question_id=question.id,
        question_code=question.code,
        question_title=question.title,
        question_type=question.question_type,
        value=raw_value,
        values=values,
        selected_option_title=selected_option_title,
        subquestion_label=subquestion_label,
    )


async def get_response_detail(
    session: AsyncSession,
    survey_id: uuid.UUID,
    response_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    """Load a response with fully enriched answer data. Enforces survey ownership.

    Returns 404 for both not-found and wrong-owner cases (no ownership oracle).

    Raises:
        NotFoundError: If the response/survey does not exist or is not owned by user_id.
    """
    result = await session.execute(
        select(Response)
        .join(Survey, Response.survey_id == Survey.id)
        .where(
            Response.id == response_id,
            Response.survey_id == survey_id,
            Survey.user_id == user_id,
        )
        .options(
            selectinload(Response.answers).selectinload(ResponseAnswer.question).selectinload(
                Question.answer_options
            ),
            selectinload(Response.answers).selectinload(ResponseAnswer.question).selectinload(
                Question.subquestions
            ),
        )
    )
    response = result.scalar_one_or_none()

    if response is None:
        raise NotFoundError("Response not found")

    enriched_answers = [_build_enriched_answer(a) for a in response.answers]

    return {
        "id": response.id,
        "status": response.status,
        "started_at": response.started_at,
        "completed_at": response.completed_at,
        "ip_address": response.ip_address,
        "metadata": response.metadata_,
        "participant_id": response.participant_id,
        "answers": enriched_answers,
    }


async def get_survey_statistics(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    """Compute aggregate statistics for a survey and its questions.

    Enforces survey ownership — returns 404 for both missing and unauthorized surveys.

    Raises:
        NotFoundError: If the survey does not exist or is not owned by user_id.
    """
    # Verify survey ownership
    survey_result = await session.execute(
        select(Survey).where(Survey.id == survey_id, Survey.user_id == user_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is None:
        raise NotFoundError("Survey not found")

    status_counts_result = await session.execute(
        select(Response.status, func.count().label("cnt"))
        .where(Response.survey_id == survey_id)
        .group_by(Response.status)
    )
    status_map: dict[str, int] = {}
    for row in status_counts_result:
        status_map[row.status] = row.cnt

    total_responses = sum(status_map.values())
    complete_responses = status_map.get("complete", 0)
    incomplete_responses = status_map.get("incomplete", 0)
    disqualified_responses = status_map.get("disqualified", 0)
    completion_rate = (complete_responses / total_responses) if total_responses > 0 else 0.0

    avg_time_result = await session.execute(
        select(
            func.avg(
                extract("epoch", Response.completed_at) - extract("epoch", Response.started_at)
            )
        ).where(
            Response.survey_id == survey_id,
            Response.status == "complete",
            Response.completed_at.is_not(None),
        )
    )
    avg_time_seconds: float | None = avg_time_result.scalar_one_or_none()

    questions_result = await session.execute(
        select(Question)
        .join(QuestionGroup, Question.group_id == QuestionGroup.id)
        .where(QuestionGroup.survey_id == survey_id)
        .order_by(QuestionGroup.sort_order, Question.sort_order)
    )
    questions = list(questions_result.scalars().all())
    question_stats_list = []

    for question in questions:
        qtype = question.question_type
        question_id = question.id

        answers_result = await session.execute(
            select(ResponseAnswer.value)
            .join(Response, ResponseAnswer.response_id == Response.id)
            .where(
                Response.survey_id == survey_id,
                ResponseAnswer.question_id == question_id,
                ResponseAnswer.value.is_not(None),
            )
        )
        raw_values = [row[0] for row in answers_result.fetchall()]

        answer_options: list[AnswerOption] = []
        if qtype in _CHOICE_TYPES | _MULTI_CHOICE_TYPES:
            opts_result = await session.execute(
                select(AnswerOption)
                .where(AnswerOption.question_id == question_id)
                .order_by(AnswerOption.sort_order)
            )
            answer_options = list(opts_result.scalars().all())

        stats = _compute_question_stats(qtype, raw_values, answer_options)
        question_stats_list.append({
            "question_id": question.id,
            "question_code": question.code,
            "question_title": question.title,
            "question_type": qtype,
            "stats": stats,
        })

    return {
        "survey_id": survey_id,
        "total_responses": total_responses,
        "complete_responses": complete_responses,
        "incomplete_responses": incomplete_responses,
        "disqualified_responses": disqualified_responses,
        "completion_rate": round(completion_rate, 4),
        "average_completion_time_seconds": avg_time_seconds,
        "questions": question_stats_list,
    }
