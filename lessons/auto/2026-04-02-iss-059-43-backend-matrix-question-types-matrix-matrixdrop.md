---
date: "2026-04-02"
ticket_id: "ISS-059"
ticket_title: "4.3: Backend — Matrix Question Types (matrix, matrix_dropdown, matrix_dynamic)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-059"
ticket_title: "4.3: Backend — Matrix Question Types (matrix, matrix_dropdown, matrix_dynamic)"
categories: ["backend", "database", "validation", "testing", "alembic"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/models/question.py
  - backend/app/services/question_service.py
  - backend/app/api/questions.py
  - backend/app/services/validators/matrix_validators.py
  - backend/alembic/versions/0009_add_matrix_question_types.py
  - backend/tests/test_matrix_validators.py
  - backend/tests/test_matrix_questions.py
---

# Lessons Learned: 4.3: Backend — Matrix Question Types (matrix, matrix_dropdown, matrix_dynamic)

## What Worked Well
- Modeling matrix rows as subquestions (parent_id) and columns as answer_options on the parent kept the schema clean and reused the existing parent_id pattern without requiring new tables or model fields
- Separating matrix validators into a dedicated `matrix_validators.py` file mirrored the existing `choice_validators.py` convention, making the codebase consistent and the new code easy to locate
- The two-layer test strategy (unit tests for validators + integration tests for HTTP endpoints) caught edge cases at both the pure-logic level and the full request/response level independently
- Running an import smoke-test (`python -c "from app.models.question import Question"`) before every alembic command reliably caught import issues before they caused silent migration failures

## What Was Challenging
- Alembic autogenerate cannot be trusted for check constraint updates, JSONB columns, `server_default`, or `onupdate` — manually authoring the migration for the `question_type` check constraint was necessary to avoid silent omission or incorrect DDL
- The DATABASE_URL environment default uses the psycopg2 scheme (`postgresql://`) which silently fails with asyncpg; every pytest invocation required an explicit override to `postgresql+asyncpg://`
- Session-scoped async SQLAlchemy fixtures cause asyncpg event loop mismatch errors — all integration test fixtures had to use `scope="function"`, which is non-obvious and easy to regress on
- The `column_types` JSONB field for matrix_dropdown required explicit `sa.dialects.postgresql.JSONB` in the migration DDL; autogenerate would have silently rendered it as TEXT

## Key Technical Insights
1. **Subquestion code generation** — `_generate_subquestion_code()` in question_service.py auto-generates codes in the format `{parent_code}_SQ001`, `_SQ002`, etc. Any new endpoint creating subquestions must go through this function, not assign codes directly
2. **Matrix answer formats differ per type** — `matrix` expects `{"value": {"SQ001": "A1"}}`, `matrix_dropdown` maps subquestion codes to dropdown column values, and `matrix_dynamic` expects `{"values": [{col: val}, ...]}` — these are not interchangeable and each needs a distinct validator
3. **`is_all_rows_required` enforcement** — for matrix and matrix_dropdown, the answer validator must check that every subquestion code appears in the submitted value map when this flag is true; partial answers must be rejected with a clear error
4. **matrix_dynamic range validation** — `min_rows`, `max_rows`, and `default_row_count` form an interdependent triple: `1 <= min_rows <= max_rows` and `min_rows <= default_row_count <= max_rows` must all hold; validate the full triple together rather than each field in isolation
5. **Alembic migration authoring** — for any migration touching check constraints on `question_type`, always drop the old constraint by name and recreate it with the full updated list of valid values; never rely on autogenerate to detect or update named constraints
6. **Model import registration** — new or updated models must be imported in both `alembic/env.py` AND `app/models/__init__.py`; missing either causes a silent migration gap with no error raised

## Reusable Patterns
- **Validator registry pattern**: add new question type validators to `_CHOICE_TYPE_VALIDATORS` dict in `question_service.py` keyed by question type string — this is the single registration point that wires validators into create/update flows
- **Pre-alembic smoke-test**: `python -c "from app.models.question import Question"` before every `alembic upgrade` or `alembic revision` command
- **Manually authored check constraint migration**: drop old constraint by name, recreate with updated type list using raw DDL — do not use autogenerate for this
- **Function-scoped async fixtures**: all pytest fixtures that touch the async SQLAlchemy engine or session must declare `scope="function"` to avoid asyncpg event loop errors
- **Explicit DATABASE_URL override**: `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker" pytest` on every test run in the container environment
- **Docker scope during migration work**: `docker-compose up -d postgres` only — avoids frontend stub failures (missing nginx.conf) from blocking the postgres container

## Files to Review for Similar Tasks
- `backend/app/services/validators/choice_validators.py` — canonical example of validator function signature, settings structure, and answer validation pattern to replicate for new question types
- `backend/app/services/validators/matrix_validators.py` — reference implementation for multi-field interdependent settings validation and complex answer format validation
- `backend/app/services/question_service.py` — `_CHOICE_TYPE_VALIDATORS` registry, `_generate_subquestion_code()`, and how validators are invoked during create/update
- `backend/alembic/versions/0009_add_matrix_question_types.py` — reference for manually authoring a check constraint migration with explicit JSONB columns
- `backend/tests/test_matrix_validators.py` — unit test patterns for validator functions with mocked Question/AnswerOption objects
- `backend/tests/test_matrix_questions.py` — integration test patterns for subquestion CRUD endpoints, nested response shapes, and cross-owner access rejection

## Gotchas and Pitfalls
- **Never trust autogenerate** for check constraints, `server_default`, `onupdate`, or JSONB columns — always manually inspect and patch or fully author the migration
- **JSONB must be explicit** — `sa.dialects.postgresql.JSONB` in migration DDL; autogenerate silently produces TEXT for JSONB fields
- **session-scoped async fixtures will fail** — asyncpg creates a new event loop per function; session scope causes a loop mismatch that surfaces as a cryptic RuntimeError, not an obvious fixture error
- **DATABASE_URL scheme mismatch is silent** — `postgresql://` (psycopg2) will appear to connect but fail at the async driver level; always verify the scheme is `postgresql+asyncpg://` for test runs
- **Missing model import in alembic/env.py** produces no error — the migration simply never sees the model's metadata changes; always double-check both `alembic/env.py` and `app/models/__init__.py` after any model addition
- **Subquestion endpoints must validate parent is a matrix type** — the POST subquestions endpoint must reject requests where the parent question is not one of `matrix`, `matrix_dropdown`, `matrix_dynamic`; failing to check this allows orphaned subquestions on incompatible question types
- **`is_all_rows_required` is a settings flag, not a schema constraint** — it must be enforced at answer validation time in the validator, not at the database level; easy to implement the settings field without wiring up the enforcement logic
```
