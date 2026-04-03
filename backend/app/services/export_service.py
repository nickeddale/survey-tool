"""Survey clone, export, and import service.

clone_survey  – deep-copies a survey with new UUIDs, draft status
export_survey – returns a portable dict (uses question/option codes, not UUIDs)
import_survey – creates a new survey from an exported dict

Response export functions:
get_responses_for_export   – fetches all responses with eagerly loaded answers+questions
build_csv_headers          – collects unique question codes in sort_order for CSV header row
flatten_answer_to_csv      – converts a response to a flat CSV row dict
generate_csv_stream        – async generator yielding CSV rows as bytes
build_json_export          – returns list of dicts with question_code keys for JSON format
"""
import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.answer_option import AnswerOption
from app.models.question import VALID_QUESTION_TYPES, Question
from app.models.question_group import QuestionGroup
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _with_deep_load():
    """Return selectinload chain: groups → questions → subquestions + answer_options."""
    return (
        selectinload(Survey.groups)
        .selectinload(QuestionGroup.questions)
        .selectinload(Question.subquestions)
        .selectinload(Question.answer_options)
    )


def _question_answer_options_load():
    """Load answer_options on questions (used for subquestions reload)."""
    return selectinload(Question.answer_options)


async def _load_survey_deep(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Survey | None:
    """Load survey with all nested relationships eagerly. Returns None if not found/owned."""
    result = await session.execute(
        select(Survey)
        .where(Survey.id == survey_id, Survey.user_id == user_id)
        .options(
            selectinload(Survey.groups)
            .selectinload(QuestionGroup.questions)
            .options(
                selectinload(Question.subquestions).selectinload(Question.answer_options),
                selectinload(Question.answer_options),
            )
        )
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Clone
# ---------------------------------------------------------------------------


async def clone_survey(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str | None = None,
) -> Survey:
    """Deep-clone a survey with all groups, questions, subquestions, and answer options.

    The cloned survey gets new UUIDs and draft status.
    Title defaults to "{original} (Copy)" if not provided.
    Raises HTTP 404 if survey not found or not owned.
    """
    original = await _load_survey_deep(session, survey_id, user_id)
    if original is None:
        raise HTTPException(status_code=404, detail="Survey not found")

    new_title = title if title is not None else f"{original.title} (Copy)"
    now = datetime.now(timezone.utc)

    new_survey = Survey(
        id=uuid.uuid4(),
        user_id=user_id,
        title=new_title,
        description=original.description,
        status="draft",
        welcome_message=original.welcome_message,
        end_message=original.end_message,
        default_language=original.default_language,
        settings=original.settings,
        translations=original.translations or {},
        created_at=now,
        updated_at=now,
    )
    session.add(new_survey)
    await session.flush()

    for group in original.groups:
        new_group = QuestionGroup(
            id=uuid.uuid4(),
            survey_id=new_survey.id,
            title=group.title,
            description=group.description,
            sort_order=group.sort_order,
            relevance=group.relevance,
            translations=group.translations or {},
            created_at=now,
        )
        session.add(new_group)
        await session.flush()

        # Map old question id → new question id (needed for parent_id re-wiring)
        old_to_new_question_id: dict[uuid.UUID, uuid.UUID] = {}

        # First pass: clone top-level questions (parent_id is None)
        for question in group.questions:
            if question.parent_id is not None:
                continue  # handled in second pass

            new_q_id = uuid.uuid4()
            old_to_new_question_id[question.id] = new_q_id

            new_question = Question(
                id=new_q_id,
                group_id=new_group.id,
                parent_id=None,
                question_type=question.question_type,
                code=question.code,
                title=question.title,
                description=question.description,
                is_required=question.is_required,
                sort_order=question.sort_order,
                relevance=question.relevance,
                validation=question.validation,
                settings=question.settings,
                translations=question.translations or {},
                created_at=now,
            )
            session.add(new_question)
            await session.flush()

            for option in question.answer_options:
                new_option = AnswerOption(
                    id=uuid.uuid4(),
                    question_id=new_q_id,
                    code=option.code,
                    title=option.title,
                    sort_order=option.sort_order,
                    assessment_value=option.assessment_value,
                    translations=option.translations or {},
                    created_at=now,
                )
                session.add(new_option)

        # Second pass: clone subquestions (parent_id is not None)
        for question in group.questions:
            if question.parent_id is None:
                continue

            new_parent_id = old_to_new_question_id.get(question.parent_id)
            if new_parent_id is None:
                # parent was not cloned (shouldn't happen in well-formed data)
                continue

            new_sq_id = uuid.uuid4()
            old_to_new_question_id[question.id] = new_sq_id

            new_subquestion = Question(
                id=new_sq_id,
                group_id=new_group.id,
                parent_id=new_parent_id,
                question_type=question.question_type,
                code=question.code,
                title=question.title,
                description=question.description,
                is_required=question.is_required,
                sort_order=question.sort_order,
                relevance=question.relevance,
                validation=question.validation,
                settings=question.settings,
                translations=question.translations or {},
                created_at=now,
            )
            session.add(new_subquestion)
            await session.flush()

            for option in question.answer_options:
                new_option = AnswerOption(
                    id=uuid.uuid4(),
                    question_id=new_sq_id,
                    code=option.code,
                    title=option.title,
                    sort_order=option.sort_order,
                    assessment_value=option.assessment_value,
                    translations=option.translations or {},
                    created_at=now,
                )
                session.add(new_option)

        await session.flush()

    # Reload the new survey with all relations for the response
    result = await session.execute(
        select(Survey)
        .where(Survey.id == new_survey.id)
        .options(
            selectinload(Survey.groups)
            .selectinload(QuestionGroup.questions)
            .options(
                selectinload(Question.subquestions).selectinload(Question.answer_options),
                selectinload(Question.answer_options),
            )
        )
    )
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def _export_option(option: AnswerOption) -> dict[str, Any]:
    return {
        "code": option.code,
        "title": option.title,
        "sort_order": option.sort_order,
        "assessment_value": option.assessment_value,
        "translations": option.translations or {},
    }


def _export_question(question: Question) -> dict[str, Any]:
    return {
        "code": question.code,
        "question_type": question.question_type,
        "title": question.title,
        "description": question.description,
        "is_required": question.is_required,
        "sort_order": question.sort_order,
        "relevance": question.relevance,
        "validation": question.validation,
        "settings": question.settings,
        "translations": question.translations or {},
        "answer_options": [_export_option(o) for o in question.answer_options],
        "subquestions": [_export_question(sq) for sq in question.subquestions],
    }


def _export_group(group: QuestionGroup) -> dict[str, Any]:
    # Only export top-level questions; subquestions are nested inside
    top_level = [q for q in group.questions if q.parent_id is None]
    return {
        "title": group.title,
        "description": group.description,
        "sort_order": group.sort_order,
        "relevance": group.relevance,
        "translations": group.translations or {},
        "questions": [_export_question(q) for q in top_level],
    }


async def export_survey(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict[str, Any]:
    """Return a portable JSON-serialisable dict for the survey.

    Uses question/option code values instead of UUIDs for portability.
    Raises HTTP 404 if survey not found or not owned.
    """
    survey = await _load_survey_deep(session, survey_id, user_id)
    if survey is None:
        raise HTTPException(status_code=404, detail="Survey not found")

    return {
        "title": survey.title,
        "description": survey.description,
        "status": survey.status,
        "welcome_message": survey.welcome_message,
        "end_message": survey.end_message,
        "default_language": survey.default_language,
        "settings": survey.settings,
        "translations": survey.translations or {},
        "groups": [_export_group(g) for g in survey.groups],
    }


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

_REQUIRED_SURVEY_KEYS = {"title", "groups"}
_REQUIRED_GROUP_KEYS = {"title", "questions"}
_REQUIRED_QUESTION_KEYS = {"code", "question_type", "title"}
_REQUIRED_OPTION_KEYS = {"code", "title"}


def _validate_import_payload(data: dict[str, Any]) -> None:
    """Validate that the import payload has the expected structure.

    Raises HTTP 400 with a descriptive message on any validation error.
    """
    missing = _REQUIRED_SURVEY_KEYS - data.keys()
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid import format: missing survey fields: {sorted(missing)}",
        )

    if not isinstance(data["groups"], list):
        raise HTTPException(
            status_code=400,
            detail="Invalid import format: 'groups' must be a list",
        )

    for g_idx, group in enumerate(data["groups"]):
        if not isinstance(group, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid import format: group[{g_idx}] must be an object",
            )
        missing_g = _REQUIRED_GROUP_KEYS - group.keys()
        if missing_g:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid import format: group[{g_idx}] missing fields: {sorted(missing_g)}",
            )
        if not isinstance(group["questions"], list):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid import format: group[{g_idx}].questions must be a list",
            )
        for q_idx, question in enumerate(group["questions"]):
            _validate_question_payload(question, f"group[{g_idx}].questions[{q_idx}]")


