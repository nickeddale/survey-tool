---
date: "2026-04-03"
ticket_id: "ISS-090"
ticket_title: "6.8: Response Export Endpoint (CSV and JSON)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-090"
ticket_title: "6.8: Response Export Endpoint (CSV and JSON)"
categories: ["api", "export", "streaming", "csv", "authentication"]
outcome: "success"
complexity: "high"
files_modified:
  - "backend/app/api/responses.py"
  - "backend/app/services/export_service.py"
  - "backend/tests/test_responses.py"
---

# Lessons Learned: 6.8: Response Export Endpoint (CSV and JSON)

## What Worked Well
- Reusing the existing `list_responses()` filtering pattern kept the export endpoint consistent with other response endpoints and avoided duplicating query logic.
- Using Python stdlib `csv.writer` with `io.StringIO` and encoding per-row for `StreamingResponse` kept the implementation dependency-free and easy to test.
- Routing `/export` before `/{response_id}` in `responses.py` prevented FastAPI from capturing the literal string "export" as a UUID path parameter — treating this as a hard requirement from the start avoided a subtle runtime bug.
- The ownership-scoped JOIN query pattern (single query with `WHERE survey_id = :id AND surveys.user_id = :user_id`) produced clean 404 responses for both missing and unauthorized surveys without any application-layer branching.
- Explicit `selectinload()` chains on all traversed relationships (`Response.answers → Answer.question → Question.subquestions`) prevented `MissingGreenlet` errors that would only surface at runtime.

## What Was Challenging
- Matrix question flattening required a separate deterministic ordering pass (sort by `sort_order` on questions, then subquestions) to produce stable column headers across requests. Without this, tests asserting column order were fragile.
- Streaming CSV responses required careful async generator design to ensure the header row was always emitted even when the response set was empty — preventing clients from receiving an empty body instead of a header-only CSV.
- Column filtering via comma-separated `columns` query param required intersection logic against available question codes before building headers, so unknown codes are silently ignored rather than raising errors.

## Key Technical Insights
1. **Route registration order is load-bearing in FastAPI**: `/surveys/{survey_id}/responses/export` must be registered before `/surveys/{survey_id}/responses/{response_id}`. FastAPI matches routes in registration order; `export` will be treated as a UUID response_id and return a 422 if order is wrong.
2. **Async SQLAlchemy requires exhaustive eager loading**: Any relationship accessed outside an explicit `selectinload()` or `joinedload()` raises `MissingGreenlet` at access time, not at import time. For export queries touching `Response → Answer → Question → Subquestion`, every hop must be declared.
3. **Ownership enforcement belongs in the query**: A JOIN to the surveys table with `WHERE s.user_id = :user_id` returns 404 for both nonexistent and unauthorized surveys without leaking existence. Fetch-then-check is both slower and leaky.
4. **Function-scoped async fixtures are mandatory**: `pytest-asyncio` + `asyncpg` + session-scoped engine = event loop mismatch errors. All engine/session/client fixtures in `test_responses.py` must use `scope='function'`.
5. **Test DATABASE_URL must use asyncpg scheme**: The container default uses `psycopg2`, which silently fails with the async engine. Always override: `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker"`.
6. **Do not use passlib CryptContext**: `bcrypt >= 4.x` raises `AttributeError: module 'bcrypt' has no attribute '__about__'` at runtime. Use `bcrypt.checkpw` directly for any credential verification.

## Reusable Patterns
- **Ownership-scoped export query**: `SELECT r.* FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE r.survey_id = :survey_id AND s.user_id = :user_id`
- **Eager loading for export**: `selectinload(Response.answers).selectinload(Answer.question).selectinload(Question.subquestions)`
- **CSV streaming generator**: yield header row bytes first, then one encoded row per response; always emit headers even on empty result sets
- **Matrix column naming**: flatten subquestions as `{question_code}_{subquestion_code}` (e.g., `Q5_SQ001`), ordered by `sort_order`
- **Multi-value cell joining**: join list values with comma within a single CSV cell
- **Import smoke-test before editing**: `python -c "from app.services.export_service import *; from app.api.responses import *"` catches broken imports with clean tracebacks before test runs
- **Content-Disposition for both formats**: set `Content-Disposition: attachment; filename="responses.csv"` (or `.json`) on both `StreamingResponse` and `JSONResponse`

## Files to Review for Similar Tasks
- `backend/app/api/responses.py` — route registration order, export endpoint signature, dependency injection pattern
- `backend/app/services/export_service.py` — CSV streaming generator, JSON builder, matrix flattening, column ordering logic
- `backend/app/services/response_service.py` — ownership-scoped query pattern to replicate for other export-style endpoints
- `backend/tests/test_responses.py` — function-scoped async fixture setup, DATABASE_URL override, CSV parsing in tests, auth enforcement assertions

## Gotchas and Pitfalls
- Registering `/export` after `/{response_id}` causes FastAPI to match "export" as a path parameter and return 422 — always register static path segments before parameterized ones.
- Empty response sets must still return a valid CSV with headers only — an empty body will break clients expecting column metadata.
- `MissingGreenlet` is a runtime error triggered on first relationship access, not at import or query time — missing eager loads will not appear until the row-building loop executes.
- `pytest-asyncio` session-scoped async fixtures reliably fail with asyncpg due to event loop lifecycle — there is no workaround; use `scope='function'` universally.
- Wrong DATABASE_URL scheme (`psycopg2` vs `asyncpg`) fails silently or with a confusing driver error, not a clear connection error — always verify the scheme in the test override.
- Ownership returning 403 instead of 404 leaks resource existence; the correct pattern throughout this codebase is 404 for both missing and unauthorized.
- passlib CryptContext is permanently broken with bcrypt >= 4.x and must not be used in any new code, including middleware or dependencies touched by the export endpoint.
```
