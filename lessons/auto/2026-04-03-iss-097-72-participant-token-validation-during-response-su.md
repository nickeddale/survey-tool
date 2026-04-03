---
date: "2026-04-03"
ticket_id: "ISS-097"
ticket_title: "7.2: Participant Token Validation During Response Submission"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-097"
ticket_title: "7.2: Participant Token Validation During Response Submission"
categories: ["authentication", "validation", "async-sqlalchemy", "testing", "schema-design"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/schemas/response.py
  - backend/app/services/response_service.py
  - backend/app/api/responses.py
  - backend/app/models/participant.py
  - backend/app/models/response.py
  - backend/app/services/expressions/resolver.py
---

# Lessons Learned: 7.2: Participant Token Validation During Response Submission

## What Worked Well
- Separating input and output schemas cleanly (ResponseCreate with optional `participant_token` vs ResponseRead with no token) prevented accidental credential leakage from the start.
- The plan to check for existing custom error classes in `app/utils/errors.py` before raising raw `HTTPException` paid off — using `ForbiddenError` kept error response formatting consistent with the global exception handler.
- Designing `check_survey_requires_participants()` as a lightweight existence check (`SELECT 1 ... LIMIT 1`) kept the anonymous-survey fast path cheap and clearly separated from the validation path.
- Running an import smoke-test before pytest caught any broken imports as clean tracebacks rather than cryptic collection failures during test discovery.

## What Was Challenging
- Ensuring the atomic `uses_remaining` decrement was verified by rowcount rather than a post-UPDATE SELECT — a subsequent SELECT cannot distinguish a legitimate zero from a concurrent race decrement, so the rowcount check inside the same transaction was the only safe approach.
- Avoiding async SQLAlchemy fixture scope mistakes: `scope='session'` or `scope='module'` on async engine/session fixtures causes asyncpg event loop mismatch errors that are hard to diagnose. All async fixtures must use `scope='function'`.
- Confirming that the global exception handler in `app/main.py` maps HTTP status codes to `{code, message}` error objects rather than expecting a structured dict passed as the `detail` argument — passing a raw dict to `HTTPException(detail={...})` would bypass the handler's formatting logic.
- Ensuring `participant_token` never surfaces in any response body or log output required an explicit test assertion rather than relying on schema defaults.

## Key Technical Insights
1. **Atomic decrement pattern**: Use `UPDATE participants SET uses_remaining = uses_remaining - 1 WHERE id=:id AND uses_remaining > 0` and check `rowcount > 0` within the same transaction before creating the Response row. Do not issue a follow-up SELECT to confirm the value.
2. **Schema credential isolation**: Fields that are secrets (tokens, passwords) belong only in input schemas. Output schemas must explicitly exclude them. Add a test asserting the field is absent from the serialized response body.
3. **Conditional participant requirement**: Surveys with no Participant rows should silently allow anonymous submissions. The existence check avoids forcing all surveys through the validation path and keeps the anonymous flow backward-compatible.
4. **HTTPException formatting**: The global exception handler formats errors based on the HTTP status code, not on the shape of `detail`. Raise domain-specific errors using existing custom classes (e.g. `ForbiddenError`) so formatting is consistent — do not pass structured dicts directly to `HTTPException`.
5. **Expression context enrichment**: Passing the loaded participant to `build_expression_context()` after linking `response.participant_id` is the correct integration point for `{RESPONDENT.attribute}` piping — the participant must be loaded via an explicit SELECT after the response is persisted, not cached from the validation step, to avoid stale-state issues.
6. **completed flag lifecycle**: `completed=True` on the participant must be set during `complete_response()`, not during token validation or response creation, to correctly reflect the full response submission lifecycle.

## Reusable Patterns
- **Import smoke-test before pytest**: `python -c 'from app.services.response_service import create_response, complete_response; from app.schemas.response import ResponseCreate'` — run this before any test suite execution to surface broken imports cleanly.
- **Atomic conditional decrement with rowcount guard**: `UPDATE ... WHERE uses_remaining > 0` + `assert result.rowcount > 0` inside a single transaction is the standard pattern for race-safe counter decrements.
- **Function-scoped async fixtures**: All `AsyncSession` and `AsyncEngine` fixtures in pytest must use `scope='function'` when using asyncpg with pytest-asyncio.
- **Database URL override for tests**: Always run pytest with `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/` — the environment default uses the psycopg2 scheme which is silently incompatible with the async engine.
- **Token absence assertion**: `assert 'participant_token' not in response.json()` as an explicit test case for any endpoint that accepts a secret credential in the request body.

## Files to Review for Similar Tasks
- `backend/app/services/response_service.py` — validate_participant_token, check_survey_requires_participants, atomic decrement, complete_response participant linkage
- `backend/app/schemas/response.py` — ResponseCreate (input with token) vs ResponseRead (output without token) schema split
- `backend/app/api/responses.py` — token extraction from request body and forwarding to service layer
- `backend/app/utils/errors.py` — existing custom error class hierarchy (ForbiddenError, etc.) to reuse before creating new exception types
- `backend/app/main.py` — global exception handler registration and status-code-to-error-code mapping logic
- `backend/app/services/expressions/resolver.py` — build_expression_context() signature for {RESPONDENT.attribute} piping
- `backend/tests/test_participant_token_validation.py` — reference test structure for async mock-based service unit tests

## Gotchas and Pitfalls
- **Never verify atomic decrement with a SELECT**: After `UPDATE ... WHERE uses_remaining > 0`, only `rowcount` is authoritative. A subsequent SELECT may observe a stale or already-modified value.
- **asyncpg event loop mismatch**: Using `scope='session'` or `scope='module'` on any async SQLAlchemy fixture will cause asyncpg to raise event loop errors. There is no clean workaround — always use `scope='function'`.
- **psycopg2 vs asyncpg URL scheme**: The default `DATABASE_URL` in this project uses `psycopg2` — async tests require explicit override to `postgresql+asyncpg://` or the engine will silently fail or error at runtime.
- **participant_token in logs**: Ensure the token field is never logged at DEBUG or INFO level in the service or API layer. Treat it as a secret credential equivalent to a password.
- **Stale participant state after decrement**: Do not reuse the Participant object fetched during validation to set `completed=True` in `complete_response()` — always reload via an explicit SELECT to avoid operating on a detached or stale ORM instance.
- **HTTPException detail format**: Do not pass `detail={"code": "FORBIDDEN", "message": "..."}` to `HTTPException` unless you have confirmed the global handler accepts structured dicts. The handler may wrap only plain strings and derive the code from the status code itself.
```
