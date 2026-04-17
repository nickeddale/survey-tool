---
date: "2026-04-17"
ticket_id: "ISS-277"
ticket_title: "Participant Profile System"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-17"
ticket_id: "ISS-277"
ticket_title: "Participant Profile System"
categories: ["database", "api", "frontend", "testing", "migrations"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/alembic/versions/0027_add_participant_profiles.py
  - backend/app/models/participant_profile.py
  - backend/app/models/participant.py
  - backend/app/schemas/participant_profile.py
  - backend/app/services/participant_profile_service.py
  - backend/app/services/response_service.py
  - backend/app/api/participant_profiles.py
  - backend/app/api/participants.py
  - backend/app/main.py
  - backend/tests/test_participant_profiles.py
  - frontend/src/types/survey.ts
  - frontend/src/services/participantProfileService.ts
  - frontend/src/components/participant-profiles/ProfileForm.tsx
  - frontend/src/components/participant-profiles/ProfileTable.tsx
  - frontend/src/components/participant-profiles/ProfileCsvImport.tsx
  - frontend/src/components/participant-profiles/AddFromProfilesDialog.tsx
  - frontend/src/pages/ParticipantProfilesPage.tsx
  - frontend/src/pages/ParticipantsPage.tsx
  - frontend/src/App.tsx
---

# Lessons Learned: Participant Profile System

## What Worked Well
- Layered backend architecture (router → service → model) made it straightforward to add a new resource without disrupting existing ones
- JSONB `attributes` and ARRAY `tags` columns gave the profile model the flexibility needed for custom metadata without schema migrations later
- Reusing existing frontend component patterns (ParticipantForm, CsvImportDialog, ParticipantTable) accelerated UI development and kept visual consistency
- Keeping `profile_id` nullable on `participants` ensured full backward compatibility — existing per-survey participants were completely unaffected
- Pre-recording warnings in the implementation plan (autogenerate pitfalls, UUID server_default, event loop scope) prevented several known failure modes before they occurred

## What Was Challenging
- The `./backend:/app` Docker volume mount masking container `.egg-info` build artifacts meant newly created modules (`participant_profile.py`, `participant_profile_service.py`) were invisible to pytest until the backend image was rebuilt
- Alembic autogenerate silently drops `server_default` and `onupdate` directives on timestamp columns, requiring fully manual migration authoring for 0027
- Coordinating auto-profile creation in the response submission path required carefully understanding the existing `response_service.py` flow to hook in without breaking existing behavior
- Keeping TypeScript types in sync with Python schemas required discipline — field-name drift between backend and frontend is easy to introduce and hard to detect without end-to-end tests

## Key Technical Insights
1. **Write migrations manually for tables with timestamps and Python-side defaults.** Autogenerate silently drops `server_default=sa.text('now()')` on `created_at`/`updated_at` and does not reproduce `onupdate`. Always hand-author migrations for new tables.
2. **Use Python-side `default=uuid.uuid4` for UUID PKs, not `server_default=gen_random_uuid()`.** The pgcrypto extension is not guaranteed to be enabled in all environments; Python-side defaults are portable and reliable.
3. **Import new models in both `alembic/env.py` and `app/models/__init__.py` before any alembic command.** Missing either one causes silent migration gaps — alembic will not error; it simply will not see the table.
4. **Run import smoke-tests after creating each new module.** `python -c "from app.models.participant_profile import ParticipantProfile"` surfaces broken imports with clean tracebacks rather than cryptic alembic or pytest errors.
5. **Catch `sqlalchemy.exc.IntegrityError` for duplicate email inserts and map to HTTP 409.** Application-level pre-checks alone are insufficient due to race conditions; the DB-level unique constraint is the authoritative guard.
6. **Use `scope="function"` for all async SQLAlchemy fixtures.** Session-scoped async fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio that surface as cryptic failures unrelated to the real cause.
7. **`SET NULL` on delete for FK relationships is the correct default when child records (participants) have independent business meaning.** Cascading delete would silently destroy survey participation history when a profile is removed.
8. **Auto-profile creation from response email is a write path side effect** — wrap it in a try/except for `IntegrityError` so a concurrent duplicate does not roll back the response submission itself.

## Reusable Patterns
- **Get-or-create by unique field:** `get_or_create_profile_by_email` — attempt insert, catch `IntegrityError`, fall back to select. Use this pattern for any upsert on a unique-constrained column.
- **Batch create with partial failure handling:** accept a list, attempt each insert individually, collect successes and failures, return both in the response body rather than failing the entire batch.
- **MSW error envelope shape:** all MSW handlers for backend endpoints must return `{detail: {code: string, message: string}}` — not `{message: '...'}` — to match the actual FastAPI error format.
- **Tag filtering with ARRAY contains:** use `sa.func.array_contains` or raw `ANY` SQL for filtering on ARRAY columns; do not attempt Python-side filtering after a full table scan.
- **Docker test command with DATABASE_URL override:** always pass `-e DATABASE_URL="postgresql+asyncpg://..."` explicitly; never rely on the container default which uses the psycopg2 scheme.

## Files to Review for Similar Tasks
- `backend/alembic/versions/0027_add_participant_profiles.py` — reference for manually authored migration with UUID PK, JSONB, ARRAY, FK with SET NULL, and correct timestamp server_defaults
- `backend/app/services/participant_profile_service.py` — reference for get-or-create pattern, IntegrityError → 409 mapping, and batch create with partial failure collection
- `backend/app/api/participant_profiles.py` — reference for router structure with require_scope, rate limiting, and UUID parsing helpers on a new resource
- `backend/tests/test_participant_profiles.py` — reference for function-scoped async fixtures, conftest helper usage, and testing SET NULL cascade behavior
- `frontend/src/components/participant-profiles/ProfileForm.tsx` — reference for create/edit modal with dynamic key-value attribute fields
- `frontend/src/components/participant-profiles/AddFromProfilesDialog.tsx` — reference for search-and-multi-select assignment dialog pattern

## Gotchas and Pitfalls
- **Rebuild backend image after adding new Python modules** when the `./backend:/app` volume mount is active — new files are present on the host but the editable install inside the container may not see them until `docker compose build backend` is run.
- **Never use `asyncio_mode` session-scoped fixtures with asyncpg** — the error message will not mention event loops; it will look like a database connection error.
- **Autogenerate is unsafe for this project's migration pattern** — always author 0027-style migrations by hand and verify `server_default`, `onupdate`, and `nullable` are correct before committing.
- **`| default('x')` in Jinja2 does not cover `None`** — use `| default('x', true)` if the variable can be `None` (not just `Undefined`).
- **Read `conftest.py` in full before writing any new test file** — helper function names (`register_and_login`, `create_survey`, etc.) and their exact signatures must be confirmed; do not assume based on naming conventions.
- **Do not pre-check for duplicate email before insert** — always go insert-first and handle `IntegrityError`; pre-checks create a TOCTOU race condition that will eventually cause 500 errors under concurrent load.
- **Tags stored as ARRAY(String) require explicit cast in some filter queries** — test tag-based filtering with multi-tag inputs early; implicit coercion behavior varies between SQLAlchemy versions.
```
