"""Tests for rate limiting on auth and response submission endpoints."""

import pytest
from httpx import AsyncClient

DEFAULT_MUTATING_LIMIT = 60

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"

REGISTER_LIMIT = 5
LOGIN_LIMIT = 10
REFRESH_LIMIT = 10


def _register_payload(n: int = 0) -> dict:
    return {
        "email": f"ratelimit{n}@example.com",
        "password": "securepassword123",
        "name": f"Rate Limit User {n}",
    }


def _login_payload(n: int = 0) -> dict:
    return {
        "email": f"ratelimit{n}@example.com",
        "password": "wrongpassword",
    }


# --------------------------------------------------------------------------- #
# Register rate limit
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_register_within_limit_succeeds(client: AsyncClient):
    """Requests within the register limit should succeed (not 429)."""
    for i in range(REGISTER_LIMIT):
        response = await client.post(REGISTER_URL, json=_register_payload(i))
        assert response.status_code != 429, (
            f"Request {i + 1} unexpectedly rate limited"
        )


@pytest.mark.asyncio
async def test_register_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th request to /register should return 429."""
    # Exhaust the limit
    for i in range(REGISTER_LIMIT):
        await client.post(REGISTER_URL, json=_register_payload(i))

    # One more request should be rate-limited
    response = await client.post(REGISTER_URL, json=_register_payload(REGISTER_LIMIT))
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_register_rate_limit_error_format(client: AsyncClient):
    """Rate limit response for /register should use the standard error format."""
    for i in range(REGISTER_LIMIT):
        await client.post(REGISTER_URL, json=_register_payload(i))

    response = await client.post(REGISTER_URL, json=_register_payload(REGISTER_LIMIT))
    assert response.status_code == 429
    body = response.json()
    assert "detail" in body
    assert body["detail"]["code"] == "RATE_LIMITED"
    assert "message" in body["detail"]


# --------------------------------------------------------------------------- #
# Login rate limit
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_login_within_limit_succeeds(client: AsyncClient):
    """Requests within the login limit should not be rate limited."""
    for i in range(LOGIN_LIMIT):
        response = await client.post(LOGIN_URL, json=_login_payload(i))
        assert response.status_code != 429, (
            f"Login request {i + 1} unexpectedly rate limited"
        )


@pytest.mark.asyncio
async def test_login_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th request to /login should return 429."""
    for i in range(LOGIN_LIMIT):
        await client.post(LOGIN_URL, json=_login_payload(i))

    response = await client.post(LOGIN_URL, json=_login_payload(LOGIN_LIMIT))
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_login_rate_limit_error_format(client: AsyncClient):
    """Rate limit response for /login should use the standard error format."""
    for i in range(LOGIN_LIMIT):
        await client.post(LOGIN_URL, json=_login_payload(i))

    response = await client.post(LOGIN_URL, json=_login_payload(LOGIN_LIMIT))
    assert response.status_code == 429
    body = response.json()
    assert "detail" in body
    assert body["detail"]["code"] == "RATE_LIMITED"
    assert "message" in body["detail"]


# --------------------------------------------------------------------------- #
# Refresh rate limit
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_refresh_within_limit_succeeds(client: AsyncClient):
    """Requests within the refresh limit should not be rate limited."""
    payload = {"refresh_token": "dummy-token"}
    for i in range(REFRESH_LIMIT):
        response = await client.post(REFRESH_URL, json=payload)
        assert response.status_code != 429, (
            f"Refresh request {i + 1} unexpectedly rate limited"
        )


@pytest.mark.asyncio
async def test_refresh_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th request to /refresh should return 429."""
    payload = {"refresh_token": "dummy-token"}
    for i in range(REFRESH_LIMIT):
        await client.post(REFRESH_URL, json=payload)

    response = await client.post(REFRESH_URL, json=payload)
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_refresh_rate_limit_error_format(client: AsyncClient):
    """Rate limit response for /refresh should use the standard error format."""
    payload = {"refresh_token": "dummy-token"}
    for i in range(REFRESH_LIMIT):
        await client.post(REFRESH_URL, json=payload)

    response = await client.post(REFRESH_URL, json=payload)
    assert response.status_code == 429
    body = response.json()
    assert "detail" in body
    assert body["detail"]["code"] == "RATE_LIMITED"
    assert "message" in body["detail"]


# --------------------------------------------------------------------------- #
# Response submission rate limit
# --------------------------------------------------------------------------- #

RESPONSE_SUBMIT_LIMIT = 30


@pytest.mark.asyncio
async def test_response_submission_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th submission to /{survey_id}/responses should return 429."""
    survey_id = "00000000-0000-0000-0000-000000000001"
    url = f"/api/v1/surveys/{survey_id}/responses"
    payload = {"answers": []}

    for i in range(RESPONSE_SUBMIT_LIMIT):
        await client.post(url, json=payload)

    response = await client.post(url, json=payload)
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_response_submission_rate_limit_error_format(client: AsyncClient):
    """Rate limit response for response submission should use the standard error format."""
    survey_id = "00000000-0000-0000-0000-000000000001"
    url = f"/api/v1/surveys/{survey_id}/responses"
    payload = {"answers": []}

    for i in range(RESPONSE_SUBMIT_LIMIT):
        await client.post(url, json=payload)

    response = await client.post(url, json=payload)
    assert response.status_code == 429
    body = response.json()
    assert "detail" in body
    assert body["detail"]["code"] == "RATE_LIMITED"
    assert "message" in body["detail"]


