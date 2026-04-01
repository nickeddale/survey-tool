---
date: "2026-04-01"
ticket_id: "ISS-011"
ticket_title: "Task 1.11: Survey Clone and Export/Import"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-011"
ticket_title: "Task 1.11: Survey Clone and Export/Import"
categories: ["survey", "clone", "export", "import", "service-layer"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/export_service.py
  - backend/app/schemas/survey.py
  - backend/app/api/surveys.py
  - backend/tests/test_export.py
---

# Lessons Learned: Task 1.11: Survey Clone and Export/Import

## What Worked Well
- Isolating all clone/export/import logic in a dedicated `export_service.py` kept the survey service clean and the new functionality testable in isolation.
- Using question and option `code` fields (not UUIDs) in the export format produced a portable, human-readable JSON structure that survives re-import without UUID collisions.
- Python-side `uuid.uuid4()` for all cloned entity IDs avoided any dependency on the `pgcrypto` extension or server-side UUID generation.
- Defaulting the cloned title to `"{original} (Copy)"` as a parameter default kept the API simple while remaining customizable.

## What Was Challenging
- Ensuring correct parent references across all nested levels (groups → questions → subquestions → options) required careful ordering during the deep clone — children must be inserted after their parents with the newly assigned UUIDs, not the originals.
- Export required traversing the full object graph eagerly; lazy-loaded SQLAlchemy relationships must be explicitly joined or awaited before serialization or the nested structure silently truncates.
- Import validation requires checking for missing required fields at each nesting level; a top-level validity check is insufficient since malformed nested structures can pass outer schema validation.

## Key Technical Insights
1. **Clone ordering matters**: Insert parent rows before child rows. Use a two-pass approach if needed — first collect all new UUID mappings, then bulk-insert in dependency order.
2. **Eager-load before export**: Use `selectinload` or `joinedload` on all nested relationships before serializing to JSON. Accessing unloaded async relationships outside a session raises `MissingGreenlet` or returns empty collections silently.
3. **Import validation at every level**: Pydantic schema validation at the top level does not catch missing codes or invalid question types on nested items. Validate each group, question, and option explicitly and return HTTP 400 with a descriptive message on the first failure.
4. **Codes as portable keys**: Exporting by `code` rather than UUID makes the JSON re-importable across environments and database instances — UUIDs are environment-specific, codes are author-assigned and stable.
5. **Draft status is enforced in service, not schema**: The clone operation must set `status = "draft"` unconditionally in the service layer, regardless of what the caller passes, to prevent accidental promotion of cloned surveys.

## Reusable Patterns
- `export_service.py` service pattern: three focused functions (`clone_survey`, `export_survey`, `import_survey`) each accepting a `db: AsyncSession` and returning a typed schema or model — mirrors the existing survey service structure.
- Deep clone helper pattern: build a UUID-remap dict `{old_id: new_uuid4()}` for every entity level before any DB writes, then insert using the remapped IDs.
- Import validation pattern: wrap the full import body in a `try/except ValidationError` block and re-raise as `HTTPException(status_code=400)` with the Pydantic error messages surfaced to the caller.
- Pydantic v2 `model_config = ConfigDict(from_attributes=True)` on all new schemas — never use the v1 `class Config` inner class.

## Files to Review for Similar Tasks
- `backend/app/services/export_service.py` — reference implementation for clone/export/import pattern
- `backend/app/services/survey_service.py` — established async service layer conventions to follow
- `backend/app/schemas/survey.py` — `SurveyCloneRequest`, `SurveyExportResponse`, `SurveyImportRequest` schema definitions
- `backend/app/api/surveys.py` — endpoint registration for `POST /clone`, `GET /export`, `POST /import`
- `backend/tests/test_export.py` — test coverage for all three operations including negative cases

## Gotchas and Pitfalls
- **Do not reuse original UUIDs at any nesting level during clone** — even a single shared UUID between original and clone will cause FK conflicts or silent data corruption on re-import.
- **Async relationship access outside session raises silently or errors** — always eager-load the full graph within the session context before returning or serializing.
- **`status` must be hard-coded to `draft` in the service** — do not trust the caller or copy the original status; clones must always start as drafts.
- **Import of duplicate `code` values within the same survey must be rejected** — the import service should validate uniqueness of question codes within each group before writing.
- **DATABASE_URL must be overridden to `postgresql+asyncpg://` scheme for all test runs** — the environment default uses the psycopg2 scheme which is incompatible with asyncpg.
- **All async SQLAlchemy fixtures must use `scope="function"`** — session-scoped async engine fixtures cause event loop mismatch errors under pytest-asyncio.
- **Never use passlib `CryptContext`** — use `bcrypt` directly if any password hashing is needed; passlib 1.7.x is incompatible with bcrypt >= 4.x.
```
