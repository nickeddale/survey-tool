"""Tests for HTTP security headers added by SecurityHeadersMiddleware."""

import pytest
from httpx import AsyncClient


EXPECTED_SECURITY_HEADERS = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
}


def _assert_security_headers(response):
    for header, value in EXPECTED_SECURITY_HEADERS.items():
        assert header in response.headers, f"Missing security header: {header}"
        assert response.headers[header] == value, (
            f"Header {header} has wrong value: {response.headers[header]!r}"
        )
    csp = response.headers.get("content-security-policy", "")
    assert csp, "Missing Content-Security-Policy header"
    assert "default-src 'self'" in csp
    assert "server" not in response.headers, (
        f"Server header should be absent but got: {response.headers.get('server')}"
    )


@pytest.mark.asyncio
async def test_security_headers_on_health_endpoint(client: AsyncClient):
    """Health endpoint should return all security headers."""
    response = await client.get("/health")
    assert response.status_code == 200
    _assert_security_headers(response)


@pytest.mark.asyncio
async def test_security_headers_on_auth_endpoint(client: AsyncClient):
    """Auth endpoints should return all security headers."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "secheaders@example.com",
            "password": "securepassword123",
            "name": "Security Headers Test",
        },
    )
    assert response.status_code == 201
    _assert_security_headers(response)


@pytest.mark.asyncio
async def test_security_headers_on_404_response(client: AsyncClient):
    """Error responses (404) should also include security headers."""
    response = await client.get("/api/v1/surveys/99999999")
    assert response.status_code in (401, 403, 404)
    _assert_security_headers(response)


@pytest.mark.asyncio
async def test_server_header_absent_on_successful_response(client: AsyncClient):
    """The 'server' header should not be present in any response."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert "server" not in response.headers, (
        f"Server header leaked: {response.headers.get('server')}"
    )


@pytest.mark.asyncio
async def test_csp_header_value(client: AsyncClient):
    """Content-Security-Policy header should have required directives."""
    response = await client.get("/health")
    csp = response.headers.get("content-security-policy", "")
    assert "default-src 'self'" in csp
    assert "script-src 'self'" in csp
    assert "style-src 'self'" in csp


@pytest.mark.asyncio
async def test_x_frame_options_is_deny(client: AsyncClient):
    """X-Frame-Options should be DENY to prevent clickjacking."""
    response = await client.get("/health")
    assert response.headers.get("x-frame-options") == "DENY"
