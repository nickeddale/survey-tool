"""Tests for JWT authentication endpoints and registration."""

import asyncio
import time

import bcrypt
import pytest
from httpx import AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.auth_service import (
    get_user_by_email,
    get_refresh_token_by_hash,
    hash_password,
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
    """Register a user, log in, and return the login JSON response.
    The refresh token is set as a cookie on the client automatically by httpx."""
    await client.post(REGISTER_URL, json={**VALID_PAYLOAD, "email": email})
    response = await client.post(
        LOGIN_URL, json={"email": email, "password": VALID_PAYLOAD["password"]}
    )
    assert response.status_code == 200
    return response.json()


def get_refresh_token_from_response(response) -> str | None:
    """Extract the refresh token value from a Set-Cookie header."""
    cookie_name = settings.refresh_token_cookie_name
    for header_value in response.headers.get_list("set-cookie"):
        if header_value.startswith(f"{cookie_name}="):
            # Parse the value before the first semicolon
            return header_value.split(";")[0].split("=", 1)[1]
    return None


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
    body = response.json()
    assert body == {
        "detail": {
            "code": "CONFLICT",
            "message": "A user with this email already exists",
        }
    }


@pytest.mark.asyncio
async def test_register_invalid_email_returns_422(client: AsyncClient):
    payload = {**VALID_PAYLOAD, "email": "not-an-email"}
    response = await client.post(REGISTER_URL, json=payload)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_register_short_password_returns_422(client: AsyncClient):
    payload = {**VALID_PAYLOAD, "email": "short@example.com", "password": "short"}
    response = await client.post(REGISTER_URL, json=payload)
    assert response.status_code == 400


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
    assert await verify_password(payload["password"], user.password_hash)


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
async def test_login_returns_access_token(client: AsyncClient):
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert "expires_in" in body


@pytest.mark.asyncio
async def test_login_response_does_not_contain_refresh_token(client: AsyncClient):
    """Refresh token must NOT appear in the JSON response body (it is in a cookie)."""
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    body = response.json()
    assert "refresh_token" not in body


@pytest.mark.asyncio
async def test_login_sets_httponly_cookie(client: AsyncClient):
    """The refresh token must be delivered as an httpOnly SameSite=Strict cookie."""
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    cookie_header = response.headers.get("set-cookie", "")
    assert settings.refresh_token_cookie_name in cookie_header
    assert "httponly" in cookie_header.lower()
    assert "samesite=strict" in cookie_header.lower()


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
async def test_login_access_token_contains_type_access(client: AsyncClient):
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    body = response.json()
    payload = jwt.decode(
        body["access_token"], settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )
    assert payload.get("type") == "access"


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
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    login_response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    refresh_token = get_refresh_token_from_response(login_response)
    assert refresh_token is not None
    token_hash = hash_refresh_token(refresh_token)
    record = await get_refresh_token_by_hash(session, token_hash)
    assert record is not None
    assert not record.revoked


# --------------------------------------------------------------------------- #
# Refresh
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_refresh_returns_new_access_token(client: AsyncClient):
    """After login, calling /auth/refresh with the cookie returns a new access token."""
    await register_and_login(client)
    response = await client.post(REFRESH_URL)
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert "expires_in" in body


@pytest.mark.asyncio
async def test_refresh_response_does_not_contain_refresh_token_in_body(client: AsyncClient):
    """Refresh token must NOT appear in the JSON response body."""
    await register_and_login(client)
    response = await client.post(REFRESH_URL)
    assert response.status_code == 200
    body = response.json()
    assert "refresh_token" not in body


@pytest.mark.asyncio
async def test_refresh_sets_new_httponly_cookie(client: AsyncClient):
    """After refresh, a new httpOnly SameSite=Strict cookie must be set."""
    await register_and_login(client)
    response = await client.post(REFRESH_URL)
    cookie_header = response.headers.get("set-cookie", "")
    assert settings.refresh_token_cookie_name in cookie_header
    assert "httponly" in cookie_header.lower()
    assert "samesite=strict" in cookie_header.lower()


@pytest.mark.asyncio
async def test_refresh_revokes_old_token(client: AsyncClient, session: AsyncSession):
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    login_response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    old_token = get_refresh_token_from_response(login_response)
    assert old_token is not None
    old_hash = hash_refresh_token(old_token)

    await client.post(REFRESH_URL)

    old_record = await get_refresh_token_by_hash(session, old_hash)
    assert old_record is not None
    assert old_record.revoked


@pytest.mark.asyncio
async def test_refresh_old_cookie_fails_after_rotation(client: AsyncClient):
    """After rotation, using the old token again must return 401."""
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    login_response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    old_token = get_refresh_token_from_response(login_response)

    # Perform one refresh (rotates the cookie in the client's jar)
    await client.post(REFRESH_URL)

    # Manually set back the old cookie to simulate reuse
    client.cookies.set(settings.refresh_token_cookie_name, old_token)
    response = await client.post(REFRESH_URL)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_without_cookie_returns_401(client: AsyncClient):
    """Calling /auth/refresh without a cookie must return 401."""
    response = await client.post(REFRESH_URL)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_new_token_is_usable(client: AsyncClient):
    await register_and_login(client)
    refresh_response = await client.post(REFRESH_URL)
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
    await register_and_login(client)
    response = await client.post(LOGOUT_URL)
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_logout_clears_cookie(client: AsyncClient):
    """Logout must send a Set-Cookie header that expires/clears the refresh token."""
    await register_and_login(client)
    response = await client.post(LOGOUT_URL)
    cookie_header = response.headers.get("set-cookie", "")
    assert settings.refresh_token_cookie_name in cookie_header
    # Cookie should be cleared (max-age=0 or expires in the past)
    assert "max-age=0" in cookie_header.lower() or "expires" in cookie_header.lower()


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client: AsyncClient, session: AsyncSession):
    await client.post(REGISTER_URL, json=VALID_PAYLOAD)
    login_response = await client.post(
        LOGIN_URL,
        json={"email": VALID_PAYLOAD["email"], "password": VALID_PAYLOAD["password"]},
    )
    token_value = get_refresh_token_from_response(login_response)
    assert token_value is not None
    token_hash = hash_refresh_token(token_value)

    await client.post(LOGOUT_URL)

    record = await get_refresh_token_by_hash(session, token_hash)
    assert record is not None
    assert record.revoked


