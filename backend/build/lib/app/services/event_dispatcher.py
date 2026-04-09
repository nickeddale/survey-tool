"""Event dispatcher abstraction for decoupling services from webhook_service.

Provides a thin callable abstraction so that response_service, survey_service,
and quota_service do not need to import directly from webhook_service.

Usage in services:
    from app.services.event_dispatcher import get_dispatcher

    get_dispatcher()(event="response.started", survey_id=survey_id, data={...})

Usage in tests (inject a fake dispatcher before calling service code):
    from app.services import event_dispatcher

    event_dispatcher.set_dispatcher(fake_fn)
    ...
    event_dispatcher.reset_dispatcher()

Design notes:
- No module-level async references (no async_session imports) to avoid event
  loop binding issues with function-scoped test fixtures.
- set_dispatcher / reset_dispatcher helpers are preferred over patching the
  private _dispatcher variable directly, making the test contract explicit.
"""

from __future__ import annotations

import uuid
from typing import Callable, Protocol


class EventDispatcher(Protocol):
    """Callable protocol for event dispatchers."""

    def __call__(
        self,
        *,
        event: str,
        survey_id: uuid.UUID | None,
        data: dict,
    ) -> None: ...


def _default_dispatcher(
    *,
    event: str,
    survey_id: uuid.UUID | None,
    data: dict,
) -> None:
    """Default dispatcher: delegates to webhook_service.dispatch_webhook_event."""
    from app.services.webhook_service import dispatch_webhook_event  # local import to avoid circular

    dispatch_webhook_event(event=event, survey_id=survey_id, data=data)


# Module-level dispatcher variable — replaced in tests via set_dispatcher()
_dispatcher: Callable[..., None] = _default_dispatcher


def get_dispatcher() -> Callable[..., None]:
    """Return the currently active event dispatcher."""
    return _dispatcher


def set_dispatcher(fn: Callable[..., None]) -> None:
    """Replace the active dispatcher. Call reset_dispatcher() after the test."""
    global _dispatcher
    _dispatcher = fn


def reset_dispatcher() -> None:
    """Restore the default webhook dispatcher."""
    global _dispatcher
    _dispatcher = _default_dispatcher
