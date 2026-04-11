"""Tests for webhook CRUD endpoints.

Tests cover:
    - Create webhook (201, secret auto-generated, secret absent from response,
      URL validation, invalid events rejected)
    - List webhooks (pagination, user isolation)
    - Get webhook (200/404)
    - Update webhook (partial update, URL/events validation)
    - Delete webhook (204/404)
    - survey_id nullable (global webhook)
    - User isolation (user A cannot access user B webhooks)
    - Unauthenticated access returns 401/403
    - SSRF protection: blocked URLs return 400/422
"""

import uuid

import pytest
from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
WEBHOOKS_URL = "/api/v1/webhooks"
SURVEYS_URL = "/api/v1/surveys"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def register_and_login(client: AsyncClient, email: str, password: str = "testpass123") -> dict:
    await client.post(REGISTER_URL, json={"email": email, "password": password, "name": "Test User"})
    resp = await client.post(LOGIN_URL, json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()


async def auth_headers(client: AsyncClient, email: str) -> dict:
    tokens = await register_and_login(client, email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_survey(client: AsyncClient, headers: dict, title: str = "Test Survey") -> str:
    resp = await client.post(SURVEYS_URL, json={"title": title}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


def webhook_payload(
    url: str = "https://example.com/hook",
    events: list | None = None,
    survey_id: str | None = None,
    is_active: bool = True,
) -> dict:
    payload: dict = {
        "url": url,
        "events": events if events is not None else ["response.completed"],
        "is_active": is_active,
    }
    if survey_id is not None:
        payload["survey_id"] = survey_id
    return payload


# ---------------------------------------------------------------------------
# Create tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_webhook_returns_201(client: AsyncClient):
    headers = await auth_headers(client, "create_wh@example.com")
    resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["url"] == "https://example.com/hook"
    assert data["events"] == ["response.completed"]
    assert data["is_active"] is True
    assert "id" in data
    assert "user_id" in data
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_create_webhook_returns_secret(client: AsyncClient):
    """The create response must include a non-null signing secret (shown once)."""
    headers = await auth_headers(client, "secret_wh@example.com")
    resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert "secret" in data
    assert data["secret"] is not None
    assert len(data["secret"]) > 0


@pytest.mark.asyncio
async def test_create_webhook_global_no_survey_id(client: AsyncClient):
    """survey_id is nullable — global webhooks work without a survey_id."""
    headers = await auth_headers(client, "global_wh@example.com")
    resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["survey_id"] is None


@pytest.mark.asyncio
async def test_create_webhook_with_survey_id(client: AsyncClient):
    """survey_id can be set to scope a webhook to a specific survey."""
    headers = await auth_headers(client, "survey_wh@example.com")
    survey_id = await create_survey(client, headers)
    resp = await client.post(
        WEBHOOKS_URL, json=webhook_payload(survey_id=survey_id), headers=headers
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["survey_id"] == survey_id


@pytest.mark.asyncio
async def test_create_webhook_invalid_url_returns_400(client: AsyncClient):
    """URL must start with http:// or https://."""
    headers = await auth_headers(client, "badurl_wh@example.com")
    resp = await client.post(
        WEBHOOKS_URL, json=webhook_payload(url="ftp://example.com/hook"), headers=headers
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_webhook_invalid_event_returns_400(client: AsyncClient):
    """Invalid event names are rejected."""
    headers = await auth_headers(client, "badevent_wh@example.com")
    resp = await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(events=["invalid.event"]),
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_webhook_empty_events_returns_400(client: AsyncClient):
    """Empty events list is rejected."""
    headers = await auth_headers(client, "emptyevents_wh@example.com")
    resp = await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(events=[]),
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_webhook_all_valid_events(client: AsyncClient):
    """All five valid event types are accepted."""
    headers = await auth_headers(client, "allevents_wh@example.com")
    all_events = [
        "response.started",
        "response.completed",
        "survey.activated",
        "survey.closed",
        "quota.reached",
    ]
    resp = await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(events=all_events),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert set(data["events"]) == set(all_events)


@pytest.mark.asyncio
async def test_create_webhook_unauthenticated_returns_401_or_403(client: AsyncClient):
    """Unauthenticated request is rejected."""
    resp = await client.post(WEBHOOKS_URL, json=webhook_payload())
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# List tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_webhooks_returns_200_and_pagination(client: AsyncClient):
    headers = await auth_headers(client, "list_wh@example.com")

    for i in range(3):
        await client.post(
            WEBHOOKS_URL,
            json=webhook_payload(url=f"https://example.com/hook{i}"),
            headers=headers,
        )

    resp = await client.get(WEBHOOKS_URL, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3
    assert data["page"] == 1
    assert "pages" in data
    assert "per_page" in data


@pytest.mark.asyncio
async def test_list_webhooks_pagination(client: AsyncClient):
    headers = await auth_headers(client, "page_wh@example.com")

    for i in range(5):
        await client.post(
            WEBHOOKS_URL,
            json=webhook_payload(url=f"https://example.com/hook{i}"),
            headers=headers,
        )

    resp = await client.get(f"{WEBHOOKS_URL}?page=1&per_page=2", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["pages"] == 3


@pytest.mark.asyncio
async def test_list_webhooks_user_isolation(client: AsyncClient):
    """User A cannot see User B's webhooks."""
    headers1 = await auth_headers(client, "iso1_wh@example.com")
    headers2 = await auth_headers(client, "iso2_wh@example.com")

    # User 1 creates 2 webhooks
    for i in range(2):
        await client.post(
            WEBHOOKS_URL,
            json=webhook_payload(url=f"https://user1.com/hook{i}"),
            headers=headers1,
        )
    # User 2 creates 1 webhook
    await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(url="https://user2.com/hook"),
        headers=headers2,
    )

    # User 1 only sees their own
    resp1 = await client.get(WEBHOOKS_URL, headers=headers1)
    assert resp1.status_code == 200
    assert resp1.json()["total"] == 2

    # User 2 only sees their own
    resp2 = await client.get(WEBHOOKS_URL, headers=headers2)
    assert resp2.status_code == 200
    assert resp2.json()["total"] == 1


@pytest.mark.asyncio
async def test_list_webhooks_items_have_no_secret(client: AsyncClient):
    """Listed webhook items must not expose the secret."""
    headers = await auth_headers(client, "listsecret_wh@example.com")
    await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)

    resp = await client.get(WEBHOOKS_URL, headers=headers)
    assert resp.status_code == 200
    for item in resp.json()["items"]:
        assert "secret" not in item


@pytest.mark.asyncio
async def test_list_webhooks_unauthenticated_returns_401_or_403(client: AsyncClient):
    resp = await client.get(WEBHOOKS_URL)
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Get detail tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_webhook_returns_200(client: AsyncClient):
    headers = await auth_headers(client, "get_wh@example.com")
    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    webhook_id = create_resp.json()["id"]

    resp = await client.get(f"{WEBHOOKS_URL}/{webhook_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == webhook_id
    assert data["url"] == "https://example.com/hook"


@pytest.mark.asyncio
async def test_get_webhook_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "get404_wh@example.com")
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"{WEBHOOKS_URL}/{fake_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_webhook_wrong_user_returns_404(client: AsyncClient):
    """User B cannot access User A's webhook."""
    headers1 = await auth_headers(client, "getiso1_wh@example.com")
    headers2 = await auth_headers(client, "getiso2_wh@example.com")

    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers1)
    webhook_id = create_resp.json()["id"]

    resp = await client.get(f"{WEBHOOKS_URL}/{webhook_id}", headers=headers2)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_webhook_no_secret_in_response(client: AsyncClient):
    """GET detail must not expose the secret."""
    headers = await auth_headers(client, "getsecret_wh@example.com")
    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    webhook_id = create_resp.json()["id"]

    resp = await client.get(f"{WEBHOOKS_URL}/{webhook_id}", headers=headers)
    assert resp.status_code == 200
    assert "secret" not in resp.json()


# ---------------------------------------------------------------------------
# Update tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_webhook_returns_200(client: AsyncClient):
    headers = await auth_headers(client, "update_wh@example.com")
    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    webhook_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"{WEBHOOKS_URL}/{webhook_id}",
        json={"url": "https://updated.com/hook", "is_active": False},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["url"] == "https://updated.com/hook"
    assert data["is_active"] is False
    # Unchanged fields preserved
    assert data["events"] == ["response.completed"]


@pytest.mark.asyncio
async def test_update_webhook_partial_update(client: AsyncClient):
    """PATCH with only one field only changes that field."""
    headers = await auth_headers(client, "partial_wh@example.com")
    create_resp = await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(url="https://original.com/hook", is_active=True),
        headers=headers,
    )
    webhook_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"{WEBHOOKS_URL}/{webhook_id}",
        json={"is_active": False},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["is_active"] is False
    assert data["url"] == "https://original.com/hook"


@pytest.mark.asyncio
async def test_update_webhook_invalid_url_returns_400(client: AsyncClient):
    headers = await auth_headers(client, "patchurl_wh@example.com")
    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    webhook_id = create_resp.json()["id"]

    resp = await client.patch(
        f"{WEBHOOKS_URL}/{webhook_id}",
        json={"url": "not-a-url"},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_webhook_invalid_events_returns_400(client: AsyncClient):
    headers = await auth_headers(client, "patchevents_wh@example.com")
    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    webhook_id = create_resp.json()["id"]

    resp = await client.patch(
        f"{WEBHOOKS_URL}/{webhook_id}",
        json={"events": ["bad.event"]},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_webhook_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "patch404_wh@example.com")
    fake_id = str(uuid.uuid4())
    resp = await client.patch(
        f"{WEBHOOKS_URL}/{fake_id}",
        json={"is_active": False},
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_webhook_wrong_user_returns_404(client: AsyncClient):
    headers1 = await auth_headers(client, "patchiso1_wh@example.com")
    headers2 = await auth_headers(client, "patchiso2_wh@example.com")

    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers1)
    webhook_id = create_resp.json()["id"]

    resp = await client.patch(
        f"{WEBHOOKS_URL}/{webhook_id}",
        json={"is_active": False},
        headers=headers2,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_webhook_no_secret_in_response(client: AsyncClient):
    """PATCH response must not expose the secret."""
    headers = await auth_headers(client, "patchsecret_wh@example.com")
    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    webhook_id = create_resp.json()["id"]

    patch_resp = await client.patch(
        f"{WEBHOOKS_URL}/{webhook_id}",
        json={"is_active": False},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert "secret" not in patch_resp.json()


# ---------------------------------------------------------------------------
# Delete tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_webhook_returns_204(client: AsyncClient):
    headers = await auth_headers(client, "delete_wh@example.com")
    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    webhook_id = create_resp.json()["id"]

    del_resp = await client.delete(f"{WEBHOOKS_URL}/{webhook_id}", headers=headers)
    assert del_resp.status_code == 204

    # Subsequent GET returns 404
    get_resp = await client.get(f"{WEBHOOKS_URL}/{webhook_id}", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_webhook_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client, "del404_wh@example.com")
    fake_id = str(uuid.uuid4())
    resp = await client.delete(f"{WEBHOOKS_URL}/{fake_id}", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_webhook_wrong_user_returns_404(client: AsyncClient):
    headers1 = await auth_headers(client, "deliso1_wh@example.com")
    headers2 = await auth_headers(client, "deliso2_wh@example.com")

    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers1)
    webhook_id = create_resp.json()["id"]

    del_resp = await client.delete(f"{WEBHOOKS_URL}/{webhook_id}", headers=headers2)
    assert del_resp.status_code == 404

    # Webhook still exists for owner
    get_resp = await client.get(f"{WEBHOOKS_URL}/{webhook_id}", headers=headers1)
    assert get_resp.status_code == 200


# ---------------------------------------------------------------------------
# SSRF protection tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "blocked_url",
    [
        pytest.param("http://127.0.0.1/hook", id="loopback-127.0.0.1"),
        pytest.param("http://10.0.0.1/hook", id="rfc1918-10.0.0.1"),
        pytest.param("http://192.168.1.1/hook", id="rfc1918-192.168.1.1"),
        pytest.param("http://172.16.0.1/hook", id="rfc1918-172.16.0.1"),
        pytest.param("http://169.254.169.254/hook", id="metadata-169.254.169.254"),
        pytest.param("http://localhost/hook", id="loopback-localhost"),
        pytest.param("http://0x7f000001/hook", id="hex-loopback"),
        pytest.param("http://2130706433/hook", id="decimal-loopback"),
        pytest.param("http://0177.0.0.1/hook", id="octal-loopback"),
        pytest.param("http://[::1]/hook", id="ipv6-loopback"),
        pytest.param("http://[::ffff:127.0.0.1]/hook", id="ipv6-mapped-loopback"),
        pytest.param("http://metadata.google.internal/hook", id="metadata-google-internal"),
    ],
)
async def test_create_webhook_ssrf_blocked_url_returns_400(client: AsyncClient, blocked_url: str):
    """POST /webhooks with a blocked (SSRF) URL must return 400."""
    headers = await auth_headers(client, f"ssrf_{hash(blocked_url) & 0xFFFFFF}@example.com")
    resp = await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(url=blocked_url),
        headers=headers,
    )
    assert resp.status_code == 400, (
        f"Expected 400 for blocked URL {blocked_url!r}, got {resp.status_code}: {resp.text}"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "blocked_url",
    [
        pytest.param("http://127.0.0.1/hook", id="update-loopback-127.0.0.1"),
        pytest.param("http://10.0.0.1/hook", id="update-rfc1918-10.0.0.1"),
        pytest.param("http://192.168.1.1/hook", id="update-rfc1918-192.168.1.1"),
        pytest.param("http://169.254.169.254/hook", id="update-metadata"),
        pytest.param("http://localhost/hook", id="update-localhost"),
        pytest.param("http://0x7f000001/hook", id="update-hex-loopback"),
    ],
)
async def test_update_webhook_ssrf_blocked_url_returns_400(client: AsyncClient, blocked_url: str):
    """PATCH /webhooks/{id} with a blocked (SSRF) URL must return 400."""
    headers = await auth_headers(client, f"ssrf_upd_{hash(blocked_url) & 0xFFFFFF}@example.com")
    # First create a valid webhook
    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    assert create_resp.status_code == 201
    webhook_id = create_resp.json()["id"]

    # Then attempt to update to a blocked URL
    patch_resp = await client.patch(
        f"{WEBHOOKS_URL}/{webhook_id}",
        json={"url": blocked_url},
        headers=headers,
    )
    assert patch_resp.status_code == 400, (
        f"Expected 400 for blocked URL {blocked_url!r} on PATCH, got {patch_resp.status_code}: {patch_resp.text}"
    )


@pytest.mark.asyncio
async def test_create_webhook_ssrf_error_message_descriptive(client: AsyncClient):
    """The error message for a blocked URL should be descriptive."""
    headers = await auth_headers(client, "ssrf_msg@example.com")
    resp = await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(url="http://127.0.0.1/hook"),
        headers=headers,
    )
    assert resp.status_code == 400
    body = resp.text
    # The error should mention something about private/loopback/reserved
    assert any(
        word in body.lower()
        for word in ["private", "loopback", "reserved", "allowed", "blocked"]
    ), f"Expected descriptive SSRF error message, got: {body}"


# --------------------------------------------------------------------------- #
# API key scope enforcement on webhook write endpoints (SEC-ISS-217)
# --------------------------------------------------------------------------- #

KEYS_URL = "/api/v1/auth/keys"


async def _create_api_key(client: AsyncClient, headers: dict, scopes: list | None) -> str:
    """Create an API key with the given scopes; return the raw key string."""
    payload: dict = {"name": "Test Key"}
    if scopes is not None:
        payload["scopes"] = scopes
    resp = await client.post(KEYS_URL, json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()["key"]


@pytest.mark.asyncio
async def test_create_webhook_jwt_auth_returns_201(client: AsyncClient):
    """JWT-authenticated requests to create webhooks bypass scope enforcement."""
    headers = await auth_headers(client, "scope_wh_jwt@example.com")
    resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_webhook_api_key_with_scope_returns_201(client: AsyncClient):
    """API key with webhooks:write scope can create webhooks."""
    headers = await auth_headers(client, "scope_wh_write@example.com")
    api_key = await _create_api_key(client, headers, scopes=["webhooks:write"])

    resp = await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(),
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_webhook_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without webhooks:write scope cannot create webhooks."""
    headers = await auth_headers(client, "scope_wh_noscp@example.com")
    api_key = await _create_api_key(client, headers, scopes=["surveys:read"])

    resp = await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(),
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"
    assert "message" in body["detail"]


@pytest.mark.asyncio
async def test_create_webhook_api_key_empty_scopes_returns_403(client: AsyncClient):
    """API key with empty scopes cannot create webhooks."""
    headers = await auth_headers(client, "scope_wh_empty@example.com")
    api_key = await _create_api_key(client, headers, scopes=[])

    resp = await client.post(
        WEBHOOKS_URL,
        json=webhook_payload(),
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_delete_webhook_api_key_missing_scope_returns_403(client: AsyncClient):
    """API key without webhooks:write scope cannot delete webhooks."""
    headers = await auth_headers(client, "scope_wh_del@example.com")
    create_resp = await client.post(WEBHOOKS_URL, json=webhook_payload(), headers=headers)
    webhook_id = create_resp.json()["id"]

    api_key = await _create_api_key(client, headers, scopes=["surveys:read"])
    resp = await client.delete(
        f"{WEBHOOKS_URL}/{webhook_id}",
        headers={"X-API-Key": api_key},
    )
    assert resp.status_code == 403
