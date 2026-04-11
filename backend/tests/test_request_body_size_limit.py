"""Tests for the RequestBodySizeLimitMiddleware and Pydantic max_length validators."""

import pytest
from httpx import AsyncClient

from app.main import MAX_BODY_SIZE

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ONE_MB = MAX_BODY_SIZE  # 1_048_576 bytes
_SURVEY_URL = "/api/v1/surveys"
_HEALTH_URL = "/health"


async def _register_and_login(client: AsyncClient, email: str) -> dict:
    """Register a user and return Authorization headers."""
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123", "name": "Test User"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_raw_json_body(size_bytes: int) -> bytes:
    """Construct a raw JSON bytes object of approximately size_bytes."""
    # Build a JSON payload: {"title": "X...X"} padded to reach the target size.
    prefix = b'{"title": "'
    suffix = b'"}'
    padding_size = max(0, size_bytes - len(prefix) - len(suffix))
    return prefix + b"A" * padding_size + suffix


# ---------------------------------------------------------------------------
# Middleware: body size enforcement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_body_at_limit_is_accepted(client: AsyncClient):
    """A request body exactly at the 1 MB limit should not be rejected by the middleware."""
    headers = await _register_and_login(client, "bodylimit_exact@example.com")
    body = _make_raw_json_body(_ONE_MB)

    response = await client.post(
        _SURVEY_URL,
        content=body,
        headers={**headers, "Content-Type": "application/json"},
    )
    # The middleware should not reject this; the app may return 400/422 due to
    # the oversized title field hitting Pydantic validation, but NOT 413.
    assert response.status_code != 413, (
        f"Exact-limit body incorrectly rejected with 413: {response.text}"
    )


@pytest.mark.asyncio
async def test_body_one_byte_over_limit_returns_413(client: AsyncClient):
    """A request body 1 byte over the 1 MB limit should be rejected with HTTP 413."""
    headers = await _register_and_login(client, "bodylimit_over@example.com")
    body = _make_raw_json_body(_ONE_MB + 1)

    response = await client.post(
        _SURVEY_URL,
        content=body,
        headers={**headers, "Content-Type": "application/json"},
    )
    assert response.status_code == 413, (
        f"Expected 413 for oversized body, got {response.status_code}: {response.text}"
    )


@pytest.mark.asyncio
async def test_413_response_format(client: AsyncClient):
    """The 413 response must use the standard error format."""
    headers = await _register_and_login(client, "bodylimit_format@example.com")
    body = _make_raw_json_body(_ONE_MB + 100)

    response = await client.post(
        _SURVEY_URL,
        content=body,
        headers={**headers, "Content-Type": "application/json"},
    )
    assert response.status_code == 413
    data = response.json()
    assert "detail" in data, f"Missing 'detail' key in response: {data}"
    assert data["detail"]["code"] == "PAYLOAD_TOO_LARGE", (
        f"Wrong error code: {data['detail'].get('code')}"
    )
    assert "message" in data["detail"], "Missing 'message' in error detail"


@pytest.mark.asyncio
async def test_413_response_is_json(client: AsyncClient):
    """The 413 response must have Content-Type: application/json."""
    headers = await _register_and_login(client, "bodylimit_ctype@example.com")
    body = _make_raw_json_body(_ONE_MB + 1)

    response = await client.post(
        _SURVEY_URL,
        content=body,
        headers={**headers, "Content-Type": "application/json"},
    )
    assert response.status_code == 413
    assert "application/json" in response.headers.get("content-type", ""), (
        f"Expected JSON content-type, got: {response.headers.get('content-type')}"
    )


@pytest.mark.asyncio
async def test_large_body_via_content_length_header(client: AsyncClient):
    """A request with Content-Length exceeding the limit should be fast-path rejected."""
    headers = await _register_and_login(client, "bodylimit_clheader@example.com")
    # Send a small body but lie about Content-Length being huge.
    # The middleware fast-path should reject based on the header alone.
    response = await client.post(
        _SURVEY_URL,
        content=b'{"title": "small"}',
        headers={
            **headers,
            "Content-Type": "application/json",
            "Content-Length": str(_ONE_MB + 1),
        },
    )
    assert response.status_code == 413, (
        f"Expected 413 for oversized Content-Length header, got {response.status_code}"
    )


@pytest.mark.asyncio
async def test_small_body_is_accepted(client: AsyncClient):
    """Normal small request bodies must pass through without being rejected."""
    headers = await _register_and_login(client, "bodylimit_small@example.com")

    response = await client.post(
        _SURVEY_URL,
        json={"title": "Normal Survey"},
        headers=headers,
    )
    # Small body should never be rejected by the size middleware.
    assert response.status_code != 413, (
        f"Small body incorrectly rejected with 413: {response.text}"
    )
    assert response.status_code in (200, 201, 400, 422), (
        f"Unexpected status code for small body: {response.status_code}"
    )


@pytest.mark.asyncio
async def test_get_request_not_affected(client: AsyncClient):
    """GET requests (no body) should not be affected by the size limit middleware."""
    response = await client.get(_HEALTH_URL)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_large_body_on_non_survey_endpoint_returns_413(client: AsyncClient):
    """The body size limit applies to all endpoints, not just survey creation."""
    body = _make_raw_json_body(_ONE_MB + 500)
    response = await client.post(
        "/api/v1/auth/register",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


# ---------------------------------------------------------------------------
# Pydantic max_length validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_survey_title_max_length_enforced(client: AsyncClient):
    """A survey title exceeding 500 characters should return 400 (validation error)."""
    headers = await _register_and_login(client, "maxlen_title@example.com")

    response = await client.post(
        _SURVEY_URL,
        json={"title": "T" * 501},
        headers=headers,
    )
    assert response.status_code == 400, (
        f"Expected 400 for title > 500 chars, got {response.status_code}: {response.text}"
    )


@pytest.mark.asyncio
async def test_survey_title_at_max_length_accepted(client: AsyncClient):
    """A survey title of exactly 500 characters should be accepted."""
    headers = await _register_and_login(client, "maxlen_title_ok@example.com")

    response = await client.post(
        _SURVEY_URL,
        json={"title": "T" * 500},
        headers=headers,
    )
    assert response.status_code == 201, (
        f"Expected 201 for title exactly 500 chars, got {response.status_code}: {response.text}"
    )


@pytest.mark.asyncio
async def test_survey_description_max_length_enforced(client: AsyncClient):
    """A survey description exceeding 10000 characters should return 400."""
    headers = await _register_and_login(client, "maxlen_desc@example.com")

    response = await client.post(
        _SURVEY_URL,
        json={"title": "Valid Title", "description": "D" * 10001},
        headers=headers,
    )
    assert response.status_code == 400, (
        f"Expected 400 for description > 10000 chars, got {response.status_code}"
    )


@pytest.mark.asyncio
async def test_survey_welcome_message_max_length_enforced(client: AsyncClient):
    """A welcome_message exceeding 10000 characters should return 400."""
    headers = await _register_and_login(client, "maxlen_welcome@example.com")

    response = await client.post(
        _SURVEY_URL,
        json={"title": "Valid Title", "welcome_message": "W" * 10001},
        headers=headers,
    )
    assert response.status_code == 400, (
        f"Expected 400 for welcome_message > 10000 chars, got {response.status_code}"
    )
