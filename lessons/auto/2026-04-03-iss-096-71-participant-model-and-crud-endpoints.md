---
date: "2026-04-03"
ticket_id: "ISS-096"
ticket_title: "7.1: Participant Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-096"
ticket_title: "7.1: Participant Model and CRUD Endpoints"
categories: ["database", "api", "authentication", "testing", "alembic"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/participant.py
  - backend/app/schemas/participant.py
  - backend/app/api/participants.py
  - backend/app/main.py
  - backend/alembic/versions/0011_add_participant_token_fields.py
---

# Lessons Learned: 7.1: Participant Model and CRUD Endpoints

## What Worked Well
- Using `secrets.token_urlsafe(24)` for token generation mirrored the existing refresh token pattern, making it easy to follow and audit
- Structuring separate `ParticipantCreateResponse` (with token) and `ParticipantResponse` (without token) schemas kept the security boundary explicit at the type level
- Survey-scoped routing under `/surveys/{survey_id}/participants` aligned with existing API conventions and made ownership verification straightforward
- Manually authoring the Alembic migration avoided silent loss of constraints that autogenerate would have dropped

## What Was Challenging
- Ensuring the `token` field was genuinely excluded (not merely omitted) from `ParticipantResponse` required explicit Pydantic schema discipline — field omission and field exclusion are not equivalent in Pydantic v2
- The compound validity filter (`?valid=true`) required careful composition: `valid_from IS NULL OR valid_from <= NOW()` AND `valid_until IS NULL OR valid_until >= NOW()` AND `uses_remaining IS NULL OR uses_remaining > 0` AND `completed = false` — missing any clause produces incorrect results
- The container default `DATABASE_URL` uses the psycopg2 scheme which silently fails with the async SQLAlchemy engine; this requires an explicit override for every test run

## Key Technical Insights
1. **Alembic autogenerate is not safe for this project.** It silently drops `server_default` and `onupdate` directives. Always manually author migrations using `op.add_column` and `op.create_index`.
2. **Model imports must exist in two places before any alembic command:** `alembic/env.py` and `app/models/__init__.py`. Missing either causes silent migration gaps where new columns are invisible to autogenerate.
3. **Pydantic v2 field exclusion requires explicit schema design.** Use separate response schemas (`ParticipantResponse` vs `ParticipantCreateResponse`) rather than runtime `model.dict(exclude={...})` calls, and assert the excluded field is absent in tests.
4. **Participant tokens are stored in plaintext** (unlike hashed refresh tokens) because they serve as lookup keys for survey access. This is intentional and must not be changed to hashing without rethinking the access model.
5. **Catch `sqlalchemy.exc.IntegrityError` at the endpoint level** and return HTTP 409 Conflict for duplicate token violations. Application-level pre-checks cannot prevent race conditions — only DB-level unique constraints can, and they must be mapped to a meaningful HTTP response.
6. **All async pytest fixtures must use `scope='function'`.** Session-scoped async SQLAlchemy engines cause event loop mismatch errors with asyncpg under pytest-asyncio, with no workaround.

## Reusable Patterns
- **Import smoke-test before alembic:** `python -c 'from app.models.participant import Participant'` — surfaces broken imports as clean tracebacks rather than cryptic Alembic errors.
- **Router smoke-test before wiring:** `python -c 'from app.api.participants import router'` — catches circular imports before they cause runtime failures.
- **Test DATABASE_URL override:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest`
- **Validity filter pattern:** Combine NULL-safe date range checks with `uses_remaining` and `completed` guards in a single compound WHERE clause.
- **Token exposure pattern:** Generate token in the POST handler, store as-is, return in a dedicated `*CreateResponse` schema that extends the base response schema; base response schema never includes the token field.
- **Pydantic v2 config:** Always use `model_config = ConfigDict(from_attributes=True)` — never use the v1 inner `class Config`.

## Files to Review for Similar Tasks
- `backend/app/models/participant.py` — ORM model with token/email/validity fields pattern
- `backend/app/schemas/participant.py` — split Create/Update/Response/CreateResponse schema pattern with explicit token exclusion
- `backend/app/api/participants.py` — survey-scoped CRUD with ownership verification, IntegrityError handling, and compound validity filter
- `backend/alembic/versions/0011_add_participant_token_fields.py` — manually authored migration with unique index pattern
- `backend/alembic/versions/0010_create_participants_responses_tables.cpython-311.pyc` — baseline participants table structure for reference

## Gotchas and Pitfalls
- **Do not use passlib CryptContext anywhere** — bcrypt >= 4.x breaks it at runtime with `AttributeError`. Use `secrets` module for token generation instead.
- **Do not read `os.environ` directly in `app/api/participants.py`** — all settings must be imported from the `Settings` singleton in `app.config`.
- **Do not use session-scoped async fixtures** — they cause event loop mismatch errors with asyncpg; use `scope='function'` for all async SQLAlchemy fixtures.
- **Do not trust the container default DATABASE_URL for tests** — it uses psycopg2 scheme which silently fails with the async engine; always override to `postgresql+asyncpg://`.
- **Do not rely on field omission for security-sensitive fields** — write an explicit test assertion that `token` is absent from GET detail response bodies.
- **Do not run alembic before adding the model import to both `alembic/env.py` and `app/models/__init__.py`** — missing either causes silent migration gaps.
```
