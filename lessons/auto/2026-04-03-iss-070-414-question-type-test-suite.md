---
date: "2026-04-03"
ticket_id: "ISS-070"
ticket_title: "4.14: Question Type Test Suite"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-070"
ticket_title: "4.14: Question Type Test Suite"
categories: ["testing", "backend", "pytest", "validators", "async"]
outcome: "success"
complexity: "high"
files_modified: ["backend/tests/test_question_types.py"]
---

# Lessons Learned: 4.14: Question Type Test Suite

## What Worked Well
- Using `pytest.mark.parametrize` across all 18 question types dramatically reduced boilerplate — a single parametrized test covered creation, validation, and answer flows for all types simultaneously
- Splitting into unit tests (direct validator calls with MagicMock) and integration tests (HTTP API with real DB) kept the suite fast and thorough: unit tests caught config logic errors early, integration tests caught serialization and DB issues
- Building a centralized `VALID_SETTINGS` / `INVALID_SETTINGS` dict keyed by question type made it easy to add new types and verify coverage at a glance
- The export-import round-trip test served as a powerful smoke test, surfacing serialization bugs that unit tests missed
- Running an import smoke-test (`python -c 'from app.validators import ...'`) before the full pytest run caught broken imports with clean tracebacks rather than cryptic collection errors

## What Was Challenging
- Mapping all 18 question types to their exact required settings, answer_options, subquestions, and validation rules required careful reading of every validator file — no single source of truth existed
- asyncpg event loop mismatch errors surfaced when any async SQLAlchemy fixture was scoped above `function` — this was a silent footgun that only appeared under concurrent test collection
- The default `DATABASE_URL` in the container uses the `psycopg2` scheme, causing cryptic async dialect errors unless explicitly overridden to `postgresql+asyncpg://` for every test run
- Export/import round-trip assertions using raw dict equality produced false failures due to key ordering and `None`-vs-absent differences; field-by-field comparison was required

## Key Technical Insights
1. **MagicMock auto-attributes are unsafe for validator tests**: `MagicMock()` returns a new `MagicMock` for any attribute access, so validators checking `if question.answer_options` or `if question.subquestions is None` would pass incorrectly. Always explicitly assign `type`, `settings`, `is_required`, `answer_options`, and `subquestions` on every mock Question object.
2. **asyncpg requires function-scoped async fixtures**: Session- or module-scoped async SQLAlchemy engine/session fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio. Verify `conftest.py` uses `scope='function'` before writing any async test.
3. **DATABASE_URL scheme must match the async engine**: The container default (`postgresql://`) is the psycopg2 scheme. Async tests require `postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker` — bake this override into every pytest invocation.
4. **Pydantic field omission ≠ exclusion**: Fields absent from a Pydantic schema are not guaranteed to be excluded from serialization. Use explicit field-by-field assertions in round-trip comparisons, or confirm `model_config = ConfigDict(exclude_none=True)` is set before relying on compact output.
5. **`min_choices > option count` is a meaningful edge case**: Checkbox validators must guard against this; testing it explicitly surfaces off-by-one errors that happy-path tests miss.

## Reusable Patterns
- **Import smoke-test before pytest collection**: `python -c 'from app.validators import registry'` — run this before any test suite touching validators to catch broken imports with clean tracebacks.
- **Parametrized validator test skeleton**:
  ```python
  @pytest.mark.parametrize("qtype,settings", VALID_SETTINGS.items())
  def test_valid_config(qtype, settings):
      q = make_question(qtype, settings)
      validate_question_config(q)  # must not raise
  ```
- **Explicit MagicMock builder**:
  ```python
  def make_question(qtype, settings=None, is_required=False, answer_options=None, subquestions=None):
      q = MagicMock()
      q.type = qtype; q.settings = settings or {}
      q.is_required = is_required
      q.answer_options = answer_options or []
      q.subquestions = subquestions or []
      return q
  ```
- **Round-trip assertion pattern**: Compare `codes`, `types`, `settings`, `options`, and `subquestions` field-by-field between two exports rather than asserting dict equality.
- **asyncpg pytest invocation**: `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest -q tests/test_question_types.py`

## Files to Review for Similar Tasks
- `backend/tests/conftest.py` — fixture scopes and DATABASE_URL override; verify `scope='function'` on all async fixtures
- `backend/tests/test_question_types.py` — canonical reference for parametrized multi-type test suites
- `backend/app/validators/__init__.py` — validator registry; source of truth for all 18 type names
- `backend/tests/test_questions.py` — existing question API test patterns and HTTP helper functions
- `backend/tests/test_export.py` — export/import round-trip test patterns
- `backend/app/services/export_service.py` — serialization logic; review before writing round-trip assertions

## Gotchas and Pitfalls
- **Never use session-scoped async fixtures with asyncpg** — the event loop will be closed before the fixture tears down, causing `RuntimeError: Event loop is closed`.
- **Always override DATABASE_URL for pytest runs** — forgetting this produces an obscure `asyncpg dialect not found` error that looks like a missing dependency, not a URL scheme issue.
- **Do not trust MagicMock for emptiness checks** — `bool(MagicMock())` is `True`, so validators checking `if question.subquestions` will behave differently than validators checking `if question.subquestions is None`. Assign explicit empty lists/None values.
- **Export round-trip with raw dict equality is fragile** — JSON serializers may emit `null` vs omit the key depending on `exclude_none` config; always compare semantically relevant fields explicitly.
- **Matrix with zero subquestions must be tested explicitly** — it is a valid creation state but must fail answer validation; this edge case is easy to miss in a purely happy-path parametrized suite.
- **Regex validators with unescaped special characters** (e.g., `[`, `{`, `\`) must be tested to confirm the validator rejects malformed patterns rather than raising an unhandled `re.error`.
```
