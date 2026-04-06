"""Unit and integration tests for app/services/webhook_service.py.

Unit tests cover:
    - dispatch_webhook_event: fires asyncio.create_task when loop is running
    - dispatch_webhook_event: no-op when no loop is running
    - _deliver_webhook: successful HTTP POST with HMAC signature
    - _deliver_webhook: 4xx response is logged but not raised
    - _deliver_webhook: connection error is logged but not raised
    - _deliver_webhook: no signature header when secret is empty
    - _deliver_webhook: includes X-Webhook-Delivery-Id header
    - _deliver_webhook: same delivery_id reused across all retry attempts
    - _deliver_webhook: X-Webhook-Delivery-Id value is a valid UUID

Integration tests cover:
    - _query_matching_webhooks: matches webhook by survey_id
    - _query_matching_webhooks: matches global webhook (survey_id=None)
    - _query_matching_webhooks: filters by event type
    - _query_matching_webhooks: excludes inactive webhooks
    - _query_matching_webhooks: excludes webhooks for other surveys (no global)
    - _dispatch_task: end-to-end delivery with mocked httpx
    - _deliver_and_log: creates WebhookDeliveryLog row with status=delivered on success
    - _deliver_and_log: creates WebhookDeliveryLog row with status=failed after max retries

Trigger integration tests:
    - response.started dispatched on create_response
    - response.completed dispatched on complete_response
    - survey.activated dispatched on activate_survey
    - survey.closed dispatched on close_survey
    - quota.reached dispatched via _emit_quota_reached
"""

