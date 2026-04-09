"""JSON export logic for survey responses.

build_json_export – returns list of dicts with question_code keys for JSON format
"""
import uuid
from typing import Any

from app.models.question import Question
from app.models.response import Response


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
        # For JSON, include the raw value rather than stringified
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
