---
date: "2026-04-13"
ticket_id: "ISS-232"
ticket_title: "Email Invitation CRUD API endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-13"
ticket_id: "ISS-232"
ticket_title: "Email Invitation CRUD API endpoints"
categories: ["fastapi", "email", "crud", "participants", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/config.py
  - backend/app/services/email_invitation_service.py
  - backend/app/api/email_invitations.py
  - backend/app/main.py
  - backend/tests/test_email_invitations.py
---

# Lessons Learned: Email Invitation CRUD API endpoints

## What Worked Well
- The existing router/service/model pattern (participants.py, webhooks.py) provided clear scaffolding — following it closely kept implementation consistent and reviewable
- Splitting participant lookup/creation into a dedicated `get_or_create_participant` helper kept `send_invitation` clean and made the batch path trivial to implement
- Mocking `email_service.send_email` at the import reference in `email_invitation_service` (not at the definition module) allowed tests to run without any SMTP infrastructure
- Function-scoped fixtures ensured full table isolation per test, preventing state leakage across send/batch/list/delete tests
- Reading `conftest.py` fully before writing tests avoided signature mismatches on helpers like `register_and_login` and `auth_headers`

## What Was Challenging
- The `./backend:/app` volume mount masks the `.egg-info` built inside the Docker image — new service/router modules are invisible inside the container if the editable install is absent on the host; an import smoke-test before running pytest catches this immediately
- pydantic-settings v2 `SettingsConfigDict` pattern is not obvious from reading the field definitions alone — always read `config.py` first to confirm the pattern before adding a new field like `FRONTEND_URL`
- `asyncpg` requires `postgresql+asyncpg://` scheme in `DATABASE_URL`; the default in `config.py` uses the psycopg2 scheme, so every Docker pytest invocation needs an explicit `DATABASE_URL` override
- Async SQLAlchemy fixtures scoped to `session` or `module` cause event loop mismatches with asyncpg under `asyncio_mode = 'auto'` — scope must always be `'function'`

## Key Technical Insights
1. Always patch the reference, not the origin: mock `app.services.email_invitation_service.email_service`, not `app.services.email_service.email_service`. The module where the name is imported is what gets patched at test time.
2. `asyncio_mode = 'auto'` in `pyproject.toml [tool.pytest.ini_options]` eliminates the need for `@pytest.mark.asyncio` on every async test — verify this is set before writing a single test.
3. `FRONTEND_URL` belongs in `Settings` using `SettingsConfigDict(env_file='.env', extra='ignore')` — never add a nested `class Config` block (pydantic v1 pattern).
4. Survey link format `{FRONTEND_URL}/s/{survey_id}?token={participant_token}` should be constructed in the service layer, not the router, so it is consistently testable and reusable by the resend path.
5. Resend logic should validate that the invitation's current status is `failed` before proceeding — return HTTP 400 otherwise to prevent accidental duplicate sends.
6. Batch send should aggregate results as `{sent, failed, skipped}` counts rather than returning full invitation records, keeping the response payload bounded for large lists.

## Reusable Patterns
- **Import smoke-test before any pytest run:** `python -c "from app.services.email_invitation_service import send_invitation; from app.api.email_invitations import router"` — catches missing `__init__.py` or broken editable install before the full test suite runs
- **get_or_create pattern:** `SELECT ... WHERE survey_id=X AND email=Y`, create with `secrets.token_urlsafe(32)` if absent, return participant in either branch — identical pattern applies to participants in other invite flows
- **Status lifecycle:** `pending` → `sent` (update `sent_at`) or `failed` (update `error_message`); resend resets `attempt_count` and re-enters the same send path
- **Survey ownership guard:** fetch survey with `WHERE id=survey_id AND user_id=current_user.id`; raise 404 (not 403) so cross-user enumeration is not possible
- **Rate limiting placement:** apply `limiter.limit(...)` only on mutation + send endpoints (POST /, POST /batch, POST /{id}/resend); list/get/delete do not need it

## Files to Review for Similar Tasks
- `backend/app/api/webhooks.py` — canonical example of ownership-guarded CRUD router with require_scope pattern
- `backend/app/api/surveys.py` — pagination and filter query param patterns
- `backend/tests/test_webhooks.py` — helper usage (`register_and_login`, `auth_headers`, `create_survey`) and isolation fixture pattern
- `backend/app/config.py` — SettingsConfigDict v2 pattern for adding new env vars
- `backend/tests/conftest.py` — authoritative source for fixture signatures; read before writing any test file

## Gotchas and Pitfalls
- **Volume mount hides new modules:** `./backend:/app` overwrites the image's installed package. A new `app/services/email_invitation_service.py` added on the host is visible; one added only inside the container is not. Always add files on the host.
- **Wrong DATABASE_URL scheme:** `config.py` defaults to `postgresql://` (psycopg2). Running pytest inside Docker without overriding to `postgresql+asyncpg://` produces a cryptic driver error, not a clear scheme error.
- **Fixture scope with asyncpg:** `scope='session'` or `scope='module'` on any async SQLAlchemy engine/session fixture causes `Task attached to a different loop` with asyncpg. Use `scope='function'` unconditionally.
- **Patching at the wrong path:** patching `app.services.email_service.send_email` has no effect if `email_invitation_service` imports `email_service` as a module reference. Always patch at `app.services.email_invitation_service.email_service`.
- **pydantic v1 Config class:** adding `class Config: env_file = '.env'` inside `Settings` breaks v2 pydantic-settings. Use `model_config = SettingsConfigDict(...)` at the class body level.
- **Resend without status check:** calling resend on a `sent` or `pending` invitation without a status guard can produce duplicate sends that are invisible to the caller — always assert `status == 'failed'` and return 400 otherwise.
```
