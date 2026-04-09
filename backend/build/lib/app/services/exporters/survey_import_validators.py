"""Validation helpers for survey import payloads.

Used by survey_export_service.import_survey to validate incoming data
before attempting DB writes.
"""
from typing import Any

from fastapi import HTTPException

from app.models.question import VALID_QUESTION_TYPES


_REQUIRED_SURVEY_KEYS = {"title", "groups"}
_REQUIRED_GROUP_KEYS = {"title", "questions"}
_REQUIRED_QUESTION_KEYS = {"code", "question_type", "title"}
_REQUIRED_OPTION_KEYS = {"code", "title"}


def validate_import_payload(data: dict[str, Any]) -> None:
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
            validate_question_payload(question, f"group[{g_idx}].questions[{q_idx}]")


def validate_question_payload(question: Any, path: str) -> None:
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
        validate_option_payload(option, f"{path}.answer_options[{opt_idx}]")
    for sq_idx, subquestion in enumerate(question.get("subquestions", [])):
        validate_question_payload(subquestion, f"{path}.subquestions[{sq_idx}]")


def validate_option_payload(option: Any, path: str) -> None:
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
