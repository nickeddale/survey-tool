---
date: "2026-04-03"
ticket_id: "ISS-084"
ticket_title: "6.2: Server-Side Answer Validation"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-084"
ticket_title: "6.2: Server-Side Answer Validation"
categories: ["validation", "error-handling", "fastapi", "sqlalchemy", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/response_service.py"
  - "backend/app/utils/errors.py"
  - "backend/app/services/validators/__init__.py"
  - "backend/app/services/validators/_types.py"
  - "backend/app/main.py"
  - "backend/tests/services/test_response_service.py"
  - "backend/tests/api/test_responses.py"
---

# Lessons Learned: 6.2: Server-Side Answer Validation

## What Worked Well
- Reusing the existing `validate_answer()` dispatcher from `app/services/validators/__init__.py` kept the implementation focused and avoided duplicating validation logic.
- The flat error collection loop pattern (iterate all inputs, collect all errors, raise once at the end) mapped cleanly to the ticket requirement and produced a clean, readable `_validate_answers()` helper.
- Reading `app/main.py` before wiring the new `AnswerValidationError` prevented accidental duplication of exception handler logic and preserved the established layered error-handling pattern.
- Querying answer_options and subquestions with both resource ID and parent survey_id in a single DB call enforced survey ownership and matched the ownership-enforced pattern already established in the codebase.

## What Was Challenging
- Confirming whether the existing `AppError` base class already supported a nested `errors` list required careful reading of `app/utils/errors.py` before writing any implementation code. The base class did not support it, making an explicit `AnswerValidationError` subclass with an overridden `to_response()` necessary.
- Ensuring the serialized HTTP response body actually included the `errors` array required explicit test assertions rather than trusting schema-level field omission or Pydantic model defaults.
- Coordinating the async SQLAlchemy session fixture scope correctly across all new tests required verifying existing `conftest.py` fixtures use `scope="function"` before writing new ones.

## Key Technical Insights
1. **Never short-circuit on the first validation error.** The ticket explicitly required collecting ALL validation errors across ALL questions before returning. A `return`-on-first-error pattern would have passed basic tests but failed the multi-error integration tests.
2. **`AppError` subclasses must explicitly override `to_response()` to include nested fields.** Pydantic field omission is not the same as confirmed field exclusion — the `errors` array will silently disappear from the response if not explicitly serialized in `to_response()`.
3. **Run an import smoke-test before any implementation.** `python -c "from app.services.response_service import create_response; from app.services.validators import validate_answer"` catches broken imports before they surface as cryptic runtime failures.
4. **All async pytest fixtures must use `scope="function"`.** Session- or module-scoped async SQLAlchemy engines cause event loop mismatch errors with asyncpg under pytest-asyncio; this is non-negotiable.
5. **The DATABASE_URL must be overridden to `postgresql+asyncpg://` for every test invocation.** The container default uses the psycopg2 scheme, which silently fails with the async engine.
6. **Do not use passlib CryptContext.** bcrypt >= 4.x breaks it at runtime with `AttributeError: module 'bcrypt' has no attribute '__about__'`. Use `bcrypt.hashpw/checkpw/gensalt` directly.

## Reusable Patterns
- **Flat error collection loop:** iterate all answer inputs, call `validate_answer()` for each, append all returned errors to a single flat list, and raise a single `AnswerValidationError` at the end only if the list is non-empty. Never raise inside the loop.
- **Ownership-enforced DB lookup:** when fetching answer_options or subquestions inside `_validate_answers()`, filter by both the question ID and the parent survey_id in a single query to enforce survey ownership and prevent information leakage.
- **Explicit `to_response()` override:** any `AppError` subclass that adds fields beyond the base class (e.g., an `errors` array) must override `to_response()` and include those fields explicitly in the returned dict.
- **Explicit absence assertions in tests:** for every field that should be absent from an error response body, add a positive assertion (`assert "field" not in body["detail"]`) rather than relying on Pydantic schema omission.
- **Import smoke-test:** run `python -c "from app.services.<module> import <symbol>"` as the first step after any new module or import is added, before running the full test suite.

## Files to Review for Similar Tasks
- `backend/app/services/response_service.py` — primary implementation of `_validate_answers()` and the `create_response()` validation gate.
- `backend/app/utils/errors.py` — `AppError` base class and `AnswerValidationError` subclass with `to_response()` override; canonical reference for adding new structured error types.
- `backend/app/services/validators/__init__.py` — `validate_answer()` dispatcher and `_ANSWER_VALIDATORS` registry; reference for any future question-type-specific validation.
- `backend/app/main.py` — FastAPI exception handler registration; must be read before wiring any new `AppError` subclass.
- `backend/tests/api/test_responses.py` — integration tests asserting the exact `{detail: {code, message, errors: [...]}}` response body shape; reference for structuring similar multi-error integration tests.
- `backend/tests/services/test_response_service.py` — unit tests for `_validate_answers()` with mocked DB and validator; reference for isolating service-layer validation logic in tests.

## Gotchas and Pitfalls
- **passlib CryptContext is broken with bcrypt >= 4.x.** Do not introduce it anywhere, even in test fixtures. Use `bcrypt` directly.
- **Pydantic schema omission does not guarantee field exclusion in HTTP responses.** Always add explicit test assertions that verify the presence or absence of every field in the actual response body.
- **asyncpg + session-scoped fixtures = event loop mismatch.** All async fixtures must be `scope="function"`. Check existing `conftest.py` before writing new fixtures.
- **Container default DATABASE_URL uses psycopg2 scheme** (`postgresql://`) which silently fails with the async engine. Always override: `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker" pytest`.
- **Short-circuiting on the first validation error is a silent regression.** The multi-error integration test is the only reliable guard against this; do not skip it.
- **`to_response()` must be explicitly overridden** in any `AppError` subclass that adds a nested `errors` list — do not assume the base class will pass unknown fields through.
```
