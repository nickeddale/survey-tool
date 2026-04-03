---
date: "2026-04-03"
ticket_id: "ISS-091"
ticket_title: "6.9: Survey Statistics Endpoint"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-091"
ticket_title: "6.9: Survey Statistics Endpoint"
categories: ["api", "statistics", "sqlalchemy", "pydantic", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/response_service.py
  - backend/app/api/responses.py
  - backend/app/schemas/response.py
---

# Lessons Learned: 6.9: Survey Statistics Endpoint

## What Worked Well
- Using SQL-level aggregations (COUNT, AVG, GROUP BY) for response counts and completion time kept the service function efficient and avoided loading large result sets into memory.
- Enforcing survey ownership via a JOIN at the query layer (`responses JOIN surveys WHERE surveys.user_id = :user_id`) rather than a two-step fetch-then-check eliminated a race condition and returned consistent 404s for both missing and unauthorized surveys without leaking existence.
- Registering the GET `/{survey_id}/statistics` route before any wildcard routes prevented FastAPI's registration-order-based shadowing from silently misrouting requests.
- Using existing custom error classes (`NotFoundError`, `UnauthorizedError` from `app/utils/errors.py`) preserved the `WWW-Authenticate: Bearer` header on 401s per RFC 6750 and produced a consistent error format.
- Running import and app smoke-tests before invoking pytest surfaced broken imports and route registration issues as clear, actionable errors rather than confusing collection failures.

## What Was Challenging
- Per-question statistics required branching logic by question type (choice, numeric, rating, text), making the service function more complex than typical CRUD operations.
- Median calculation is not available as a standard SQL aggregate in PostgreSQL without extensions; computing it Python-side from fetched numeric values required an extra fetch step outside the main aggregation query.
- Pydantic Union schemas for heterogeneous question statistics sub-schemas required explicit `model_rebuild()` calls after class definition — the error surfaces at first serialization rather than at import time, making it easy to miss until runtime.
- Async SQLAlchemy relationship access inside service functions required explicit `selectinload` or SQL-level JOINs; lazy loading causes `MissingGreenlet` errors that do not appear until runtime under load.

## Key Technical Insights
1. FastAPI resolves routes in registration order — always register literal path segments (e.g., `/statistics`) before wildcard segments (e.g., `/{param}`) in the same router prefix to avoid silent shadowing.
2. PostgreSQL has no built-in `MEDIAN` aggregate — compute median Python-side from a fetched list of numeric values rather than attempting a pure SQL approach.
3. Pydantic `Union` schemas containing forward references or multiple sub-schema types require `model_rebuild()` after the parent schema definition; the error is deferred to first serialization, not import time.
4. In async SQLAlchemy contexts, never rely on lazy relationship loading — any ORM relationship accessed outside the session context raises `MissingGreenlet`; use `selectinload` eagerly or rewrite as a SQL JOIN.
5. The container default `DATABASE_URL` uses the `postgresql://` (psycopg2) scheme; async test runs require overriding to `postgresql+asyncpg://` — the mismatch silently fails without a clear error.
6. All async pytest fixtures (`engine`, `session`, `client`) must use `scope='function'`; `scope='session'` causes event loop mismatch errors with asyncpg under pytest-asyncio.
7. Statistics endpoints return computed aggregates, not ORM model instances — service functions should return plain dicts or Pydantic models to avoid lazy-load errors outside the session.

## Reusable Patterns
- **Ownership-scoped aggregate query:** `SELECT COUNT(*) FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE s.user_id = :user_id AND s.id = :survey_id` — single query, no existence leak.
- **Avg completion time via SQL:** `AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))` — returns seconds as a float directly from the database.
- **Pydantic Union with model_rebuild:** Define sub-schemas per question type, use `Union[ChoiceQuestionStats, NumericQuestionStats, RatingQuestionStats, TextQuestionStats]` in the parent, call `SurveyStatisticsResponse.model_rebuild()` immediately after the class block.
- **Function-scoped async fixtures:** `@pytest_asyncio.fixture(scope='function')` with `create_all` on setup and `drop_all` on teardown — safe for asyncpg, no event loop leakage.
- **Import smoke-test:** `python -c 'from app.services.response_service import get_survey_statistics; from app.schemas.response import SurveyStatisticsResponse'` — run before pytest to catch broken imports early.
- **App smoke-test:** `python -c 'from app.main import app'` — run after any router change to verify the import chain is intact.
- **Test invocation with scheme override:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_statistics.py -v`

## Files to Review for Similar Tasks
- `backend/app/services/response_service.py` — SQL aggregation patterns, ownership-scoped queries, async session usage.
- `backend/app/api/responses.py` — route registration order, auth dependency injection, response schema wiring.
- `backend/app/schemas/response.py` — Pydantic Union schema with `model_rebuild()`, per-question stats sub-schemas.
- `backend/app/utils/errors.py` — custom error classes to use instead of raw `HTTPException`.
- `backend/tests/test_statistics.py` — function-scoped async fixtures, DATABASE_URL override pattern, per-question-type assertion examples.

## Gotchas and Pitfalls
- **Route shadowing:** Registering a wildcard route before `/statistics` causes the literal path to be silently swallowed — always register specifics first.
- **Lazy load in async context:** Accessing an ORM relationship not loaded with `selectinload` inside an async function raises `MissingGreenlet` at runtime, not at definition time.
- **Pydantic Union deferred error:** Missing `model_rebuild()` on a Union schema causes `PydanticUserError` at first serialization, not at import — easy to miss in smoke-tests if not exercising the full serialization path.
- **asyncpg scheme mismatch:** Using `postgresql://` instead of `postgresql+asyncpg://` silently fails to connect in async test runs — always override `DATABASE_URL` explicitly.
- **Session-scoped fixtures with asyncpg:** `scope='session'` on async fixtures causes event loop mismatch; use `scope='function'` exclusively.
- **Median in PostgreSQL:** No native `MEDIAN` — do not attempt a pure SQL median; fetch the values and compute Python-side with `statistics.median()`.
- **Returning ORM objects from statistics service:** Lazy-loaded ORM objects returned outside the session context will fail on attribute access — always serialize to dict or Pydantic model inside the session block.
```
