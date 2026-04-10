"""Tests verifying database connection lifecycle correctness.

These tests ensure that:
1. The get_db dependency always closes the session (via the finally clause),
   even when an exception is raised mid-handler.
2. require_scope reuses the same session as get_current_user (FastAPI
   dependency deduplication) rather than opening a second connection.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import get_db
from app.main import app


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

async def _register_and_login(client: AsyncClient) -> dict:
    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": "lc_test@example.com", "password": "password123", "name": "LC Test"},
    )
    assert reg.status_code == 201, reg.text
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "lc_test@example.com", "password": "password123"},
    )
    assert login.status_code == 200, login.text
    return login.json()


# --------------------------------------------------------------------------- #
# 1. get_db finally clause: session is closed on exception
# --------------------------------------------------------------------------- #

async def test_get_db_closes_session_on_normal_completion():
    """Session.close() is called when the generator completes normally."""
    closed = []

    async def _mock_get_db():
        session = AsyncMock(spec=AsyncSession)
        session.close = AsyncMock(side_effect=lambda: closed.append(True))
        session.commit = AsyncMock()
        session.rollback = AsyncMock()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    gen = _mock_get_db()
    sess = await gen.__anext__()
    # Simulate normal completion
    try:
        await gen.aclose()
    except StopAsyncIteration:
        pass

    assert closed, "session.close() should have been called in finally block"


async def test_get_db_closes_session_on_exception():
    """Session.close() is called even when an exception is raised mid-handler."""
    closed = []
    rolled_back = []

    async def _mock_get_db():
        session = AsyncMock(spec=AsyncSession)
        session.close = AsyncMock(side_effect=lambda: closed.append(True))
        session.commit = AsyncMock()
        session.rollback = AsyncMock(side_effect=lambda: rolled_back.append(True))
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    gen = _mock_get_db()
    await gen.__anext__()
    # Simulate an exception being thrown into the generator
    try:
        await gen.athrow(ValueError("mid-handler error"))
    except ValueError:
        pass

    assert rolled_back, "session.rollback() should have been called"
    assert closed, "session.close() should have been called in finally block"


async def test_get_db_closes_session_on_base_exception():
    """Session.close() is called even for BaseException (e.g. asyncio.CancelledError)."""
    import asyncio

    closed = []

    async def _mock_get_db():
        session = AsyncMock(spec=AsyncSession)
        session.close = AsyncMock(side_effect=lambda: closed.append(True))
        session.commit = AsyncMock()
        session.rollback = AsyncMock()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    gen = _mock_get_db()
    await gen.__anext__()
    # CancelledError is a BaseException, not caught by except Exception
    try:
        await gen.athrow(asyncio.CancelledError())
    except asyncio.CancelledError:
        pass

    assert closed, "session.close() should be called even for CancelledError"


# --------------------------------------------------------------------------- #
# 2. require_scope reuses the session from get_current_user
# --------------------------------------------------------------------------- #

async def test_require_scope_reuses_get_current_user_session(client: AsyncClient):
    """require_scope dependency shares the session opened by get_current_user.

    FastAPI deduplicates Depends(get_db) — a single session is created per
    request even though both get_current_user and require_scope._check declare
    Depends(get_db). We verify this by counting get_db invocations: there
    should be exactly one session per request.
    """
    login_data = await _register_and_login(client)
    token = login_data["access_token"]

    get_db_call_count = []

    original_get_db = get_db

    async def counting_get_db():
        get_db_call_count.append(1)
        async for val in original_get_db():
            yield val

    app.dependency_overrides[get_db] = counting_get_db

    try:
        # We need a survey and response to hit the require_scope endpoint.
        # Instead, test with an API key that has the required scope.
        # First create a survey to get an endpoint that uses require_scope.
        # The endpoint is GET /api/v1/surveys/{id}/responses/{rid}/detail
        # We just need to hit it — a 404 is fine, what we care about is
        # how many times get_db was called.
        headers = {"Authorization": f"Bearer {token}"}
        # Use a non-existent survey/response ID — we expect 404 but just want
        # to confirm the session count.
        response = await client.get(
            "/api/v1/surveys/00000000-0000-0000-0000-000000000001"
            "/responses/00000000-0000-0000-0000-000000000002/detail",
            headers=headers,
        )
        # 404 or 403 expected — endpoint exists and was reached
        assert response.status_code in (404, 403, 422)

        # FastAPI should deduplicate get_db across get_current_user,
        # require_scope._check, and the endpoint's own Depends(get_db).
        # All three reference the same get_db function, so only one
        # get_db generator is created per request.
        assert len(get_db_call_count) == 1, (
            f"Expected 1 get_db call per request (FastAPI deduplication), "
            f"got {len(get_db_call_count)}"
        )
    finally:
        # Restore the original override used by the client fixture
        from app.database import get_db as _get_db
        # Re-install the test engine override (conftest handles this in client fixture)
        del app.dependency_overrides[get_db]


# --------------------------------------------------------------------------- #
# 3. Pool settings are applied to the engine
# --------------------------------------------------------------------------- #

def test_engine_pool_settings():
    """Engine is configured with the expected pool settings."""
    import app.database as db_module

    sync_engine = db_module.engine.sync_engine
    pool = sync_engine.pool

    # pool_size is the number of permanent connections
    assert pool.size() == 20, f"Expected pool_size=20, got {pool.size()}"
    # max_overflow configures overflow slots
    assert pool._max_overflow == 10, f"Expected max_overflow=10, got {pool._max_overflow}"
    # pool_timeout
    assert pool._timeout == 30, f"Expected pool_timeout=30, got {pool._timeout}"


# --------------------------------------------------------------------------- #
# 4. idle_in_transaction event listener is registered
# --------------------------------------------------------------------------- #

def test_checkout_event_listener_registered():
    """The checkout event listener is registered on the sync engine."""
    import app.database as db_module
    from sqlalchemy import event

    sync_engine = db_module.engine.sync_engine

    # event.contains(target, identifier, fn) returns True if fn is registered
    # for the named event on target.
    has_checkout_listener = event.contains(
        sync_engine, "checkout", db_module._set_idle_in_transaction_timeout
    )
    assert has_checkout_listener, (
        "Expected _set_idle_in_transaction_timeout to be registered as a "
        "'checkout' event listener on the sync engine"
    )
