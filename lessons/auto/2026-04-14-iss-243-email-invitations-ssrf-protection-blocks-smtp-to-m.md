---
date: "2026-04-14"
ticket_id: "ISS-243"
ticket_title: "Email invitations: SSRF protection blocks SMTP to Mailpit in Docker dev environment"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-14"
ticket_id: "ISS-243"
ticket_title: "Email invitations: SSRF protection blocks SMTP to Mailpit in Docker dev environment"
categories: ["security", "email", "docker", "ssrf", "configuration"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/services/email_service.py", "backend/tests/test_email_service.py"]
---

# Lessons Learned: Email invitations: SSRF protection blocks SMTP to Mailpit in Docker dev environment

## What Worked Well
- The implementation plan's warning to read `config.py` before referencing `settings.environment` prevented silent AttributeError failures at runtime
- Scoping the SSRF bypass to `settings.environment` (not an env var read directly) kept the fix consistent with the project's existing patterns
- The existing `_NON_PRODUCTION_ENVS` pattern in `cli.py` provided a clear, consistent precedent for the environment check
- Running an import smoke-test (`python -c 'from app.services.email_service import EmailService'`) before the Docker test run would surface broken imports with clean tracebacks

## What Was Challenging
- Docker bridge IPs (172.16.0.0/12) are in the private range that SSRF protection legitimately blocks, making the conflict between security and dev tooling non-obvious until runtime
- The SSRF check constructs a synthetic `smtp://` URL internally — this indirection makes it harder to trace why a valid-looking hostname is rejected

## Key Technical Insights
1. SSRF protection that resolves hostnames at validation time will block Docker bridge IPs because Mailpit resolves to a 172.x.x.x address inside the Docker network — this is expected behavior, not a bug in the protection logic
2. The correct fix is environment-scoped allowlisting of the *configured* `smtp_host` value rather than disabling SSRF protection entirely or hardcoding IP ranges
3. Always read `app/config.py` to confirm the exact field name and type for `environment` before referencing `settings.environment` — pydantic-settings v2 field names do not always match environment variable names
4. The `_NON_PRODUCTION_ENVS` set defined in `config.py` is the canonical way to express "skip this in dev/test" — use it consistently rather than inline string comparisons
5. Email service tests that involve no database queries can be run with plain `pytest` on the host Python, avoiding the Docker test runner overhead — but only when `email_service.py` has no DB-level imports

## Reusable Patterns
- Environment-scoped security bypass: `if settings.environment not in _NON_PRODUCTION_ENVS: <run security check>` — apply this pattern for any security control that legitimately conflicts with Docker/local dev infrastructure
- Always add a debug-level log message when skipping a security check (`logger.debug("Skipping SSRF check for smtp_host in non-production environment")`) so the bypass is observable without being noisy
- Import the `Settings` singleton from `app.config`; never read `os.environ` directly in application modules
- Run import smoke-test before Docker test runs: `python -c 'from app.services.email_service import EmailService'`

## Files to Review for Similar Tasks
- `backend/app/services/email_service.py` — SSRF validation logic and environment-scoped bypass pattern
- `backend/app/config.py` — `_NON_PRODUCTION_ENVS` set, `environment` field name/type/default
- `backend/app/cli.py` — existing usage of `_NON_PRODUCTION_ENVS` as the canonical precedent
- `backend/tests/test_email_service.py` — mock patterns for `settings.environment` and `aiosmtplib.send`

## Gotchas and Pitfalls
- Do not assume `settings.environment` exists — confirm the field name in `config.py` before referencing it; a wrong name raises `AttributeError` at runtime with no helpful message
- Do not disable SSRF protection globally or based on the destination IP — scope the bypass to the configured `smtp_host` only, and only in non-production environments
- The `_NON_PRODUCTION_ENVS` set may or may not be importable from `config.py` depending on whether it is module-level or nested — verify before importing, or define the check inline to avoid circular imports
- Docker tests require `DATABASE_URL` with `postgresql+asyncpg://` scheme — tests for email service logic that need no DB can skip the Docker runner, but this is only safe if the module has no transitive DB imports
- Adding tests for the SSRF bypass requires mocking both `settings.environment` and `aiosmtplib.send` — verify the mock target paths match the actual import locations in `email_service.py`
```