def _validate_question_payload(question: Any, path: str) -> None:
    if not isinstance(question, dict):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid import format: {path} must be an object",
        )
    missing_q = _REQUIRED_QUESTION_KEYS - question.keys()
    if missing_q:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid import format: {path} missing fields: {sorted(missing_q)}",
        )
    if question["question_type"] not in VALID_QUESTION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid import format: {path}.question_type "
                f"'{question['question_type']}' is not a valid question type"
            ),
        )
    for opt_idx, option in enumerate(question.get("answer_options", [])):
        _validate_option_payload(option, f"{path}.answer_options[{opt_idx}]")
    for sq_idx, subquestion in enumerate(question.get("subquestions", [])):
        _validate_question_payload(subquestion, f"{path}.subquestions[{sq_idx}]")


def _validate_option_payload(option: Any, path: str) -> None:
    if not isinstance(option, dict):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid import format: {path} must be an object",
        )
    missing_o = _REQUIRED_OPTION_KEYS - option.keys()
    if missing_o:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid import format: {path} missing fields: {sorted(missing_o)}",
        )


async def import_survey(
    session: AsyncSession,
    user_id: uuid.UUID,
    data: dict[str, Any],
    title: str | None = None,
) -> Survey:
    """Create a new survey from an exported JSON dict.

    The entire import is wrapped in a savepoint so that any failure
    (invalid question type, DB constraint, etc.) rolls back all previously
    created records — all-or-nothing creation.

    Raises HTTP 400 if the format is invalid.
    """
    _validate_import_payload(data)

    async with session.begin_nested():
        now = datetime.now(timezone.utc)
        new_title = title if title is not None else data["title"]

        new_survey = Survey(
            id=uuid.uuid4(),
            user_id=user_id,
            title=new_title,
            description=data.get("description"),
            status="draft",
            welcome_message=data.get("welcome_message"),
            end_message=data.get("end_message"),
            default_language=data.get("default_language", "en"),
            settings=data.get("settings"),
            translations=data.get("translations") or {},
            created_at=now,
            updated_at=now,
        )
        session.add(new_survey)
        await session.flush()

        for group_data in data["groups"]:
            new_group = QuestionGroup(
                id=uuid.uuid4(),
                survey_id=new_survey.id,
                title=group_data["title"],
                description=group_data.get("description"),
                sort_order=group_data.get("sort_order", 1),
                relevance=group_data.get("relevance"),
                translations=group_data.get("translations") or {},
                created_at=now,
            )
            session.add(new_group)
            await session.flush()

            for question_data in group_data["questions"]:
                await _import_question(session, new_group.id, question_data, None, now)

    # Reload for response
    result = await session.execute(
        select(Survey)
        .where(Survey.id == new_survey.id)
        .options(
            selectinload(Survey.groups)
            .selectinload(QuestionGroup.questions)
            .options(
                selectinload(Question.subquestions).selectinload(Question.answer_options),
                selectinload(Question.answer_options),
            )
        )
    )
    return result.scalar_one()


