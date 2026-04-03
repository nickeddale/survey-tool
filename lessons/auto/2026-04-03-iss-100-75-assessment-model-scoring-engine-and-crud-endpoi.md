---
date: "2026-04-03"
ticket_id: "ISS-100"
ticket_title: "7.5: Assessment Model, Scoring Engine, and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-100"
ticket_title: "7.5: Assessment Model, Scoring Engine, and CRUD Endpoints"
categories: ["assessment", "scoring-engine", "crud", "alembic", "sqlalchemy", "fastapi"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/models/assessment.py
  - backend/app/models/__init__.py
  - backend/app/schemas/assessment.py
  - backend/app/api/assessments.py
  - backend/app/services/assessment_service.py
  - backend/app/main.py
  - backend/alembic/versions/0013_create_assessments_table.py
  - backend/alembic/env.py
---

# Lessons Learned: 7.5: Assessment Model, Scoring Engine, and CRUD Endpoints

## What Worked Well
- Pre-flight warnings in the implementation plan accurately identified all critical pitfalls (ENUM duplication, autogenerate hazards, missing imports) before they could cause runtime failures.
- The pattern of running an import smoke-test (`python -c "from app.models.assessment import Assessment"`) before any Alembic command surfaced broken imports as clean tracebacks rather than cryptic migration errors.
- Reusing `create_type=False` for the pre-existing `assessment_scope` ENUM (defined in `0001_initial_extensions_and_enums.py`) prevented `DuplicateObject` errors without requiring schema inspection at runtime.
- Declaring all SQLAlchemy relationships with `lazy='raise'` caught accidental implicit lazy-load attempts at the ORM layer immediately, forcing correct `selectinload`/`joinedload` usage throughout.
- Ownership enforcement via a single JOIN query (`WHERE assessments.id = :id AND surveys.user_id = :user_id`) prevented resource-existence information leaks without a fetch-then-check pattern.

## What Was Challenging
- Confirming the correct FK target for `group_id` required careful exploration of existing migrations and models before implementation could begin — the ticket description was ambiguous between `question_groups` and a separate `groups` table.
- Verifying that `answer_options.assessment_value` existed as a DECIMAL/NUMERIC column required explicit pre-implementation exploration rather than assumption.
- Manually authoring the Alembic migration to preserve `server_default=sa.text('now()')` on DateTime columns required discipline; autogenerate would have silently dropped these defaults.
- Ensuring the Assessment model import was added to both `alembic/env.py` AND `app/models/__init__.py` — missing either causes a silent migration gap with no error raised.
- Designing the scoring engine to correctly handle scope=group (filtering only answer_options for questions belonging to the target `group_id`) required careful query construction with explicit eager loading.

## Key Technical Insights
1. The `assessment_scope` ENUM (`total`, `group`) was pre-created in `0001_initial_extensions_and_enums.py`. Always use `postgresql.ENUM('total', 'group', name='assessment_scope', create_type=False)` in subsequent migrations; never recreate it, and never drop it in downgrade.
2. Never use `alembic revision --autogenerate` in this project. It silently drops `server_default=sa.text('now()')` on DateTime columns and may render JSONB columns as TEXT. Always manually author migration DDL.
3. Async SQLAlchemy will raise `MissingGreenlet` if any relationship is traversed without explicit eager loading. Declaring `lazy='raise'` on all relationships converts silent bugs into immediate, actionable errors.
4. Multiple assessment rules can match a single score (overlapping ranges are allowed by design). The scoring engine must return all rules where `min_score <= computed_score <= max_score`, not just the first match.
5. The scoring engine must load ResponseAnswer records and their associated AnswerOption records using explicit `selectinload` chains — never rely on relationship traversal without eager loading in an async context.
6. Paginated list endpoints require a separate `SELECT COUNT(*) WHERE ...` query for the total count. Never use `len(results)` on a limited result page, as it will return at most `per_page` rather than the true total.
7. All async pytest fixtures must use `scope='function'`. Session-scoped async SQLAlchemy engines cause event loop mismatch errors with asyncpg under pytest-asyncio.

## Reusable Patterns
- **UUID PK (Python-side default):** `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — no pgcrypto dependency required.
- **Timestamp migration DDL:** `sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)` — always specify explicitly, never rely on autogenerate.
- **Pre-existing ENUM reuse:** `postgresql.ENUM('total', 'group', name='assessment_scope', create_type=False)` — omit from downgrade if the ENUM predates this migration.
- **Import smoke-test before Alembic:** `python -c "from app.models.assessment import Assessment"` — run before every `alembic upgrade` command.
- **Dual model registration:** Add new model import to BOTH `alembic/env.py` AND `app/models/__init__.py` before any Alembic command.
- **Ownership enforcement:** Single-query JOIN pattern: `WHERE assessments.id = :id AND surveys.user_id = :user_id` — never fetch-then-check.
- **Pydantic v2 schema config:** `model_config = ConfigDict(from_attributes=True)` — never use inner `class Config`.
- **Scoring engine scope handling:** For `scope=group`, filter `ResponseAnswer` records to only those whose `Question.group_id` matches the assessment's `group_id` before summing `assessment_value`.
- **Test DATABASE_URL override:** Always override to `postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker` for async test runs — the container default uses psycopg2 scheme, which silently fails with async engine.
- **Overlapping range matching:** `WHERE min_score <= :score AND max_score >= :score` — returns all matching assessment rules, not just one.

## Files to Review for Similar Tasks
- `backend/alembic/versions/0001_initial_extensions_and_enums.py` — source of truth for pre-existing ENUMs; check here before any migration that references a named ENUM.
- `backend/alembic/versions/0013_create_assessments_table.py` — reference implementation for manually authored migration with pre-existing ENUM, DECIMAL columns, and indexed FKs.
- `backend/app/models/assessment.py` — reference for UUID PK, ENUM column, DECIMAL columns, nullable FK, and `lazy='raise'` relationships.
- `backend/app/services/assessment_service.py` — reference for async scoring engine using explicit `selectinload`, scope filtering, and multi-rule range matching.
- `backend/app/api/assessments.py` — reference for nested CRUD router pattern, ownership enforcement via JOIN, and composite scoring endpoint.
- `backend/app/services/quota_service.py` — prior reference for loading related response data in an async context with explicit eager loading.

## Gotchas and Pitfalls
- **Do not recreate `assessment_scope` ENUM.** It already exists from migration 0001. Using `create_type=True` (the default) will raise `DuplicateObject` at migration time.
- **Do not drop `assessment_scope` ENUM in downgrade.** The ENUM predates this migration and may be used by other tables. Only drop the `assessments` table itself.
- **Do not use `alembic revision --autogenerate`.** It will silently corrupt DateTime `server_default` values and misrender JSONB columns.
- **Missing import in either `alembic/env.py` or `app/models/__init__.py` is silent.** No error is raised — the migration simply does not create the table. Always add the import to both files.
- **`lazy='raise'` is intentional, not a bug.** If `MissingGreenlet` or `raise` errors appear in service code, add the appropriate `selectinload`/`joinedload` to the query rather than removing the `lazy='raise'` declaration.
- **Session-scoped async fixtures will fail.** Always use `scope='function'` for async SQLAlchemy fixtures in pytest-asyncio to avoid event loop mismatch errors with asyncpg.
- **The `group_id` FK target is `question_groups.id`, not a separate `groups` table.** Confirm this in the existing schema before implementing any future model that references groups.
- **`answer_options.assessment_value` is a DECIMAL/NUMERIC column.** The scoring engine must treat it as `Decimal`, not float, to avoid floating-point precision errors in range comparisons.
- **Scope=group scoring requires question-level filtering.** When `scope=group`, only `ResponseAnswer` records for questions whose `group_id` matches the assessment rule's `group_id` should contribute to the score — not all answers in the response.
```
