---
date: "2026-04-02"
ticket_id: "ISS-058"
ticket_title: "4.2: Backend — Choice Question Types (radio, dropdown, checkbox)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-058"
ticket_title: "4.2: Backend — Choice Question Types (radio, dropdown, checkbox)"
categories: ["backend", "validation", "service-layer", "testing", "python"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/validators/__init__.py"
  - "backend/app/services/validators/choice_validators.py"
  - "backend/app/services/question_service.py"
  - "backend/tests/test_choice_validators.py"
---

# Lessons Learned: 4.2: Backend — Choice Question Types (radio, dropdown, checkbox)

## What Worked Well
- Isolating all choice-type validation into a dedicated `validators/` subpackage kept `question_service.py` clean and the new logic independently testable
- Keying validator dispatch on `question_type` string (single_choice → radio, dropdown → dropdown, multiple_choice → checkbox) was straightforward to hook into the existing create/update flow without touching models or API routes
- Unit-testing validators directly with mock data (no DB) gave fast feedback on constraint logic before running integration tests
- Following the existing `app.utils.errors.ValidationError` signature from prior services produced consistent error shapes across all validators

## What Was Challenging
- The `./backend:/app` Docker volume mount masks container `.egg-info` build artifacts, making the new `validators/` subpackage invisible to pytest unless the editable install exists on the host — this is a silent, hard-to-diagnose failure mode
- Integration tests using asyncpg require all async SQLAlchemy fixtures to use `scope="function"`; session-scoped async fixtures cause event loop mismatch errors that surface as cryptic pytest-asyncio failures rather than pointing at the real cause
- The container default `DATABASE_URL` uses the `postgresql://` (psycopg2) scheme, which silently fails with the async engine — must override to `postgresql+asyncpg://` before every pytest run

## Key Technical Insights
1. Always run an import smoke-test inside the container immediately after creating a new subpackage: `python -c "from app.services.validators.choice_validators import validate_radio_settings"`. Broken imports surface as clean tracebacks here but as cryptic internal errors inside pytest or alembic.
2. `asyncio_mode = "auto"` in `pyproject.toml` `[tool.pytest.ini_options]` eliminates the need for `@pytest.mark.asyncio` on every async test function — verify it is set before adding decorators.
3. `min_choices > len(answer_options)` must be validated at save time (not just at answer submission time) because the constraint is a settings-level invariant — catching it early avoids confusing runtime errors when answers are later submitted.
4. All async SQLAlchemy engine/session fixtures in test files must use `scope="function"` — never `scope="session"` — when using asyncpg under pytest-asyncio. Copy the exact pattern from `conftest.py` rather than inventing new fixture plumbing.
5. Read `conftest.py` in full before writing any integration test — helper function names (`register_and_login`, `create_survey`, `create_group`, `create_question`, `create_option`) and their exact signatures must be confirmed, not assumed.

## Reusable Patterns
- Validator dispatch pattern: map `question_type` to a validator function in a dict and call it only when the type matches, keeping the service method free of nested conditionals
- Import smoke-test one-liner before running any tests: `python -c "from app.services.validators.choice_validators import validate_radio_settings, validate_dropdown_settings, validate_checkbox_settings"`
- Override DATABASE_URL at test invocation: `DATABASE_URL=postgresql+asyncpg://... pytest ...` to ensure async engine compatibility
- For any new `app/services/` subpackage, verify `__init__.py` exists and the editable install is present on the host before running tests in the container
- Read an existing service that raises `app.utils.errors.ValidationError` before implementing new validators to confirm the constructor signature and error dict shape

## Files to Review for Similar Tasks
- `backend/app/services/validators/choice_validators.py` — canonical example of settings and answer validation for JSONB-backed question types
- `backend/app/services/question_service.py` — shows how to hook validators into create/update without model changes
- `backend/tests/conftest.py` — authoritative source for async fixture patterns, DATABASE_URL override, and HTTP test helpers
- `backend/tests/test_choice_validators.py` — reference for unit + integration test structure for service-layer validators
- Any existing service that raises `app.utils.errors.ValidationError` — confirms error constructor signature

## Gotchas and Pitfalls
- **Volume mount masking editable install**: the `./backend:/app` bind mount hides `.egg-info` built inside the image; new subpackages require the editable install to exist on the host or a rebuild
- **Silent asyncpg scheme mismatch**: `postgresql://` and `postgresql+asyncpg://` are not interchangeable — the wrong scheme fails silently with the async engine rather than raising an obvious connection error
- **Session-scoped async fixtures**: using `scope="session"` on any async SQLAlchemy fixture with asyncpg causes event loop mismatch; always use `scope="function"`
- **min_choices vs option count**: must validate that `min_choices <= len(answer_options)` at settings-save time, not deferred to answer submission — easy to overlook since it crosses two data concerns
- **`other` code collision**: the string `'other'` is a reserved answer code for has_other validation; ensure no answer_option has `code='other'` unless the question explicitly has `has_other=True`
- **passlib CryptContext**: do not import or use passlib anywhere in the validators subpackage — it is an environment-wide constraint even though this ticket does not involve password hashing
```
