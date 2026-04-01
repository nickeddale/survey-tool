---
date: "2026-04-01"
ticket_id: "ISS-019"
ticket_title: "1.6: Survey Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-019"
ticket_title: "1.6: Survey Model and CRUD Endpoints"
categories: ["fastapi", "sqlalchemy", "postgresql", "migrations", "crud", "pagination", "authentication"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/models/survey.py
  - backend/app/schemas/survey.py
  - backend/app/services/survey_service.py
  - backend/app/api/surveys.py
  - backend/app/utils/pagination.py
  - backend/alembic/versions/0005_create_surveys_table.py
  - backend/tests/test_surveys.py
---

# Lessons Learned: 1.6: Survey Model and CRUD Endpoints

## What Worked Well
- Accumulating prior lessons into the implementation plan meant known pitfalls (ENUM reuse, lazy loading, ownership enforcement) were addressed proactively rather than discovered at runtime.
- Structuring the service layer with a clear separation between `get_survey_by_id` (ownership-enforced, no eager loading) and `get_survey_full_by_id` (explicit selectinload chains) kept the query logic clean and testable.
- Using `exclude_unset=True` on the Pydantic update schema made partial PATCH semantics trivial — only fields explicitly provided by the caller are written to the database.
- Reusing the `survey_status` ENUM from migration 0001 with `create_type=False` avoided a DuplicateObject error without any extra migration bookkeeping.

## What Was Challenging
- Alembic autogenerate cannot be trusted for this stack: it silently drops `server_default=sa.text('now()')` on timestamp columns and may render JSONB columns as TEXT. Every migration touching these column types must be manually authored and reviewed against the actual DDL.
- The `?include=full` eager-loading path (groups → questions → answer_options) requires chaining `selectinload` calls explicitly. Any implicit relationship traversal outside an active async session raises `MissingGreenlet` with no obvious indication of the root cause.
- Correctly computing paginated totals requires a dedicated `SELECT COUNT(*)` query scoped to the same filters as the data query. Using `len(results)` on the fetched page silently returns at most `per_page`, making the total field wrong on all but the last page.

## Key Technical Insights
1. **ENUM reuse across migrations:** `survey_status` is created once in migration 0001. All subsequent migrations must reference it with `postgresql.ENUM(..., create_type=False)` — attempting to create it again raises `DuplicateObject` and aborts the migration.
2. **Ownership at query layer:** User ownership must be enforced with a single `WHERE id = :id AND user_id = :user_id` query. A fetch-then-check pattern leaks resource existence to unauthorized callers; both missing and unauthorized resources must return 404.
3. **Async SQLAlchemy lazy loading:** Implicit lazy loading does not work in async SQLAlchemy. Declare `lazy='raise'` on all relationships as a safety net, and always use `selectinload` or `joinedload` explicitly when traversal is needed.
4. **DATABASE_URL scheme:** The container default `DATABASE_URL` uses the `postgresql://` (psycopg2) scheme. All test runs must override to `postgresql+asyncpg://` or the async engine will fail silently or raise a confusing connection error.
5. **Pagination total:** The `total` field in the paginated response envelope must come from a separate `SELECT COUNT(*) WHERE <same filters>` query, executed before the windowed `SELECT ... LIMIT ... OFFSET ...` query.
6. **Model registration:** The Survey model must be imported in both `alembic/env.py` and `app/models/__init__.py`. Missing either import causes Alembic to silently skip creating the table with no error.

## Reusable Patterns
- **UUID primary key (Python-side):** `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — no pgcrypto dependency.
- **JSONB column in migration:** `sa.Column('settings', postgresql.JSONB(), nullable=True)` — never rely on autogenerate for this type.
- **Timestamp column in migration:** `sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)` — autogenerate drops the `server_default`.
- **Ownership-enforced fetch:** `SELECT ... FROM surveys WHERE id = :id AND user_id = :user_id` — single query, 404 for both missing and unauthorized.
- **Paginated count:** `SELECT COUNT(*) FROM surveys WHERE user_id = :user_id [AND status = :status] [AND title ILIKE :search]` then a separate windowed query.
- **Case-insensitive title search:** `.where(Survey.title.ilike(f'%{search}%'))` applied only when the `search` query param is present.
- **Partial update:** `update_data = schema.model_dump(exclude_unset=True)` then `stmt = update(Survey).where(...).values(**update_data)`.
- **Function-scoped async fixtures:** `@pytest_asyncio.fixture(scope='function')` for all engine/session/client fixtures — session scope causes asyncpg event loop mismatch.
- **Import smoke-test before alembic:** `python -c "from app.models.survey import Survey"` surfaces broken imports as clean tracebacks rather than cryptic Alembic errors.
- **Test invocation:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_surveys.py -v`

## Files to Review for Similar Tasks
- `backend/app/models/survey.py` — canonical example of UUID PK, ENUM column, JSONB column, and timestamp defaults with `lazy='raise'` on relationships.
- `backend/app/services/survey_service.py` — canonical example of ownership-enforced fetch, separate COUNT query for pagination, `exclude_unset` partial update, and explicit `selectinload` chains for `?include=full`.
- `backend/app/utils/pagination.py` — reusable `PaginationParams` dependency and `offset = (page - 1) * per_page` formula.
- `backend/alembic/versions/0005_create_surveys_table.py` — reference for manually authored migration with JSONB, timestamps with `server_default`, composite index, and `create_type=False` ENUM reuse.
- `backend/tests/test_surveys.py` — reference for cross-user 404 isolation test, paginated envelope shape assertion, and `?include=full` nested response test.

## Gotchas and Pitfalls
- **Never autogenerate migrations** for tables with JSONB columns or `server_default` timestamps — autogenerate silently corrupts both.
- **`survey_status` ENUM exists from migration 0001** — always use `create_type=False`; re-creating it raises `DuplicateObject` and aborts the migration run.
- **`len(results)` is not the total** — it is at most `per_page`. Always issue a separate `COUNT(*)` query.
- **Implicit async relationship traversal raises `MissingGreenlet`** — not a session scope issue; it is a fundamental async SQLAlchemy constraint. Always use `selectinload`/`joinedload` at query time.
- **Cross-user access must return 404, not 403** — returning 403 confirms the resource exists and leaks ownership information.
- **`DATABASE_URL` scheme mismatch** causes silent failures or confusing errors — always override to `postgresql+asyncpg://` in test runs.
- **Missing model import in `alembic/env.py` or `app/models/__init__.py`** causes the migration to run to completion without creating the table — no error is raised, making this extremely hard to diagnose post-hoc.
```
