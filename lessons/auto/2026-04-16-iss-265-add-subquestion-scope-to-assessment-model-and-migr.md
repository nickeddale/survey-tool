---
date: "2026-04-16"
ticket_id: "ISS-265"
ticket_title: "Add subquestion scope to assessment model and migration"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-265"
ticket_title: "Add subquestion scope to assessment model and migration"
categories: ["database", "sqlalchemy", "alembic", "postgresql", "api-validation"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/alembic/versions/0026_add_subquestion_scope_to_assessments.py
  - backend/app/models/assessment.py
  - backend/app/schemas/assessment.py
  - backend/app/api/assessments.py
  - backend/tests/test_assessments.py
---

# Lessons Learned: Add subquestion scope to assessment model and migration

## What Worked Well
- Following the established migration pattern from `0014b` exactly (DO $$ idempotent block) prevented ENUM-related retry failures
- The existing `question` scope implementation served as a direct structural template for `subquestion`, minimizing guesswork
- Planning both SQLAlchemy relationship updates (`question` and `subquestion`) in the same commit avoided a hard-to-diagnose `AmbiguousForeignKeysError`
- Writing the migration manually rather than relying on autogenerate ensured ENUM addition and FK column were handled correctly

## What Was Challenging
- PostgreSQL ENUM types are non-transactional: `ALTER TYPE ... ADD VALUE` cannot be rolled back. A failed mid-migration run leaves the new ENUM value in place, requiring an idempotency guard on retry.
- Two FK columns pointing to the same target table (`questions.id`) trigger SQLAlchemy's `AmbiguousForeignKeysError` at mapper configuration time — not at query time — making it easy to miss until the application boots.
- The Docker volume mount `./backend:/app` masks build artifacts, so model changes require an explicit `docker compose build backend` before running tests if the image is stale.

## Key Technical Insights
1. **ENUM idempotency guard**: Always use a `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE ...) THEN ALTER TYPE ... ADD VALUE ...; END IF; END $$;` block when adding values to a PostgreSQL ENUM. Copy the exact syntax from `0014b` — do not reconstruct from memory.
2. **Explicit `foreign_keys` on both relationships**: When a model has two FK columns targeting the same table, SQLAlchemy requires `foreign_keys=[Model.col]` on *every* relationship that references that table, not just the new one. Updating only the new relationship still raises `AmbiguousForeignKeysError`.
3. **Import smoke-test before alembic**: Run `python -c "from app.models.assessment import Assessment"` before any `alembic` command. Broken imports surface as cryptic alembic errors otherwise.
4. **Model import registration**: New or modified models must be imported in both `alembic/env.py` and `app/models/__init__.py`. Missing either causes silent migration failures.
5. **API validation symmetry**: When a scope adds new required fields (`subquestion_id`), the create *and* update endpoints both need mirrored validation logic for effective (merged) values on partial updates.

## Reusable Patterns
- **Idempotent ENUM addition**: Copy the `DO $$ ... pg_enum check` block from `0014b` verbatim for any future `assessment_scope` or other custom ENUM extension.
- **Second FK on same table**: Template for adding `subquestion_id` alongside `question_id` — declare both mapped columns, then specify `foreign_keys` explicitly on both ORM relationships.
- **Scope/field co-validation**: Pattern for API-level validation where a specific scope requires a specific set of fields: check `scope == X` → require field A and B; check `field B set` → require `scope == X`; mirror in update with effective-value merging.
- **Docker test command**: `docker compose up -d postgres && docker run --rm --network host -e DATABASE_URL="postgresql+asyncpg://survey:survey@localhost:5432/survey_test" -e JWT_SECRET=testsecret -e CORS_ORIGINS="http://localhost:3000" -v $(pwd)/backend:/app survey_tool-backend:latest python -m pytest tests/ -q`

## Files to Review for Similar Tasks
- `backend/alembic/versions/0014b_*.py` — canonical DO $$ idempotent ENUM addition block
- `backend/app/models/assessment.py` — two-FK-same-table SQLAlchemy relationship pattern
- `backend/app/api/assessments.py` — scope/field co-validation pattern for create and update
- `backend/app/schemas/assessment.py` — Literal VALID_SCOPES extension pattern

## Gotchas and Pitfalls
- **Do not use autogenerate for ENUM migrations**: `alembic revision --autogenerate` silently drops `server_default`, `onupdate`, and does not handle `ALTER TYPE ADD VALUE`. Always write manually.
- **ENUM value persists after partial failure**: If migration fails after `ADD VALUE` but before adding the column, the ENUM value is permanently in the DB. The DO $$ guard handles retries; without it you get a duplicate-value error on re-run.
- **Stale Docker image**: The bind mount `./backend:/app` means Python source is live, but if the image itself is outdated (e.g., new dependency added), tests may fail for unrelated reasons. Run `docker compose build backend` when in doubt.
- **`asyncpg` scheme required**: DATABASE_URL must use `postgresql+asyncpg://` not `postgresql://` when running tests via Docker. Using the wrong scheme causes the async driver to fail silently or with a confusing error.
- **Update both endpoints**: Scope validation added only to `create_assessment` and missed in `update_assessment` will allow invalid partial updates to bypass constraints. Always mirror validation using effective (merged existing + incoming) values.
```