import asyncio
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models.survey import Survey
from app.models.user import User
from app.models.webhook import Webhook
from app.services.webhook_service import (
    _deliver_and_log,
    _deliver_webhook,
    _dispatch_task,
    _query_matching_webhooks,
    dispatch_webhook_event,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_webhook_row(
    user_id: uuid.UUID,
    survey_id: uuid.UUID | None = None,
    events: list | None = None,
    is_active: bool = True,
    url: str = "https://example.com/hook",
    secret: str = "test-secret",
) -> dict:
    """Helper to build webhook insert kwargs."""
    return {
        "id": uuid.uuid4(),
        "user_id": user_id,
        "survey_id": survey_id,
        "url": url,
        "events": events if events is not None else ["response.completed"],
        "secret": secret,
        "is_active": is_active,
    }


# ---------------------------------------------------------------------------
# Unit tests: dispatch_webhook_event
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dispatch_webhook_event_creates_task_when_loop_running():
    """dispatch_webhook_event should schedule a task when a loop is running."""
    created_tasks = []

    original_create_task = asyncio.create_task

    def mock_create_task(coro, **kwargs):
        task = original_create_task(coro, **kwargs)
        created_tasks.append(task)
        return task

    with patch("app.services.webhook_service._dispatch_task", new_callable=AsyncMock) as mock_dt:
        mock_dt.return_value = None
        with patch("asyncio.create_task", side_effect=mock_create_task):
            dispatch_webhook_event(
                event="response.started",
                survey_id=uuid.uuid4(),
                data={"response_id": "abc"},
            )
            # Allow the event loop to process the created task
            await asyncio.sleep(0)

    assert len(created_tasks) == 1


def test_dispatch_webhook_event_no_loop_does_not_raise():
    """dispatch_webhook_event should silently skip when no event loop is running."""
    # This runs in a plain sync context — no running loop
    # We run it in a thread to avoid the test loop being considered "running"
    import threading
    errors = []

    def run():
        try:
            dispatch_webhook_event(
                event="response.started",
                survey_id=uuid.uuid4(),
                data={},
            )
        except Exception as exc:
            errors.append(exc)

    t = threading.Thread(target=run)
    t.start()
    t.join()

    assert errors == []


# ---------------------------------------------------------------------------
# Unit tests: _deliver_webhook
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deliver_webhook_sends_post_with_hmac_signature():
    """_deliver_webhook should POST with X-Webhook-Signature when secret is set."""
    secret = "my-secret"
    payload = {"event": "response.started", "data": {}}
    wh_id = uuid.uuid4()

    captured_requests = []

    async def mock_post(url, content, headers, **kwargs):
        captured_requests.append({"url": url, "content": content, "headers": headers})
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        await _deliver_webhook(
            url="https://example.com/hook",
            payload=payload,
            secret=secret,
            webhook_id=wh_id,
            delivery_id=uuid.uuid4(),
        )

    assert len(captured_requests) == 1
    req = captured_requests[0]
    assert req["url"] == "https://example.com/hook"

    body = req["content"]
    expected_sig = hmac.new(
        secret.encode("utf-8"),
        body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    assert req["headers"]["X-Webhook-Signature"] == f"sha256={expected_sig}"


@pytest.mark.asyncio
async def test_deliver_webhook_no_signature_when_empty_secret():
    """_deliver_webhook should not include X-Webhook-Signature when secret is empty."""
    captured_requests = []

    async def mock_post(url, content, headers, **kwargs):
        captured_requests.append(headers)
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        await _deliver_webhook(
            url="https://example.com/hook",
            payload={"event": "test"},
            secret="",
            webhook_id=uuid.uuid4(),
            delivery_id=uuid.uuid4(),
        )

    assert len(captured_requests) == 1
    assert "X-Webhook-Signature" not in captured_requests[0]


@pytest.mark.asyncio
async def test_deliver_webhook_4xx_does_not_raise():
    """_deliver_webhook should log but not raise on 4xx responses."""
    mock_response = MagicMock()
    mock_response.status_code = 400

    async def mock_post(url, content, headers, **kwargs):
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        # Should not raise
        await _deliver_webhook(
            url="https://example.com/hook",
            payload={"event": "test"},
            secret="",
            webhook_id=uuid.uuid4(),
            delivery_id=uuid.uuid4(),
        )


@pytest.mark.asyncio
async def test_deliver_webhook_connection_error_does_not_raise():
    """_deliver_webhook should catch connection errors and not raise."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=Exception("Connection refused"))

    with patch("httpx.AsyncClient", return_value=mock_client):
        # Should not raise
        await _deliver_webhook(
            url="https://unreachable.example.com/hook",
            payload={"event": "test"},
            secret="",
            webhook_id=uuid.uuid4(),
            delivery_id=uuid.uuid4(),
        )


@pytest.mark.asyncio
async def test_deliver_webhook_includes_user_agent_header():
    """_deliver_webhook should include User-Agent: SurveyTool/1.0 in all requests."""
    captured_headers = []

    async def mock_post(url, content, headers, **kwargs):
        captured_headers.append(dict(headers))
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        await _deliver_webhook(
            url="https://example.com/hook",
            payload={"event": "test"},
            secret="",
            webhook_id=uuid.uuid4(),
            delivery_id=uuid.uuid4(),
        )

    assert len(captured_headers) == 1
    assert captured_headers[0].get("User-Agent") == "SurveyTool/1.0"


@pytest.mark.asyncio
async def test_deliver_webhook_uses_correct_timeout():
    """_deliver_webhook should configure httpx.AsyncClient with connect=5s and read=10s."""
    import httpx as _httpx

    captured_timeout = []

    def mock_async_client_cls(**kwargs):
        captured_timeout.append(kwargs.get("timeout"))
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        async def mock_post(url, content, headers, **kwargs):
            mock_response = MagicMock()
            mock_response.status_code = 200
            return mock_response

        mock_client.post = mock_post
        return mock_client

    with patch("httpx.AsyncClient", side_effect=mock_async_client_cls):
        await _deliver_webhook(
            url="https://example.com/hook",
            payload={"event": "test"},
            secret="",
            webhook_id=uuid.uuid4(),
            delivery_id=uuid.uuid4(),
        )

    assert len(captured_timeout) == 1
    timeout = captured_timeout[0]
    assert isinstance(timeout, _httpx.Timeout)
    assert timeout.connect == 5.0
    assert timeout.read == 10.0


@pytest.mark.asyncio
async def test_deliver_webhook_no_sleep_on_first_attempt_success():
    """asyncio.sleep should NOT be called when delivery succeeds on the first attempt."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    async def mock_post(url, content, headers, **kwargs):
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await _deliver_webhook(
                url="https://example.com/hook",
                payload={"event": "test"},
                secret="",
                webhook_id=uuid.uuid4(),
                delivery_id=uuid.uuid4(),
            )

    mock_sleep.assert_not_called()


@pytest.mark.asyncio
async def test_deliver_webhook_retries_on_timeout_exception():
    """_deliver_webhook should retry on httpx.TimeoutException with backoff delays."""
    import httpx as _httpx

    call_count = 0

    async def mock_post(url, content, headers, **kwargs):
        nonlocal call_count
        call_count += 1
        raise _httpx.TimeoutException("timed out")

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await _deliver_webhook(
                url="https://example.com/hook",
                payload={"event": "test"},
                secret="",
                webhook_id=uuid.uuid4(),
                delivery_id=uuid.uuid4(),
            )

    # Should have made 4 total attempts (1 initial + 3 retries)
    assert call_count == 4
    # asyncio.sleep called 3 times with backoff delays
    assert mock_sleep.call_count == 3
    delays = [call.args[0] for call in mock_sleep.call_args_list]
    assert delays == [10, 60, 300]


@pytest.mark.asyncio
async def test_deliver_webhook_retries_on_connect_error():
    """_deliver_webhook should retry on httpx.ConnectError."""
    import httpx as _httpx

    call_count = 0

    async def mock_post(url, content, headers, **kwargs):
        nonlocal call_count
        call_count += 1
        raise _httpx.ConnectError("connection refused")

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await _deliver_webhook(
                url="https://example.com/hook",
                payload={"event": "test"},
                secret="",
                webhook_id=uuid.uuid4(),
                delivery_id=uuid.uuid4(),
            )

    assert call_count == 4
    assert mock_sleep.call_count == 3
    delays = [call.args[0] for call in mock_sleep.call_args_list]
    assert delays == [10, 60, 300]


@pytest.mark.asyncio
async def test_deliver_webhook_retries_on_5xx_response():
    """_deliver_webhook should retry on HTTP 5xx responses."""
    call_count = 0

    async def mock_post(url, content, headers, **kwargs):
        nonlocal call_count
        call_count += 1
        mock_response = MagicMock()
        mock_response.status_code = 503
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await _deliver_webhook(
                url="https://example.com/hook",
                payload={"event": "test"},
                secret="",
                webhook_id=uuid.uuid4(),
                delivery_id=uuid.uuid4(),
            )

    assert call_count == 4
    assert mock_sleep.call_count == 3
    delays = [call.args[0] for call in mock_sleep.call_args_list]
    assert delays == [10, 60, 300]


@pytest.mark.asyncio
async def test_deliver_webhook_no_retry_on_4xx():
    """_deliver_webhook should NOT retry on HTTP 4xx responses."""
    call_count = 0

    async def mock_post(url, content, headers, **kwargs):
        nonlocal call_count
        call_count += 1
        mock_response = MagicMock()
        mock_response.status_code = 404
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await _deliver_webhook(
                url="https://example.com/hook",
                payload={"event": "test"},
                secret="",
                webhook_id=uuid.uuid4(),
                delivery_id=uuid.uuid4(),
            )

    assert call_count == 1
    mock_sleep.assert_not_called()


@pytest.mark.asyncio
async def test_deliver_webhook_success_after_two_failures():
    """_deliver_webhook should succeed after 2 transient failures with correct backoff."""
    import httpx as _httpx

    call_count = 0

    async def mock_post(url, content, headers, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            raise _httpx.TimeoutException("timed out")
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await _deliver_webhook(
                url="https://example.com/hook",
                payload={"event": "test"},
                secret="",
                webhook_id=uuid.uuid4(),
                delivery_id=uuid.uuid4(),
            )

    assert call_count == 3
    # Sleep called twice: after attempt 1 (10s) and attempt 2 (60s)
    assert mock_sleep.call_count == 2
    delays = [call.args[0] for call in mock_sleep.call_args_list]
    assert delays == [10, 60]


# ---------------------------------------------------------------------------
# Integration fixtures
# ---------------------------------------------------------------------------


TEST_DATABASE_URL = None  # resolved at module load via conftest


@pytest_asyncio.fixture(scope="function")
async def wh_engine():
    """Create a fresh test DB engine for webhook service tests."""
    import os
    db_url = os.environ.get("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker")
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    _engine = create_async_engine(db_url, echo=False)
    async with _engine.begin() as conn:
        await conn.exec_driver_sql(
            "DO $$ BEGIN"
            " IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'survey_status') THEN"
            " CREATE TYPE survey_status AS ENUM ('draft', 'active', 'closed', 'archived');"
            " END IF; END $$"
        )
        await conn.exec_driver_sql(
            "DO $$ BEGIN"
            " IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quota_action') THEN"
            " CREATE TYPE quota_action AS ENUM ('terminate', 'hide_question');"
            " END IF; END $$"
        )
        await conn.exec_driver_sql(
            "DO $$ BEGIN"
            " IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assessment_scope') THEN"
            " CREATE TYPE assessment_scope AS ENUM ('total', 'group');"
            " END IF; END $$"
        )
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.exec_driver_sql("DROP TYPE IF EXISTS assessment_scope")
        await conn.exec_driver_sql("DROP TYPE IF EXISTS quota_action")
        await conn.exec_driver_sql("DROP TYPE IF EXISTS survey_status")
    await _engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def wh_session(wh_engine):
    """Provide a session for direct DB operations in webhook service tests."""
    factory = async_sessionmaker(wh_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as sess:
        yield sess


@pytest_asyncio.fixture(scope="function")
async def wh_user_id(wh_session) -> uuid.UUID:
    """Insert a minimal User row and return its UUID for FK satisfaction."""
    user = User(
        id=uuid.uuid4(),
        email=f"wh-test-{uuid.uuid4()}@example.com",
        password_hash="hashed",
        name="WH Test User",
    )
    wh_session.add(user)
    await wh_session.flush()
    return user.id


async def _create_survey_in_session(session: AsyncSession, user_id: uuid.UUID) -> uuid.UUID:
    """Insert a minimal Survey row and return its UUID."""
    survey = Survey(
        id=uuid.uuid4(),
        user_id=user_id,
        title="WH Test Survey",
        status="active",
    )
    session.add(survey)
    await session.flush()
    return survey.id


# ---------------------------------------------------------------------------
# Integration tests: _query_matching_webhooks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_query_matching_webhooks_by_survey_id(wh_session, wh_user_id):
    """Should return webhooks matching the exact survey_id."""
    survey_id = await _create_survey_in_session(wh_session, wh_user_id)
    wh = Webhook(**make_webhook_row(user_id=wh_user_id, survey_id=survey_id, events=["response.completed"]))
    wh_session.add(wh)
    await wh_session.flush()

    results = await _query_matching_webhooks(wh_session, "response.completed", survey_id)
    ids = [r[0] for r in results]
    assert wh.id in ids


@pytest.mark.asyncio
async def test_query_matching_webhooks_global_webhook_returned_for_any_survey(wh_session, wh_user_id):
    """Global webhooks (survey_id=None) should match any survey_id dispatch."""
    global_wh = Webhook(**make_webhook_row(user_id=wh_user_id, survey_id=None, events=["response.completed"]))
    wh_session.add(global_wh)
    await wh_session.flush()

    some_survey_id = uuid.uuid4()
    results = await _query_matching_webhooks(wh_session, "response.completed", some_survey_id)
    ids = [r[0] for r in results]
    assert global_wh.id in ids


@pytest.mark.asyncio
async def test_query_matching_webhooks_filters_by_event_type(wh_session, wh_user_id):
    """Should not return webhooks that don't include the dispatched event."""
    survey_id = await _create_survey_in_session(wh_session, wh_user_id)
    wh = Webhook(**make_webhook_row(user_id=wh_user_id, survey_id=survey_id, events=["survey.activated"]))
    wh_session.add(wh)
    await wh_session.flush()

    results = await _query_matching_webhooks(wh_session, "response.completed", survey_id)
    ids = [r[0] for r in results]
    assert wh.id not in ids


@pytest.mark.asyncio
async def test_query_matching_webhooks_excludes_inactive(wh_session, wh_user_id):
    """Inactive webhooks (is_active=False) should not be returned."""
    survey_id = await _create_survey_in_session(wh_session, wh_user_id)
    wh = Webhook(**make_webhook_row(user_id=wh_user_id, survey_id=survey_id, events=["response.completed"], is_active=False))
    wh_session.add(wh)
    await wh_session.flush()

    results = await _query_matching_webhooks(wh_session, "response.completed", survey_id)
    ids = [r[0] for r in results]
    assert wh.id not in ids


@pytest.mark.asyncio
async def test_query_matching_webhooks_excludes_other_survey_non_global(wh_session, wh_user_id):
    """Webhooks for a different survey_id should not be returned for a different survey."""
    other_survey_id = await _create_survey_in_session(wh_session, wh_user_id)
    wh = Webhook(**make_webhook_row(user_id=wh_user_id, survey_id=other_survey_id, events=["response.completed"]))
    wh_session.add(wh)
    await wh_session.flush()

    target_survey_id = uuid.uuid4()  # different from other_survey_id (no FK needed — we're checking it's excluded)
    results = await _query_matching_webhooks(wh_session, "response.completed", target_survey_id)
    ids = [r[0] for r in results]
    assert wh.id not in ids


@pytest.mark.asyncio
async def test_query_matching_webhooks_both_global_and_scoped(wh_session, wh_user_id):
    """Both global and survey-scoped webhooks should be returned for a survey dispatch."""
    survey_id = await _create_survey_in_session(wh_session, wh_user_id)
    global_wh = Webhook(**make_webhook_row(user_id=wh_user_id, survey_id=None, events=["response.completed"], url="https://global.com/hook"))
    scoped_wh = Webhook(**make_webhook_row(user_id=wh_user_id, survey_id=survey_id, events=["response.completed"], url="https://scoped.com/hook"))
    wh_session.add_all([global_wh, scoped_wh])
    await wh_session.flush()

    results = await _query_matching_webhooks(wh_session, "response.completed", survey_id)
    ids = [r[0] for r in results]
    assert global_wh.id in ids
    assert scoped_wh.id in ids


# ---------------------------------------------------------------------------
# Integration tests: _dispatch_task (end-to-end with mocked httpx)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dispatch_task_delivers_to_matching_webhook(wh_engine):
    """_dispatch_task should POST to matching webhooks with correct payload."""
    factory = async_sessionmaker(wh_engine, class_=AsyncSession, expire_on_commit=False)
    survey_id = uuid.uuid4()

    async with factory() as sess:
        user = User(
            id=uuid.uuid4(),
            email=f"dt-test-{uuid.uuid4()}@example.com",
            password_hash="hashed",
            name="DT Test",
        )
        sess.add(user)
        survey = Survey(id=survey_id, user_id=user.id, title="DT Test Survey", status="active")
        sess.add(survey)
        wh = Webhook(**make_webhook_row(
            user_id=user.id,
            survey_id=survey_id,
            events=["response.completed"],
            url="https://example.com/hook",
            secret="my-secret",
        ))
        sess.add(wh)
        await sess.commit()

    posted_payloads = []

    async def mock_post(url, content, headers, **kwargs):
        posted_payloads.append({"url": url, "payload": json.loads(content)})
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        return mock_resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("app.database.async_session", factory):
        with patch("httpx.AsyncClient", return_value=mock_client):
            await _dispatch_task(
                event="response.completed",
                survey_id=survey_id,
                data={"response_id": "test-123"},
            )

    assert len(posted_payloads) == 1
    body = posted_payloads[0]["payload"]
    assert body["event"] == "response.completed"
    assert body["survey_id"] == str(survey_id)
    assert body["data"]["response_id"] == "test-123"
    assert "timestamp" in body


@pytest.mark.asyncio
async def test_dispatch_task_skips_non_matching_webhooks(wh_engine):
    """_dispatch_task should not POST to webhooks not matching the event."""
    factory = async_sessionmaker(wh_engine, class_=AsyncSession, expire_on_commit=False)
    survey_id = uuid.uuid4()

    async with factory() as sess:
        user = User(
            id=uuid.uuid4(),
            email=f"dt-skip-{uuid.uuid4()}@example.com",
            password_hash="hashed",
            name="DT Skip Test",
        )
        sess.add(user)
        survey = Survey(id=survey_id, user_id=user.id, title="DT Skip Survey", status="active")
        sess.add(survey)
        wh = Webhook(**make_webhook_row(
            user_id=user.id,
            survey_id=survey_id,
            events=["survey.activated"],  # does not match response.completed
        ))
        sess.add(wh)
        await sess.commit()

    posted = []

    async def mock_post(url, content, headers, **kwargs):
        posted.append(url)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        return mock_resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("app.database.async_session", factory):
        with patch("httpx.AsyncClient", return_value=mock_client):
            await _dispatch_task(
                event="response.completed",
                survey_id=survey_id,
                data={},
            )

    assert posted == []


# ---------------------------------------------------------------------------
# Unit tests: X-Webhook-Delivery-Id header idempotency
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deliver_webhook_includes_delivery_id_header():
    """_deliver_webhook should include X-Webhook-Delivery-Id header on every request."""
    delivery_id = uuid.uuid4()
    captured_headers = []

    async def mock_post(url, content, headers, **kwargs):
        captured_headers.append(dict(headers))
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        await _deliver_webhook(
            url="https://example.com/hook",
            payload={"event": "test"},
            secret="",
            webhook_id=uuid.uuid4(),
            delivery_id=delivery_id,
        )

    assert len(captured_headers) == 1
    assert captured_headers[0].get("X-Webhook-Delivery-Id") == str(delivery_id)


@pytest.mark.asyncio
async def test_deliver_webhook_delivery_id_is_valid_uuid():
    """X-Webhook-Delivery-Id header value should be a valid UUID string."""
    import re

    delivery_id = uuid.uuid4()
    captured_headers = []

    async def mock_post(url, content, headers, **kwargs):
        captured_headers.append(dict(headers))
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        await _deliver_webhook(
            url="https://example.com/hook",
            payload={"event": "test"},
            secret="",
            webhook_id=uuid.uuid4(),
            delivery_id=delivery_id,
        )

    assert len(captured_headers) == 1
    header_value = captured_headers[0].get("X-Webhook-Delivery-Id", "")
    uuid_pattern = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        re.IGNORECASE,
    )
    assert uuid_pattern.match(header_value), f"Not a valid UUID: {header_value!r}"
    # Confirm the value matches the exact delivery_id passed in
    assert uuid.UUID(header_value) == delivery_id


@pytest.mark.asyncio
async def test_deliver_webhook_same_delivery_id_reused_on_retries():
    """_deliver_webhook should send the same X-Webhook-Delivery-Id on all retry attempts."""
    import httpx as _httpx

    delivery_id = uuid.uuid4()
    captured_delivery_ids = []
    call_count = 0

    async def mock_post(url, content, headers, **kwargs):
        nonlocal call_count
        call_count += 1
        captured_delivery_ids.append(headers.get("X-Webhook-Delivery-Id"))
        # Fail on first two attempts, succeed on third
        if call_count <= 2:
            raise _httpx.TimeoutException("timed out")
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        with patch("asyncio.sleep", new_callable=AsyncMock):
            await _deliver_webhook(
                url="https://example.com/hook",
                payload={"event": "test"},
                secret="",
                webhook_id=uuid.uuid4(),
                delivery_id=delivery_id,
            )

    assert call_count == 3
    # Every attempt must use the same delivery_id
    assert len(set(captured_delivery_ids)) == 1, (
        f"Expected same delivery_id on all retries, got: {captured_delivery_ids}"
    )
    assert captured_delivery_ids[0] == str(delivery_id)


# ---------------------------------------------------------------------------
# Integration tests: _deliver_and_log (WebhookDeliveryLog persistence)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deliver_and_log_creates_log_row_status_delivered(wh_engine):
    """_deliver_and_log should create a WebhookDeliveryLog with status=delivered on success."""
    from app.models.webhook_delivery_log import WebhookDeliveryLog

    factory = async_sessionmaker(wh_engine, class_=AsyncSession, expire_on_commit=False)
    delivery_id = uuid.uuid4()

    # Create user, survey and webhook in DB
    async with factory() as sess:
        user = User(
            id=uuid.uuid4(),
            email=f"dal-ok-{uuid.uuid4()}@example.com",
            password_hash="hashed",
            name="DAL OK",
        )
        sess.add(user)
        survey = Survey(
            id=uuid.uuid4(),
            user_id=user.id,
            title="DAL Survey",
            status="active",
        )
        sess.add(survey)
        wh = Webhook(**make_webhook_row(
            user_id=user.id,
            survey_id=survey.id,
            events=["response.completed"],
            url="https://example.com/hook",
            secret="",
        ))
        sess.add(wh)
        await sess.commit()
        wh_id = wh.id

    async def mock_post(url, content, headers, **kwargs):
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        await _deliver_and_log(
            session_factory=factory,
            wh_id=wh_id,
            wh_url="https://example.com/hook",
            wh_secret="",
            payload={"event": "response.completed", "data": {}},
            event="response.completed",
            delivery_id=delivery_id,
        )

    async with factory() as sess:
        result = await sess.execute(
            select(WebhookDeliveryLog).where(WebhookDeliveryLog.delivery_id == delivery_id)
        )
        log = result.scalar_one_or_none()

    assert log is not None
    assert log.delivery_id == delivery_id
    assert log.webhook_id == wh_id
    assert log.event == "response.completed"
    assert log.status == "delivered"
    assert log.attempt_count == 1
    assert log.last_error is None


@pytest.mark.asyncio
async def test_deliver_and_log_creates_log_row_status_failed_after_max_retries(wh_engine):
    """_deliver_and_log should set status=failed after all retry attempts are exhausted."""
    import httpx as _httpx
    from app.models.webhook_delivery_log import WebhookDeliveryLog

    factory = async_sessionmaker(wh_engine, class_=AsyncSession, expire_on_commit=False)
    delivery_id = uuid.uuid4()

    async with factory() as sess:
        user = User(
            id=uuid.uuid4(),
            email=f"dal-fail-{uuid.uuid4()}@example.com",
            password_hash="hashed",
            name="DAL Fail",
        )
        sess.add(user)
        survey = Survey(
            id=uuid.uuid4(),
            user_id=user.id,
            title="DAL Fail Survey",
            status="active",
        )
        sess.add(survey)
        wh = Webhook(**make_webhook_row(
            user_id=user.id,
            survey_id=survey.id,
            events=["response.completed"],
            url="https://unreachable.example.com/hook",
            secret="",
        ))
        sess.add(wh)
        await sess.commit()
        wh_id = wh.id

    async def mock_post(url, content, headers, **kwargs):
        raise _httpx.ConnectError("connection refused")

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("httpx.AsyncClient", return_value=mock_client):
        with patch("asyncio.sleep", new_callable=AsyncMock):
            await _deliver_and_log(
                session_factory=factory,
                wh_id=wh_id,
                wh_url="https://unreachable.example.com/hook",
                wh_secret="",
                payload={"event": "response.completed", "data": {}},
                event="response.completed",
                delivery_id=delivery_id,
            )

    async with factory() as sess:
        result = await sess.execute(
            select(WebhookDeliveryLog).where(WebhookDeliveryLog.delivery_id == delivery_id)
        )
        log = result.scalar_one_or_none()

    assert log is not None
    assert log.status == "failed"
    assert log.attempt_count == 4  # 1 initial + 3 retries
    assert log.last_error is not None


@pytest.mark.asyncio
async def test_dispatch_task_includes_delivery_id_header(wh_engine):
    """_dispatch_task should include X-Webhook-Delivery-Id header when delivering."""
    factory = async_sessionmaker(wh_engine, class_=AsyncSession, expire_on_commit=False)
    survey_id = uuid.uuid4()

    async with factory() as sess:
        user = User(
            id=uuid.uuid4(),
            email=f"disp-hdr-{uuid.uuid4()}@example.com",
            password_hash="hashed",
            name="Dispatch Header Test",
        )
        sess.add(user)
        survey = Survey(id=survey_id, user_id=user.id, title="Dispatch Header Survey", status="active")
        sess.add(survey)
        wh = Webhook(**make_webhook_row(
            user_id=user.id,
            survey_id=survey_id,
            events=["response.completed"],
            url="https://example.com/hook",
            secret="",
        ))
        sess.add(wh)
        await sess.commit()

    captured_headers = []

    async def mock_post(url, content, headers, **kwargs):
        captured_headers.append(dict(headers))
        mock_response = MagicMock()
        mock_response.status_code = 200
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("app.database.async_session", factory):
        with patch("httpx.AsyncClient", return_value=mock_client):
            await _dispatch_task(
                event="response.completed",
                survey_id=survey_id,
                data={"response_id": "abc"},
            )

    assert len(captured_headers) == 1
    delivery_id_header = captured_headers[0].get("X-Webhook-Delivery-Id")
    assert delivery_id_header is not None
    # Verify it's a valid UUID
    parsed = uuid.UUID(delivery_id_header)
    assert parsed.version == 4


# ---------------------------------------------------------------------------
# Trigger integration tests (via API client)
# ---------------------------------------------------------------------------


REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
SURVEYS_URL = "/api/v1/surveys"
WEBHOOKS_URL = "/api/v1/webhooks"


async def _register_and_login(client: AsyncClient, email: str) -> dict:
    await client.post(REGISTER_URL, json={"email": email, "password": "testpass123", "name": "Test"})
    resp = await client.post(LOGIN_URL, json={"email": email, "password": "testpass123"})
    return resp.json()


async def _create_active_survey_with_question(client: AsyncClient, headers: dict) -> str:
    """Create a survey with a question and activate it. Returns survey_id."""
    survey_resp = await client.post(SURVEYS_URL, json={"title": "WH Test Survey"}, headers=headers)
    assert survey_resp.status_code == 201, survey_resp.text
    survey_id = survey_resp.json()["id"]

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1"},
        headers=headers,
    )
    assert group_resp.status_code == 201, group_resp.text
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={
            "title": "Q1",
            "question_type": "short_text",
            "code": "Q1",
        },
        headers=headers,
    )
    assert q_resp.status_code == 201, q_resp.text

    act_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
    assert act_resp.status_code == 200, act_resp.text
    return survey_id


@pytest.mark.asyncio
async def test_response_started_event_dispatched(client: AsyncClient):
    """Creating a response should trigger a response.started webhook dispatch."""
    tokens = await _register_and_login(client, "whrs_start@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    survey_id = await _create_active_survey_with_question(client, headers)

    dispatched_events = []

    def fake_dispatch(event, survey_id, data):
        dispatched_events.append({"event": event, "survey_id": survey_id})

    with patch("app.services.event_dispatcher._dispatcher", side_effect=fake_dispatch):
        resp = await client.post(
            f"{SURVEYS_URL}/{survey_id}/responses",
            json={},
        )
        assert resp.status_code == 201

    assert any(e["event"] == "response.started" for e in dispatched_events)


@pytest.mark.asyncio
async def test_response_completed_event_dispatched(client: AsyncClient):
    """Completing a response should trigger a response.completed webhook dispatch."""
    tokens = await _register_and_login(client, "whrs_comp@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    survey_id = await _create_active_survey_with_question(client, headers)

    dispatched_events = []

    def fake_dispatch(event, survey_id, data):
        dispatched_events.append({"event": event, "survey_id": survey_id})

    with patch("app.services.event_dispatcher._dispatcher", side_effect=fake_dispatch):
        # Create response
        create_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/responses", json={})
        assert create_resp.status_code == 201
        response_id = create_resp.json()["id"]

        # Complete response
        comp_resp = await client.patch(
            f"{SURVEYS_URL}/{survey_id}/responses/{response_id}",
            json={"status": "complete"},
        )
        assert comp_resp.status_code == 200

    assert any(e["event"] == "response.completed" for e in dispatched_events)


@pytest.mark.asyncio
async def test_survey_activated_event_dispatched(client: AsyncClient):
    """Activating a survey should trigger a survey.activated webhook dispatch."""
    tokens = await _register_and_login(client, "whsurv_act@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    survey_resp = await client.post(SURVEYS_URL, json={"title": "Activation Test"}, headers=headers)
    survey_id = survey_resp.json()["id"]

    group_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups",
        json={"title": "Group 1"},
        headers=headers,
    )
    assert group_resp.status_code == 201, group_resp.text
    group_id = group_resp.json()["id"]

    q_resp = await client.post(
        f"{SURVEYS_URL}/{survey_id}/groups/{group_id}/questions",
        json={"title": "Q1", "question_type": "short_text", "code": "Q1"},
        headers=headers,
    )
    assert q_resp.status_code == 201, q_resp.text

    dispatched_events = []

    def fake_dispatch(event, survey_id, data):
        dispatched_events.append({"event": event, "survey_id": survey_id})

    with patch("app.services.event_dispatcher._dispatcher", side_effect=fake_dispatch):
        act_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/activate", headers=headers)
        assert act_resp.status_code == 200

    assert any(e["event"] == "survey.activated" for e in dispatched_events)


@pytest.mark.asyncio
async def test_survey_closed_event_dispatched(client: AsyncClient):
    """Closing a survey should trigger a survey.closed webhook dispatch."""
    tokens = await _register_and_login(client, "whsurv_close@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    survey_id = await _create_active_survey_with_question(client, headers)

    dispatched_events = []

    def fake_dispatch(event, survey_id, data):
        dispatched_events.append({"event": event, "survey_id": survey_id})

    with patch("app.services.event_dispatcher._dispatcher", side_effect=fake_dispatch):
        close_resp = await client.post(f"{SURVEYS_URL}/{survey_id}/close", headers=headers)
        assert close_resp.status_code == 200

    assert any(e["event"] == "survey.closed" for e in dispatched_events)


@pytest.mark.asyncio
async def test_quota_reached_event_dispatched():
    """_emit_quota_reached should call dispatch_webhook_event with quota.reached."""
    from app.services.quota_service import _emit_quota_reached

    quota = MagicMock()
    quota.id = uuid.uuid4()
    quota.name = "Test Quota"
    quota.survey_id = uuid.uuid4()
    quota.limit = 10

    session_mock = AsyncMock()
    response_id = uuid.uuid4()

    dispatched = []

    def fake_dispatch(event, survey_id, data):
        dispatched.append({"event": event, "survey_id": survey_id, "data": data})

    with patch("app.services.event_dispatcher._dispatcher", side_effect=fake_dispatch):
        await _emit_quota_reached(
            session=session_mock,
            quota=quota,
            response_id=response_id,
            new_count=10,
        )

    assert len(dispatched) == 1
    d = dispatched[0]
    assert d["event"] == "quota.reached"
    assert d["survey_id"] == quota.survey_id
    assert d["data"]["quota_id"] == str(quota.id)
    assert d["data"]["response_id"] == str(response_id)
    assert d["data"]["current_count"] == 10
    assert d["data"]["limit"] == 10
