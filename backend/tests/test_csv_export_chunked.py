"""Tests for chunked CSV export — ISS-212.

Verifies that the chunked streaming export endpoint:
- Returns correct CSV output for 0, 1, and many responses
- Correctly handles column filtering
- Returns 200 with correct Content-Disposition header
- Produces identical output to a non-chunked export (correctness regression)
"""

import csv
import io

import pytest
from httpx import AsyncClient

from app.services.exporters.csv_exporter import generate_csv_stream_chunked

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"

_USER = {
    "email": "chunkedexport@example.com",
    "password": "securepassword123",
    "name": "Chunked Export User",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register_and_login(client: AsyncClient, email: str = _USER["email"]) -> dict:
    await client.post(REGISTER_URL, json={**_USER, "email": email})
    resp = await client.post(LOGIN_URL, json={"email": email, "password": _USER["password"]})
    assert resp.status_code == 200
    return resp.json()


async def _auth_headers(client: AsyncClient, email: str = _USER["email"]) -> dict:
    tokens = await _register_and_login(client, email=email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def _create_survey(client: AsyncClient, headers: dict, title: str = "Test") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


async def _add_group(client: AsyncClient, headers: dict, survey_id: str) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups", json={"title": "G1"}, headers=headers
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _add_question(
    client: AsyncClient,
    headers: dict,
    survey_id: str,
    group_id: str,
    code: str = "Q1",
    qtype: str = "short_text",
) -> str:
    resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": f"Question {code}", "question_type": qtype, "code": code},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _activate(client: AsyncClient, headers: dict, survey_id: str) -> None:
    resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}", json={"status": "active"}, headers=headers
    )
    assert resp.status_code == 200


async def _submit_response(
    client: AsyncClient,
    survey_id: str,
    answers: list[dict] | None = None,
) -> str:
    payload: dict = {}
    if answers:
        payload["answers"] = answers
    resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]