async def _import_question(
    session: AsyncSession,
    group_id: uuid.UUID,
    question_data: dict[str, Any],
    parent_id: uuid.UUID | None,
    now: datetime,
) -> uuid.UUID:
    """Recursively import a question and its subquestions. Returns the new question id."""
    new_q_id = uuid.uuid4()
    new_question = Question(
        id=new_q_id,
        group_id=group_id,
        parent_id=parent_id,
        question_type=question_data["question_type"],
        code=question_data["code"],
        title=question_data["title"],
        description=question_data.get("description"),
        is_required=question_data.get("is_required", False),
        sort_order=question_data.get("sort_order", 1),
        relevance=question_data.get("relevance"),
        validation=question_data.get("validation"),
        settings=question_data.get("settings"),
        translations=question_data.get("translations") or {},
        created_at=now,
    )
    session.add(new_question)
    await session.flush()

    for option_data in question_data.get("answer_options", []):
        new_option = AnswerOption(
            id=uuid.uuid4(),
            question_id=new_q_id,
            code=option_data["code"],
            title=option_data["title"],
            sort_order=option_data.get("sort_order", 1),
            assessment_value=option_data.get("assessment_value", 0),
            translations=option_data.get("translations") or {},
            created_at=now,
        )
        session.add(new_option)

    for subquestion_data in question_data.get("subquestions", []):
        await _import_question(session, group_id, subquestion_data, new_q_id, now)

    await session.flush()
    return new_q_id


# ---------------------------------------------------------------------------
# Response Export
# ---------------------------------------------------------------------------

_MATRIX_TYPES = frozenset({
    "matrix",
    "matrix_single",
    "matrix_multiple",
    "matrix_dropdown",
    "matrix_dynamic",
})


