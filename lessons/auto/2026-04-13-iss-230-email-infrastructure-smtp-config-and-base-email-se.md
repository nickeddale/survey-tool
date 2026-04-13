---
date: "2026-04-13"
ticket_id: "ISS-230"
ticket_title: "Email Infrastructure: SMTP config and base email service"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-13"
ticket_id: "ISS-230"
ticket_title: "Email Infrastructure: SMTP config and base email service"
categories: ["backend", "email", "infrastructure", "testing", "async"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/pyproject.toml
  - backend/app/config.py
  - backend/app/services/email_service.py
  - backend/tests/test_email_service.py
---

# Lessons Learned: Email Infrastructure: SMTP config and base email service

## What Worked Well
- Modelling email_service.py directly after webhook_service.py gave a proven retry pattern (3 attempts, exponential backoff) without reinventing anything
- Reusing `app.utils.ssrf_protection.is_safe_url` for SMTP host validation kept security logic centralised and consistent
- Dev-mode (SMTP_ENABLED=false) log-instead-of-send made local development safe with zero configuration
- Pure unit tests with no real SMTP server kept the test suite fast and portable — `unittest.mock.patch` + `AsyncMock` on `aiosmtplib.send` was sufficient for full coverage
- Pydantic-settings v2 `SettingsConfigDict` pattern made adding eight new SMTP fields straightforward with sensible defaults

## What Was Challenging
- The Docker volume mount (`./backend:/app`) masks container build artifacts, so adding `aiosmtplib` to `pyproject.toml` requires a full `docker compose build backend` before any container test run — a container restart alone is not enough
- Import failures inside the container can surface as confusing `ModuleNotFoundError` rather than an SMTP error if the image is stale; running an import smoke-test (`python -c "from app.services.email_service import send_email, send_emails"`) inside the container surfaces this cleanly before running the full suite
- Patching the correct target for settings overrides requires care: patch `app.services.email_service.settings` (the module-level object), not `os.environ` or the original `app.config.settings`, because the module captures the singleton at import time

## Key Technical Insights
1. The Docker volume mount pattern used by this project means new pip dependencies are invisible to the running container until the image is rebuilt — this is a project-wide invariant, not specific to aiosmtplib.
2. `asyncio_mode = 'auto'` is set project-wide in `pyproject.toml`; adding `@pytest.mark.asyncio` to async test functions is unnecessary and can cause warnings or conflicts — always verify this before writing any async tests.
3. Constructing a synthetic `smtp://host` URL to pass through `is_safe_url` is the correct SSRF-check pattern for non-HTTP protocols; raise `ValueError` and log a warning on block before any network connection is attempted.
4. `asyncio.gather` over per-recipient `send_email` calls is the right approach for batch sending — it preserves individual per-recipient retry logic while allowing concurrent dispatch.
5. Retriable exceptions for SMTP are `aiosmtplib.SMTPException` and `OSError` (covers connection-level failures); all other exceptions should propagate immediately without retry.

## Reusable Patterns
- **Retry loop with backoff**: `_RETRY_DELAYS = [1, 5, 15]`; iterate with `asyncio.sleep(delay)` between attempts; catch only known-transient exceptions; log each attempt — identical structure to `webhook_service.py`.
- **SSRF check for non-HTTP protocols**: construct `scheme://host` URL, call `is_safe_url`, raise `ValueError` on failure before opening any socket.
- **Dev-mode bypass**: check `settings.smtp_enabled` at the top of the send function; log the full email (to, subject, body) at INFO level and return early — no real connection code is reached.
- **Settings patching in unit tests**: `with patch('app.services.email_service.settings') as mock_settings: mock_settings.smtp_enabled = False` — patch the module-level reference, not the origin.
- **Import smoke-test**: after creating any new service module, verify with `python -c "from app.services.X import fn"` inside the container before running pytest.

## Files to Review for Similar Tasks
- `backend/app/services/webhook_service.py` — canonical retry/backoff/logging pattern for async outbound network calls
- `backend/app/utils/ssrf_protection.py` — SSRF host validation utility; use for any service that makes outbound connections based on user-supplied or config-supplied hostnames
- `backend/app/config.py` — pydantic-settings v2 pattern; confirm `SettingsConfigDict` usage before adding new fields
- `backend/pyproject.toml` — dependency declarations and `asyncio_mode = 'auto'` pytest config
- `backend/tests/conftest.py` — read before writing any test file to avoid fixture conflicts, even for pure unit tests with no DB dependency

## Gotchas and Pitfalls
- **Never use `os.environ` directly** in service code — always import and use the `settings` singleton from `app.config`. This is a project-wide convention enforced by pattern, not tooling.
- **Never use pydantic v1 `class Config` inner class** — the project uses pydantic-settings v2 with `SettingsConfigDict`; mixing patterns causes silent misconfiguration.
- **Rebuild the Docker image after adding any new dependency** to `pyproject.toml`; `docker compose restart backend` does not install new packages.
- **Do not add `@pytest.mark.asyncio`** to async test functions — `asyncio_mode = 'auto'` is already configured and the decorator is redundant or harmful.
- **Patch the module-level `settings` object**, not `os.environ` or the config module's `settings`, when overriding SMTP fields in unit tests.
- **Run the import smoke-test inside the container** after creating a new service module — pytest can mask import errors with collection warnings that are easy to miss in `-q` mode.
```
