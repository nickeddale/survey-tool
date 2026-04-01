"""Tests for standardized error handling and global exception handlers."""

import pytest
import pytest_asyncio

from app.main import app
from app.utils.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    RateLimitedError,
    UnauthorizedError,
    UnprocessableError,
    ValidationError,
)


# ---------------------------------------------------------------------------
# Unit tests for error classes
# ---------------------------------------------------------------------------

class TestErrorClasses:
    def test_not_found_error_attributes(self):
        err = NotFoundError("Resource not found")
        assert err.status_code == 404
        assert err.code == "NOT_FOUND"
        assert err.message == "Resource not found"

    def test_not_found_error_to_response(self):
        err = NotFoundError("Resource not found")
        assert err.to_response() == {
            "detail": {"code": "NOT_FOUND", "message": "Resource not found"}
        }

    def test_conflict_error_attributes(self):
        err = ConflictError("Already exists")
        assert err.status_code == 409
        assert err.code == "CONFLICT"

    def test_validation_error_attributes(self):
        err = ValidationError("Bad input")
        assert err.status_code == 400
        assert err.code == "VALIDATION_ERROR"

    def test_unprocessable_error_attributes(self):
        err = UnprocessableError("Cannot process")
        assert err.status_code == 422
        assert err.code == "UNPROCESSABLE"

    def test_unauthorized_error_attributes(self):
        err = UnauthorizedError("Not authorized")
        assert err.status_code == 401
        assert err.code == "UNAUTHORIZED"

    def test_forbidden_error_attributes(self):
        err = ForbiddenError("Forbidden")
        assert err.status_code == 403
        assert err.code == "FORBIDDEN"

    def test_rate_limited_error_attributes(self):
        err = RateLimitedError("Too many requests")
        assert err.status_code == 429
        assert err.code == "RATE_LIMITED"
        assert err.message == "Too many requests"


# ---------------------------------------------------------------------------
# Integration tests via HTTP client (no DB needed)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def plain_client():
    """AsyncClient without DB override — for testing pure error handler behavior."""
    from httpx import ASGITransport, AsyncClient
    from fastapi import APIRouter
    from fastapi.responses import JSONResponse

    # Register a test-only router with routes that raise specific errors
    test_router = APIRouter(prefix="/test-errors")

    @test_router.get("/not-found")
    async def raise_not_found():
        raise NotFoundError("Resource not found")

    @test_router.get("/conflict")
    async def raise_conflict():
        raise ConflictError("Already exists")

    @test_router.get("/validation")
    async def raise_validation():
        raise ValidationError("Bad input")

    @test_router.get("/unprocessable")
    async def raise_unprocessable():
        raise UnprocessableError("Cannot process")

    @test_router.get("/unauthorized")
    async def raise_unauthorized():
        raise UnauthorizedError("Not authorized")

    @test_router.get("/forbidden")
    async def raise_forbidden():
        raise ForbiddenError("Forbidden")

    @test_router.get("/rate-limited")
    async def raise_rate_limited():
        raise RateLimitedError("Too many requests")

    @test_router.get("/unhandled")
    async def raise_unhandled():
        raise RuntimeError("Something exploded")

    @test_router.get("/raw-http-404")
    async def raise_raw_http():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Raw not found")

    app.include_router(test_router)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    # Remove the test routes to avoid polluting other tests
    app.router.routes = [
        r for r in app.router.routes
        if not (hasattr(r, "path") and r.path.startswith("/test-errors"))
    ]


@pytest.mark.asyncio
async def test_not_found_error_response(plain_client):
    resp = await plain_client.get("/test-errors/not-found")
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["code"] == "NOT_FOUND"
    assert body["detail"]["message"] == "Resource not found"


@pytest.mark.asyncio
async def test_conflict_error_response(plain_client):
    resp = await plain_client.get("/test-errors/conflict")
    assert resp.status_code == 409
    body = resp.json()
    assert body["detail"]["code"] == "CONFLICT"
    assert body["detail"]["message"] == "Already exists"


@pytest.mark.asyncio
async def test_validation_error_response(plain_client):
    resp = await plain_client.get("/test-errors/validation")
    assert resp.status_code == 400
    body = resp.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_unprocessable_error_response(plain_client):
    resp = await plain_client.get("/test-errors/unprocessable")
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"]["code"] == "UNPROCESSABLE"


@pytest.mark.asyncio
async def test_unauthorized_error_response(plain_client):
    resp = await plain_client.get("/test-errors/unauthorized")
    assert resp.status_code == 401
    body = resp.json()
    assert body["detail"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_forbidden_error_response(plain_client):
    resp = await plain_client.get("/test-errors/forbidden")
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_unhandled_exception_returns_500():
    """
    Verify the unhandled_exception_handler returns 500 INTERNAL_ERROR without
    stack trace details. Tested via the handler function directly to avoid
    BaseHTTPMiddleware re-raise behavior in ASGITransport test mode.
    """
    from unittest.mock import MagicMock
    from app.main import unhandled_exception_handler

    mock_request = MagicMock()
    mock_request.method = "GET"
    mock_request.url.path = "/some/path"

    exc = RuntimeError("Something exploded")
    response = await unhandled_exception_handler(mock_request, exc)

    assert response.status_code == 500
    import json
    body = json.loads(response.body)
    assert body["detail"]["code"] == "INTERNAL_ERROR"
    # Must not contain stack trace or exception message
    assert "traceback" not in str(body).lower()
    assert "RuntimeError" not in str(body)
    assert "Something exploded" not in str(body)


@pytest.mark.asyncio
async def test_raw_http_exception_reformatted(plain_client):
    """Raw HTTPException from a router must be reformatted to standard structure."""
    resp = await plain_client.get("/test-errors/raw-http-404")
    assert resp.status_code == 404
    body = resp.json()
    assert "detail" in body
    assert isinstance(body["detail"], dict)
    assert body["detail"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_pydantic_validation_error_returns_400(plain_client):
    """FastAPI RequestValidationError (Pydantic) → 400 VALIDATION_ERROR."""
    # Hit an endpoint that requires a body with invalid data
    resp = await plain_client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "password": "x"},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["detail"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_rate_limited_error_response(plain_client):
    """RateLimitedError raises 429 RATE_LIMITED in standard format."""
    resp = await plain_client.get("/test-errors/rate-limited")
    assert resp.status_code == 429
    body = resp.json()
    assert body["detail"]["code"] == "RATE_LIMITED"
    assert body["detail"]["message"] == "Too many requests"


@pytest.mark.asyncio
async def test_cors_header_present(plain_client):
    """CORS middleware adds Access-Control-Allow-Origin for matching origins."""
    resp = await plain_client.get(
        "/health",
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 200
    assert "access-control-allow-origin" in resp.headers


@pytest.mark.asyncio
async def test_error_response_format_has_detail_code_message(plain_client):
    """All error responses must follow {detail: {code, message}} format."""
    resp = await plain_client.get("/test-errors/not-found")
    body = resp.json()
    assert "detail" in body
    assert isinstance(body["detail"], dict)
    assert "code" in body["detail"]
    assert "message" in body["detail"]
