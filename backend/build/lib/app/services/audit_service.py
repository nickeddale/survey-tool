"""Structured JSON audit logger for security-relevant events.

This module is a pure stdlib logging module — no SQLAlchemy, no async,
no external dependencies. It emits structured JSON log entries via the
named 'audit' logger.

Usage:
    from app.services import audit_service

    audit_service.log_auth_event(
        event_type="login_success",
        user_id=str(user.id),
        email=user.email,
        success=True,
        ip_address="1.2.3.4",
    )
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("audit")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_str(value: Any) -> str | None:
    """Convert a value (including UUID) to str, or return None if already None."""
    if value is None:
        return None
    return str(value)


def log_auth_event(
    event_type: str,
    email: str,
    success: bool,
    ip_address: str | None = None,
    user_id: uuid.UUID | str | None = None,
    detail: str | None = None,
) -> None:
    """Emit a structured audit log entry for an authentication event.

    Args:
        event_type: One of 'login_success', 'login_failure', 'logout', etc.
        email: The email address attempted.
        success: Whether the auth attempt succeeded.
        ip_address: The client IP address (from request.client.host or X-Forwarded-For).
        user_id: The authenticated user's UUID (None if unknown/failed).
        detail: Optional additional context (e.g. failure reason).
    """
    entry: dict[str, Any] = {
        "timestamp": _now_iso(),
        "event_type": event_type,
        "email": email,
        "success": success,
        "user_id": _safe_str(user_id),
        "ip_address": ip_address,
    }
    if detail is not None:
        entry["detail"] = detail
    logger.info(json.dumps(entry))


def log_survey_transition(
    user_id: uuid.UUID | str | None,
    survey_id: uuid.UUID | str,
    old_status: str,
    new_status: str,
) -> None:
    """Emit a structured audit log entry for a survey status transition.

    Args:
        user_id: The UUID of the user performing the transition.
        survey_id: The UUID of the survey being transitioned.
        old_status: The previous survey status (e.g. 'draft').
        new_status: The new survey status (e.g. 'active').
    """
    entry: dict[str, Any] = {
        "timestamp": _now_iso(),
        "event_type": "survey_transition",
        "user_id": _safe_str(user_id),
        "survey_id": _safe_str(survey_id),
        "old_status": old_status,
        "new_status": new_status,
    }
    logger.info(json.dumps(entry))


def log_token_usage(
    participant_id: uuid.UUID | str,
    survey_id: uuid.UUID | str,
    token_prefix: str,
    uses_remaining: int | None,
) -> None:
    """Emit a structured audit log entry for participant token consumption.

    Args:
        participant_id: The UUID of the Participant row whose token was used.
        survey_id: The UUID of the survey.
        token_prefix: First 8 characters of the token (never log the full token).
        uses_remaining: The uses_remaining value AFTER decrement (None = unlimited).
    """
    entry: dict[str, Any] = {
        "timestamp": _now_iso(),
        "event_type": "token_usage",
        "participant_id": _safe_str(participant_id),
        "survey_id": _safe_str(survey_id),
        "token_prefix": token_prefix,
        "uses_remaining": uses_remaining,
    }
    logger.info(json.dumps(entry))
