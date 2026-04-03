---
date: "2026-04-03"
ticket_id: "ISS-085"
ticket_title: "6.3: Relevance-Aware Validation and Response Completion"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-085"
ticket_title: "6.3: Relevance-Aware Validation and Response Completion"
categories: ["fastapi", "sqlalchemy", "pydantic", "validation", "expression-engine"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/schemas/response.py
  - backend/app/services/response_service.py
  - backend/app/api/responses.py
  - backend/tests/test_responses.py
---

# Lessons Learned: 6.3: Relevance-Aware Validation and Response Completion

## What Worked Well
- Separating `ResponseUpdate` (input) from `ResponseResponse` (output) as distinct Pydantic v2 schemas prevented accidental field leakage and kept the PATCH contract clean
- Delegating all completion logic to `complete_response()` in the service layer kept the endpoint handler thin and testable
- Using the existing `AsyncClient` fixture pattern from `conftest.py` meant integration tests required no new fixture infrastructure
- The implementation plan's warnings about `selectinload` chain completeness and `passlib` avoidance prevented known runtime failures before they occurred

## What Was Challenging
- Ensuring the full eager-load chain (`Response -> answers -> question -> group -> survey.groups -> group.questions`) was complete in a single query to avoid `DetachedInstanceError` inside the async context
- Mapping `AnswerValidationError` from the service layer to a consistent HTTP 422 shape matching existing validation error patterns in the API layer
- Correctly threading the `visible_question_ids` set through `_validate_answers()` without creating silent passthrough bugs for hidden questions

## Key Technical Insights
1. **Relevance-aware validation requires two passes**: first evaluate all relevance expressions to determine which questions are visible, then filter validation to only that visible set — hidden required questions must be skipped entirely, not just softened.
2. **`visible_question_ids` must be an explicit required parameter** in `_validate_answers()`, not an optional defaulting to `None`. An optional default risks accidentally validating all questions when the caller omits the argument.
3. **FastAPI route ordering matters**: the PATCH `/{survey_id}/responses/{response_id}` route must be registered explicitly and its position relative to POST/GET routes verified to avoid shadowing.
4. **Async SQLAlchemy fixtures must be `scope='function'`**: session- or module-scoped async engine fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio.
5. **`DATABASE_URL` must be overridden to `postgresql+asyncpg://`** for all async test runs; the environment default uses the psycopg2 scheme and will fail silently or with cryptic errors under an async engine.
6. **Do not use passlib `CryptContext`**: bcrypt 5.0.0 is installed; passlib 1.7.x raises `AttributeError` at runtime. Use `bcrypt.hashpw`/`checkpw`/`gensalt` directly.
7. **Already-completed response conflict (409)** must match the existing error shape convention in `app/api/responses.py` — verify before implementing rather than assuming HTTP 409 is handled uniformly.

## Reusable Patterns
- **Completion flow pattern**: load entity with full eager-load chain → evaluate relevance → filter validation to visible set → mutate state → commit → return output schema
- **Distinct input/output schemas**: always define a separate `*Update` schema for PATCH input and `*Response` schema for output; never reuse or extend between the two
- **Import smoke-test before running tests**: `python -c 'from app.services.response_service import complete_response'` surfaces broken imports with clean tracebacks rather than cryptic pytest/SQLAlchemy errors
- **Explicit `visible_question_ids` parameter**: pass the visible set as a required argument rather than an optional to prevent silent validation passthrough

## Files to Review for Similar Tasks
- `backend/app/services/response_service.py` — `complete_response()` and updated `_validate_answers()` for the relevance-aware validation pattern
- `backend/app/api/responses.py` — PATCH endpoint handler and 409/422 error-shape conventions
- `backend/app/schemas/response.py` — `ResponseUpdate` vs `ResponseResponse` schema separation example
- `backend/tests/test_responses.py` — integration test pattern for create-survey → POST-response → PATCH-complete flow

## Gotchas and Pitfalls
- **Incomplete `selectinload` chain**: any relationship left as `lazy='raise'` in the load chain for `survey -> groups -> questions -> options` will raise `MissingGreenlet` or `DetachedInstanceError` inside an async context — verify the full chain before calling `evaluate_relevance()`
- **passlib is broken**: do not introduce `CryptContext` anywhere; bcrypt 5.0.0 is installed and passlib 1.7.x will raise `AttributeError` at runtime
- **Session-scoped async fixtures**: always use `scope='function'` for async SQLAlchemy engine/session fixtures in `conftest.py`
- **DATABASE_URL scheme**: the default environment value uses `postgresql://` (psycopg2); all pytest invocations must explicitly set `postgresql+asyncpg://` or async tests will fail
- **Optional `visible_question_ids` default `None`**: if the parameter defaults to `None` and the call site omits it, hidden questions will be validated — make the parameter explicitly required or guard with an assertion
- **Pydantic field omission ≠ field exclusion**: if `ResponseUpdate` shares a base with `ResponseResponse`, internal or sensitive fields may leak into PATCH response output — keep the schemas fully separate
```
