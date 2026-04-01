"""Tests for API key CRUD endpoints and X-API-Key authentication."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.api_key_service import get_api_key_by_hash, hash_api_key

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
ME_URL = "/api/v1/auth/me"
KEYS_URL = "/api/v1/auth/keys"

VALID_USER = {
    "email": "keyuser@example.com",
    "password": "securepassword123",
    "name": "Key User",
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


async def register_and_login(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
    await client.post(REGISTER_URL, json={**VALID_USER, "email": email})
    response = await client.post(
        LOGIN_URL, json={"email": email, "password": VALID_USER["password"]}
    )
    assert response.status_code == 200
    return response.json()


async def auth_headers(client: AsyncClient, email: str = VALID_USER["email"]) -> dict:
    tokens = await register_and_login(client, email=email)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


# --------------------------------------------------------------------------- #
# POST /auth/keys
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_key_returns_201(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.post(KEYS_URL, json={"name": "My Key"}, headers=headers)
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_key_response_contains_full_key(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.post(KEYS_URL, json={"name": "My Key"}, headers=headers)
    body = response.json()
    assert "key" in body
    assert body["key"].startswith("svt_")
    assert len(body["key"]) == 4 + 40  # "svt_" + 40 hex chars


@pytest.mark.asyncio
async def test_create_key_response_contains_prefix_not_full_key_in_key_prefix(
    client: AsyncClient,
):
    headers = await auth_headers(client)
    response = await client.post(KEYS_URL, json={"name": "My Key"}, headers=headers)
    body = response.json()
    # key_prefix should be a short prefix, not the full key
    assert body["key_prefix"] != body["key"]
    assert body["key"].startswith(body["key_prefix"])


@pytest.mark.asyncio
async def test_create_key_returns_id_and_metadata(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.post(
        KEYS_URL,
        json={"name": "Test Key", "scopes": ["read", "write"]},
        headers=headers,
    )
    body = response.json()
    assert "id" in body
    assert body["name"] == "Test Key"
    assert body["scopes"] == ["read", "write"]
    assert body["is_active"] is True
    assert "created_at" in body


@pytest.mark.asyncio
async def test_create_key_with_expiry(client: AsyncClient):
    headers = await auth_headers(client)
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    response = await client.post(
        KEYS_URL,
        json={"name": "Expiring Key", "expires_at": expires},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["expires_at"] is not None


@pytest.mark.asyncio
async def test_create_key_requires_auth(client: AsyncClient):
    response = await client.post(KEYS_URL, json={"name": "My Key"})
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# GET /auth/keys
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_keys_returns_empty_list_initially(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.get(KEYS_URL, headers=headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_list_keys_shows_created_key(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(KEYS_URL, json={"name": "My Key"}, headers=headers)
    response = await client.get(KEYS_URL, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "My Key"


@pytest.mark.asyncio
async def test_list_keys_does_not_include_full_key(client: AsyncClient):
    """Critical: full key must never appear in list responses."""
    headers = await auth_headers(client)
    create_resp = await client.post(KEYS_URL, json={"name": "My Key"}, headers=headers)
    full_key = create_resp.json()["key"]

    list_resp = await client.get(KEYS_URL, headers=headers)
    list_body = list_resp.json()
    assert len(list_body) == 1
    item = list_body[0]

    # Confirm no field in the list item contains the full key value
    assert "key" not in item
    for field_value in item.values():
        assert field_value != full_key


@pytest.mark.asyncio
async def test_list_keys_includes_key_prefix(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(KEYS_URL, json={"name": "My Key"}, headers=headers)
    response = await client.get(KEYS_URL, headers=headers)
    body = response.json()
    assert "key_prefix" in body[0]


@pytest.mark.asyncio
async def test_list_keys_includes_metadata_fields(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(KEYS_URL, json={"name": "My Key"}, headers=headers)
    response = await client.get(KEYS_URL, headers=headers)
    item = response.json()[0]
    assert "id" in item
    assert "name" in item
    assert "is_active" in item
    assert "last_used_at" in item
    assert "expires_at" in item
    assert "created_at" in item


@pytest.mark.asyncio
async def test_list_keys_requires_auth(client: AsyncClient):
    response = await client.get(KEYS_URL)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_keys_only_shows_own_keys(client: AsyncClient):
    headers_a = await auth_headers(client, email="usera@example.com")
    headers_b = await auth_headers(client, email="userb@example.com")

    await client.post(KEYS_URL, json={"name": "A's Key"}, headers=headers_a)
    await client.post(KEYS_URL, json={"name": "B's Key"}, headers=headers_b)

    resp_a = await client.get(KEYS_URL, headers=headers_a)
    assert len(resp_a.json()) == 1
    assert resp_a.json()[0]["name"] == "A's Key"

    resp_b = await client.get(KEYS_URL, headers=headers_b)
    assert len(resp_b.json()) == 1
    assert resp_b.json()[0]["name"] == "B's Key"


# --------------------------------------------------------------------------- #
# DELETE /auth/keys/{id}
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_delete_key_returns_204(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(KEYS_URL, json={"name": "My Key"}, headers=headers)
    key_id = create_resp.json()["id"]

    response = await client.delete(f"{KEYS_URL}/{key_id}", headers=headers)
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_delete_key_revokes_key(client: AsyncClient, session: AsyncSession):
    headers = await auth_headers(client)
    create_resp = await client.post(KEYS_URL, json={"name": "My Key"}, headers=headers)
    full_key = create_resp.json()["key"]
    key_id = create_resp.json()["id"]

    await client.delete(f"{KEYS_URL}/{key_id}", headers=headers)

    key_hash = hash_api_key(full_key)
    record = await get_api_key_by_hash(session, key_hash)
    assert record is not None
    assert record.is_active is False


@pytest.mark.asyncio
async def test_delete_key_not_found_returns_404(client: AsyncClient):
    headers = await auth_headers(client)
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.delete(f"{KEYS_URL}/{fake_id}", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_key_belonging_to_other_user_returns_404(client: AsyncClient):
    headers_a = await auth_headers(client, email="owner@example.com")
    headers_b = await auth_headers(client, email="attacker@example.com")

    create_resp = await client.post(KEYS_URL, json={"name": "Owner Key"}, headers=headers_a)
    key_id = create_resp.json()["id"]

    response = await client.delete(f"{KEYS_URL}/{key_id}", headers=headers_b)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_key_requires_auth(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.delete(f"{KEYS_URL}/{fake_id}")
    assert response.status_code == 403


# --------------------------------------------------------------------------- #
# X-API-Key authentication
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_x_api_key_authenticates_request(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(KEYS_URL, json={"name": "Auth Key"}, headers=headers)
    full_key = create_resp.json()["key"]

    response = await client.get(ME_URL, headers={"X-API-Key": full_key})
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == VALID_USER["email"]


@pytest.mark.asyncio
async def test_x_api_key_invalid_returns_401(client: AsyncClient):
    response = await client.get(ME_URL, headers={"X-API-Key": "svt_invalidkeyvalue"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_x_api_key_revoked_returns_401(client: AsyncClient):
    headers = await auth_headers(client)
    create_resp = await client.post(KEYS_URL, json={"name": "Revoke Key"}, headers=headers)
    full_key = create_resp.json()["key"]
    key_id = create_resp.json()["id"]

    await client.delete(f"{KEYS_URL}/{key_id}", headers=headers)

    response = await client.get(ME_URL, headers={"X-API-Key": full_key})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_x_api_key_expired_returns_401(client: AsyncClient):
    headers = await auth_headers(client)
    # Create a key that already expired
    past_time = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    create_resp = await client.post(
        KEYS_URL,
        json={"name": "Expired Key", "expires_at": past_time},
        headers=headers,
    )
    full_key = create_resp.json()["key"]

    response = await client.get(ME_URL, headers={"X-API-Key": full_key})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_x_api_key_updates_last_used_at(client: AsyncClient, session: AsyncSession):
    headers = await auth_headers(client)
    create_resp = await client.post(KEYS_URL, json={"name": "Track Key"}, headers=headers)
    full_key = create_resp.json()["key"]

    key_hash = hash_api_key(full_key)
    record_before = await get_api_key_by_hash(session, key_hash)
    assert record_before is not None
    assert record_before.last_used_at is None

    await client.get(ME_URL, headers={"X-API-Key": full_key})

    # Re-fetch from DB
    await session.refresh(record_before)
    assert record_before.last_used_at is not None
