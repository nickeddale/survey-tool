"""Business logic for email invitations.

Handles participant lookup/creation, survey link construction,
email dispatch via email_service, and invitation record management.
"""

import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.email_invitation import EmailInvitation
from app.models.participant import Participant
from app.services import email_service
from app.services import template_service
from app.utils.errors import NotFoundError, ValidationError
from app.utils.pagination import PaginationParams


async def get_or_create_participant(
    session: AsyncSession,
    survey_id: uuid.UUID,
    email: str,
    name: str | None = None,
) -> Participant:
    """Look up an existing participant by survey_id+email, or create one with a token."""
    result = await session.execute(
        select(Participant).where(
            Participant.survey_id == survey_id,
            Participant.email == email,
        )
    )
    participant = result.scalar_one_or_none()
    if participant is not None:
        return participant

    token = secrets.token_urlsafe(24)
    participant = Participant(
        id=uuid.uuid4(),
        survey_id=survey_id,
        token=token,
        email=email,
        completed=False,
    )
    session.add(participant)
    await session.flush()
    await session.refresh(participant)
    return participant


def _build_survey_link(survey_id: uuid.UUID, token: str) -> str:
    base = settings.frontend_url.rstrip("/")
    return f"{base}/s/{survey_id}?token={token}"


def _build_tracking_urls(invitation_id: uuid.UUID) -> tuple[str, str]:
    """Return (tracking_open_url, tracking_click_url) for the given invitation."""
    base = settings.backend_url.rstrip("/")
    open_url = f"{base}/api/v1/email/track/open/{invitation_id}"
    click_url = f"{base}/api/v1/email/track/click/{invitation_id}"
    return open_url, click_url


def _build_email_body(
    recipient_name: str | None,
    survey_link: str,
    invitation_type: str,
    invitation_id: uuid.UUID | None = None,
    survey_title: str = "",
    survey_description: str | None = None,
    custom_message: str | None = None,
) -> tuple[str, str]:
    """Return (html_body, text_body) for the invitation email using Jinja2 templates."""
    template_name = (
        "email/reminder.html" if invitation_type == "reminder" else "email/invitation.html"
    )

    if invitation_id is not None:
        tracking_open_url, tracking_click_url = _build_tracking_urls(invitation_id)
    else:
        # Fallback: link directly to the survey if no invitation_id available
        tracking_open_url = ""
        tracking_click_url = survey_link

    context = {
        "recipient_name": recipient_name,
        "survey_link": survey_link,
        "tracking_open_url": tracking_open_url,
        "tracking_click_url": tracking_click_url,
        "survey_title": survey_title,
        "survey_description": survey_description,
        "custom_message": custom_message,
        "sender_name": settings.smtp_from_name,
    }
    html_body = template_service.render_template(template_name, **context)
    text_body = template_service.html_to_text(html_body)
    return html_body, text_body


async def send_invitation(
    session: AsyncSession,
    survey_id: uuid.UUID,
    recipient_email: str,
    recipient_name: str | None = None,
    subject: str | None = None,
    invitation_type: str = "invite",
    survey_title: str = "",
    survey_description: str | None = None,
    custom_message: str | None = None,
) -> EmailInvitation:
    """Create an EmailInvitation record, dispatch via email_service, and update status."""
    participant = await get_or_create_participant(session, survey_id, recipient_email, recipient_name)

    survey_link = _build_survey_link(survey_id, participant.token or "")

    effective_subject = subject or "You have been invited to take a survey"
    if invitation_type == "reminder":
        effective_subject = subject or "Reminder: Please complete your survey"

    invitation = EmailInvitation(
        id=uuid.uuid4(),
        survey_id=survey_id,
        participant_id=participant.id,
        recipient_email=recipient_email,
        recipient_name=recipient_name,
        subject=effective_subject,
        status="pending",
        attempt_count=0,
        invitation_type=invitation_type,
    )
    session.add(invitation)
    await session.flush()
    await session.refresh(invitation)

    html_body, text_body = _build_email_body(
        recipient_name,
        survey_link,
        invitation_type,
        invitation_id=invitation.id,
        survey_title=survey_title,
        survey_description=survey_description,
        custom_message=custom_message,
    )

    try:
        await email_service.send_email(
            to=recipient_email,
            subject=effective_subject,
            html_body=html_body,
            text_body=text_body,
        )
        invitation.status = "sent"
        invitation.sent_at = datetime.now(timezone.utc)
        invitation.attempt_count = 1
        invitation.error_message = None
    except Exception as exc:
        invitation.status = "failed"
        invitation.attempt_count = 1
        invitation.error_message = str(exc)

    await session.flush()
    await session.refresh(invitation)
    return invitation


