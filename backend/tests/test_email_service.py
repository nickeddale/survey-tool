"""Unit tests for app.services.email_service.

Pure unit tests — no database, no real SMTP server.
Patches aiosmtplib.send, asyncio.sleep, and app.services.email_service.settings.
asyncio_mode='auto' is set in pyproject.toml — no @pytest.mark.asyncio needed.
"""

from unittest.mock import AsyncMock, MagicMock, call, patch

import aiosmtplib
import pytest

import app.services.email_service as email_module
from app.services.email_service import send_email, send_emails


def _make_settings(**overrides):
    """Return a mock settings object with sensible SMTP defaults."""
    s = MagicMock()
    s.smtp_enabled = overrides.get("smtp_enabled", True)
    s.smtp_host = overrides.get("smtp_host", "smtp.example.com")
    s.smtp_port = overrides.get("smtp_port", 587)
    s.smtp_user = overrides.get("smtp_user", "user@example.com")
    s.smtp_password = overrides.get("smtp_password", "secret")
    s.smtp_from_email = overrides.get("smtp_from_email", "noreply@example.com")
    s.smtp_from_name = overrides.get("smtp_from_name", "Survey Tool")
    s.smtp_use_tls = overrides.get("smtp_use_tls", True)
    s.environment = overrides.get("environment", "production")
    return s


# ---------------------------------------------------------------------------
# Dev mode: smtp_enabled=False
# ---------------------------------------------------------------------------


async def test_send_email_dev_mode_logs_without_sending(caplog):
    """When smtp_enabled=False, email is logged and aiosmtplib.send is never called."""
    mock_settings = _make_settings(smtp_enabled=False)
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
        patch("app.services.email_service.asyncio.sleep", new_callable=AsyncMock),
    ):
        import logging

        with caplog.at_level(logging.INFO, logger="app.services.email_service"):
            await send_email(
                to="user@test.com",
                subject="Hello",
                html_body="<p>Hi</p>",
            )

        mock_send.assert_not_called()
        assert any("smtp_enabled=False" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# Successful send
# ---------------------------------------------------------------------------


async def test_send_email_success_calls_aiosmtplib_send():
    """Successful send calls aiosmtplib.send with correct parameters."""
    mock_settings = _make_settings()
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
        patch("app.utils.ssrf_protection.is_safe_url", return_value=True),
    ):
        await send_email(
            to="recipient@test.com",
            subject="Test Subject",
            html_body="<b>Test</b>",
            text_body="Test",
        )

    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args
    assert call_kwargs.kwargs["hostname"] == "smtp.example.com"
    assert call_kwargs.kwargs["port"] == 587
    assert call_kwargs.kwargs["use_tls"] is True


async def test_send_email_success_with_list_of_recipients():
    """send_email accepts a list of recipients and joins them in the To header."""
    mock_settings = _make_settings()
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
        patch("app.utils.ssrf_protection.is_safe_url", return_value=True),
    ):
        await send_email(
            to=["a@test.com", "b@test.com"],
            subject="Batch",
            html_body="<p>Hi</p>",
        )

    mock_send.assert_called_once()


# ---------------------------------------------------------------------------
# SSRF protection
# ---------------------------------------------------------------------------


async def test_send_email_ssrf_blocked_does_not_call_smtp(caplog):
    """SSRF-blocked host logs warning and raises ValueError without calling aiosmtplib."""
    mock_settings = _make_settings(smtp_host="192.168.1.1")
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
    ):
        import logging

        with caplog.at_level(logging.WARNING, logger="app.services.email_service"):
            with pytest.raises(ValueError, match="SSRF"):
                await send_email(
                    to="user@test.com",
                    subject="Test",
                    html_body="<p>test</p>",
                )

        mock_send.assert_not_called()
        assert any("SSRF" in r.message for r in caplog.records)


async def test_send_email_localhost_blocked():
    """localhost SMTP host is blocked by SSRF protection."""
    mock_settings = _make_settings(smtp_host="localhost")
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
    ):
        with pytest.raises(ValueError, match="SSRF"):
            await send_email(to="u@test.com", subject="s", html_body="b")

        mock_send.assert_not_called()


async def test_send_email_dev_environment_skips_ssrf_check():
    """In development environment, Docker bridge IPs are not blocked by SSRF protection."""
    mock_settings = _make_settings(smtp_host="172.17.0.2", environment="development")
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
    ):
        await send_email(to="u@test.com", subject="s", html_body="b")

    mock_send.assert_called_once()


async def test_send_email_test_environment_skips_ssrf_check():
    """In test environment, Docker bridge IPs are not blocked by SSRF protection."""
    mock_settings = _make_settings(smtp_host="172.17.0.2", environment="test")
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
    ):
        await send_email(to="u@test.com", subject="s", html_body="b")

    mock_send.assert_called_once()


async def test_send_email_production_environment_still_blocks_ssrf():
    """In production environment, Docker bridge IPs are still blocked by SSRF protection."""
    mock_settings = _make_settings(smtp_host="172.17.0.2", environment="production")
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
    ):
        with pytest.raises(ValueError, match="SSRF"):
            await send_email(to="u@test.com", subject="s", html_body="b")

    mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# Retry logic