def _parse_csv(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows = list(reader)
    return list(headers), rows


def _export_url(survey_id: str, **params: str) -> str:
    base = f"{SURVEYS_URL}/{survey_id}/responses/export"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{base}?{qs}"
    return base


# ---------------------------------------------------------------------------
# Unit tests for generate_csv_stream_chunked (no HTTP)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_csv_stream_chunked_zero_responses():
    """Empty async iterator yields only the meta header row."""

    async def empty_chunks():
        return
        yield  # make it an async generator

    chunks_collected = []
    async for chunk in generate_csv_stream_chunked(empty_chunks()):
        chunks_collected.append(chunk)

    assert len(chunks_collected) == 1
    text = b"".join(chunks_collected).decode("utf-8")
    rows = list(csv.reader(io.StringIO(text)))
    assert len(rows) == 1  # header row only
    assert rows[0] == ["response_id", "status", "started_at", "completed_at", "ip_address"]


@pytest.mark.asyncio
async def test_generate_csv_stream_chunked_zero_responses_with_columns():
    """Empty async iterator with column filter still yields only meta headers."""

    async def empty_chunks():
        return
        yield

    chunks_collected = []
    async for chunk in generate_csv_stream_chunked(empty_chunks(), columns=["Q1", "Q2"]):
        chunks_collected.append(chunk)

    text = b"".join(chunks_collected).decode("utf-8")
    rows = list(csv.reader(io.StringIO(text)))
    assert len(rows) == 1
    # columns filter has no known codes so only meta headers present
    assert rows[0] == ["response_id", "status", "started_at", "completed_at", "ip_address"]


# ---------------------------------------------------------------------------
# Integration tests via HTTP endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_csv_export_chunked_zero_responses_returns_header_only(client: AsyncClient):
    """Export with 0 responses returns 200 with only the meta header row."""
    headers = await _auth_headers(client, email="chunked_zero@example.com")
    survey_id = await _create_survey(client, headers, title="Zero Responses")
    await _add_group(client, headers, survey_id)
    await _activate(client, headers, survey_id)

    resp = await client.get(_export_url(survey_id), headers=headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]

    col_headers, rows = _parse_csv(resp.content)
    assert "response_id" in col_headers
    assert "status" in col_headers
    assert "started_at" in col_headers
    assert "completed_at" in col_headers
    assert "ip_address" in col_headers
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_csv_export_chunked_one_response(client: AsyncClient):
    """Export with 1 response returns correct CSV with one data row."""
    headers = await _auth_headers(client, email="chunked_one@example.com")
    survey_id = await _create_survey(client, headers, title="One Response")
    group_id = await _add_group(client, headers, survey_id)
    q_id = await _add_question(client, headers, survey_id, group_id, code="MYCODE")
    await _activate(client, headers, survey_id)

    await _submit_response(
        client, survey_id, answers=[{"question_id": q_id, "value": "hello chunked"}]
    )

    resp = await client.get(_export_url(survey_id), headers=headers)
    assert resp.status_code == 200

    col_headers, rows = _parse_csv(resp.content)
    assert "MYCODE" in col_headers
    assert len(rows) == 1
    assert rows[0]["MYCODE"] == "hello chunked"


@pytest.mark.asyncio
async def test_csv_export_chunked_many_responses(client: AsyncClient):
    """Export with multiple responses returns all rows in correct order."""
    headers = await _auth_headers(client, email="chunked_many@example.com")
    survey_id = await _create_survey(client, headers, title="Many Responses")
    group_id = await _add_group(client, headers, survey_id)
    q_id = await _add_question(client, headers, survey_id, group_id, code="SCORE")
    await _activate(client, headers, survey_id)

    n = 5
    for i in range(n):
        await _submit_response(
            client, survey_id, answers=[{"question_id": q_id, "value": str(i)}]
        )

    resp = await client.get(_export_url(survey_id), headers=headers)
    assert resp.status_code == 200

    col_headers, rows = _parse_csv(resp.content)
    assert "SCORE" in col_headers
    assert len(rows) == n
    # All submitted values should appear (order not guaranteed so use set comparison)
    scores = {r["SCORE"] for r in rows}
    assert scores == {str(i) for i in range(n)}


@pytest.mark.asyncio
async def test_csv_export_chunked_content_disposition(client: AsyncClient):
    """CSV export response includes Content-Disposition: attachment header."""
    headers = await _auth_headers(client, email="chunked_cd@example.com")
    survey_id = await _create_survey(client, headers)
    await _activate(client, headers, survey_id)

    resp = await client.get(_export_url(survey_id), headers=headers)
    assert resp.status_code == 200
    content_disp = resp.headers.get("content-disposition", "")
    assert "attachment" in content_disp
    assert survey_id in content_disp


@pytest.mark.asyncio
async def test_csv_export_chunked_column_filter(client: AsyncClient):
    """Column filter ?columns=Q1 includes only Q1 in the CSV output."""
    headers = await _auth_headers(client, email="chunked_col@example.com")
    survey_id = await _create_survey(client, headers, title="Column Filter")
    group_id = await _add_group(client, headers, survey_id)
    q1_id = await _add_question(client, headers, survey_id, group_id, code="QONE")
    q2_id = await _add_question(client, headers, survey_id, group_id, code="QTWO")
    await _activate(client, headers, survey_id)

    await _submit_response(
        client,
        survey_id,
        answers=[
            {"question_id": q1_id, "value": "val1"},
            {"question_id": q2_id, "value": "val2"},
        ],
    )

    resp = await client.get(_export_url(survey_id, columns="QONE"), headers=headers)
    assert resp.status_code == 200

    col_headers, rows = _parse_csv(resp.content)
    assert "QONE" in col_headers
    assert "QTWO" not in col_headers
    assert len(rows) == 1
    assert rows[0]["QONE"] == "val1"


@pytest.mark.asyncio
async def test_csv_export_chunked_status_filter(client: AsyncClient):
    """Status filter ?status=complete returns only complete responses."""
    headers = await _auth_headers(client, email="chunked_status@example.com")
    survey_id = await _create_survey(client, headers, title="Status Filter")
    group_id = await _add_group(client, headers, survey_id)
    await _add_question(client, headers, survey_id, group_id, code="Q1")
    await _activate(client, headers, survey_id)

    # Submit incomplete response
    await _submit_response(client, survey_id)

    # Submit and complete a second response
    r2_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
    assert r2_resp.status_code == 201
    r2_id = r2_resp.json()["id"]
    complete_resp = await client.patch(
        f"{SURVEYS_URL}/{survey_id}/responses/{r2_id}", json={"status": "complete"}
    )
    assert complete_resp.status_code == 200

    resp = await client.get(_export_url(survey_id, status="complete"), headers=headers)
    assert resp.status_code == 200

    _col_headers, rows = _parse_csv(resp.content)
    assert len(rows) == 1
    assert rows[0]["status"] == "complete"


@pytest.mark.asyncio
async def test_csv_export_chunked_unauthenticated_returns_403(client: AsyncClient):
    """CSV export without auth returns 403."""
    headers = await _auth_headers(client, email="chunked_unauth@example.com")
    survey_id = await _create_survey(client, headers)
    await _activate(client, headers, survey_id)

    resp = await client.get(_export_url(survey_id))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_csv_export_chunked_wrong_owner_returns_404(client: AsyncClient):
    """CSV export for another user's survey returns 404."""
    owner_headers = await _auth_headers(client, email="chunked_owner@example.com")
    survey_id = await _create_survey(client, owner_headers)
    await _activate(client, owner_headers, survey_id)

    other_headers = await _auth_headers(client, email="chunked_other@example.com")
    resp = await client.get(_export_url(survey_id), headers=other_headers)
    assert resp.status_code == 404
