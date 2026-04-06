---
date: "2026-04-06"
ticket_id: "ISS-112"
ticket_title: "Add survey versioning (version field + history)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-112"
ticket_title: "Add survey versioning (version field + history)"
categories: ["database", "alembic", "sqlalchemy", "api", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/survey.py
  - backend/app/schemas/survey.py
  - backend/app/services/survey_service.py
  - backend/app/api/surveys.py
  - backend/alembic/versions/0016_add_survey_versioning.py
  - backend/tests/test_surveys.py
  - backend/alembic/env.py
  - backend/app/models/__init__.py
---

# Lessons Learned: Add survey versioning (version field + history)

## What Worked Well
- Breaking the task into distinct layers (model → migration → schema → service → API → tests) prevented regressions and made each step verifiable in isolation
- Consulting prior lessons from ISS-004 and ISS-005 upfront identified all known Alembic pitfalls before touching a single file
- Manually authoring the Alembic migration (rather than using autogenerate) ensured correct DDL for JSONB and server_default timestamps from the start
- Mocking `dispatch_webhook_event` at the call-site module (`app.services.survey_service`) avoided background-task event loop failures in tests without any fixture gymnastics

## What Was Challenging
- Alembic autogenerate would silently produce incorrect DDL (TEXT instead of JSONB for the snapshot column, missing `server_default` on `created_at`) — requires discipline to always manually author migrations for tables with these column types
- Ensuring the `SurveyVersion` model was imported in *both* `alembic/env.py` and `app/models/__init__.py` before any `alembic` command; missing either import causes silent table omission with no error raised
- Coordinating the snapshot capture in `update_survey()` — the snapshot must be taken *before* applying changes to the survey, not after, to represent the pre-update state accurately

## Key Technical Insights
1. **JSONB columns require explicit DDL typing.** Use `sa.dialects.postgresql.JSONB` in migration DDL. Alembic autogenerate may fall back to TEXT, which is schema-valid but loses PostgreSQL JSONB indexing and operator support.
2. **`server_default` is silently dropped by autogenerate.** Timestamp columns with `server_default=sa.text('now()')` must be manually specified in the migration; autogenerate omits this directive.
3. **New models need dual registration.** Any new SQLAlchemy model (`SurveyVersion`) must be imported in both `alembic/env.py` (for migration target metadata) and `app/models/__init__.py` (for `Base.metadata.create_all` in tests). Missing either causes silent failures.
4. **Snapshot ordering matters in service logic.** In `update_survey()`, insert the `SurveyVersion` snapshot row capturing the *current* state before applying field updates, then increment `survey.version`. Inverting this order stores the post-update state as the snapshot, defeating version history.
5. **asyncpg does not support `CREATE TYPE IF NOT EXISTS`.** No new ENUM types were introduced in this ticket, but if any related type changes are added later, use the `DO $$ BEGIN IF NOT EXISTS ... END $$` workaround via `conn.exec_driver_sql()`.
6. **Import smoke-test before running Alembic.** Run `python -c 'from app.models.survey import SurveyVersion'` before any `alembic upgrade` to surface import errors as clean tracebacks rather than cryptic Alembic runtime failures.

## Reusable Patterns
- **Manually authored Alembic migration template for JSONB + timestamp tables:**
  ```python
  import sqlalchemy.dialects.postgresql as pg
  op.create_table(
      'survey_versions',
      sa.Column('id', sa.Integer(), primary_key=True),
      sa.Column('survey_id', sa.Integer(), sa.ForeignKey('surveys.id'), nullable=False),
      sa.Column('version', sa.Integer(), nullable=False),
      sa.Column('snapshot', pg.JSONB(), nullable=False),
      sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
  )
  op.add_column('surveys', sa.Column('version', sa.Integer(), server_default='1', nullable=False))
  ```
- **Dual-import checklist for new models:** Before any `alembic` command, verify the model class appears in both `alembic/env.py` (`from app.models.survey import SurveyVersion`) and `app/models/__init__.py`.
- **Webhook mock placement for update paths:** Always patch at `app.services.survey_service.dispatch_webhook_event`, not at the webhook service internals, to avoid background `asyncio.create_task` event loop mismatches.
- **Version increment pattern in service layer:**
  ```python
  # 1. Snapshot current state BEFORE changes
  snapshot = {field: getattr(survey, field) for field in tracked_fields}
  db.add(SurveyVersion(survey_id=survey.id, version=survey.version, snapshot=snapshot))
  # 2. Apply updates
  for key, value in update_data.items():
      setattr(survey, key, value)
  # 3. Increment version
  survey.version += 1
  ```

## Files to Review for Similar Tasks
- `backend/alembic/versions/0016_add_survey_versioning.py` — reference for manually authored JSONB + FK + server_default migration
- `backend/app/models/survey.py` — SurveyVersion model definition alongside Survey; shows relationship and JSONB column declaration
- `backend/app/services/survey_service.py` — snapshot-before-update pattern in `update_survey()`
- `backend/app/api/surveys.py` — paginated history endpoint pattern (`GET /surveys/{id}/versions`)
- `backend/tests/test_surveys.py` — versioning test structure: creation baseline, patch increment, snapshot content assertion, history ordering

## Gotchas and Pitfalls
- **Never use `--autogenerate` for migrations involving JSONB columns or `server_default` timestamps.** Always manually author and inspect the DDL before applying.
- **Silent table omission with no error.** If `SurveyVersion` is missing from `alembic/env.py`, the table simply won't appear in the migration diff and no error is raised — the bug surfaces only at runtime when the table doesn't exist.
- **Snapshot must precede field mutation.** Capturing the survey snapshot after `setattr` calls records the new state, not the historical one — the snapshot insert must come first.
- **`conn.exec_driver_sql()` not `conn.execute(text(...))` for raw DDL** in SQLAlchemy async context when working around asyncpg limitations.
- **`version` column `server_default` in migration vs. `default` in model.** Use `server_default='1'` in the Alembic DDL for existing rows; use `default=1` in the SQLAlchemy column definition for new Python-side inserts. Both are needed.
- **Test event loop scope.** All async fixtures in `conftest.py` must use `scope='function'` — a session-scoped async engine will bind to the first event loop and fail on subsequent tests that create new loops.
```
