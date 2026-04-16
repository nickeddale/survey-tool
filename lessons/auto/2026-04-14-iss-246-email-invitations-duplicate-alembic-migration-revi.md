---
date: "2026-04-14"
ticket_id: "ISS-246"
ticket_title: "Email invitations: Duplicate Alembic migration revision IDs (0014, 0023)"
categories: ["testing", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-14"
ticket_id: "ISS-246"
ticket_title: "Email invitations: Duplicate Alembic migration revision IDs (0014, 0023)"
categories: ["alembic", "database-migrations", "postgresql", "check-constraints"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/alembic/versions/0014b_add_question_scope_to_assessments.py"
  - "backend/alembic/versions/0015_add_translations_jsonb_columns.py"
  - "backend/alembic/versions/0024_rename_number_to_numeric_question_type.py"
  - "backend/alembic/versions/0025_add_reminder_count_to_email_invitations.py"
---

# Lessons Learned: Email invitations: Duplicate Alembic migration revision IDs (0014, 0023)

## What Worked Well
- Renaming files with a `b` suffix (0014b) cleanly resolved the duplicate without disrupting the rest of the chain
- Renumbering subsequent migrations sequentially (0023→0024, 0024→0025) maintained a readable, predictable naming convention
- The fix-order pattern for check constraint migrations (drop → update data → recreate) was well-documented in prior lessons and applied directly

## What Was Challenging
- Duplicate revision IDs surface only at runtime as a cryptic "Multiple head revisions" error — there is no static analysis that catches this at commit time
- Stale `.pyc` files in `__pycache__` caused alembic to load old migration logic even after files were renamed, making it appear the fix had not taken effect
- The check constraint violation during the rename migration was non-obvious: the constraint rejection happens at the `UPDATE` statement level before any schema changes, so the error message does not clearly point to the constraint as the cause
- The `down_revision` pointer in 0015 had to be updated manually; it is easy to miss intermediate files that reference a renamed revision ID

## Key Technical Insights
1. Alembic identifies migrations by the `revision` string inside the file, not the filename — renaming the file alone does nothing; the `revision` field must also be updated.
2. A check constraint containing `'number'` will reject `UPDATE questions SET question_type='numeric'` before the constraint is modified, causing a silent-looking integrity error. The correct order is always: drop constraint → update data → recreate constraint with new allowed values.
3. The `downgrade()` must mirror this in reverse: drop new constraint → update data back → recreate old constraint. A broken downgrade blocks future rollbacks and is easy to skip if only `upgrade` is tested.
4. `alembic heads` is the fast diagnostic: if it returns more than one line, the chain is broken regardless of what individual files look like.
5. Stale `.pyc` files in `alembic/versions/__pycache__` must be deleted after renaming migration files; otherwise alembic may load the old module under the old name and ignore the new file entirely.
6. Any migration that touches `down_revision` of a renamed revision must be found and updated — grep the entire `versions/` directory for the old revision string before declaring the fix complete.

## Reusable Patterns
- **Pre-alembic smoke-test:** `python -c 'from app.models import *'` — catches broken imports as clean tracebacks rather than cryptic alembic errors.
- **Chain validation before upgrade:** Always run `alembic heads` first; proceed to `alembic upgrade head` only when a single head is confirmed.
- **Check constraint + data migration order (upgrade):** `op.drop_constraint(name)` → `op.execute("UPDATE ...")` → `op.create_check_constraint(name, ...)`.
- **Check constraint + data migration order (downgrade):** `op.drop_constraint(name)` → `op.execute("UPDATE ...")` → `op.create_check_constraint(name, ...)` with original values.
- **Full round-trip test:** After `alembic upgrade head` succeeds, run `alembic downgrade base` then `alembic upgrade head` again to validate the entire chain in both directions.
- **After renaming migration files:** Delete `alembic/versions/__pycache__/` before any alembic command to avoid stale module loading.
- **Find all down_revision references:** `grep -r "down_revision" alembic/versions/` filtered by the old revision ID to catch any files not listed in the implementation plan.

## Files to Review for Similar Tasks
- `backend/alembic/versions/0014b_add_question_scope_to_assessments.py` — example of a `b`-suffix rename to resolve a duplicate revision ID
- `backend/alembic/versions/0015_add_translations_jsonb_columns.py` — example of updating `down_revision` in an intermediate migration after a rename
- `backend/alembic/versions/0024_rename_number_to_numeric_question_type.py` — canonical example of the drop-constraint → update-data → recreate-constraint pattern with both `upgrade()` and `downgrade()` correctly authored

## Gotchas and Pitfalls
- **Filename ≠ revision ID:** Alembic does not derive the revision from the filename. Renaming without editing the `revision` field inside the file leaves the duplicate intact.
- **Stale pyc files:** `__pycache__` entries for old filenames persist after rename and can cause alembic to load the wrong module. Always wipe `__pycache__` after any migration file rename.
- **Missed down_revision pointers:** Any migration not in the implementation plan may still reference the old revision ID as its `down_revision`. A grep across the entire `versions/` directory is mandatory before testing.
- **Check constraint blocks UPDATE silently:** The integrity error from a check constraint violation during a data migration does not mention the constraint by name in all PostgreSQL versions. The root cause is easy to misdiagnose as a type mismatch.
- **Autogenerate is unreliable for data migrations:** Do not use `alembic revision --autogenerate` for migrations involving check constraints or data transforms. Manually author both `upgrade()` and `downgrade()`.
- **DATABASE_URL scheme:** Must be `postgresql+asyncpg://` for async SQLAlchemy. A plain `postgresql://` URL produces a confusing driver error, not a clear scheme mismatch.
- **Downgrade neglect:** It is tempting to verify only `upgrade`. A downgrade that fails blocks future rollbacks and may not be caught until production. Always test the full round-trip.
```
