"""Async email sending service.

Provides HTML+plain text email delivery via SMTP using aiosmtplib.
Supports batch sending, retry logic with exponential backoff, and SSRF-safe
host validation.

Design notes:
- send_email() accepts scalar parameters only (no ORM objects or sessions).
- Settings are read from the app.config singleton at call time.
- When smtp_enabled=False (dev mode), emails are logged but not sent.
- Retry logic mirrors webhook_service.py: 3 attempts with 1s/5s/15s backoff.
- SSRF protection: smtp_host is validated via is_safe_url before connection.
- All send attempts are logged regardless of outcome.
"""

import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.config import _NON_PRODUCTION_ENVS, settings
from app.utils.ssrf_protection import is_safe_url

logger = logging.getLogger(__name__)

_RETRY_DELAYS = [1, 5, 15]  # seconds between retry attempts


async def send_email(
    to: str | list[str],
    subject: str,
    html_body: str,
    text_body: str = "",
) -> None:
    """Send an email to one or more recipients.

    When smtp_enabled=False, logs the email instead of sending (dev mode).
    Validates the SMTP host against SSRF-safe rules before connecting.
    Retries up to 3 times on transient SMTP or network failures.

    Args:
        to: Recipient email address or list of addresses.
        subject: Email subject line.
        html_body: HTML version of the email body.
        text_body: Plain text version of the email body (optional).
    """
    recipients = [to] if isinstance(to, str) else list(to)

    if not settings.smtp_enabled:
        logger.info(
            "Email not sent (smtp_enabled=False) — dev mode log: "
            "to=%s subject=%r html_length=%d",
            recipients,
            subject,
            len(html_body),
        )
        return

    # SSRF host validation — construct a synthetic URL for the checker.
    # In development/test environments the configured smtp_host is trusted
    # (e.g. Mailpit in Docker resolves to a 172.16.0.0/12 bridge IP that would
    # otherwise be blocked). Production environments always enforce the check.
    if settings.environment in _NON_PRODUCTION_ENVS:
        logger.debug(
            "SSRF check skipped for configured smtp_host in %s environment: host=%s",
            settings.environment,
            settings.smtp_host,
        )
    else:
        synthetic_url = f"smtp://{settings.smtp_host}"
        if not is_safe_url(synthetic_url):
            logger.warning(
                "Email send blocked by SSRF protection: host=%s subject=%r to=%s",
                settings.smtp_host,
                subject,
                recipients,
            )
            raise ValueError(
                f"SMTP host '{settings.smtp_host}' blocked by SSRF protection"
            )

    # Build the MIME message
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = ", ".join(recipients)

    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    max_attempts = len(_RETRY_DELAYS) + 1  # 4 total: 1 initial + 3 retries
    for attempt in range(max_attempts):
        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user or None,
                password=settings.smtp_password or None,
                use_tls=settings.smtp_use_tls,
            )
            logger.info(
                "Email sent successfully (attempt=%d): to=%s subject=%r",
                attempt + 1,
                recipients,
                subject,
            )
            return

        except (aiosmtplib.SMTPException, OSError) as exc:
            if attempt < len(_RETRY_DELAYS):
                delay = _RETRY_DELAYS[attempt]
                logger.warning(
                    "Email send attempt %d/%d failed (%s): to=%s subject=%r — retrying in %ds",
                    attempt + 1,
                    max_attempts,
                    exc,
                    recipients,
                    subject,
                    delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.warning(
                    "Email send failed after %d attempts (%s): to=%s subject=%r",
                    max_attempts,
                    exc,
                    recipients,
                    subject,
                )

        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Email send error (unretriable): to=%s subject=%r error=%s",
                recipients,
                subject,
                exc,
            )
            return


async def send_emails(
    recipients: list[str],
    subject: str,
    html_body: str,
    text_body: str = "",
) -> None:
    """Send the same email to a list of recipients concurrently.

    Calls send_email() for each recipient via asyncio.gather.
    Failures for individual recipients are logged but do not prevent
    delivery to other recipients.

    Args:
        recipients: List of recipient email addresses.
        subject: Email subject line.
        html_body: HTML version of the email body.
        text_body: Plain text version of the email body (optional).
    """
    await asyncio.gather(
        *[
            send_email(to=recipient, subject=subject, html_body=html_body, text_body=text_body)
            for recipient in recipients
        ],
        return_exceptions=True,
    )
