---
date: "2026-04-11"
ticket_id: "ISS-226"
ticket_title: "[API] POST /api/v1/surveys — Title >255 chars causes 500 (DB column mismatch)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-226"
ticket_title: "[API] POST /api/v1/surveys — Title >255 chars causes 500 (DB column mismatch)"
categories: ["database", "validation", "alembic", "pydantic", "bug-fix"]
outcome: "success"
complexity: "low"
files_modified:
  - backend/app/schemas/survey.py
  - backend/app/schemas/question_group.py
  - backend/app/schemas/quota.py
  - backend/app/models/survey.py
  - backend/app/models/question_group.py
  - backend/alembic/versions/0022_fix_title_column_lengths.py
  - backend/tests/test_surveys.py
  - backend/tests/test_question_groups.py
---

# Lessons Learned: [API] POST /api/v1/surveys — Title >255 chars causes 500 (DB column mismatch)

## What Worked Well
- The fix strategy was clearly scoped: expand DB columns to match the existing Pydantic schema (VARCHAR 255 → 500) rather than tightening the schema, preserving the intended user-facing contract.
- Manually authoring the Alembic migration (rather than relying on autogenerate) produced a clean, inspectable script with a proper downgrade path.
- Broadening the fix to cover question group titles and quota names in the same pass eliminated sibling mismatches before they surfaced as separate bugs.
- Existing tests provided a reliable baseline; targeted new tests for boundary values (256-char, 501-char) gave precise regression coverage.

## What Was Challenging
- Alembic autogenerate does not reliably detect VARCHAR length changes — it may silently emit a no-op diff even when the column definition has changed. This required manual authoring and careful review of the generated SQL.
- Running migrations inside Docker requires explicitly passing `DATABASE_URL` with the `postgresql+asyncpg://` scheme; the environment default may silently use the psycopg2 scheme and fail at runtime rather than at import time.
- The quota schema had no `max_length` constraint at all, meaning the same class of bug was latent there without a visible schema/model discrepancy to trigger investigation.

## Key Technical Insights
1. Schema-DB mismatches of this kind (Pydantic allows N chars, column only stores M < N) produce a 500 rather than a 422 because the invalid value passes all application-level validation and only fails inside the database engine. The error is a `DataError` from PostgreSQL, not a Pydantic `ValidationError`.
2. `op.alter_column(table, column, existing_type=sa.String(255), type_=sa.String(500), nullable=False)` is the correct Alembic pattern for changing VARCHAR length in place — no table recreation is required in PostgreSQL.
3. ENUM types in PostgreSQL are non-transactional. If a migration fails mid-flight after creating or altering an ENUM, retry logic must account for the type already partially existing.
4. Autogenerate in Alembic inspects the live DB schema against the ORM metadata. If the model file is not imported in `alembic/env.py` and `app/models/__init__.py`, the table is invisible to autogenerate and the mismatch is silently ignored.
5. Running an import smoke-test (`python -c "from app.models.survey import Survey; ..."`) inside Docker before any `alembic` command surfaces broken imports with clean tracebacks, avoiding cryptic Alembic errors.

## Reusable Patterns
- **Manual migration for column length changes**: Always hand-author `op.alter_column()` calls for VARCHAR length changes. Never trust autogenerate to detect or correctly render them.
- **Smoke-test imports before alembic**: `python -c "from app.models.<model> import <Model>"` inside the Docker container before every `alembic upgrade` or `alembic check`.
- **Boundary test triplet**: For any string field with a max_length constraint, add three tests — at exactly the limit (expect success), one over the limit (expect 422), and one well over (expect 422). This catches both schema-level and DB-level enforcement gaps.
- **Scope `docker compose up` to `postgres` only** during migration work: `docker compose up -d postgres` avoids unrelated service failures blocking progress.
- **Always pass `DATABASE_URL` explicitly** in Docker test commands using the `postgresql+asyncpg://` scheme — never rely on the environment default.
- **Audit sibling fields when fixing one mismatch**: If `surveys.title` is mismatched, check `question_groups.title`, `quotas.name`, and any other String(255) columns whose schemas claim a higher max_length.

## Files to Review for Similar Tasks
- `backend/app/schemas/survey.py` — canonical example of `max_length` on title fields
- `backend/app/schemas/quota.py` — example of adding missing `max_length` to prevent unvalidated DB writes
- `backend/alembic/versions/0022_fix_title_column_lengths.py` — reference implementation for `op.alter_column()` VARCHAR length migration with downgrade path
- `backend/tests/test_surveys.py` — boundary value test patterns for string length validation
- `backend/tests/test_question_groups.py` — equivalent patterns for group title validation

## Gotchas and Pitfalls
- **Autogenerate silently omits VARCHAR length changes.** Do not run `alembic revision --autogenerate` for this class of change; always write the migration by hand and verify the emitted SQL.
- **`postgresql://` vs `postgresql+asyncpg://`**: Using the wrong scheme does not fail at import time — it fails at the first async DB call, producing a confusing runtime error unrelated to the actual problem.
- **Missing model imports in `alembic/env.py` cause silent misses**: The table will not appear in autogenerate output at all, masking the mismatch entirely.
- **ENUM non-transactionality**: A failed migration that touched an ENUM may leave the type in a partially altered state. Subsequent retries must handle `DuplicateObject` or `AlreadyExists` errors gracefully.
- **Do not scope fixes only to the reported field**: The same VARCHAR(255)/max_length=500 pattern can exist across multiple models. A fix that only touches the reported column leaves sibling bugs in place.
- **`alembic check` before `alembic upgrade head`**: Running `alembic check` inside Docker after writing the migration confirms syntax validity and that the revision is detected before committing to the upgrade.
```