async def send_batch_invitations(
    session: AsyncSession,
    survey_id: uuid.UUID,
    items: list[dict],
    subject: str | None = None,
    invitation_type: str = "invite",
    survey_title: str = "",
    survey_description: str | None = None,
) -> dict:
    """Send invitations to a list of {email, name} items. Returns summary counts."""
    sent = 0
    failed = 0
    skipped = 0

    seen_emails: set[str] = set()

    for item in items:
        email = item.get("recipient_email") or item.get("email", "")
        name = item.get("recipient_name") or item.get("name")

        if not email:
            skipped += 1
            continue

        if email in seen_emails:
            skipped += 1
            continue
        seen_emails.add(email)

        item_subject = item.get("subject") or subject
        item_type = item.get("invitation_type") or invitation_type
        item_custom_message = item.get("custom_message")

        try:
            invitation = await send_invitation(
                session=session,
                survey_id=survey_id,
                recipient_email=email,
                recipient_name=name,
                subject=item_subject,
                invitation_type=item_type,
                survey_title=survey_title,
                survey_description=survey_description,
                custom_message=item_custom_message,
            )
            if invitation.status == "sent":
                sent += 1
            else:
                failed += 1
        except Exception:
            failed += 1

    return {"sent": sent, "failed": failed, "skipped": skipped}


async def list_invitations(
    session: AsyncSession,
    survey_id: uuid.UUID,
    pagination: PaginationParams,
    status: str | None = None,
    recipient_email: str | None = None,
    invitation_type: str | None = None,
) -> dict:
    """Paginated list of invitations with optional filters, sorted by created_at desc."""
    conditions = [EmailInvitation.survey_id == survey_id]

    if status is not None:
        conditions.append(EmailInvitation.status == status)
    if recipient_email is not None:
        conditions.append(EmailInvitation.recipient_email == recipient_email)
    if invitation_type is not None:
        conditions.append(EmailInvitation.invitation_type == invitation_type)

    where_clause = and_(*conditions)

    count_result = await session.execute(
        select(func.count()).select_from(EmailInvitation).where(where_clause)
    )
    total = count_result.scalar_one()

    items_result = await session.execute(
        select(EmailInvitation)
        .where(where_clause)
        .order_by(EmailInvitation.created_at.desc())
        .offset(pagination.offset)
        .limit(pagination.per_page)
    )
    items = list(items_result.scalars().all())

    pages = max(1, (total + pagination.per_page - 1) // pagination.per_page)

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "per_page": pagination.per_page,
        "pages": pages,
    }


async def get_invitation(
    session: AsyncSession,
    invitation_id: uuid.UUID,
    survey_id: uuid.UUID,
) -> EmailInvitation:
    """Fetch an invitation by id scoped to a survey; raise 404 if not found."""
    result = await session.execute(
        select(EmailInvitation).where(
            EmailInvitation.id == invitation_id,
            EmailInvitation.survey_id == survey_id,
        )
    )
    invitation = result.scalar_one_or_none()
    if invitation is None:
        raise NotFoundError("Email invitation not found")
    return invitation


