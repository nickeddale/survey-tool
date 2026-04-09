---
date: "2026-04-09"
ticket_id: "ISS-192"
ticket_title: "ISS-192: Migration 0013 still fails — assessment_scope enum conflict"
categories: ["testing", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-09"
ticket_id: "ISS-192"
ticket_title: "ISS-192: Migration 0013 still fails — assessment_scope enum conflict"
categories: ["alembic", "postgresql", "migrations", "enum-types"]
outcome: "success"
complexity: "low"
files_modified: ["backend/alembic/versions/0013_create_assessments_table.py"]
---

# Lessons Learned: ISS-192: Migration 0013 still fails — assessment_scope enum conflict

## What Worked Well
- The fix pattern established in ISS-189 (0012) transferred directly to 0013 with no surprises
- Reading 0001 first to confirm canonical enum values resolved the discrepancy noted in the ticket description before any code was changed
- The single-import + single-replacement change kept the diff minimal and reviewable

## What Was Challenging
- The ticket problem description listed incorrect enum values (`'question','group','survey'`) while the actual migration used `'total','group'` — required reading 0001 to resolve before proceeding
- The bug is a recurring pattern: each migration that references an enum created in 0001 must be audited individually; there is no automated check that catches `sa.Enum(...)` vs `ENUM(...)` misuse at authoring time

## Key Technical Insights
1. `sa.Enum(create_type=False)` does NOT reliably suppress `CREATE TYPE` during `op.create_table` on PostgreSQL — the generic SQLAlchemy Enum can still emit DDL on some code paths
2. `ENUM(create_type=False)` from `sqlalchemy.dialects.postgresql` is the only safe suppression mechanism for enums pre-created in an earlier migration
3. asyncpg does not support `CREATE TYPE IF NOT EXISTS` — any attempt throws `PostgresSyntaxError`; `ENUM(create_type=False)` is the canonical workaround
4. Enum values in downstream migrations must match exactly what was defined in 0001 — there is no runtime enforcement until the migration runs against a real database

## Reusable Patterns
- **PostgreSQL enum in Alembic (pre-existing type):** always use `from sqlalchemy.dialects.postgresql import ENUM` and `ENUM('val1', 'val2', name='type_name', create_type=False)` — never `sa.Enum(..., create_type=False)`
- **Before editing any migration referencing an enum:** read 0001 first to confirm canonical values match what the migration currently uses
- **Pre-migration smoke test:** run `python -c "from app.database import engine"` inside Docker before any `alembic` command to surface import errors with clean tracebacks
- **Full round-trip test:** always run `alembic downgrade base && alembic upgrade head`, not just an incremental upgrade from current state

## Files to Review for Similar Tasks
- `backend/alembic/versions/0001_initial_extensions_and_enums.py` — canonical source of truth for all custom enum types and their values
- `backend/alembic/versions/0012_create_quotas_table.py` — reference implementation of `ENUM(create_type=False)` pattern
- `backend/alembic/versions/0013_create_assessments_table.py` — the fixed migration; review as a second confirmed example of the pattern

## Gotchas and Pitfalls
- Ticket descriptions can contain stale or incorrect enum values copied from earlier drafts — always verify against 0001 before implementing
- Every future migration that uses a pre-existing enum type must use the dialect-specific `ENUM(create_type=False)` — `sa.Enum` with the same flag is not equivalent and will cause `type already exists` failures on clean deploys
- Running `alembic upgrade head` on an already-migrated database can mask this bug; the failure only appears on a fresh (empty) database
- There is no linting or CI check that enforces `ENUM` over `sa.Enum` for pre-existing types — this is a manual convention that must be communicated to all contributors touching migrations
```