# --------------------------------------------------------------------------- #
# Default mutating rate limit (60/minute) — newly-protected endpoints
# --------------------------------------------------------------------------- #

REGISTER_URL_AUTH = "/api/v1/auth/register"
LOGIN_URL_AUTH = "/api/v1/auth/login"


async def _get_auth_headers(client: AsyncClient, email: str) -> dict:
    """Register and log in a test user; return Authorization headers."""
    await client.post(
        REGISTER_URL_AUTH,
        json={"email": email, "password": "securepassword123", "name": "RL Test"},
    )
    resp = await client.post(
        LOGIN_URL_AUTH,
        json={"email": email, "password": "securepassword123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_survey_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th POST /surveys should return 429."""
    headers = await _get_auth_headers(client, "rl_survey@example.com")
    url = "/api/v1/surveys"
    payload = {"title": "Rate Limit Survey"}

    for _ in range(DEFAULT_MUTATING_LIMIT):
        await client.post(url, json=payload, headers=headers)

    response = await client.post(url, json=payload, headers=headers)
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_create_survey_rate_limit_error_format(client: AsyncClient):
    """Rate limit response for POST /surveys should use the standard error format."""
    headers = await _get_auth_headers(client, "rl_survey2@example.com")
    url = "/api/v1/surveys"
    payload = {"title": "Rate Limit Survey"}

    for _ in range(DEFAULT_MUTATING_LIMIT):
        await client.post(url, json=payload, headers=headers)

    response = await client.post(url, json=payload, headers=headers)
    assert response.status_code == 429
    body = response.json()
    assert "detail" in body
    assert body["detail"]["code"] == "RATE_LIMITED"
    assert "message" in body["detail"]


@pytest.mark.asyncio
async def test_delete_survey_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th DELETE /surveys/{id} should return 429."""
    headers = await _get_auth_headers(client, "rl_delete@example.com")
    survey_id = "00000000-0000-0000-0000-000000000002"
    url = f"/api/v1/surveys/{survey_id}"

    for _ in range(DEFAULT_MUTATING_LIMIT):
        await client.delete(url, headers=headers)

    response = await client.delete(url, headers=headers)
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_update_me_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th PATCH /auth/me should return 429."""
    headers = await _get_auth_headers(client, "rl_me@example.com")
    url = "/api/v1/auth/me"
    payload = {"name": "Updated Name"}

    for _ in range(DEFAULT_MUTATING_LIMIT):
        await client.patch(url, json=payload, headers=headers)

    response = await client.patch(url, json=payload, headers=headers)
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_create_key_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th POST /auth/keys should return 429."""
    headers = await _get_auth_headers(client, "rl_keys@example.com")
    url = "/api/v1/auth/keys"
    payload = {"name": "test-key"}

    for _ in range(DEFAULT_MUTATING_LIMIT):
        await client.post(url, json=payload, headers=headers)

    response = await client.post(url, json=payload, headers=headers)
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_create_participant_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th POST /surveys/{id}/participants should return 429."""
    headers = await _get_auth_headers(client, "rl_participant@example.com")
    survey_id = "00000000-0000-0000-0000-000000000003"
    url = f"/api/v1/surveys/{survey_id}/participants"
    payload = {}

    for _ in range(DEFAULT_MUTATING_LIMIT):
        await client.post(url, json=payload, headers=headers)

    response = await client.post(url, json=payload, headers=headers)
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_create_webhook_exceeds_limit_returns_429(client: AsyncClient):
    """The (LIMIT+1)th POST /webhooks should return 429."""
    headers = await _get_auth_headers(client, "rl_webhook@example.com")
    url = "/api/v1/webhooks"
    payload = {"url": "https://example.com/hook", "events": ["response.completed"]}

    for _ in range(DEFAULT_MUTATING_LIMIT):
        await client.post(url, json=payload, headers=headers)

    response = await client.post(url, json=payload, headers=headers)
    assert response.status_code == 429