async def get_invitation_stats(
    session: AsyncSession,
    survey_id: uuid.UUID,
) -> dict:
    """Aggregate delivery statistics for all invitations in a survey.

    Returns total counts by status, open/click rates, and breakdown by
    invitation_type.
    """
    result = await session.execute(
        select(EmailInvitation).where(EmailInvitation.survey_id == survey_id)
    )
    invitations = list(result.scalars().all())

    total = len(invitations)
    sent = sum(1 for i in invitations if i.status == "sent")
    delivered = sent  # treat sent as delivered (no separate delivery webhook)
    bounced = 0  # placeholder — no bounce tracking in current model
    failed = sum(1 for i in invitations if i.status == "failed")
    opened = sum(1 for i in invitations if i.opened_at is not None)
    clicked = sum(1 for i in invitations if i.clicked_at is not None)

    open_rate = round(opened / sent, 4) if sent > 0 else 0.0
    click_rate = round(clicked / sent, 4) if sent > 0 else 0.0

    # Breakdown by invitation_type
    type_counts: dict[str, dict] = {}
    for invitation in invitations:
        t = invitation.invitation_type
        if t not in type_counts:
            type_counts[t] = {"total": 0, "sent": 0, "failed": 0, "opened": 0, "clicked": 0}
        type_counts[t]["total"] += 1
        if invitation.status == "sent":
            type_counts[t]["sent"] += 1
        if invitation.status == "failed":
            type_counts[t]["failed"] += 1
        if invitation.opened_at is not None:
            type_counts[t]["opened"] += 1
        if invitation.clicked_at is not None:
            type_counts[t]["clicked"] += 1

    return {
        "total": total,
        "sent": sent,
        "delivered": delivered,
        "bounced": bounced,
        "failed": failed,
        "opened": opened,
        "clicked": clicked,
        "open_rate": open_rate,
        "click_rate": click_rate,
        "breakdown": type_counts,
    }


async def delete_invitation(
    session: AsyncSession,
    invitation_id: uuid.UUID,
    survey_id: uuid.UUID,
) -> None:
    """Delete an invitation by id scoped to a survey; raise 404 if not found."""
    invitation = await get_invitation(session, invitation_id, survey_id)
    await session.delete(invitation)
    await session.flush()


async def resend_invitation(
    session: AsyncSession,
    invitation_id: uuid.UUID,
    survey_id: uuid.UUID,
) -> EmailInvitation:
    """Resend a failed invitation. Returns 400 if status is not 'failed'."""
    invitation = await get_invitation(session, invitation_id, survey_id)

    if invitation.status != "failed":
        raise ValidationError(
            f"Cannot resend invitation with status '{invitation.status}'. Only 'failed' invitations can be resent."
        )

    invitation.status = "pending"
    invitation.attempt_count = 0
    invitation.error_message = None
    await session.flush()
    await session.refresh(invitation)

    survey_link = _build_survey_link(survey_id, "")
    if invitation.participant_id is not None:
        part_result = await session.execute(
            select(Participant).where(Participant.id == invitation.participant_id)
        )
        participant = part_result.scalar_one_or_none()
        if participant is not None and participant.token:
            survey_link = _build_survey_link(survey_id, participant.token)

    html_body, text_body = _build_email_body(
        invitation.recipient_name,
        survey_link,
        invitation.invitation_type,
        invitation_id=invitation.id,
    )

    try:
        await email_service.send_email(
            to=invitation.recipient_email,
            subject=invitation.subject,
            html_body=html_body,
            text_body=text_body,
        )
        invitation.status = "sent"
        invitation.sent_at = datetime.now(timezone.utc)
        invitation.attempt_count += 1
        invitation.error_message = None
    except Exception as exc:
        invitation.status = "failed"
        invitation.attempt_count += 1
        invitation.error_message = str(exc)

    await session.flush()
    await session.refresh(invitation)
    return invitation
