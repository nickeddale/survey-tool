"""CSV export logic for survey responses.

build_csv_headers           – collects unique question codes in sort_order for CSV header row
flatten_response_to_csv_row – converts a response to a flat CSV row dict
generate_csv_stream         – async generator yielding CSV rows as bytes (list-based)
generate_csv_stream_chunked – async generator yielding CSV rows as bytes (chunked/streaming)
"""
import csv
import io
import uuid
from contextlib import aclosing
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


def _update_headers_from_chunk(
    chunk: list[Response],
    seen: dict[str, tuple[int, int]],
    parent_map: dict[uuid.UUID, Question],
) -> None:
    """Accumulate header codes from a chunk into seen and parent_map (in-place).

    Mutates both seen and parent_map to add any new codes found in chunk.
    """
    for response in chunk:
        for answer in response.answers:
            question = answer.question
            if question.parent_id is None:
                if question.id not in parent_map:
                    parent_map[question.id] = question
                code = question.code
                if code not in seen:
                    seen[code] = (question.sort_order, 0)

    for response in chunk:
        for answer in response.answers:
            question = answer.question
            if question.parent_id is not None:
                parent = parent_map.get(question.parent_id)
                if parent is not None:
                    code = f"{parent.code}_{question.code}"
                    if code not in seen:
                        seen[code] = (parent.sort_order, question.sort_order)


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


def _write_csv_row(writer: Any, buf: io.StringIO, values: list[str]) -> bytes:
    """Write a single CSV row and return the encoded bytes."""
    writer.writerow(values)
    data = buf.getvalue().encode("utf-8")
    buf.truncate(0)
    buf.seek(0)
    return data


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


async def generate_csv_stream_chunked(
    response_chunks: AsyncIterator[list[Response]],
    columns: list[str] | None = None,
) -> AsyncIterator[bytes]:
    """Async generator yielding CSV content as bytes, consuming response chunks lazily.

    Buffers the first non-empty chunk to build CSV headers from its responses, yields
    the header row, then yields data rows for the first chunk followed by all
    subsequent chunks incrementally (without loading everything into memory).

    For the zero-response case (no chunks), outputs only the metadata header row.

    Note: Column headers are determined from the first chunk. In typical surveys all
    responses answer the same set of questions, so the first chunk covers all columns.
    Any question codes that appear only in later chunks are appended at the end in
    sort order to avoid omitting data.

    Args:
        response_chunks: Async iterator yielding lists (chunks) of Response objects
                         with eagerly loaded answers and questions.
        columns: If provided, only include question codes in this list (filter).

    Yields:
        UTF-8 encoded bytes for each CSV row (header row first, then data rows).
    """
    meta_headers = ["response_id", "status", "started_at", "completed_at", "ip_address"]

    # Accumulated header state — built from first chunk, extended by later chunks
    seen: dict[str, tuple[int, int]] = {}
    parent_map: dict[uuid.UUID, Question] = {}

    buf = io.StringIO()
    writer = csv.writer(buf)

    # ordered_codes is set after processing the first chunk and locked for the
    # header row. New codes from later chunks are appended to avoid missing data.
    ordered_codes: list[str] = []
    header_row_yielded = False
    first_chunk_buffered: list[Response] | None = None

    async with aclosing(response_chunks) as chunks:
        async for chunk in chunks:
            if not chunk:
                continue

            # Accumulate header codes from this chunk
            _update_headers_from_chunk(chunk, seen, parent_map)

            if not header_row_yielded:
                # First non-empty chunk: build and yield header row, then yield its rows
                first_chunk_buffered = chunk
                ordered_codes = sorted(seen.keys(), key=lambda c: seen[c])
                if columns is not None:
                    column_set = set(columns)
                    ordered_codes = [c for c in ordered_codes if c in column_set]

                all_headers = meta_headers + ordered_codes
                buf.truncate(0)
                buf.seek(0)
                writer.writerow(all_headers)
                yield buf.getvalue().encode("utf-8")
                header_row_yielded = True

                # Emit the first chunk's rows
                for response in first_chunk_buffered:
                    yield _emit_response_row(response, ordered_codes, parent_map, buf, writer)
            else:
                # Subsequent chunks: check if new question codes appeared and append them
                current_sorted = sorted(seen.keys(), key=lambda c: seen[c])
                if columns is not None:
                    column_set = set(columns)
                    current_sorted = [c for c in current_sorted if c in column_set]
                # Append any new codes not yet in ordered_codes (preserves row alignment)
                existing_set = set(ordered_codes)
                for code in current_sorted:
                    if code not in existing_set:
                        ordered_codes.append(code)
                        existing_set.add(code)

                for response in chunk:
                    yield _emit_response_row(response, ordered_codes, parent_map, buf, writer)

    # Zero-response case: yield only the metadata header row
    if not header_row_yielded:
        if columns is not None:
            ordered_codes = [c for c in columns if c in seen]
        all_headers = meta_headers + ordered_codes
        buf.truncate(0)
        buf.seek(0)
        writer.writerow(all_headers)
        yield buf.getvalue().encode("utf-8")


def _emit_response_row(
    response: Response,
    ordered_codes: list[str],
    parent_map: dict[uuid.UUID, Question],
    buf: io.StringIO,
    writer: Any,
) -> bytes:
    """Serialize a single response to CSV bytes using the provided buffer/writer."""
    row_dict = flatten_response_to_csv_row(response, ordered_codes, parent_map)

    meta_values = [
        str(response.id),
        response.status,
        response.started_at.isoformat() if response.started_at else "",
        response.completed_at.isoformat() if response.completed_at else "",
        response.ip_address or "",
    ]
    data_values = [row_dict[h] for h in ordered_codes]

    buf.truncate(0)
    buf.seek(0)
    writer.writerow(meta_values + data_values)
    return buf.getvalue().encode("utf-8")
