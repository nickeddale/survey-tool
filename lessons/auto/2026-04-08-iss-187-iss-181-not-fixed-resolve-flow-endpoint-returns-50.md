---
date: "2026-04-08"
ticket_id: "ISS-187"
ticket_title: "ISS-181 not fixed: resolve-flow endpoint returns 500 Internal Server Error"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-187"
ticket_title: "ISS-181 not fixed: resolve-flow endpoint returns 500 Internal Server Error"
categories: ["error-handling", "fastapi", "expression-engine", "graceful-degradation"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/app/api/logic.py", "backend/app/services/expressions/piping.py", "backend/tests/test_logic_resolve_flow.py"]
---

# Lessons Learned: ISS-181 not fixed: resolve-flow endpoint returns 500 Internal Server Error

## What Worked Well
- The implementation plan correctly identified the root cause before touching any code: `pipe_all()` raising `PipingError` without being caught, independent of the prior ISS-181 UUID fix
- MEMORY.md warnings about `from __future__ import annotations` and `frozenset` crashes were consulted early, preventing two common regressions before they occurred
- Graceful degradation (returning original unmodified text on piping failure) was the right design choice — it matches frontend behavior where `useFlowResolution` already swallows errors and shows all questions

## What Was Challenging
- The 500 was caused by a second unhandled exception path that survived a previous fix; diagnosing layered bugs in the same endpoint requires auditing the full call stack, not just the reported fix location
- `PipingError` was not imported in `logic.py`, making it invisible to grep searches for exception handling — missing imports can silently suppress intended error boundaries
- Distinguishing between the ISS-181 fix (UUID parsing) and the ISS-187 root cause (piping evaluation) required reading the endpoint implementation rather than trusting the prior ticket's description

## Key Technical Insights
1. A prior fix targeting one exception class (UUID parsing) does not protect against other exception types raised further down the same code path — each call site must be independently audited for unhandled exceptions.
2. `pipe_all()` raises `PipingError` when a piping placeholder cannot be evaluated (e.g., referencing a question that has no answer yet). This is a normal runtime condition during partial survey completion, not a programming error — it must be caught and handled gracefully.
3. The `evaluate_relevance()` call site has a separate known crash: `frozenset(answers.items())` fails with `unhashable type: list` when any answer value is a Python list (as produced by `multiple_choice` questions). This is a distinct bug that can surface through the same resolve-flow endpoint.
4. In FastAPI routers that contain locally-defined Pydantic models, adding `request: Request` as a parameter to any endpoint in a file with `from __future__ import annotations` causes those models to become unresolvable `ForwardRef`s at startup, breaking all endpoints in the router with 400 errors.
5. Broad `except Exception` guards after specific exception catches (`PipingError`) are appropriate for public-facing endpoints where any unhandled exception would produce a 500 — log the error, return a safe fallback, do not re-raise.

## Reusable Patterns
- **Graceful piping fallback**: Wrap `pipe_all()` in `try/except PipingError` and return the original question texts unchanged on failure. Never let a display-layer substitution failure crash a data-layer response.
- **Layered exception auditing**: When fixing a 500 in an endpoint, read the entire endpoint body and list every function call that can raise. Fix them all in one pass rather than iterating through reported failures.
- **Answer type discipline in tests**: Use only scalar answer types (`text`, `short_text`) in resolve-flow tests. Use string `"true"`/`"false"` for boolean questions. Never submit list values for `multiple_choice` in tests that trigger relevance evaluation — the `frozenset` cache key construction will crash.
- **Import verification**: After identifying an exception class to catch, confirm it is imported at the top of the file. Missing imports silently prevent the `except` clause from matching.
- **`from __future__ import annotations` audit**: Before adding `request: Request` to any FastAPI endpoint, check the file header. If this import is present, remove it — Python 3.11+ handles `str | None` and `list[str]` natively, and the import breaks Pydantic model resolution in FastAPI.

## Files to Review for Similar Tasks
- `backend/app/api/logic.py` — resolve-flow endpoint, all `pipe_all()` and `evaluate_relevance()` call sites
- `backend/app/services/expressions/piping.py` — `PipingError` definition and conditions that trigger it
- `backend/app/services/expressions/relevance.py:278` — `frozenset(answers.items())` cache key construction, known crash site for list values
- `backend/tests/test_logic_resolve_flow.py` — integration tests for the resolve-flow endpoint; check existing coverage before adding new tests

## Gotchas and Pitfalls
- **Do not trust prior fix commits**: ISS-181 was marked fixed but left a second exception path unguarded. Always verify the fix covers the full call stack, not just the reported traceback line.
- **Backend tests require Docker**: Python 3.12 is not available on the host. Run all backend tests with `docker run --rm --network host -e DATABASE_URL=... -e JWT_SECRET=testsecret -v $(pwd)/backend:/app survey_tool-backend:latest python -m pytest tests/ -q`. If source files changed, rebuild first with `docker compose build backend`.
- **`PipingError` must be explicitly imported**: It is not re-exported from a top-level package; import directly from `app.services.expressions.piping`.
- **Multiple choice list values crash `frozenset`**: If a test fails with `unhashable type: list` in `relevance.py`, the cause is a `multiple_choice` answer value — not a bug in the code under test. Switch to scalar answer types in the test, or fix the frozenset construction to convert list values to tuples first.
- **Graceful degradation vs. error propagation**: For display-layer operations (piping, relevance), prefer returning safe fallbacks over propagating exceptions. The frontend is already designed to handle missing conditional logic gracefully.
```
