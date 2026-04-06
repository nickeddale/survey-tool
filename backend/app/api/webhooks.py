"""CRUD endpoints for webhooks."""

import secrets
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.webhook import Webhook
from app.schemas.webhook import (
    WebhookCreate,
    WebhookListResponse,
    WebhookResponse,
    WebhookUpdate,
)
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _parse_webhook_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise NotFoundError("Webhook not found")


async def _get_webhook_or_404(
    session: AsyncSession, webhook_id: uuid.UUID, user_id: uuid.UUID
) -> Webhook:
    """Fetch a webhook verifying ownership; raise 404 if not found or not owned."""
    result = await session.execute(
        select(Webhook).where(
            Webhook.id == webhook_id,
            Webhook.user_id == user_id,
        )
    )
    webhook = result.scalar_one_or_none()
    if webhook is None:
        raise NotFoundError("Webhook not found")
    return webhook


@router.post(
    "",
    response_model=WebhookResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a webhook",
    description="Register a new webhook endpoint to receive event notifications. A signing secret is generated automatically.",
)
async def create_webhook(
    payload: WebhookCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Create a webhook."""
    webhook = Webhook(
        id=uuid.uuid4(),
        user_id=current_user.id,
        survey_id=payload.survey_id,
        url=payload.url,
        events=list(payload.events),
        secret=secrets.token_hex(16),
        is_active=payload.is_active,
    )
    session.add(webhook)
    await session.flush()
    await session.refresh(webhook)
    return WebhookResponse.model_validate(webhook)


@router.get(
    "",
    response_model=WebhookListResponse,
    status_code=status.HTTP_200_OK,
    summary="List webhooks",
    description="Return a paginated list of webhooks belonging to the authenticated user.",
)
async def list_webhooks(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> WebhookListResponse:
    """List webhooks for the current user with pagination."""
    count_result = await session.execute(
        select(func.count()).select_from(Webhook).where(Webhook.user_id == current_user.id)
    )
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    items_result = await session.execute(
        select(Webhook)
        .where(Webhook.user_id == current_user.id)
        .order_by(Webhook.created_at.asc())
        .offset(offset)
        .limit(per_page)
    )
    items = list(items_result.scalars().all())

    pages = max(1, (total + per_page - 1) // per_page)

    return WebhookListResponse(
        items=[WebhookResponse.model_validate(w) for w in items],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get(
    "/{webhook_id}",
    response_model=WebhookResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a webhook",
    description="Return a single webhook by ID.",
)
async def get_webhook(
    webhook_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Get a webhook by ID."""
    parsed_id = _parse_webhook_id(webhook_id)
    webhook = await _get_webhook_or_404(session, parsed_id, current_user.id)
    return WebhookResponse.model_validate(webhook)


@router.patch(
    "/{webhook_id}",
    response_model=WebhookResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a webhook",
    description="Partially update a webhook's URL, subscribed events, survey scope, or active status.",
)
async def update_webhook(
    webhook_id: str,
    payload: WebhookUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Partially update a webhook."""
    parsed_id = _parse_webhook_id(webhook_id)
    webhook = await _get_webhook_or_404(session, parsed_id, current_user.id)

    update_fields = payload.model_dump(exclude_unset=True)

    if "events" in update_fields and update_fields["events"] is not None:
        update_fields["events"] = list(update_fields["events"])

    for field, value in update_fields.items():
        setattr(webhook, field, value)

    await session.flush()
    await session.refresh(webhook)
    return WebhookResponse.model_validate(webhook)


@router.delete(
    "/{webhook_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a webhook",
    description="Permanently delete a webhook. No further events will be delivered to the registered URL.",
)
async def delete_webhook(
    webhook_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    """Delete a webhook."""
    parsed_id = _parse_webhook_id(webhook_id)
    webhook = await _get_webhook_or_404(session, parsed_id, current_user.id)
    await session.delete(webhook)
    await session.flush()
