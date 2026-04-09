---
date: "2026-04-09"
ticket_id: "ISS-194"
ticket_title: "Add question-level scope to assessments"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-09"
ticket_id: "ISS-194"
ticket_title: "Add question-level scope to assessments"
categories: ["database-migrations", "fastapi", "pydantic", "react", "assessment-scoring"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/alembic/versions/0014_add_question_scope_to_assessments.py"
  - "backend/app/models/assessment.py"
  - "backend/app/schemas/assessment.py"
  - "backend/app/api/assessments.py"
  - "backend/app/services/assessment_service.py"
  - "frontend/src/types/survey.ts"
  - "frontend/src/components/assessments/AssessmentForm.tsx"
  - "frontend/src/components/assessments/__tests__/AssessmentForm.test.tsx"
  - "backend/tests/test_assessments.py"
---

# Lessons Learned: Add question-level scope to assessments

## What Worked Well
- Mirroring the existing `group_id` validation pattern for `question_id` in the API layer made the implementation predictable and reduced review friction — symmetry between scope/id pairs is a reliable design anchor
- Pre-planning the migration around known asyncpg and PostgreSQL transaction constraints (ALTER TYPE ADD VALUE outside transactions, DO $$ idempotency blocks) prevented migration failures before they occurred
- Identifying `from __future__ import annotations` as a risk factor upfront allowed preemptive removal from the router file before adding new Pydantic fields

## What Was Challenging
- ALTER TYPE ADD VALUE in PostgreSQL cannot run inside a transaction block, which conflicts with Alembic's default transactional migration execution — requires explicit AUTOCOMMIT isolation or `op.execute('COMMIT')` before the statement
- asyncpg does not support `ALTER TYPE ... ADD VALUE IF NOT EXISTS` — the idempotency guard must use a DO $$ block checking pg_enum directly
- Alembic autogenerate silently corrupts `server_default` and `onupdate` directives on timestamp columns when it touches the assessments table — manual migration authoring was required to avoid subtle data integrity regressions
- The `compute_score` function needed a parallel `question_score_map` built alongside the existing `group_score_map`, requiring careful reading of the existing scoring logic before adding the new branch

## Key Technical Insights
1. **ALTER TYPE ADD VALUE is non-transactional in PostgreSQL.** Use `conn.exec_driver_sql()` with `execution_options(isolation_level='AUTOCOMMIT')` or precede the statement with `op.execute('COMMIT')` in the Alembic migration.
2. **asyncpg rejects `CREATE TYPE IF NOT EXISTS` and `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.** Always use `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = '...' AND enumtypid = 'assessment_scope'::regtype) THEN ALTER TYPE assessment_scope ADD VALUE '...'; END IF; END $$` via `conn.exec_driver_sql()`.
3. **`from __future__ import annotations` breaks Pydantic schema resolution in FastAPI router files that also use rate limiting with `request: Request`.** Locally-defined models become unresolvable `ForwardRef`s, causing body params to be treated as query params and returning 400 errors. Remove this import — Python 3.11+ handles `str | None` and `list[str]` natively.
4. **Alembic autogenerate silently drops `server_default` and `onupdate` on timestamp columns** when it regenerates table metadata. Always manually author migrations for tables with timestamp defaults.
5. **UUID FK columns should use Python-side `default=uuid.uuid4`**, not `server_default=gen_random_uuid()`, since pgcrypto may not be enabled in all environments.
6. **Run an import smoke-test before every alembic command:** `python -c "from app.models.assessment import AssessmentScope"` — this surfaces broken imports with clean tracebacks rather than cryptic Alembic errors.
7. **Tests involving question-scope assessments must avoid `multiple_choice` answer types** in any test path that triggers survey completion with relevance evaluation — list values in answers cause `unhashable type: 'list'` in `relevance.py:278` via `frozenset(answers.items())`.

## Reusable Patterns
- **Scope/ID symmetry pattern:** For any scoped resource (total/group/question), require the corresponding ID field when scope matches, reject it otherwise. Validate in both create and update endpoints. Mirror exactly across both handlers.
- **Idempotent enum migration via DO $$ block:** Check `pg_enum` before `ALTER TYPE ... ADD VALUE` to make migrations safely re-runnable.
- **AUTOCOMMIT for DDL:** Wrap `ALTER TYPE ADD VALUE` in a connection block with `isolation_level='AUTOCOMMIT'` via `op.get_bind().execution_options(...)`.
- **Parallel score maps in compute_score:** Build `group_score_map` and `question_score_map` together in a single pass over responses, then dispatch by assessment scope in the matching loop.
- **Frontend scope-conditional field pattern:** Use a controlled `scope` state value to conditionally render the `question_id` selector; include validation that enforces the field when scope is `'question'`.

## Files to Review for Similar Tasks
- `backend/app/api/assessments.py` — scope/id validation pattern (group_id and question_id guards)
- `backend/app/services/assessment_service.py` — `compute_score` function and score map construction
- `backend/alembic/versions/0014_add_question_scope_to_assessments.py` — AUTOCOMMIT + DO $$ migration pattern for enum extension
- `backend/app/models/assessment.py` — AssessmentScope enum and nullable FK column definition
- `frontend/src/components/assessments/AssessmentForm.tsx` — conditional field rendering based on scope value

## Gotchas and Pitfalls
- **Never use Alembic autogenerate for migrations on tables with timestamp server_defaults** — it silently removes them, causing subtle production bugs without errors at migration time
- **Missing model import in `alembic/env.py`** causes silent migration gaps with no error raised — always confirm model is imported before running any alembic command
- **`ALTER TYPE ADD VALUE` inside a transaction will raise `ALTER TYPE ... cannot run inside a transaction block`** — this is a hard PostgreSQL constraint, not an asyncpg limitation
- **asyncpg `PostgresSyntaxError` on `CREATE TYPE IF NOT EXISTS`** is easy to miss in test output if migrations run during fixture setup — always verify enum creation uses the DO $$ workaround
- **`from __future__ import annotations` interacts destructively with FastAPI + Pydantic schema resolution** — any router file using `request: Request` for rate limiting is at risk; audit all router files when adding this pattern
- **List-valued answers (multiple_choice) will crash relevance evaluation** at `frozenset(answers.items())` — use text, number, or boolean answer types in tests that traverse the completion + relevance path
```
