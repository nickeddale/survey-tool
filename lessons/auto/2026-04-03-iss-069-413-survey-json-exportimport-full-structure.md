---
date: "2026-04-03"
ticket_id: "ISS-069"
ticket_title: "4.13: Survey JSON Export/Import (Full Structure)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-069"
ticket_title: "4.13: Survey JSON Export/Import (Full Structure)"
categories: ["export-import", "backend", "testing", "database", "survey-structure"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/app/services/export_service.py", "backend/app/api/surveys.py", "backend/tests/test_export.py"]
---

# Lessons Learned: 4.13: Survey JSON Export/Import (Full Structure)

## What Worked Well
- Existing export_service.py (482 lines) provided a solid foundation; the task was auditing and patching gaps rather than building from scratch
- Using codes (not UUIDs) as portability keys for export payloads made round-trip comparison straightforward — stripping UUIDs and timestamps left a stable structural diff
- Wrapping the entire import_survey() in a single `async with session.begin()` context manager gave atomic all-or-nothing semantics with minimal boilerplate
- Python-side `default=uuid.uuid4` for UUID PKs avoided pgcrypto dependency issues entirely

## What Was Challenging
- Auditing all 18 question types for field completeness required careful cross-referencing against the Question model — easy to miss edge-case fields like `assessment_value` on answer options or `relevance` on subquestions
- Round-trip fidelity tests are sensitive to field ordering and None vs. missing key distinctions; normalizing both exports to a canonical form (sorted lists, omit None values) before comparison was essential
- Async SQLAlchemy fixture scoping: session-scoped async fixtures silently cause event loop mismatch errors with asyncpg — must use `scope="function"` everywhere

## Key Technical Insights
1. Never use `server_default=gen_random_uuid()` for UUID PKs on records created during import — pgcrypto extension may not be enabled. Always use Python-side `default=uuid.uuid4`.
2. Atomic import transactions require `async with session.begin()` wrapping the entire operation. Any exception (invalid question_type, constraint violation, missing required field) automatically rolls back all previously created records in that transaction.
3. The DATABASE_URL container default uses the psycopg2 scheme which silently fails with the async engine. Always override: `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker"` before pytest runs.
4. All async engine/session fixtures in conftest.py must use `scope="function"`, not `scope="session"` — session scope causes event loop mismatch errors with asyncpg under pytest-asyncio.
5. Round-trip structural comparison must ignore UUIDs, timestamps, and insertion-order artifacts. Normalize both export payloads (sort answer_options by code, sort subquestions by code, omit None fields) before asserting equality.
6. Run an import smoke-test before executing the full test suite: `python -c "from app.services.export_service import export_survey, import_survey"` — surfaces broken imports with clean tracebacks rather than cryptic test failures.

## Reusable Patterns
- **Atomic import pattern**: `async with session.begin(): [create survey, groups, questions, subquestions, options]` — exception in any step rolls back everything
- **UUID PK pattern for new records**: model field defined as `Column(UUID, primary_key=True, default=uuid.uuid4)`, no server_default
- **Round-trip comparison pattern**: export → strip UUIDs/timestamps → sort lists by stable code key → deep-equal both payloads
- **Smoke-test pattern before tests**: `python -c "from app.services.X import Y"` to validate imports cleanly
- **Test fixture pattern**: all async DB fixtures at `scope="function"`; prepend `DATABASE_URL=postgresql+asyncpg://...` to pytest invocation

## Files to Review for Similar Tasks
- `backend/app/services/export_service.py` — reference implementation for survey export/import with all 18 question types
- `backend/tests/test_export.py` — round-trip fidelity test pattern covering full survey structure
- `backend/app/api/surveys.py` — export/import endpoint wiring (GET /surveys/{id}/export, POST /surveys/import)
- `backend/conftest.py` — async fixture scope patterns (function-scoped engine/session)

## Gotchas and Pitfalls
- **Missing `assessment_value` on answer options**: easy to overlook during export serialization; must be explicitly included even when None so import can reconstruct faithfully
- **Subquestion parent remapping**: during import, subquestions reference their parent by code within the payload — must remap to new UUID PKs after parent questions are created, before inserting subquestions
- **Auto-generated codes**: if import payload omits codes, auto-generate them deterministically (e.g., `Q{n}`, `SQ{n}`, `A{n}`) rather than randomly, so partial re-imports produce predictable structures
- **passlib is broken with bcrypt >= 4.x**: do not use passlib CryptContext anywhere; use `bcrypt.hashpw/checkpw/gensalt` directly
- **Partial failure leaves orphaned records without transactions**: any import logic that creates records outside a single transaction block risks partial survey creation on failure — always wrap the full creation sequence in one `session.begin()` context
- **psycopg2 scheme silently fails**: the container DATABASE_URL default must be overridden to asyncpg scheme for every test run; there is no runtime error at import time, only failures when queries execute
```
