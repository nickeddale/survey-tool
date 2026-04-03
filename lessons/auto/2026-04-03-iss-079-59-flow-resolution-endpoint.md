---
date: "2026-04-03"
ticket_id: "ISS-079"
ticket_title: "5.9: Flow Resolution Endpoint"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-079"
ticket_title: "5.9: Flow Resolution Endpoint"
categories: ["api", "expression-engine", "flow-resolution", "testing", "fastapi"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/api/logic.py
  - backend/app/services/expression_engine.py
  - backend/app/services/expressions/resolver.py
  - backend/app/services/expressions/relevance.py
  - backend/app/services/expressions/flow.py
  - backend/app/services/expressions/piping.py
  - backend/tests/test_logic_resolve_flow.py
---

# Lessons Learned: 5.9: Flow Resolution Endpoint

## What Worked Well
- Composing existing expression engine services (build_expression_context, evaluate_relevance, get_next_question/get_previous_question, pipe_all) kept the endpoint function thin and delegation-focused
- Separating ResolveFlowRequest and ResolveFlowResponse as distinct Pydantic models avoided accidental field bleed between input and output
- Mapping known error types (CircularRelevanceError → 422, invalid question code → 404) at the endpoint boundary kept service layer clean and reusable
- Accumulating expression evaluation errors into validation_results rather than raising kept the endpoint non-fatal and useful for UI feedback
- Ownership enforcement via a single WHERE id = :id AND user_id = :user_id query prevented TOCTOU races and existence information leakage

## What Was Challenging
- Identifying the full set of ORM relationship traversals across all four expression engine services (resolver, relevance, flow, piping) to ensure complete eager load coverage — missing any one caused MissingGreenlet at runtime
- Constructing a synthetic response object from the flat answers dict without a database write required careful understanding of what build_expression_context expected as input
- Ensuring all async pytest fixtures used scope='function' consistently across the new test file to avoid event loop mismatch errors with asyncpg under pytest-asyncio

## Key Technical Insights
1. Every relationship accessed by any downstream service must be enumerated before finalising the selectinload chain. Read resolver.py, relevance.py, flow.py, and piping.py in full and list every `.groups`, `.questions`, `.answer_options` traversal before writing the query.
2. The async engine requires the `postgresql+asyncpg://` scheme. The container default DATABASE_URL uses `postgresql://` (psycopg2). Failing to override in tests produces silent failures rather than clear errors.
3. Session-scoped async fixtures are incompatible with asyncpg under pytest-asyncio. Use `@pytest_asyncio.fixture(scope='function')` unconditionally for all engine, session, and TestClient fixtures.
4. A pre-run import smoke test (`python -c "from app.api.logic import router"`) surfaces broken imports with a clean traceback before pytest produces confusing output.
5. UUID fields in Pydantic response models may require explicit serialization configuration — verify against existing response schemas before typing new fields as UUID rather than str.
6. The endpoint is purely computational (no DB writes), so Alembic migrations are not a concern, but the full eager load chain is still critical.

## Reusable Patterns
- **Ownership-enforced fetch:** `SELECT * FROM surveys WHERE id = :id AND user_id = :user_id` — never fetch-then-check
- **Eager load chain:** `selectinload(Survey.groups).selectinload(QuestionGroup.questions).selectinload(Question.answer_options)`
- **Function-scoped async fixtures:** `@pytest_asyncio.fixture(scope='function')` for all engine/session/client fixtures
- **Test invocation with correct DB scheme:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_logic_resolve_flow.py -v`
- **Import smoke test:** `python -c "from app.api.logic import router"` before any test or server run
- **Error boundary mapping:** CircularRelevanceError → HTTP 422; invalid question code → HTTP 404; expression eval errors → validation_results dict

## Files to Review for Similar Tasks
- `backend/app/api/logic.py` — endpoint structure, ownership query pattern, eager load chain
- `backend/app/services/expression_engine.py` — service composition orchestration
- `backend/app/services/expressions/flow.py` — NavigationPosition lookup and directional navigation signatures
- `backend/app/services/expressions/relevance.py` — evaluate_relevance return type (visible/hidden sets)
- `backend/app/services/expressions/piping.py` — pipe_all signature and piped_texts dict shape
- `backend/tests/test_expressions_flow.py` — mock Survey/Group/Question helper patterns for unit tests
- `backend/tests/test_logic_resolve_flow.py` — full test coverage reference for flow resolution endpoint

## Gotchas and Pitfalls
- **MissingGreenlet at runtime:** Any ORM relationship not covered by selectinload will raise MissingGreenlet when traversed inside an async context. Audit all four expression services before writing the query.
- **Silent asyncpg failure:** Using the psycopg2 DATABASE_URL scheme with an async engine fails without a clear error. Always verify the scheme before running tests.
- **Session-scoped fixture incompatibility:** asyncpg and pytest-asyncio will produce event loop mismatch errors if any fixture uses `scope='session'`. Convert all to `scope='function'`.
- **Fetch-then-check ownership anti-pattern:** Two-query ownership checks leak survey existence to unauthorized callers and introduce a TOCTOU window. Single-query approach is both correct and safer.
- **Pydantic UUID serialization:** Response models with UUID-typed fields may serialize incorrectly depending on project Pydantic configuration. Cross-check against existing working response schemas before introducing UUID fields.
- **Expression errors should not raise:** Errors from evaluating individual question expressions must be captured into validation_results, not propagated as HTTP errors, to keep the endpoint useful for partial/invalid form states.
```
