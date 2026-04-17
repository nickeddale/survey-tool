"""Query services for survey responses: listing, detail retrieval, and statistics."""

import statistics
import time
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
_NUMERIC_TYPES = {"numeric", "scale"}
_RATING_TYPES = {"rating"}

# ---------------------------------------------------------------------------
# TTL cache for survey statistics
# ---------------------------------------------------------------------------
# Keyed by survey_id (UUID). Each entry is (result_dict, expires_at_monotonic).
# Cache is invalidated on new response submission or completion.

_STATS_CACHE: dict[uuid.UUID, tuple[dict, float]] = {}
_STATS_CACHE_TTL = 60.0  # seconds


def _cache_get(survey_id: uuid.UUID) -> dict | None:
    """Return cached statistics for survey_id if still valid, else None."""
    entry = _STATS_CACHE.get(survey_id)
    if entry is None:
        return None
    result, expires_at = entry
    if time.monotonic() >= expires_at:
        del _STATS_CACHE[survey_id]
        return None
    return result


def _cache_set(survey_id: uuid.UUID, result: dict) -> None:
    """Store statistics result in the cache with TTL."""
    _STATS_CACHE[survey_id] = (result, time.monotonic() + _STATS_CACHE_TTL)


def invalidate_statistics_cache(survey_id: uuid.UUID) -> None:
    """Remove cached statistics for a survey (call on new response submission)."""
    _STATS_CACHE.pop(survey_id, None)


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
    from app.schemas.response import MatrixColumnHeader, ResponseAnswerDetail

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
    matrix_column_headers: list[MatrixColumnHeader] | None = None
    if question.question_type in _DETAIL_MATRIX_TYPES and question.parent_id is not None:
        subquestion_label = question.title
        # Load column headers from the parent question's answer options
        parent = question.parent
        if parent is not None:
            try:
                parent_options = list(parent.answer_options)
                if parent_options:
                    matrix_column_headers = [
                        MatrixColumnHeader(code=opt.code, title=opt.title or opt.code)
                        for opt in sorted(parent_options, key=lambda o: o.sort_order)
                    ]
            except Exception:
                pass

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
        matrix_column_headers=matrix_column_headers,
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
            selectinload(Response.answers)
            .selectinload(ResponseAnswer.question)
            .selectinload(Question.parent)
            .selectinload(Question.answer_options),
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
    Results are cached in-memory for _STATS_CACHE_TTL seconds to avoid redundant
    computation on repeated requests. The cache is invalidated when a new response
    is submitted or completed.

    Raises:
        NotFoundError: If the survey does not exist or is not owned by user_id.
    """
    # Check cache first (keyed only on survey_id — no answer data in key)
    cached = _cache_get(survey_id)
    if cached is not None:
        return cached

    # Verify survey ownership
    survey_result = await session.execute(
        select(Survey).where(Survey.id == survey_id, Survey.user_id == user_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is None:
        raise NotFoundError("Survey not found")

    # --- Query 1: response status counts ---
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

    # --- Query 2: average completion time ---
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

    # --- Query 3: all questions for the survey (ordered) ---
    questions_result = await session.execute(
        select(Question)
        .join(QuestionGroup, Question.group_id == QuestionGroup.id)
        .where(QuestionGroup.survey_id == survey_id)
        .order_by(QuestionGroup.sort_order, Question.sort_order)
    )
    questions = list(questions_result.scalars().all())

    if not questions:
        result = {
            "survey_id": survey_id,
            "total_responses": total_responses,
            "complete_responses": complete_responses,
            "incomplete_responses": incomplete_responses,
            "disqualified_responses": disqualified_responses,
            "completion_rate": round(completion_rate, 4),
            "average_completion_time_seconds": avg_time_seconds,
            "questions": [],
        }
        _cache_set(survey_id, result)
        return result

    question_ids = [q.id for q in questions]

    # --- Query 4: all answers for all questions in ONE batched query ---
    # Join response_answers -> responses to filter by survey_id, then
    # group by question_id and aggregate all values into an array.
    # This eliminates the N+1 query pattern (previously one query per question).
    answers_result = await session.execute(
        select(ResponseAnswer.question_id, func.array_agg(ResponseAnswer.value).label("values"))
        .join(Response, ResponseAnswer.response_id == Response.id)
        .where(
            Response.survey_id == survey_id,
            ResponseAnswer.question_id.in_(question_ids),
            ResponseAnswer.value.is_not(None),
        )
        .group_by(ResponseAnswer.question_id)
    )
    # Build a map from question_id -> [raw_value, ...]
    answers_by_question: dict[uuid.UUID, list] = {}
    for row in answers_result:
        # array_agg returns a Python list; filter out any Nones within the array
        answers_by_question[row.question_id] = [v for v in row.values if v is not None]

    # --- Query 5: all answer options for choice questions in ONE batched query ---
    choice_question_ids = [
        q.id for q in questions if q.question_type in (_CHOICE_TYPES | _MULTI_CHOICE_TYPES)
    ]
    options_by_question: dict[uuid.UUID, list[AnswerOption]] = {q_id: [] for q_id in choice_question_ids}

    if choice_question_ids:
        opts_result = await session.execute(
            select(AnswerOption)
            .where(AnswerOption.question_id.in_(choice_question_ids))
            .order_by(AnswerOption.question_id, AnswerOption.sort_order)
        )
        for opt in opts_result.scalars().all():
            options_by_question[opt.question_id].append(opt)

    # Build per-question stats using the pre-fetched data (no more DB calls)
    question_stats_list = []
    for question in questions:
        qtype = question.question_type
        raw_values = answers_by_question.get(question.id, [])
        answer_options = options_by_question.get(question.id, [])

        stats = _compute_question_stats(qtype, raw_values, answer_options)
        question_stats_list.append({
            "question_id": question.id,
            "question_code": question.code,
            "question_title": question.title,
            "question_type": qtype,
            "stats": stats,
        })

    result = {
        "survey_id": survey_id,
        "total_responses": total_responses,
        "complete_responses": complete_responses,
        "incomplete_responses": incomplete_responses,
        "disqualified_responses": disqualified_responses,
        "completion_rate": round(completion_rate, 4),
        "average_completion_time_seconds": avg_time_seconds,
        "questions": question_stats_list,
    }
    _cache_set(survey_id, result)
    return result
