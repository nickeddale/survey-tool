"""Survey clone, export, and import service.

clone_survey  – deep-copies a survey with new UUIDs, draft status
export_survey – returns a portable dict (uses question/option codes, not UUIDs)
import_survey – creates a new survey from an exported dict
"""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.answer_option import AnswerOption
from app.models.question import VALID_QUESTION_TYPES, Question
from app.models.question_group import QuestionGroup
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

    Raises HTTP 400 if the format is invalid.
    """
    _validate_import_payload(data)

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
            created_at=now,
        )
        session.add(new_option)

    for subquestion_data in question_data.get("subquestions", []):
        await _import_question(session, group_id, subquestion_data, new_q_id, now)

    await session.flush()
    return new_q_id
