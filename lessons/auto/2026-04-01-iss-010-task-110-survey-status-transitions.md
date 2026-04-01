---
date: "2026-04-01"
ticket_id: "ISS-010"
ticket_title: "Task 1.10: Survey Status Transitions"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-010"
ticket_title: "Task 1.10: Survey Status Transitions"
categories: ["state-machine", "api-design", "fastapi", "testing", "service-layer"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/survey_service.py
  - backend/app/services/question_group_service.py
  - backend/app/services/question_service.py
  - backend/app/api/surveys.py
  - backend/tests/test_survey_transitions.py
---

# Lessons Learned: Task 1.10: Survey Status Transitions

## What Worked Well
- Centralizing the `check_survey_editable` guard in the service layer meant all callers (update_survey, create_group, update_group, create_question, update_question) got consistent 422 error shapes without duplicating logic in route handlers.
- The existing Survey model already had the status enum field with all four values (draft/active/closed/archived), so no Alembic migration was needed — verifying this upfront prevented wasted effort.
- Raising `HTTPException(status_code=422)` directly inside service helpers kept route handlers thin and enforced the invariant uniformly across all mutation paths.
- Reusing the existing function-scoped async pytest fixture pattern from conftest.py avoided event loop mismatch errors with asyncpg.
- Running import smoke-tests before modifying service files caught any circular import issues early, before test execution.

## What Was Challenging
- Guarding question_service.py required a survey lookup through the group relationship, adding an extra async DB call compared to the simpler group-level guards. This indirection needed careful handling to avoid N+1 patterns.
- Ensuring the activation check for "at least one question" correctly traversed the groups→questions relationship required verifying how the ORM loaded these associations (eager vs. lazy loading).
- The DATABASE_URL environment default uses the psycopg2 scheme, requiring a manual override on every pytest invocation — easy to forget and produces a confusing error if missed.

## Key Technical Insights
1. Service-layer guards with `HTTPException` are preferable to route-layer guards for shared invariants: every call site gets the same error shape and the logic lives in one place.
2. State machine transitions are easiest to reason about when each transition function validates its own precondition (current status) rather than relying on callers to pre-check — this makes invalid transitions impossible to slip through.
3. Activation requiring at least one question is a cross-entity validation; it must be checked at the service layer where the survey's question groups are accessible, not at the schema/validation layer.
4. asyncpg is incompatible with session-scoped async fixtures in pytest-asyncio — always use `scope='function'` for engine and session fixtures.
5. passlib 1.7.x is incompatible with bcrypt >= 4.x in this environment; any touched auth-adjacent file must use bcrypt directly (`hashpw`/`checkpw`/`gensalt`).

## Reusable Patterns
- `check_survey_editable` helper pattern: a single async function that accepts a survey ORM object and raises `HTTPException(status_code=422, detail='Survey is not editable')` if `survey.status != 'draft'`. Call it at the top of every mutation service function.
- Transition function shape: `async def activate_survey(survey_id, db) -> Survey`: fetch survey, call `check_survey_editable`, validate additional preconditions, mutate status, commit, refresh, return.
- Test structure for state machines: one test per valid transition (happy path), one test per invalid transition (wrong source status → 422), one test per business rule violation (no questions → 422), and one test per guarded mutation endpoint (PATCH/create on non-draft → 422).
- Import smoke-test before touching services: `DATABASE_URL='postgresql+asyncpg://...' python -c "from app.services.survey_service import *"` — run for each modified service file.
- Always prefix pytest with `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker'` in this environment.

## Files to Review for Similar Tasks
- `backend/app/services/survey_service.py` — canonical example of check_survey_editable helper and transition service functions.
- `backend/app/api/surveys.py` — pattern for thin route handlers that delegate all validation to service layer.
- `backend/app/services/question_group_service.py` — example of calling check_survey_editable in a child-resource service.
- `backend/app/services/question_service.py` — example of looking up a parent survey through a group relationship before calling check_survey_editable.
- `backend/tests/test_survey_transitions.py` — reference test file for state machine endpoint coverage.
- `backend/tests/conftest.py` — function-scoped async fixture pattern to reuse for any new test files.

## Gotchas and Pitfalls
- Do not use `scope='session'` or `scope='module'` for async SQLAlchemy engine fixtures — asyncpg will raise event loop mismatch errors at teardown.
- Do not import or use passlib CryptContext anywhere in this codebase — bcrypt 5.0.0 is installed and passlib 1.7.x is incompatible with it.
- Do not forget to override DATABASE_URL when running pytest locally — the environment default uses `postgresql://` (psycopg2 scheme) which asyncpg rejects.
- Do not assume a migration is unnecessary — always read the Survey model and existing migration files to confirm the status column and enum values exist before starting implementation.
- Do not place transition guards only in route handlers — if a service function is ever called directly (e.g., from another service or a background task), route-level guards will be bypassed.
- Activation must check for questions, not just question groups — an active survey with groups but no questions is semantically invalid. Verify the check traverses to the leaf level.
```