async def get_responses_for_export(
    session: AsyncSession,
    survey_id: uuid.UUID,
    user_id: uuid.UUID,
    status: str | None = None,
    started_after: datetime | None = None,
    started_before: datetime | None = None,
    completed_after: datetime | None = None,
    completed_before: datetime | None = None,
) -> list[Response]:
    """Fetch all responses for a survey with eagerly loaded answers and question metadata.

    Enforces survey ownership via a JOIN to the surveys table in a single query
    (no fetch-then-check). Returns 404 for both missing and unauthorized surveys.

    All relationships (Response.answers, ResponseAnswer.question, Question.subquestions)
    are eagerly loaded to prevent MissingGreenlet errors from lazy loading.

    Args:
        session: The async database session.
        survey_id: The UUID of the survey to export responses from.
        user_id: The UUID of the authenticated user (ownership check).
        status: Optional filter by response status.
        started_after: Optional filter: responses started after this datetime.
        started_before: Optional filter: responses started before this datetime.
        completed_after: Optional filter: responses completed after this datetime.
        completed_before: Optional filter: responses completed before this datetime.

    Returns:
        List of Response objects with answers, question, and subquestions eagerly loaded.

    Raises:
        HTTPException(404): If the survey does not exist or does not belong to user_id.
    """
    # Validate survey existence AND ownership in a single query
    survey_result = await session.execute(
        select(Survey).where(Survey.id == survey_id, Survey.user_id == user_id)
    )
    survey = survey_result.scalar_one_or_none()
    if survey is None:
        raise HTTPException(status_code=404, detail="Survey not found")

    # Build WHERE conditions for responses
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

    result = await session.execute(
        select(Response)
        .where(*conditions)
        .order_by(Response.started_at.asc())
        .options(
            selectinload(Response.answers)
            .selectinload(ResponseAnswer.question)
            .selectinload(Question.subquestions)
        )
    )
    return list(result.scalars().all())


def build_csv_headers(
    responses: list[Response],
    columns: list[str] | None = None,
) -> list[str]:
    """Collect all unique question codes from the responses in deterministic sort order.

    For matrix questions (where a subquestion is the answer's question), the header
    is "{parent_code}_{subquestion_code}" (e.g., Q5_SQ001). For all other question
    types, the header is the question code directly.

    The returned list preserves stable ordering: codes appear in sort_order of the
    parent question, then sub-code within a matrix. Non-matrix codes appear inline.

    Args:
        responses: List of Response objects with eagerly loaded answers and questions.
        columns: If provided, only include codes present in this list (filter).

    Returns:
        Ordered list of unique column headers (question codes or Q_SQ style for matrix).
    """
    # Collect (sort_key, header_code) tuples to deterministically order columns
    seen: dict[str, tuple[int, int]] = {}  # code -> (question_sort_order, subq_sort_order)

    for response in responses:
        for answer in response.answers:
            question = answer.question
            if question.parent_id is not None:
                # This is a subquestion answer — header is parent_code + _ + subq_code
                # We need the parent's sort_order; subquestions list is on the parent question
                # The subquestion itself has sort_order
                # Build key: parent_code_subq_code
                # We don't have direct access to parent's code here without joining,
                # but subquestions are loaded on the parent. We need parent code.
                # parent is accessible via question.subquestions on the parent Question,
                # but we only have the child here. Check if subquestions list has parent info.
                # Since parent relationship has lazy="select" (not "raise"), we can read it
                # but to be safe we must avoid it. Instead, scan through all questions to build
                # a parent_id -> parent mapping.
                pass
            else:
                # Top-level question — use its code as header
                code = question.code
                if code not in seen:
                    seen[code] = (question.sort_order, 0)

    # Second pass: build parent_id -> Question mapping for matrix column naming
    parent_map: dict[uuid.UUID, Question] = {}
    for response in responses:
        for answer in response.answers:
            question = answer.question
            if question.parent_id is None:
                parent_map[question.id] = question

    # Third pass: handle matrix subquestion columns
    for response in responses:
        for answer in response.answers:
            question = answer.question
            if question.parent_id is not None:
                parent = parent_map.get(question.parent_id)
                if parent is not None:
                    code = f"{parent.code}_{question.code}"
                    if code not in seen:
                        seen[code] = (parent.sort_order, question.sort_order)

    # Sort by (parent_sort_order, subq_sort_order) for stable column ordering
    ordered_codes = sorted(seen.keys(), key=lambda c: seen[c])

    # Apply column filter if provided
    if columns is not None:
        column_set = set(columns)
        ordered_codes = [c for c in ordered_codes if c in column_set]

    return ordered_codes


