---
date: "2026-04-09"
ticket_id: "ISS-193"
ticket_title: "ISS-193: responses.status column type mismatch — ENUM in DB vs String in model"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-09"
ticket_id: "ISS-193"
ticket_title: "ISS-193: responses.status column type mismatch — ENUM in DB vs String in model"
categories: ["alembic", "postgresql", "migrations", "schema-drift"]
outcome: "success"
complexity: "low"
files_modified: ["backend/alembic/versions/0019_alter_responses_status_to_varchar.py"]
---

# Lessons Learned: ISS-193: responses.status column type mismatch — ENUM in DB vs String in model

## What Worked Well
- The fix option of adding a migration (rather than changing the model) was the right call — it avoided touching service code that already uses plain strings
- The idempotent DO $$ block pattern from migration 0018 was directly reusable here
- Using `conn.exec_driver_sql()` for raw DDL avoids asyncpg compatibility issues
- Checking `pg_attribute` joined with `pg_type` gives a reliable, side-effect-free way to detect column type before altering

## What Was Challenging
- The bug was masked for multiple rounds because earlier manual workaround SQL included `ALTER TABLE responses ALTER COLUMN status TYPE VARCHAR(20)` — making clean-migration exposure only happen after ISS-189/192 fixes landed
- The `down_revision` string must exactly match the `revision` field in migration 0018 — a mismatch silently breaks the alembic chain with no clear error pointing to the cause

## Key Technical Insights
1. Schema drift between model declarations and migration DDL can be masked by hotfix SQL and only surfaces once migrations run cleanly end-to-end — always verify model types against the actual migration that creates the column
2. When a PostgreSQL column is typed as a custom ENUM but the ORM model declares it as `String`, any INSERT/UPDATE emitting a plain string literal will fail with `column "status" is of type response_status but expression is of type character varying`
3. `ALTER TABLE responses ALTER COLUMN status TYPE VARCHAR(20) USING status::text` safely converts ENUM values to their text equivalents without data loss
4. The downgrade `USING status::response_status` cast will fail if any row contains a value not present in the ENUM — confirm all possible string values ('incomplete', 'complete', 'disqualified') are valid ENUM members before writing downgrade()
5. asyncpg does not support `CREATE TYPE IF NOT EXISTS` — but this migration only alters a column, so that pitfall does not apply; still, downgrade() must not emit unsupported syntax

## Reusable Patterns
- **Idempotent column type check:** `SELECT 1 FROM pg_attribute a JOIN pg_class c ON a.attrelid = c.oid JOIN pg_type t ON a.atttypid = t.oid WHERE c.relname = 'responses' AND a.attname = 'status' AND t.typname = 'response_status'` — wrap ALTER in DO $$ block conditional on this query returning a row
- **Raw DDL in async migrations:** always use `conn.exec_driver_sql()`, never `conn.execute(text(...))`
- **Pre-commit smoke-test:** `python -c "from app.models.response import Response"` catches import errors before alembic surfaces them as cryptic failures
- **Migration chain verification:** run `alembic history` inside Docker to confirm new migration appears correctly after its predecessor before running `alembic upgrade head`
- **Downgrade idempotency:** wrap the reverse ALTER in a similar DO $$ check to guard against failure if the ENUM type was separately dropped

## Files to Review for Similar Tasks
- `backend/alembic/versions/0018_*.py` — canonical pattern for idempotent column ALTER migrations using exec_driver_sql() and DO $$ blocks
- `backend/alembic/versions/0001_*.py` — where custom ENUMs (response_status, survey_status, etc.) are created; cross-reference when investigating column type mismatches
- `backend/alembic/versions/0010_create_participants_responses_tables.py:91` — original site of the ENUM column definition for responses.status
- `backend/app/models/response.py:37-43` — the SQLAlchemy model declaration that diverged from the migration DDL

## Gotchas and Pitfalls
- **Silent chain breaks:** a wrong `down_revision` string will not raise an error at file-creation time — only `alembic history` or `alembic upgrade head` will reveal the broken chain
- **Masked drift:** hotfix SQL that fixes a type mismatch at deploy time can hide a model/migration disagreement for many rounds; always audit model declarations against the original migration DDL, not just the current DB state
- **Downgrade cast safety:** `USING status::response_status` in downgrade will raise a PostgreSQL error if any stored value is not a valid ENUM member — validate possible values before writing the downgrade path
- **asyncpg `CREATE TYPE IF NOT EXISTS`:** not supported; use DO $$ + pg_type existence check instead (not directly relevant here but applies to any related migration that touches ENUM types)
- **Seed script as integration test:** the seed script failing is often the first signal of a clean-deploy schema issue; treat seed failures as high-priority schema integrity signals, not just data setup problems
```
