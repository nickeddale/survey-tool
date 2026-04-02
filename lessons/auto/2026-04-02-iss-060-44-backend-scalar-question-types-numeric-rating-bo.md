---
date: "2026-04-02"
ticket_id: "ISS-060"
ticket_title: "4.4: Backend — Scalar Question Types (numeric, rating, boolean, date)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-060"
ticket_title: "4.4: Backend — Scalar Question Types (numeric, rating, boolean, date)"
categories: ["validation", "backend", "python", "question-types"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/validators/scalar_validators.py"
  - "backend/app/services/question_service.py"
  - "backend/tests/test_scalar_validators.py"
---

# Lessons Learned: 4.4: Backend — Scalar Question Types (numeric, rating, boolean, date)

## What Worked Well
- The dispatch-dict pattern (`_SCALAR_TYPE_VALIDATORS`) established by choice and matrix validators translated cleanly — scalar validators required only `(settings)` with no `answer_options` or `subquestions`, making the integration simpler than prior types.
- Using `MagicMock()` for the question object in unit tests kept the test file entirely self-contained with no database fixtures required; the mock's `is_required` and `settings` attributes were all that answer validators needed.
- Separating settings validators from answer validators within the same file kept cohesion high without creating unnecessary module fragmentation.
- The `_date_format_to_python` helper cleanly isolated the YYYY-MM-DD → strptime conversion, making date parsing testable independently and preventing format-string bugs from leaking into multiple places.
- Floating-point step divisibility used `round(..., 10)` to guard against IEEE 754 precision errors — a subtle but necessary defensive measure for values like `0.5`.

## What Was Challenging
- Date format conversion required careful ordering of replacements in `_date_format_to_python`: `MM` must be replaced before `mm` (minutes) and `DD` before `dd` to avoid double-substitution producing malformed strptime strings.
- Python's `isinstance(True, int)` returns `True`, so boolean settings values like `label_true: True` (a bool, not a string) would silently pass a naive `isinstance(x, str)` check — but the inverse problem arises for rating `step`: a float like `1.5` passes `isinstance(x, (int, float))` but fails the stricter `isinstance(x, int)` check required for rating's integer-only step. The asymmetry between numeric (float-ok) and rating (int-only) required explicit attention.
- The boolean answer validator intentionally rejects Python `True`/`False` values and only accepts the strings `"true"` and `"false"`. This is a deliberate API contract but easy to overlook when writing tests — `True in ("true", "false")` evaluates to `False` correctly, but reasoning about it requires care since `True == 1`.
- Integration tests require unique email addresses per test to avoid registration conflicts across the shared test database; a naming convention like `sv_{type}_{scenario}@example.com` was adopted to prevent collisions.

## Key Technical Insights
1. **Scalar validators are the simplest dispatch case**: unlike choice validators (which need `answer_options`) and matrix validators (which need both `answer_options` and `subquestions`), scalar validators only need `settings` — the `if settings is not None` guard at the call site in `question_service.py` is sufficient.
2. **Float step validation needs a two-sided modulo check**: `remainder != 0 and round(remainder - step, 10) != 0` handles the edge case where floating-point modulo produces a remainder indistinguishable from `step` itself rather than `0`.
3. **Date range comparisons require parsing both bounds with the same format**: always resolve `date_format` before validating `min_date`/`max_date` so the same `python_format` string is used for both bounds and the answer value — mismatched formats would silently produce wrong comparisons.
4. **Rating enforces integer types strictly** while numeric accepts `int | float` — this reflects domain semantics (star ratings are whole numbers) and must be preserved in both settings and answer validators.
5. **`None` settings at the service layer is valid**: all four validators short-circuit on `settings is None`, which means omitting settings entirely at question creation is always acceptable — defaults are applied at render/response time, not stored.

## Reusable Patterns
- `_SCALAR_TYPE_VALIDATORS` dict dispatch in `question_service.py`: add new scalar types by inserting one entry; no branching logic changes needed.
- `MagicMock` question pattern for answer validator unit tests (see `make_question()` in `test_scalar_validators.py`): avoids database setup for pure logic tests.
- `_date_format_to_python` / `_parse_date` helper pair: reusable for any future date-aware validators; keep replacement order stable (longer tokens first).
- Integration test email convention `sv_{type}_{scenario}@example.com` prevents cross-test registration conflicts in a shared test database.
- Modulo-with-rounding pattern for float step divisibility: `round((value - base) % step, 10)` with secondary check `round(remainder - step, 10) != 0`.

## Files to Review for Similar Tasks
- `backend/app/services/validators/scalar_validators.py` — canonical example of a settings+answer validator pair for simple (non-collection) question types.
- `backend/app/services/validators/choice_validators.py` — reference for validators that also check `answer_options`.
- `backend/app/services/question_service.py` lines 43–48 and 209–211, 317–318 — the three-tier dispatch pattern for choice, matrix, and scalar validators.
- `backend/tests/test_scalar_validators.py` — reference for unit + integration test structure when no async fixtures are needed for the unit layer.

## Gotchas and Pitfalls
- **`isinstance(True, int)` is `True` in Python**: always check `isinstance(x, bool)` before `isinstance(x, int)` when you want to exclude booleans from integer validation, or use `type(x) is int`. Rating's `min_rating`/`max_rating` should reject `True`/`False` even though bools are ints — add an explicit `not isinstance(x, bool)` guard if this matters.
- **Date format replacement order matters**: replace `YYYY` before `MM` before `DD`; replace `HH` before `mm` (for minutes) before `ss`. Swapping order can produce double-substituted or invalid strptime tokens.
- **Integration tests share a database**: each test function that calls `register_and_login` needs a globally unique email or subsequent runs will collide on the unique email constraint.
- **`settings=None` vs `settings={}` are both valid but distinct**: `None` means no settings provided (validator skips entirely); `{}` means settings provided but all fields omitted (validator runs but accepts empty dict). Tests should cover both explicitly.
- **Run `python -c "from app.services.validators.scalar_validators import *"` before pytest** to catch import errors with a clean traceback rather than cryptic pytest collection failures.
- **Override `DATABASE_URL` to `postgresql+asyncpg://` for any local pytest run** — the container default uses the psycopg2 scheme which fails silently with the async SQLAlchemy engine.
```
