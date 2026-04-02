---
date: "2026-04-02"
ticket_id: "ISS-062"
ticket_title: "4.6: Backend — Question Validation Engine"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-062"
ticket_title: "4.6: Backend — Question Validation Engine"
categories: ["validation", "architecture", "testing", "python", "fastapi"]
outcome: "success"
complexity: "high"
files_modified:
  - "app/services/validators/__init__.py"
  - "app/services/validators/validation_rules.py"
  - "app/services/validators/text_validators.py"
  - "app/services/validators/misc_validators.py"
  - "app/services/validators/choice_validators.py"
  - "app/services/validators/scalar_validators.py"
  - "app/services/validators/matrix_validators.py"
  - "app/services/question_service.py"
  - "app/utils/errors.py"
  - "tests/test_validation_engine.py"
---

# Lessons Learned: 4.6: Backend — Question Validation Engine

## What Worked Well
- Defining `ValidationError` as a plain Python `@dataclass` (not Pydantic) kept it lightweight, import-safe, and free of forward-ref issues
- The registry pattern (`VALIDATOR_REGISTRY: dict[str, Callable]` populated at module import time) made dispatch clean and extensible with zero runtime overhead
- Reading `app/utils/errors.py` before writing any `raise UnprocessableError(...)` call prevented constructor mismatch bugs — the constructor takes a single `message: str`, not a list
- Running an import smoke-test (`python -c 'from app.services.validators import validate_question_config, validate_answer'`) before pytest caught broken imports early and avoided confusing collection failures
- Running an app smoke-test (`python -c 'from app.main import app'`) after wiring `question_service.py` confirmed no circular imports or missing symbols before the full test suite

## What Was Challenging
- Confirming that existing validator callables (choice, scalar, matrix) returned `list[ValidationError]` rather than raising directly was a critical pre-condition before designing the unified registry contract — a silent shape mismatch would have broken error collection without a clear traceback
- The `DATABASE_URL` scheme mismatch (psycopg2 default vs. asyncpg required) was a persistent footgun: tests silently failed to connect without the explicit override `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker'`
- pytest-asyncio's event loop scoping required all async fixtures to use `scope='function'` — any `scope='session'` or `scope='module'` produced event loop mismatch errors under asyncpg that were difficult to diagnose

## Key Technical Insights
1. Always read `app/utils/errors.py` before writing any `raise UnprocessableError(...)` — the constructor signature is a single `message: str`, so concatenating `ValidationError` messages into one string is intentional, not a shortcut
2. The `VALIDATOR_REGISTRY` dict must be populated at import time (not lazily) so that missing registrations surface immediately on startup rather than at the first request
3. `validate_validation_rules` should validate key presence, type correctness, and constraint ordering (`min <= max`, `min_length <= max_length`) as distinct, independent checks so each failure produces a precise `ValidationError` with a named field path
4. Regex and `custom_expression` strings should be syntax-checked (`re.compile(pattern)`) without semantic evaluation — this is sufficient for M4 and defers runtime evaluation to M5
5. `UnprocessableError` must be raised (not raw `HTTPException(422)`) so the global exception handler in `main.py` wraps the response in the `{detail: {code, message}}` envelope correctly
6. Never import or use passlib `CryptContext` anywhere in validators or test helpers — it is broken at runtime with bcrypt >= 4.x; use `bcrypt.hashpw`/`bcrypt.checkpw` directly

## Reusable Patterns
- **ValidationError dataclass:** `@dataclass\nclass ValidationError:\n    field: str\n    message: str`
- **Registry dispatch:** `VALIDATOR_REGISTRY: dict[str, Callable] = {'radio': validate_radio, 'checkbox': validate_checkbox, ...}` — call with `VALIDATOR_REGISTRY[question_type](...)` inside `validate_question_config` and `validate_answer`
- **Pre-test import smoke-test:** `python -c 'from app.services.validators import validate_question_config, validate_answer'`
- **Pre-suite app smoke-test:** `python -c 'from app.main import app'`
- **Test DATABASE_URL override:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_validation_engine.py -v`
- **Async fixture scope:** Always `@pytest.fixture(scope='function')` for any async fixture that touches asyncpg or the test DB
- **Error raise site pattern:** Collect all `ValidationError` objects into a list, then `raise UnprocessableError(errors[0].message)` or join messages as a single string before raising — never pass a list directly

## Files to Review for Similar Tasks
- `app/services/validators/__init__.py` — canonical registry pattern and dispatcher implementations
- `app/services/validators/validation_rules.py` — reference for validating JSONB config keys with typed constraint checking
- `app/utils/errors.py` — always check constructor signature before any new `raise UnprocessableError(...)` call
- `tests/test_validation_engine.py` — unit and integration test patterns: mock-based ValidationError tests, httpx AsyncClient integration tests
- `backend/tests/conftest.py` — function-scoped async fixture patterns for asyncpg test sessions

## Gotchas and Pitfalls
- **DATABASE_URL scheme mismatch:** The container default uses the psycopg2 scheme; asyncpg requires the `postgresql+asyncpg://` scheme. Failing to override silently prevents DB connections without a clear error
- **Async fixture scope:** `scope='session'` or `scope='module'` with asyncpg under pytest-asyncio produces event loop mismatch errors — always use `scope='function'`
- **passlib CryptContext:** Broken at runtime with bcrypt >= 4.x — never import it, even transitively through test helpers; use `bcrypt.hashpw`/`bcrypt.checkpw` directly
- **UnprocessableError constructor:** Accepts a single `message: str` — do not attempt to pass a list of errors or a structured object
- **Existing validator return shape:** Confirm that pre-existing choice/scalar/matrix validators return `list[ValidationError]` before wiring them into the unified registry — if they raise directly, the registry contract breaks silently
- **PostgreSQL ENUMs:** Do not add native PostgreSQL ENUM types for any new type columns in validators — use `String + CHECK constraint` to avoid `DuplicateObject` errors on schema re-run
- **Raw HTTPException vs UnprocessableError:** Always raise `UnprocessableError` (not `HTTPException(422)`) from service-layer validators so the global error handler formats the 422 response correctly
```
