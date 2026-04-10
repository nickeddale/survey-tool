---
date: "2026-04-10"
ticket_id: "ISS-213"
ticket_title: "Statistics endpoint slow — p95=14.5s for 500-response survey"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-10"
ticket_id: "ISS-213"
ticket_title: "Statistics endpoint slow — p95=14.5s for 500-response survey"
categories: ["performance", "database", "caching", "postgresql", "sqlalchemy"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/services/response_query_service.py
  - backend/app/services/response_service.py
  - backend/alembic/versions/0021_add_statistics_composite_index.py
---

# Lessons Learned: Statistics endpoint slow — p95=14.5s for 500-response survey

## What Worked Well
- Identifying the N+1 query pattern early — the root cause (per-question answer fetch in a loop) was clearly visible in `response_query_service.py` before writing any fix
- Pushing aggregations (AVG, MIN, MAX, COUNT, PERCENTILE_CONT) to SQL rather than Python eliminated the 25,000-row load for a 500-response × 50-question survey
- TTL cache keyed on survey_id (scalar only) was straightforward to implement without touching the request/response schema
- Composite index on `(question_id, response_id)` and partial index on `responses(survey_id) WHERE status='complete'` gave the query planner the information needed to avoid full-table scans
- Prior MEMORY.md warnings about field names (`total_responses` / `complete_responses`) and unhashable list pitfalls prevented at least two silent regressions before they could manifest

## What Was Challenging
- asyncpg does not support `CREATE INDEX IF NOT EXISTS` — required a `DO $$ BEGIN IF NOT EXISTS (...) THEN CREATE INDEX ...; END IF; END $$` block via `conn.exec_driver_sql()`, which is easy to get wrong if you reach for `conn.execute(text(...))` or the standard IF NOT EXISTS shorthand
- Confirming the exact JSONB column structure (`{"value": 3}` vs raw scalar) required reading the model before writing the CAST expression — assuming the wrong shape would have silently produced NULL aggregates
- Cache invalidation requires coordination between two services (`response_query_service` and `response_service`); forgetting the invalidation call in `response_service` after submission would have caused stale statistics with no obvious error
- Alembic autogenerate silently drops `server_default` and `onupdate` directives — migration 0021 was authored manually and inspected before applying to avoid this

## Key Technical Insights
1. **N+1 is the primary statistics killer**: loading answers per-question in a Python loop scales as O(questions × responses). A single `SELECT question_id, array_agg(value) ... GROUP BY question_id` collapses this to O(1) round-trips regardless of question count.
2. **Push numeric math to the database**: `AVG()`, `MIN()`, `MAX()`, `PERCENTILE_CONT(0.5)` in SQL avoid deserializing every JSONB row into Python just to compute a mean. Python only formats the already-computed result.
3. **TTL cache key must be a scalar**: the relevance evaluator bug (`frozenset(answers.items())` failing for list-valued multiple_choice answers) is a reminder that any cache key derived from answer data will break. Use only `survey_id` (int/UUID).
4. **asyncpg DDL idempotency requires DO blocks**: `CREATE INDEX IF NOT EXISTS` and `CREATE TYPE IF NOT EXISTS` are not supported. Always use `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = '...') THEN ...; END IF; END $$` and always call via `conn.exec_driver_sql()`.
5. **Import smoke-test before alembic**: running `python -c 'from app.models import *'` before any `alembic upgrade` surfaces broken imports as clean tracebacks rather than cryptic alembic errors.
6. **`from __future__ import annotations` + `request: Request` = ForwardRef failure**: if the statistics router file uses this future import and you add `request: Request` as the first parameter for rate limiting, locally-defined Pydantic models become unresolvable ForwardRefs causing 400 errors. Remove the future import; Python 3.11 handles `str | None` and `list[str]` natively.

## Reusable Patterns
- **Batched GROUP BY aggregation**: `SELECT question_id, array_agg(value ORDER BY response_id) FROM response_answers JOIN responses ON responses.id = response_answers.response_id WHERE responses.survey_id = :sid GROUP BY question_id` — replace the per-question loop with this single query.
- **SQL numeric aggregation with JSONB**: `AVG(CAST(value->>'value' AS FLOAT))` — verify the JSONB shape first (read the model; don't assume).
- **Module-level TTL cache**: `_stats_cache: dict[int, tuple[Any, float]] = {}` where the tuple is `(result, time.monotonic() + TTL_SECONDS)`. Check expiry on read; delete key on invalidation. Never include answer-derived values in the key.
- **Cache invalidation in submission service**: after inserting a new response in `response_service.py`, call `invalidate_statistics_cache(survey_id)` (a one-liner that does `_stats_cache.pop(survey_id, None)`).
- **Query-count assertion in tests**: use SQLAlchemy event listeners — `event.listen(engine.sync_engine, 'before_cursor_execute', counter_fn)` — to assert the endpoint issues ≤5 queries regardless of question count.
- **Idempotent index migration**: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_response_answers_question_response') THEN CREATE INDEX ...; END IF; END $$` via `conn.exec_driver_sql()`.

## Files to Review for Similar Tasks
- `backend/app/services/response_query_service.py` — batched GROUP BY aggregation, TTL cache implementation, numeric SQL aggregation
- `backend/app/services/response_service.py` — cache invalidation call on new response submission
- `backend/alembic/versions/0021_add_statistics_composite_index.py` — reference for asyncpg-safe idempotent index creation using DO blocks and `conn.exec_driver_sql()`
- `backend/tests/test_statistics_optimized.py` — query-count assertions via SQLAlchemy event listeners, cache TTL/invalidation test patterns
- `backend/app/models/` — confirm JSONB column structure before writing CAST expressions

## Gotchas and Pitfalls
- **asyncpg rejects `CREATE INDEX IF NOT EXISTS`** — use a DO block with a pg_indexes check; do not use the shorthand syntax even though it works in psql.
- **`conn.execute(text(...))` vs `conn.exec_driver_sql()`** — raw DDL in async SQLAlchemy migrations must use `exec_driver_sql()`; `execute(text(...))` will fail for certain DDL statements under asyncpg.
- **JSONB shape assumption** — `value->>'value'` only works if the column stores `{"value": <scalar>}`. If it stores a raw scalar, the CAST will produce NULL silently. Always read the model before writing the expression.
- **Cache key must never include list-typed values** — multiple_choice answers are stored as Python lists; any `frozenset()` or `hash()` call on them raises `unhashable type: list`. Key the cache on survey_id only.
- **Statistics schema field names** — the response schema uses `total_responses` and `complete_responses`. Using `total` or `complete` causes silent test failures (the field is simply absent from the response, not an error).
- **Alembic autogenerate drops `server_default`/`onupdate`** — always author index-only migrations manually and diff against the actual schema before applying.
- **`from __future__ import annotations` breaks rate-limited endpoints** — removing this import from the router file is the correct fix; do not use `Body(...)` as a workaround (causes a separate `PydanticUserError`).
- **Cache invalidation must be in the submission path** — if `response_service.py` is updated to submit responses but the invalidation call is omitted, the TTL cache will serve stale statistics for up to 60 seconds with no error raised.
```
