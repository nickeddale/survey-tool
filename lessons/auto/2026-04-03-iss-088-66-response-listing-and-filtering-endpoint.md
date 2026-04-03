---
date: "2026-04-03"
ticket_id: "ISS-088"
ticket_title: "6.6: Response Listing and Filtering Endpoint"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-088"
ticket_title: "6.6: Response Listing and Filtering Endpoint"
categories: ["api", "pagination", "filtering", "async-sqlalchemy", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/schemas/response.py
  - backend/app/services/response_service.py
  - backend/app/api/responses.py
  - backend/tests/test_responses.py
---

# Lessons Learned: 6.6: Response Listing and Filtering Endpoint

## What Worked Well
- Following established patterns from prior tickets (6.1–6.5) made schema, service, and router structure straightforward to implement consistently.
- Using distinct Pydantic output schemas (ResponseSummary, ResponseListResponse) kept the API surface clean and avoided accidental field leakage.
- Applying the import smoke-test (`python -c 'from app.services.response_service import list_responses'`) before running the full test suite caught broken imports early with clear tracebacks.

## What Was Challenging
- Ensuring the paginated `total` field reflected the true filtered count required a separate `SELECT COUNT(*)` query with identical WHERE clauses — it was tempting to derive total from `len(items)`, which silently breaks on any page beyond the first.
- Ownership enforcement for the survey existence check needed to filter by both `survey_id` AND `user_id` in a single query to prevent 404-as-oracle leaking the existence of other users' surveys.
- Async SQLAlchemy relationship access without explicit eager loading raises `MissingGreenlet` at runtime, not at import time, making it easy to miss during development if relationship fields are not exercised in tests.

## Key Technical Insights
1. **Separate COUNT query for pagination**: `total` must come from `SELECT COUNT(*) WHERE <same filters>`, never from `len(page_results)`. Deriving total from the page results returns at most `per_page`, producing wrong metadata on all non-first pages.
2. **Ownership-enforced existence check**: The survey lookup in `list_responses()` must apply `WHERE survey_id = :id AND user_id = :user_id`. A fetch-then-check pattern leaks whether a survey ID exists for another user via differential 404/403 responses.
3. **Async SQLAlchemy lazy loading is a runtime trap**: Any traversal of a relationship attribute without `selectinload` or `joinedload` will raise `MissingGreenlet` only when that code path executes, not at startup. Always declare eager loading explicitly for any relationship accessed in a service function.
4. **asyncpg DATABASE_URL scheme**: The container default uses `postgresql+psycopg2://`; test runs must explicitly override to `postgresql+asyncpg://` or the async engine silently fails.
5. **Function-scoped async fixtures**: All `engine`, `session`, and `client` pytest fixtures must use `scope='function'`; session-scoped async fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio.

## Reusable Patterns
- **Paginated list service pattern**: Run `SELECT COUNT(*) FROM ... WHERE <filters>` first, then `SELECT ... WHERE <filters> ORDER BY ... LIMIT :per_page OFFSET :offset`. Return `(items, total)` tuple.
- **Ownership-safe 404**: `SELECT ... WHERE id = :survey_id AND user_id = :user_id` — both unauthorized access and missing resources return 404, eliminating the oracle.
- **Distinct output schema**: Define `ResponseSummary` as a standalone Pydantic model; do not subclass or reuse input schemas. Verify sensitive fields are absent with explicit test assertions.
- **Import smoke-test**: `python -c 'from app.services.response_service import list_responses'` before `pytest` to surface import errors with clean tracebacks.
- **Eager loading declaration**: Always pass `selectinload(Model.relationship)` in async SQLAlchemy queries where relationship data will be accessed.
- **Test DATABASE_URL override**: `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest`

## Files to Review for Similar Tasks
- `backend/app/services/response_service.py` — canonical example of filtered + paginated async SQLAlchemy query with ownership enforcement and separate COUNT.
- `backend/app/schemas/response.py` — reference for distinct ResponseSummary vs input schema separation.
- `backend/app/api/responses.py` — reference for query-param-driven filter/sort/pagination wiring in a FastAPI router with auth scope enforcement.
- `backend/tests/test_responses.py` — reference test suite covering happy path, each filter in isolation, sort permutations, empty results, 404 for unknown survey, 404 for survey owned by another user, and 401 for unauthenticated access.

## Gotchas and Pitfalls
- **`len(items)` as total**: Will always equal `per_page` (or less) on any page after the first. Use a dedicated COUNT query.
- **Fetch-then-check ownership**: Returns 403 for existing-but-unauthorized surveys, leaking existence. Always enforce ownership at the query layer.
- **Lazy relationship access in async context**: `response.answers` (or any relationship) accessed without eager loading raises `MissingGreenlet` at the call site, not at startup — easy to miss without relationship-exercising tests.
- **Wrong DATABASE_URL scheme**: psycopg2-scheme URLs silently fail with the async engine; always override for test runs.
- **Session-scoped async fixtures**: Cause event loop errors with asyncpg; unconditionally use `scope='function'` for all async fixtures.
- **Omitting ownership test**: A test that only checks 404 for a nonexistent survey ID does not verify the ownership boundary — add an explicit test where a valid survey exists but belongs to a different authenticated user, and assert 404.
```