# ---------------------------------------------------------------------------


async def test_send_email_retries_on_smtp_exception():
    """SMTPException triggers retries with correct backoff delays."""
    mock_settings = _make_settings()
    call_count = 0

    async def flaky_send(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise aiosmtplib.SMTPException("transient error")

    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", side_effect=flaky_send),
        patch("app.utils.ssrf_protection.is_safe_url", return_value=True),
        patch("app.services.email_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
    ):
        await send_email(to="u@test.com", subject="s", html_body="b")

    # 3rd call succeeds; sleep called twice (after attempt 1 and 2)
    assert call_count == 3
    assert mock_sleep.call_count == 2
    assert mock_sleep.call_args_list[0] == call(1)
    assert mock_sleep.call_args_list[1] == call(5)


async def test_send_email_retries_on_os_error():
    """OSError (network failure) also triggers retries."""
    mock_settings = _make_settings()
    call_count = 0

    async def flaky_send(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        raise OSError("connection refused")

    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", side_effect=flaky_send),
        patch("app.utils.ssrf_protection.is_safe_url", return_value=True),
        patch("app.services.email_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
    ):
        await send_email(to="u@test.com", subject="s", html_body="b")

    # All 4 attempts exhausted (1 initial + 3 retries)
    assert call_count == 4
    assert mock_sleep.call_count == 3
    assert mock_sleep.call_args_list[0] == call(1)
    assert mock_sleep.call_args_list[1] == call(5)
    assert mock_sleep.call_args_list[2] == call(15)


async def test_send_email_no_retry_on_non_retriable_exception():
    """Non-retriable exceptions (e.g., ValueError) abort immediately without retry."""
    mock_settings = _make_settings()
    call_count = 0

    async def bad_send(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        raise RuntimeError("unexpected error")

    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", side_effect=bad_send),
        patch("app.utils.ssrf_protection.is_safe_url", return_value=True),
        patch("app.services.email_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
    ):
        # Should not raise — error is caught and logged
        await send_email(to="u@test.com", subject="s", html_body="b")

    assert call_count == 1
    mock_sleep.assert_not_called()


# ---------------------------------------------------------------------------
# Batch sending
# ---------------------------------------------------------------------------


async def test_send_emails_calls_send_email_per_recipient():
    """send_emails calls send_email once per recipient."""
    mock_settings = _make_settings()
    sent_to = []

    async def capture_send(*args, **kwargs):
        sent_to.append(kwargs.get("to") or args[0])

    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock),
        patch("app.utils.ssrf_protection.is_safe_url", return_value=True),
        patch.object(email_module, "send_email", side_effect=capture_send) as mock_single,
    ):
        await send_emails(
            recipients=["a@test.com", "b@test.com", "c@test.com"],
            subject="Newsletter",
            html_body="<p>content</p>",
            text_body="content",
        )

    assert mock_single.call_count == 3


async def test_send_emails_continues_on_partial_failure():
    """send_emails does not abort if one recipient's send raises."""
    mock_settings = _make_settings()
    call_count = 0

    async def partial_fail(to, **kwargs):
        nonlocal call_count
        call_count += 1
        if to == "bad@test.com":
            raise ValueError("blocked")

    with (
        patch.object(email_module, "settings", mock_settings),
        patch.object(email_module, "send_email", side_effect=partial_fail),
    ):
        # Should not raise even though one recipient fails
        await send_emails(
            recipients=["ok@test.com", "bad@test.com", "ok2@test.com"],
            subject="s",
            html_body="b",
        )

    assert call_count == 3


# ---------------------------------------------------------------------------
# Settings are read from config at call time
# ---------------------------------------------------------------------------


async def test_send_email_reads_settings_at_call_time():
    """Settings (smtp_host, port, etc.) are read from the settings object at call time."""
    mock_settings = _make_settings(smtp_host="mail.custom.com", smtp_port=465, smtp_use_tls=False)
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
        patch("app.utils.ssrf_protection.is_safe_url", return_value=True),
    ):
        await send_email(to="u@test.com", subject="s", html_body="b")

    call_kwargs = mock_send.call_args.kwargs
    assert call_kwargs["hostname"] == "mail.custom.com"
    assert call_kwargs["port"] == 465
    assert call_kwargs["use_tls"] is False


async def test_send_email_empty_credentials_passed_as_none():
    """Empty smtp_user/smtp_password strings are converted to None for aiosmtplib."""
    mock_settings = _make_settings(smtp_user="", smtp_password="")
    with (
        patch.object(email_module, "settings", mock_settings),
        patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send,
        patch("app.utils.ssrf_protection.is_safe_url", return_value=True),
    ):
        await send_email(to="u@test.com", subject="s", html_body="b")

    call_kwargs = mock_send.call_args.kwargs
    assert call_kwargs["username"] is None
    assert call_kwargs["password"] is None
