---
date: "2026-04-11"
ticket_id: "ISS-219"
ticket_title: "ReDoS via user-supplied regex in question validation rules"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-219"
ticket_title: "ReDoS via user-supplied regex in question validation rules"
categories: ["security", "dos-protection", "input-validation", "regex"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/validators/regex_utils.py"
  - "backend/app/services/validators/text_validators.py"
  - "backend/app/services/validators/validation_rules.py"
  - "backend/app/services/expressions/functions.py"
  - "backend/pyproject.toml"
  - "backend/tests/test_redos_protection.py"
---

# Lessons Learned: ReDoS via user-supplied regex in question validation rules

## What Worked Well

- Isolating all regex safety logic into a single `regex_utils.py` module kept the fix clean and testable in isolation — other modules only needed small import changes.
- The two-layer defense (complexity pre-screening at save time + runtime timeout at evaluation time) provides defense-in-depth: dangerous patterns are rejected early, but even patterns that slip through are bounded at execution.
- Normalising `regex.error` to stdlib `re.error` in `safe_regex_search` meant callers only needed one catch clause, avoiding error-handling sprawl across three call sites.
- Using `monkeypatch.setattr` on the module-level reference (e.g., `tv.safe_regex_search`) rather than patching the source module was the correct approach for isolating timeout behavior in unit tests without a real catastrophic pattern.
- Importing `app.services.expressions.evaluator` before testing `regex_match()` was necessary to register `EvaluationError` via `_register_error_class` — the test file documented this with a clear comment.

## What Was Challenging

- The `regex` PyPI library raises `TimeoutError` (builtin) on timeout, not a custom `regex.TimeoutError` or `re.error`. This required a smoke-test to confirm the exact exception class before writing catch clauses.
- The complexity pre-screening heuristic (nested quantifier regex) is inherently conservative and can produce false positives on some legitimate patterns. The tradeoff of erring toward rejection was accepted as appropriate for a security control.
- The `from __future__ import annotations` annotation in `functions.py` was already present but did not cause issues because `functions.py` is not a FastAPI router file — only router files with `request: Request` are affected by the ForwardRef problem.
- Docker image rebuild was required after adding `regex>=2023.0` to `pyproject.toml` — forgetting this step would cause `ModuleNotFoundError` inside the container with no obvious cause.
- Test inputs for catastrophic backtracking timeout tests must be long enough (20+ characters plus a non-matching suffix like `!`) to reliably trigger backtracking within a 100ms window. Short inputs may match or fail fast without exercising the timeout path.

## Key Technical Insights

1. **The `regex` PyPI library raises the builtin `TimeoutError`** (not `regex.error` or a library-specific class) when the `timeout` parameter is exceeded. Verify this by running `import regex; regex.search('(a+)+$', 'a'*25, timeout=0.001)` before writing the catch clause.
2. **Two-layer protection is the right architecture for ReDoS**: reject known-dangerous patterns at creation time (saves DB round-trips on every response submission), and enforce a runtime timeout as a fallback for patterns the static analysis misses.
3. **Complexity pre-screening is a heuristic, not a proof**: the nested quantifier regex `\([^()]*[+*]\??[^()]*\)[+*{]` will flag some valid-but-unusual patterns as dangerous. This is acceptable — a false positive that rejects a survey creator's regex is far less harmful than a false negative that hangs the server.
4. **Normalise library exceptions at the adapter boundary**: wrapping `regex.error` as `re.error` in `safe_regex_search` means callers across the codebase remain decoupled from the third-party library's exception hierarchy.
5. **`monkeypatch.setattr` must target the module that imports the function**, not the module that defines it. Patch `app.services.validators.text_validators.safe_regex_search`, not `app.services.validators.regex_utils.safe_regex_search`, to intercept calls made from within `text_validators.py`.

## Reusable Patterns

- **`safe_regex_search(pattern, value, timeout=0.1)` pattern**: wrap any third-party or stdlib regex call on user-supplied patterns with a timeout. Raise `UnprocessableError` (HTTP 422) on `TimeoutError` — consistent with existing validation error surfacing.
- **Complexity pre-screening at creation time**: reject structurally dangerous patterns before they reach the database. Use a regex-on-regex heuristic for nested quantifiers (`(expr+)+` style) and duplicate alternation branches (`(x|x)+` style).
- **Import smoke-test before running a test suite**: `python -c "from app.services.validators.regex_utils import safe_regex_search, validate_regex_complexity"` — broken imports surface as clean tracebacks here but as cryptic `ImportError`/`ModuleNotFoundError` failures elsewhere.
- **Function-scoped async fixtures**: use `@pytest_asyncio.fixture(scope='function')` for all engine/session/client fixtures in new test files. Session-scoped async engines cause event loop mismatch errors with asyncpg under pytest-asyncio.

## Files to Review for Similar Tasks

- `backend/app/services/validators/regex_utils.py` — canonical safe regex helper; extend or reference when adding regex evaluation anywhere in the codebase.
- `backend/app/services/validators/text_validators.py:67-79` — example of correct TimeoutError handling at the validation call site.
- `backend/app/services/validators/validation_rules.py:126-138` — example of pre-screening at question creation time using `validate_regex_complexity`.
- `backend/app/services/expressions/functions.py:284-295` — example of catching both `re.error` and `TimeoutError` in an expression evaluation context.
- `backend/tests/test_redos_protection.py` — complete test suite covering unit, timeout-stub, and integration scenarios for ReDoS protection.

## Gotchas and Pitfalls

- **Rebuild Docker image after adding `regex` to `pyproject.toml`** — `docker compose build backend` is mandatory before any container-based test run, or the import will fail silently inside the container with a `ModuleNotFoundError`.
- **`TimeoutError` is the builtin, not a library-specific exception** — `regex` raises Python's builtin `TimeoutError`, so catching `except TimeoutError:` (not `except regex.TimeoutError:`) is correct.
- **Test strings for catastrophic patterns must be long** — use at least 25–30 repeated characters plus a non-matching suffix (e.g., `"a" * 30 + "!"`) to reliably trigger backtracking within a 100ms timeout. Shorter strings may not exercise the timeout path.
- **DATABASE_URL must use `postgresql+asyncpg://` scheme** in integration tests — the container default `postgresql://` scheme silently fails with the async engine. Always override explicitly when running tests.
- **`from __future__ import annotations` in router files with `request: Request`** causes FastAPI ForwardRef resolution failures (Pydantic models become unresolvable). This file (`functions.py`) uses `from __future__ import annotations` safely because it is not a FastAPI router — only router files are affected.
- **Patching `safe_regex_search` for unit tests**: patch at the call-site module (`app.services.validators.text_validators.safe_regex_search`), not at the definition module, so the monkeypatch actually intercepts calls within the module under test.
- **The EvaluationError registration pattern in `functions.py`** requires importing `evaluator.py` before calling `regex_match()` in tests — without it, `_EvaluationError` is `None` and `regex_match()` raises `RuntimeError` instead of `EvaluationError`.
```