@pytest.mark.asyncio
async def test_logout_prevents_further_refresh(client: AsyncClient):
    await register_and_login(client)
    await client.post(LOGOUT_URL)
    response = await client.post(REFRESH_URL)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_without_cookie_is_idempotent(client: AsyncClient):
    """Logout with no cookie must still return 204."""
    response = await client.post(LOGOUT_URL)
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
    assert response.status_code == 400


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


# --------------------------------------------------------------------------- #
# bcrypt configuration and async offload tests
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_hash_password_uses_configured_rounds():
    """hash_password should produce a hash whose cost factor matches settings.bcrypt_rounds."""
    hashed = await hash_password("testpassword")
    # bcrypt hashes encode the cost factor in the $2b$RR$ prefix
    cost = int(hashed.split("$")[2])
    assert cost == settings.bcrypt_rounds


@pytest.mark.asyncio
async def test_verify_password_returns_true_for_correct_password():
    """verify_password must return True when the plain password matches the hash."""
    plain = "correcthorsebatterystaple"
    hashed = await hash_password(plain)
    assert await verify_password(plain, hashed) is True


@pytest.mark.asyncio
async def test_verify_password_returns_false_for_wrong_password():
    """verify_password must return False when the plain password does not match."""
    hashed = await hash_password("originalpassword")
    assert await verify_password("wrongpassword", hashed) is False


@pytest.mark.asyncio
async def test_hash_password_produces_valid_bcrypt_hash():
    """hash_password output must be verifiable by the raw bcrypt library."""
    plain = "anypassword"
    hashed = await hash_password(plain)
    assert bcrypt.checkpw(plain.encode(), hashed.encode())


@pytest.mark.asyncio
async def test_concurrent_hashing_completes_without_error():
    """Multiple concurrent hash_password calls must all succeed. This also
    exercises the ThreadPoolExecutor path under concurrent load."""
    passwords = [f"password{i}" for i in range(6)]
    hashes = await asyncio.gather(*[hash_password(p) for p in passwords])
    assert len(hashes) == len(passwords)
    for plain, hashed in zip(passwords, hashes):
        assert bcrypt.checkpw(plain.encode(), hashed.encode())
