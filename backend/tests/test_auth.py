"""Tests for JWT authentication endpoints and registration."""

import pytest
from httpx import AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.auth_service import (
    get_user_by_email,
    get_refresh_token_by_hash,
    hash_refresh_token,
    verify_password,
)

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
ME_URL = "/api/v1/auth/me"

VALID_PAYLOAD = {
    "email": "test@example.com",
    "password": "securepassword123",
    "name": "Test User",
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

async def register_and_login(client: AsyncClient, email: str = VALID_PAYLOAD["email"]) -> dict:
    """Register a user and return the login token response body."""
    await client.post(REGISTER_URL, json={**VALID_PAYLOAD, "email": email})
    response = await client.post(
        LOGIN_URL, json={"email": email, "password": VALID_PAYLOAD["password"]}
    )
    assert response.status_code == 200
    return response.json()


# --------------------------------------------------------------------------- #
# Registration
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_register_success_returns_201(client: AsyncClient):
    response = await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_register_success_returns_user_response(client: AsyncClient):
    response = await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    body = response.json()
    assert "id" in body
    assert body["email"] == VALID_PAYLOAD["email"]
    assert body["name"] == VALID_PAYLOAD["name"]
    assert body["is_active"] is True
    assert "created_at" in body


@pytest.mark.asyncio
async def test_register_response_excludes_password_hash(client: AsyncClient):
    response = await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    body = response.json()
    assert "password_hash" not in body
    assert "password" not in body


@pytest.mark.asyncio
async def test_register_duplicate_email_returns_409(client: AsyncClient):
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    response = await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_invalid_email_returns_422(client: AsyncClient):
    payload = {**VALID_PAYLOAD, "email": "not-an-email"}
    response = await client.post(REGISTER_URL, json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_register_short_password_returns_422(client: AsyncClient):
    payload = {**VALID_PAYLOAD, "email": "short@example.com", "password": "short"}
    response = await client.post(REGISTER_URL, json=payload)
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_register_password_exactly_8_chars_succeeds(client: AsyncClient):
    payload = {**VALID_PAYLOAD, "email": "exact8@example.com", "password": "12345678"}
    response = await client.post(REGISTER_URL, json=payload)
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_password_stored_as_hash(client: AsyncClient, session: AsyncSession):
    payload = {**VALID_PAYLOAD, "email": "hashcheck@example.com"}
    await client.post(REGISTER_URL, json=payload)
    user = await get_user_by_email(session, payload["email"])
    assert user is not None
    assert user.password_hash != payload["password"]
    assert verify_password(payload["password"], user.password_hash)


@pytest.mark.asyncio
async def test_register_without_name_succeeds(client: AsyncClient):
    payload = {"email": "noname@example.com", "password": "securepassword123"}
    response = await client.post(REGISTER_URL, json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] is None


@pytest.mark.asyncio
async def test_register_email_case_insensitive(client: AsyncClient):
    payload_upper = {**VALID_PAYLOAD, "email": "UPPER@EXAMPLE.COM"}
    response = await client.post(REGISTER_URL, json=payload_upper)
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "upper@example.com"


# --------------------------------------------------------------------------- #
# Login
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_login_returns_token_pair(client: AsyncClient):
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"
    assert "expires_in" in body


@pytest.mark.asyncio
async def test_login_access_token_contains_sub(client: AsyncClient):
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    body = response.json()
    payload = jwt.decode(
        body["access_token"], settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )
    assert "sub" in payload


@pytest.mark.asyncio
async def test_login_expires_in_matches_config(client: AsyncClient):
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    body = response.json()
    assert body["expires_in"] == settings.jwt_expiry_mins * 60


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client: AsyncClient):
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    response = await client.post(
        LOGIN_URL, json={"email": VALID_PAYLOAD["email"], "password": "wrongpassword"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email_returns_401(client: AsyncClient):
    response = await client.post(
        LOGIN_URL, json={"email": "nobody@example.com", "password": "anypassword"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_stores_hashed_refresh_token_in_db(
    client: AsyncClient, session: AsyncSession
):
    tokens = await register_and_login(client)
    token_hash = hash_refresh_token(tokens["refresh_token"])
    record = await get_refresh_token_by_hash(session, token_hash)
    assert record is not None
    assert not record.revoked


# --------------------------------------------------------------------------- #
# Refresh
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_refresh_returns_new_token_pair(client: AsyncClient):
    tokens = await register_and_login(client)
    response = await client.post(
        REFRESH_URL, json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["refresh_token"] != tokens["refresh_token"]


@pytest.mark.asyncio
async def test_refresh_revokes_old_token(client: AsyncClient, session: AsyncSession):
    tokens = await register_and_login(client)
    old_hash = hash_refresh_token(tokens["refresh_token"])
    await client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})
    old_record = await get_refresh_token_by_hash(session, old_hash)
    assert old_record is not None
    assert old_record.revoked


@pytest.mark.asyncio
async def test_refresh_old_token_fails_after_rotation(client: AsyncClient):
    tokens = await register_and_login(client)
    await client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})
    response = await client.post(
        REFRESH_URL, json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_invalid_token_returns_401(client: AsyncClient):
    response = await client.post(REFRESH_URL, json={"refresh_token": "not-a-valid-token"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_new_token_is_usable(client: AsyncClient):
    tokens = await register_and_login(client)
    refresh_response = await client.post(
        REFRESH_URL, json={"refresh_token": tokens["refresh_token"]}
    )
    new_tokens = refresh_response.json()
    response = await client.get(
        ME_URL, headers={"Authorization": f"Bearer {new_tokens['access_token']}"}
    )
    assert response.status_code == 200


# --------------------------------------------------------------------------- #
# Logout
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_logout_returns_204(client: AsyncClient):
    tokens = await register_and_login(client)
    response = await client.post(LOGOUT_URL, json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client: AsyncClient, session: AsyncSession):
    tokens = await register_and_login(client)
    token_hash = hash_refresh_token(tokens["refresh_token"])
    await client.post(LOGOUT_URL, json={"refresh_token": tokens["refresh_token"]})
    record = await get_refresh_token_by_hash(session, token_hash)
    assert record is not None
    assert record.revoked


@pytest.mark.asyncio
async def test_logout_prevents_further_refresh(client: AsyncClient):
    tokens = await register_and_login(client)
    await client.post(LOGOUT_URL, json={"refresh_token": tokens["refresh_token"]})
    response = await client.post(
        REFRESH_URL, json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_unknown_token_is_idempotent(client: AsyncClient):
    response = await client.post(LOGOUT_URL, json={"refresh_token": "unknown-token-value"})
    assert response.status_code == 204


# --------------------------------------------------------------------------- #
# GET /auth/me
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_get_me_returns_user_profile(client: AsyncClient):
    tokens = await register_and_login(client)
    response = await client.get(
        ME_URL, headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == VALID_PAYLOAD["email"]
    assert body["name"] == VALID_PAYLOAD["name"]
    assert "id" in body
    assert "created_at" in body


@pytest.mark.asyncio
async def test_get_me_excludes_password_hash(client: AsyncClient):
    tokens = await register_and_login(client)
    response = await client.get(
        ME_URL, headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    body = response.json()
    assert "password_hash" not in body
    assert "password" not in body


@pytest.mark.asyncio
async def test_get_me_without_token_returns_401(client: AsyncClient):
    response = await client.get(ME_URL)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_me_with_invalid_token_returns_401(client: AsyncClient):
    response = await client.get(ME_URL, headers={"Authorization": "Bearer invalid.token.here"})
    assert response.status_code == 401


# --------------------------------------------------------------------------- #
# PATCH /auth/me
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_patch_me_updates_name(client: AsyncClient):
    tokens = await register_and_login(client)
    response = await client.patch(
        ME_URL,
        json={"name": "New Name"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "New Name"


@pytest.mark.asyncio
async def test_patch_me_updates_password(client: AsyncClient, session: AsyncSession):
    tokens = await register_and_login(client)
    response = await client.patch(
        ME_URL,
        json={"password": "newpassword456"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert response.status_code == 200
    # Verify new password works for login
    login_response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": "newpassword456"},
    )
    assert login_response.status_code == 200


@pytest.mark.asyncio
async def test_patch_me_old_password_fails_after_update(client: AsyncClient):
    tokens = await register_and_login(client)
    await client.patch(
        ME_URL,
        json={"password": "newpassword456"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    login_response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    assert login_response.status_code == 401


@pytest.mark.asyncio
async def test_patch_me_excludes_password_hash(client: AsyncClient):
    tokens = await register_and_login(client)
    response = await client.patch(
        ME_URL,
        json={"name": "Updated"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    body = response.json()
    assert "password_hash" not in body
    assert "password" not in body


@pytest.mark.asyncio
async def test_patch_me_without_token_returns_401(client: AsyncClient):
    response = await client.patch(ME_URL, json={"name": "Hacker"})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_patch_me_short_password_returns_422(client: AsyncClient):
    tokens = await register_and_login(client)
    response = await client.patch(
        ME_URL,
        json={"password": "short"},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_me_empty_body_returns_current_user(client: AsyncClient):
    tokens = await register_and_login(client)
    response = await client.patch(
        ME_URL,
        json={},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == VALID_PAYLOAD["email"]
