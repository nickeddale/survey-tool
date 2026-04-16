---
date: "2026-04-13"
ticket_id: "ISS-238"
ticket_title: "Backend test suite for email invitation system"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-13"
ticket_id: "ISS-238"
ticket_title: "Backend test suite for email invitation system"
categories: ["testing", "email", "backend", "jinja2", "async"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/tests/test_email_invitations.py
  - backend/tests/test_email_service.py
  - backend/tests/test_email_tracking.py
  - backend/tests/test_email_templates.py
  - backend/app/services/email_service.py
  - backend/app/services/email_invitation_service.py
  - backend/app/api/email_invitations.py
  - backend/app/api/email_tracking.py
  - backend/app/templates/email/base.html
  - backend/app/templates/email/invitation.html
  - backend/app/templates/email/reminder.html
---

# Lessons Learned: Backend test suite for email invitation system

## What Worked Well
- Existing conftest.py patterns (function-scoped fixtures, ENUM creation, rate limiter reset) composed cleanly with the new email test files — no fixture conflicts.
- Mocking `aiosmtplib` at the module-under-test import path (`app.services.email_service.aiosmtplib`) with `AsyncMock` intercepted all SMTP calls reliably without side effects.
- Testing Jinja2 templates directly via `Environment` (no HTTP layer) gave fast, isolated feedback on rendering correctness and caught `None`-vs-`Undefined` issues immediately.
- Using `StrictUndefined` in the test `Environment` surfaced missing required template variables as hard errors rather than silent empty strings.
- Running an import smoke-test (`python -c "from app.services.email_service import EmailService"`) before the full Docker test run saved time by surfacing broken imports with clean tracebacks.

## What Was Challenging
- `test_email_templates.py` was the only missing file — creating it required understanding the Jinja2 loader root structure before writing any `{% extends %}` paths.
- Confirming that `| default('value')` without the boolean `true` silently passes `None` through is non-obvious and easy to miss in code review; templates must use `| default('value', true)`.
- Docker test execution requires the exact `postgresql+asyncpg://` scheme — a bare `postgresql://` URL fails with a confusing driver error rather than a clear connection refusal.

## Key Technical Insights
1. **Jinja2 `| default` and `None`**: `| default('fallback')` only activates when the variable is `Undefined`. When a variable is explicitly passed as `None`, the filter is bypassed. Always use `| default('fallback', true)` for optional template variables that may arrive as `None`.
2. **Template `{% extends %}` paths**: Paths in child templates must be relative to the Jinja2 `FileSystemLoader` root — use `"email/base.html"`, not `"base.html"`. Bare filenames resolve against the wrong directory and raise `TemplateNotFound` at render time.
3. **`AsyncMock` for coroutine methods**: When patching `aiosmtplib`, all coroutine methods (`.connect()`, `.sendmail()`, `.quit()`) must be wrapped with `AsyncMock` — a plain `MagicMock` will raise `TypeError: object is not awaitable` at runtime.
4. **Mock path locality**: Patch the name as it is imported in the module under test (`app.services.email_service.aiosmtplib`), not its source path. Patching the source has no effect on already-imported references.
5. **Function-scoped async fixtures**: `scope="function"` is mandatory for async SQLAlchemy engine/session fixtures under `pytest-asyncio`. Session-scoped async engines cause event loop mismatch errors with `asyncpg` because each test function runs in a fresh event loop.
6. **`StrictUndefined` in template tests**: Instantiating the test `Environment` with `undefined=StrictUndefined` turns silent rendering of missing variables into immediate `UndefinedError` exceptions, making template tests self-validating for required context keys.

## Reusable Patterns
- **SMTP mock fixture**: Create a pytest fixture that patches `app.services.email_service.aiosmtplib` with an `AsyncMock` context manager and exposes `sendmail` call args for assertions — reusable across all email service tests.
- **Template test harness**: Instantiate `jinja2.Environment(loader=FileSystemLoader("app/templates"), undefined=StrictUndefined)` once per test module; load and render templates with minimal valid context, then assert on key substrings (tracking pixel URL, unsubscribe link, recipient name).
- **Import smoke-test step**: Add `python -c "from app.services.<module> import <Class>"` as a pre-flight check in any Docker-based test workflow to get clean import errors before pytest output obscures the root cause.
- **Dev-mode email bypass**: Test `SMTP_ENABLED=false` behavior separately from SMTP mock tests — assert that the service returns success without opening any connection, verifying the bypass branch is covered.

## Files to Review for Similar Tasks
- `backend/tests/conftest.py` — canonical function-scoped async fixture setup; copy engine/session/client pattern for any new test module.
- `backend/tests/test_email_service.py` — reference implementation for mocking `aiosmtplib` with `AsyncMock` and testing retry logic.
- `backend/tests/test_email_templates.py` — reference for Jinja2 `Environment` + `StrictUndefined` template test pattern.
- `backend/app/services/email_service.py` — shows where `aiosmtplib` is imported; the import path here is the correct mock target.
- `backend/app/templates/email/invitation.html` / `reminder.html` — verify `{% extends "email/base.html" %}` and `| default('there', true)` patterns before adding new templates.

## Gotchas and Pitfalls
- **Never use `scope="session"` for async SQLAlchemy fixtures** — asyncpg event loop binding makes this fail silently or with misleading errors.
- **`postgresql://` vs `postgresql+asyncpg://`**: The asyncpg driver requires the `+asyncpg` dialect suffix. A missing suffix causes an unhelpful driver lookup error, not a connection error.
- **`| default('x')` does not protect against `None`**: Jinja2 treats `None` as a defined (falsy) value, so the default filter is not applied. This is a common silent rendering bug in email templates with optional recipient names.
- **`{% extends %}` path must match the loader root**: If the `FileSystemLoader` points to `app/templates`, child templates must use `{% extends "email/base.html" %}` — omitting the subdirectory prefix causes `TemplateNotFound` at runtime, not at load time.
- **Patch early, patch locally**: Applying `unittest.mock.patch` after the module under test has already imported the target has no effect. Always patch the attribute on the importing module, not the defining module.
- **Coverage gaps in async branches**: `pytest-cov` can under-count async code if `asyncio_mode` is not set to `"auto"` in `pytest.ini` / `pyproject.toml`. Confirm `asyncio_mode = "auto"` is present before interpreting coverage numbers.
```
