"""Tests for POST /api/v1/auth/register endpoint."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.auth_service import get_user_by_email, verify_password

REGISTER_URL = "/api/v1/auth/register"

VALID_PAYLOAD = {
    "email": "test@example.com",
    "password": "securepassword123",
    "name": "Test User",
}


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
