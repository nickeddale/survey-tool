---
date: "2026-04-01"
ticket_id: "ISS-024"
ticket_title: "1.11: Survey Clone and Export/Import"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-024"
ticket_title: "1.11: Survey Clone and Export/Import"
categories: ["survey", "clone", "export-import", "fastapi", "async-sqlalchemy"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/api/surveys.py
  - backend/app/services/export_service.py
  - backend/app/services/survey_service.py
  - backend/app/schemas/survey.py
  - backend/tests/test_export.py
---

# Lessons Learned: 1.11: Survey Clone and Export/Import

## What Worked Well
- Two-pass approach for cloning subquestions: first pass creates all top-level questions with new UUIDs, second pass remaps `parent_id` to new UUIDs — this cleanly avoids FK violations and broken parent references.
- Separating export/clone/import logic into a dedicated `export_service.py` kept `survey_service.py` focused and made the new functions easy to test in isolation.
- Pydantic schema-layer validation for import caught missing/invalid fields early and mapped `ValidationError` to HTTP 400 in the endpoint, keeping the service layer clean.
- Using `uuid.uuid4()` Python-side for all new UUIDs during clone/import avoided any dependency on `gen_random_uuid()` or the `pgcrypto` extension.
- Running an import smoke-test (`python -c "from app.services.export_service import clone_survey, export_survey, import_survey"`) after each implementation step surfaced broken imports before they became cryptic test or alembic errors.

## What Was Challenging
- Remapping all foreign keys (`group_id`, `parent_id`, `question_id`) during deep clone required careful tracking of old-to-new UUID mappings across groups, questions, and answer options — a missed remap produces silent data corruption rather than an obvious error.
- Ensuring the export schema structurally excluded internal UUIDs (not just marked them optional) required deliberate schema design; relying on optional field omission is insufficient and misleading.
- The environment `DATABASE_URL` defaults to the psycopg2 scheme, which silently fails with the async engine — this required a manual override on every local test run.

## Key Technical Insights
1. **Two-pass clone for subquestions is mandatory**: A single-pass clone of questions with `parent_id` references will produce FK violations or broken parent links. Always collect all new question UUIDs in the first pass before assigning `parent_id` in the second pass.
2. **Export portability requires structural schema separation**: Use distinct output schemas that never include UUID fields — do not rely on `Optional` field omission. Code values (not UUIDs) must be the only identifiers in the exported JSON.
3. **Import validation belongs at the Pydantic layer**: Validate required fields (title, groups/questions structure, question codes and types) via schema, then catch `ValidationError` in the endpoint and return HTTP 400. Keep the service layer free of HTTP concerns.
4. **Python-side UUID generation is safer than server-side**: `uuid.uuid4()` in Python requires no DB extensions and works identically across clone and import flows.
5. **Async fixture scope must be `function`**: Session-scoped async SQLAlchemy engine fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio. Always use `scope="function"`.

## Reusable Patterns
- **Function-scoped async engine fixture**:
  ```python
  @pytest_asyncio.fixture(scope="function")
  async def db_engine():
      engine = create_async_engine(DATABASE_URL, ...)
      async with engine.begin() as conn:
          await conn.run_sync(Base.metadata.create_all)
      yield engine
      await engine.dispose()
  ```
- **Import smoke-test**: `python -c "from app.services.export_service import clone_survey, export_survey, import_survey"`
- **UUID generation for cloned entities**: `new_id = uuid.uuid4()` — never `gen_random_uuid()` server_default.
- **DATABASE_URL override for local tests**: `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker" pytest`
- **Old-to-new UUID mapping dict for deep clone**:
  ```python
  group_map = {}  # old_uuid -> new_uuid
  question_map = {}
  for group in original.groups:
      new_id = uuid.uuid4()
      group_map[group.id] = new_id
      # ... create new group with new_id
  ```

## Files to Review for Similar Tasks
- `backend/app/services/export_service.py` — canonical pattern for deep-copy clone with FK remapping, portable export serialization, and validated import.
- `backend/app/api/surveys.py` — endpoint wiring for clone/export/import, including Pydantic `ValidationError` → HTTP 400 mapping.
- `backend/app/schemas/survey.py` — `SurveyCloneRequest`, `SurveyExportResponse`, `SurveyImportRequest` schema designs; reference for structurally excluding UUIDs from export responses.
- `backend/tests/test_export.py` — function-scoped async fixture pattern and test coverage for clone, export, and import including validation error cases.

## Gotchas and Pitfalls
- **Single-pass subquestion clone causes FK violations**: Always do a two-pass clone — first pass for top-level questions, second pass for `parent_id` remapping.
- **Optional field omission is not structural exclusion**: An export schema with `Optional[UUID]` fields will still serialize UUIDs if present. Define a separate export schema that does not include UUID fields at all.
- **psycopg2 scheme in DATABASE_URL**: The environment default is `postgresql://...` (psycopg2), which silently fails with the async engine. Override to `postgresql+asyncpg://...` for every local test run — this is not surfaced as a clear connection error.
- **Broken imports surface as cryptic alembic errors**: Any import error inside `export_service.py` will appear as an opaque alembic failure. Run the import smoke-test after each implementation step, before running migrations or tests.
- **Missing FK remap causes silent data corruption**: A cloned survey with an unmapped `group_id` or `parent_id` will point to the original survey's entities — no error is raised, but the clone is structurally broken. Verify all FK maps are complete before committing cloned rows.
```
