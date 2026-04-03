"""Async webhook event dispatching service.

Provides fire-and-forget delivery of webhook events to registered endpoints.
Events: response.started, response.completed, survey.activated, survey.closed, quota.reached.

Design notes:
- dispatch_webhook_event() accepts only scalar parameters (no ORM objects or sessions)
  to avoid request-session lifetime issues when scheduled as a background task.
- A new DB session is opened inside the background task via async_sessionmaker.
- _deliver_webhook() uses httpx.AsyncClient as a context manager to ensure cleanup.
- All delivery failures are caught and logged; never propagated to the caller.
- asyncio.create_task() schedules fire-and-forget delivery without blocking the request.
- If a webhook has a secret, an HMAC-SHA256 X-Webhook-Signature header is included.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.webhook import Webhook

logger = logging.getLogger(__name__)


_RETRY_DELAYS = [10, 60, 300]  # seconds between retry attempts (exponential backoff)
_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
_USER_AGENT = "SurveyTool/1.0"


async def _deliver_webhook(
    url: str,
    payload: dict,
    secret: str,
    webhook_id: uuid.UUID,
) -> None:
    """Deliver a single webhook payload via HTTP POST with retry logic.

    Uses httpx.AsyncClient as a context manager to ensure connection cleanup.
    Catches all exceptions to ensure delivery failures never surface to callers.
    Computes HMAC-SHA256 signature if the webhook has a non-empty secret.

    Retries up to 3 times with exponential backoff (10s, 60s, 300s) on:
    - httpx.TimeoutException
    - httpx.ConnectError
    - HTTP 5xx responses

    Does NOT retry on HTTP 4xx (client errors).

    Args:
        url: The target URL to POST to.
        payload: The JSON-serializable payload dict.
        secret: The webhook secret for HMAC signing (may be empty string).
        webhook_id: The webhook UUID for logging context.
    """
    body = json.dumps(payload, default=str)
    body_bytes = body.encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": _USER_AGENT,
    }

    if secret:
        signature = hmac.new(
            secret.encode("utf-8"),
            body_bytes,
            hashlib.sha256,
        ).hexdigest()
        headers["X-Webhook-Signature"] = f"sha256={signature}"

    max_attempts = len(_RETRY_DELAYS) + 1  # 4 total: 1 initial + 3 retries
    for attempt in range(max_attempts):
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                response = await client.post(url, content=body, headers=headers)

            if response.status_code >= 500:
                # Retriable server error
                if attempt < len(_RETRY_DELAYS):
                    delay = _RETRY_DELAYS[attempt]
                    logger.warning(
                        "Webhook delivery attempt %d/%d failed (status=%d): "
                        "webhook_id=%s url=%s — retrying in %ds",
                        attempt + 1,
                        max_attempts,
                        response.status_code,
                        webhook_id,
                        url,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.warning(
                        "Webhook delivery failed after %d attempts (status=%d): "
                        "webhook_id=%s url=%s",
                        max_attempts,
                        response.status_code,
                        webhook_id,
                        url,
                    )
                    return

            if response.status_code >= 400:
                # Non-retriable client error
                logger.warning(
                    "Webhook delivery failed (status=%d, not retrying): "
                    "webhook_id=%s url=%s",
                    response.status_code,
                    webhook_id,
                    url,
                )
                return

            logger.debug(
                "Webhook delivered successfully (attempt=%d, status=%d): "
                "webhook_id=%s url=%s",
                attempt + 1,
                response.status_code,
                webhook_id,
                url,
            )
            return

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            if attempt < len(_RETRY_DELAYS):
                delay = _RETRY_DELAYS[attempt]
                logger.warning(
                    "Webhook delivery attempt %d/%d failed (%s): "
                    "webhook_id=%s url=%s — retrying in %ds",
                    attempt + 1,
                    max_attempts,
                    exc,
                    webhook_id,
                    url,
                    delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.warning(
                    "Webhook delivery failed after %d attempts (%s): "
                    "webhook_id=%s url=%s",
                    max_attempts,
                    exc,
                    webhook_id,
                    url,
                )

        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Webhook delivery error (unretriable): webhook_id=%s url=%s error=%s",
                webhook_id,
                url,
                exc,
            )
            return


async def _dispatch_task(
    event: str,
    survey_id: uuid.UUID | None,
    data: dict,
) -> None:
    """Background task: query matching webhooks and deliver the event.

    Opens its own DB session (not the request-scoped one) to avoid
    DetachedInstanceError after the request completes.

    Args:
        event: The event name (e.g. "response.started").
        survey_id: The UUID of the survey, or None for global-only delivery.
        data: Event-specific data dict to include in the payload.
    """
    from app.database import async_session  # local import to avoid circular

    payload = {
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "survey_id": str(survey_id) if survey_id is not None else None,
        "data": data,
    }

    try:
        async with async_session() as session:
            webhooks = await _query_matching_webhooks(session, event, survey_id)

        delivery_tasks = [
            _deliver_webhook(
                url=wh_url,
                payload=payload,
                secret=wh_secret,
                webhook_id=wh_id,
            )
            for wh_id, wh_url, wh_secret in webhooks
        ]
        if delivery_tasks:
            await asyncio.gather(*delivery_tasks, return_exceptions=True)

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Webhook dispatch task error: event=%s survey_id=%s error=%s",
            event,
            survey_id,
            exc,
        )


async def _query_matching_webhooks(
    session: AsyncSession,
    event: str,
    survey_id: uuid.UUID | None,
) -> list[tuple[uuid.UUID, str, str]]:
    """Query active webhooks matching the event and survey scope.

    Matches webhooks where:
    - is_active = True
    - events JSONB array contains the event string
    - survey_id matches OR survey_id IS NULL (global webhook)

    Args:
        session: An async DB session.
        event: The event name to filter by.
        survey_id: The survey UUID to match (along with global webhooks).

    Returns:
        List of (webhook_id, url, secret) tuples.
    """
    # Build the survey_id filter: match exact survey_id OR global (survey_id IS NULL)
    if survey_id is not None:
        survey_filter = or_(
            Webhook.survey_id == survey_id,
            Webhook.survey_id.is_(None),
        )
    else:
        # When dispatching without a specific survey, only match global webhooks
        survey_filter = Webhook.survey_id.is_(None)

    # Query at DB level: events JSONB must contain the event string
    result = await session.execute(
        select(Webhook.id, Webhook.url, Webhook.secret)
        .where(
            Webhook.is_active == True,  # noqa: E712
            Webhook.events.contains([event]),  # JSONB contains check
            survey_filter,
        )
    )
    return list(result.fetchall())


def dispatch_webhook_event(
    event: str,
    survey_id: uuid.UUID | None,
    data: dict,
) -> None:
    """Schedule a fire-and-forget webhook dispatch for the given event.

    Accepts only scalar parameters to ensure the background task has no
    dependency on the caller's session or ORM object state.

    This function schedules an asyncio task and returns immediately.
    Delivery failures are logged but never propagated.

    Args:
        event: The event name (e.g. "response.started", "quota.reached").
        survey_id: The survey UUID to scope the dispatch, or None for global.
        data: Event-specific data to include in the payload's "data" field.
    """
    try:
        asyncio.get_running_loop()
        asyncio.create_task(_dispatch_task(event, survey_id, data))
    except RuntimeError:
        # No running event loop — log and skip (e.g., during tests or sync contexts)
        logger.debug(
            "dispatch_webhook_event called outside event loop: event=%s survey_id=%s",
            event,
            survey_id,
        )
