"""CSV export logic for survey responses.

build_csv_headers        – collects unique question codes in sort_order for CSV header row
flatten_response_to_csv_row – converts a response to a flat CSV row dict
generate_csv_stream      – async generator yielding CSV rows as bytes
"""
import csv
import io
import uuid
from typing import Any, AsyncIterator

from app.models.question import Question
from app.models.response import Response


_MATRIX_TYPES = frozenset({
    "matrix",
    "matrix_single",
    "matrix_multiple",
    "matrix_dropdown",
    "matrix_dynamic",
})


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
                # This is a subquestion answer — handled in third pass
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
