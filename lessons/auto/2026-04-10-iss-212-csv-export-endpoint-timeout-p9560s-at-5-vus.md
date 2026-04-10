---
date: "2026-04-10"
ticket_id: "ISS-212"
ticket_title: "CSV export endpoint timeout — p95=60s at 5 VUs"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-10"
ticket_id: "ISS-212"
ticket_title: "CSV export endpoint timeout — p95=60s at 5 VUs"
categories: ["performance", "streaming", "database", "async"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/exporters/response_export_service.py
  - backend/app/services/exporters/csv_exporter.py
  - backend/app/api/responses.py
  - backend/app/services/export_service.py
  - backend/alembic/versions/0020_add_export_query_indexes.py
  - backend/tests/test_csv_export_chunked.py
---

# Lessons Learned: CSV export endpoint timeout — p95=60s at 5 VUs

## What Worked Well
- The existing `StreamingResponse` wrapper was already in place, so the endpoint-level change was minimal — the bottleneck was entirely in the upfront bulk query, not the HTTP layer
- Chunked LIMIT/OFFSET pagination with `selectinload` per chunk preserved the same eager-loading pattern, avoiding DetachedInstanceError without requiring a major architectural change
- Extracting scalar dicts from ORM objects inside the session scope before yielding cleanly eliminated all session-lifetime edge cases
- Using a composite index on `responses(survey_id, status)` and `response_answers(response_id)` gave significant query speedup with a single migration

## What Was Challenging
- Building CSV headers from the first chunk required an explicit guard for the zero-response case — the header-building logic would crash on an empty first chunk without it
- Verifying that the SQLAlchemy session remained open for the full duration of the `StreamingResponse` generator required careful reading of FastAPI's dependency injection lifecycle
- Alembic autogenerate could not reliably detect missing indexes on existing tables; the migration had to be manually authored and inspected

## Key Technical Insights
1. **Bulk query is the bottleneck, not streaming**: `StreamingResponse` provides no benefit if all data is loaded into memory before the first byte is sent. The fix must move the chunking upstream into the query layer, not the HTTP layer.
2. **Session lifetime spans the full stream**: FastAPI does not close the `get_db` dependency until the response generator is exhausted. This is safe — but it must be verified, not assumed.
3. **Extract scalars before yielding**: ORM objects accessed after a session closes raise `DetachedInstanceError`. Converting to dicts inside the generator (while the session is open) is the cleanest mitigation — no need for `expire_on_commit=False` or other workarounds.
4. **selectinload per chunk is required**: Lazy-loading answer relationships outside the session scope causes `MissingGreenlet` errors in asyncpg. Each chunk must eagerly load its relationships before yielding.
5. **Composite indexes are critical for pagination**: LIMIT/OFFSET queries on `responses` without an index on `(survey_id, status)` perform full table scans per page, negating the chunking benefit entirely.

## Reusable Patterns
- **Chunked async generator pattern**: Replace `async def get_responses_for_export(...)` returning a flat list with `async def get_responses_for_export_chunked(...)` yielding `list[Response]` in batches of ~100, using `LIMIT chunk_size OFFSET page * chunk_size` with `selectinload` per batch.
- **Dict extraction before yield**: `yield [row_to_dict(r) for r in chunk]` where `row_to_dict` accesses all ORM attributes while the session is still active. Never yield ORM objects across a session boundary.
- **Empty-export guard in header building**: Always handle the case where the first chunk is empty. Return a CSV with headers only (or no content) rather than crashing.
- **Import smoke-test before pytest**: `python -c 'from app.services.exporters.response_export_service import get_responses_for_export_chunked; from app.services.exporters.csv_exporter import generate_csv_stream'` catches broken imports as clean tracebacks rather than cryptic pytest collection errors.
- **Manual Alembic migration for indexes**: Always hand-author index migrations for existing tables. Run `alembic check` and inspect the generated script — autogenerate silently misses or misidentifies indexes on tables that already exist.

## Files to Review for Similar Tasks
- `backend/app/services/exporters/response_export_service.py` — chunked async generator implementation and selectinload pattern
- `backend/app/services/exporters/csv_exporter.py` — how `generate_csv_stream` consumes an `AsyncIterator[list[dict]]` and handles empty first chunk
- `backend/app/api/responses.py` — how `StreamingResponse` is wired to the async generator; session dependency lifetime
- `backend/alembic/versions/0020_add_export_query_indexes.py` — reference for hand-authored composite index migration
- `backend/tests/test_csv_export_chunked.py` — test patterns for 0, 1, and 500-response chunked export correctness

## Gotchas and Pitfalls
- **Do not use `scope='session'` for async SQLAlchemy fixtures**: asyncpg will raise event loop mismatch errors. All fixtures must use `scope='function'`, including any new ones added for chunked streaming tests.
- **Do not yield ORM objects across session boundaries**: This is a silent failure path — the error only manifests when a lazily-loaded attribute is accessed after the session closes. Always extract dicts inside the generator.
- **asyncpg does not support `CREATE TYPE IF NOT EXISTS`**: Irrelevant for index-only migrations, but confirm the migration touches only indexes. If ENUM types are involved, use the `DO $$ BEGIN ... END $$` workaround via `conn.exec_driver_sql()`.
- **`from __future__ import annotations` breaks rate-limited endpoints**: If the export router file uses this import and a `request: Request` parameter is added (e.g., for rate limiting), locally-defined Pydantic models become unresolvable `ForwardRef`s and body params are misrouted as query params. Fix: remove the import — Python 3.11+ handles modern type syntax natively.
- **LIMIT/OFFSET pagination degrades at high offsets**: For very large exports (10,000+ responses), keyset pagination (filtering by last seen `id`) is more performant than OFFSET. The current chunk size of ~100 mitigates this for typical use, but revisit if export counts grow significantly.
```