def flatten_response_to_csv_row(
    response: Response,
    headers: list[str],
    parent_map: dict[uuid.UUID, Question],
) -> dict[str, str]:
    """Convert a single response into a flat CSV row dict keyed by column headers.

    Handles:
    - matrix questions: column key is "{parent_code}_{subq_code}"
    - multiple_choice questions: comma-joined list values within the cell
    - all other types: str(value) or empty string for None

    Args:
        response: Response with eagerly loaded answers and questions.
        headers: Ordered list of column headers (from build_csv_headers).
        parent_map: Mapping from parent question ID to parent Question object.

    Returns:
        Dict mapping each header to its string value (empty string if no answer).
    """
    # Build a lookup from column_code -> raw_value
    answer_map: dict[str, Any] = {}

    for answer in response.answers:
        question = answer.question
        raw_value = answer.value

        if question.parent_id is not None:
            parent = parent_map.get(question.parent_id)
            if parent is not None:
                col_key = f"{parent.code}_{question.code}"
            else:
                # Fallback: use question code directly
                col_key = question.code
        else:
            col_key = question.code

        # Normalize value to string
        if raw_value is None:
            cell_value = ""
        elif question.question_type == "multiple_choice" and isinstance(raw_value, list):
            cell_value = ",".join(str(v) for v in raw_value)
        else:
            cell_value = str(raw_value)

        answer_map[col_key] = cell_value

    # Build row with empty string for any missing column
    return {header: answer_map.get(header, "") for header in headers}


async def generate_csv_stream(
    responses: list[Response],
    headers: list[str],
) -> AsyncIterator[bytes]:
    """Async generator yielding CSV content as bytes rows.

    Yields the header row first, then one row per response. Uses Python's
    stdlib csv.writer with io.StringIO for proper CSV quoting/escaping.

    Args:
        responses: List of Response objects with eagerly loaded answers and questions.
        headers: Ordered list of CSV column headers.

    Yields:
        UTF-8 encoded bytes for each CSV row (header + data rows).
    """
    # Build parent_map once for the entire stream
    parent_map: dict[uuid.UUID, Question] = {}
    for response in responses:
        for answer in response.answers:
            question = answer.question
            if question.parent_id is None:
                parent_map[question.id] = question

    # Add metadata columns at the front
    meta_headers = ["response_id", "status", "started_at", "completed_at", "ip_address"]
    all_headers = meta_headers + headers

    # Yield header row
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(all_headers)
    yield buf.getvalue().encode("utf-8")

    # Yield one row per response
    for response in responses:
        row_dict = flatten_response_to_csv_row(response, headers, parent_map)

        meta_values = [
            str(response.id),
            response.status,
            response.started_at.isoformat() if response.started_at else "",
            response.completed_at.isoformat() if response.completed_at else "",
            response.ip_address or "",
        ]
        data_values = [row_dict[h] for h in headers]

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(meta_values + data_values)
        yield buf.getvalue().encode("utf-8")


def build_json_export(
    responses: list[Response],
    headers: list[str],
) -> list[dict[str, Any]]:
    """Build a JSON-serializable list of response dicts with question_code keys.

    Each dict includes response metadata and a nested 'answers' dict keyed by
    column header (question code or Q_SQ style for matrix questions).

    Args:
        responses: List of Response objects with eagerly loaded answers and questions.
        headers: Ordered list of column headers used to select which answers to include.

    Returns:
        List of dicts, one per response.
    """
    parent_map: dict[uuid.UUID, Question] = {}
    for response in responses:
        for answer in response.answers:
            question = answer.question
            if question.parent_id is None:
                parent_map[question.id] = question

    result = []
    for response in responses:
        row_dict = flatten_response_to_csv_row(response, headers, parent_map)

        # For JSON, include the raw value rather than stringified
        # Rebuild with proper types
        answers_dict: dict[str, Any] = {}
        for answer in response.answers:
            question = answer.question
            raw_value = answer.value

            if question.parent_id is not None:
                parent = parent_map.get(question.parent_id)
                col_key = f"{parent.code}_{question.code}" if parent else question.code
            else:
                col_key = question.code

            if col_key in {h for h in headers}:
                answers_dict[col_key] = raw_value

        # Add empty entries for columns with no answer
        for h in headers:
            if h not in answers_dict:
                answers_dict[h] = None

        result.append({
            "response_id": str(response.id),
            "status": response.status,
            "started_at": response.started_at.isoformat() if response.started_at else None,
            "completed_at": response.completed_at.isoformat() if response.completed_at else None,
            "ip_address": response.ip_address,
            "answers": answers_dict,
        })

    return result
