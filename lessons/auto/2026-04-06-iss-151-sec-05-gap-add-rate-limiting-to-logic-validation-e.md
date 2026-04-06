---
date: "2026-04-06"
ticket_id: "ISS-151"
ticket_title: "SEC-05 gap: Add rate limiting to logic validation endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-151"
ticket_title: "SEC-05 gap: Add rate limiting to logic validation endpoints"
categories: ["rate-limiting", "security", "fastapi", "testing"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/api/logic.py", "backend/tests/test_rate_limiting.py"]
---

# Lessons Learned: SEC-05 gap: Add rate limiting to logic validation endpoints

## What Worked Well
- Reading `app/limiter.py` and existing rate-limited endpoints before writing any code confirmed the exact `RATE_LIMITS` key name, import paths, and decorator ordering without guessing
- Following the established pattern from other rate-limited POST endpoints (e.g. in `app/api/surveys.py`) made the decorator placement unambiguous
- The existing test structure in `tests/test_rate_limiting.py` provided a clear template for the new test functions

## What Was Challenging
- The `from __future__ import annotations` import in `logic.py` is a hidden footgun: adding `request: Request` to an endpoint in such a file causes locally-defined Pydantic models to become unresolvable `ForwardRef`s, silently turning body params into query params and returning 400 errors
- The rate-limit test loop (60+ real HTTP requests) can be slow if no fixture override is available — always check for an existing test-scoped limiter override before writing a brute-force loop

## Key Technical Insights
1. **`from __future__ import annotations` breaks FastAPI body resolution when `Request` is added**: In Python 3.11, this import is unnecessary (native support for `str | None`, `list[str]`, etc.). Removing it is the correct fix; do not use `Body(...)` as a workaround — it triggers a different `PydanticUserError: TypeAdapter not fully defined` crash.
2. **Decorator ordering is significant and silent**: `@router.post(...)` must come first (outermost), then `@limiter.limit(...)` immediately above the `def`. Wrong order does not raise an error at startup but breaks rate limiting silently.
3. **`request: Request` must be added to the function signature** for `slowapi` to identify the client — omitting it causes the limiter to raise a `ValueError` at runtime rather than a startup error.
4. **RATE_LIMITS key is `'default_mutating'`**: Confirmed in `app/limiter.py`. Do not assume the key name — always read `limiter.py` first.

## Reusable Patterns
- Before modifying any router file for rate limiting: read `app/limiter.py`, read 2–3 already-rate-limited POST endpoints, and read the full target function signatures to avoid duplicate `request` params and wrong key names.
- To add rate limiting to a FastAPI endpoint:
  ```python
  @router.post("/path")
  @limiter.limit(RATE_LIMITS["default_mutating"])
  async def my_endpoint(request: Request, ...):
  ```
- Remove `from __future__ import annotations` from any router file where you add `request: Request` to avoid Pydantic `ForwardRef` resolution failures.
- Rate limit test pattern: exhaust the limit in a loop (`for _ in range(60): client.post(...)`), then assert the next call returns `HTTP 429` with `response.json()["detail"]["code"] == "RATE_LIMITED"`.

## Files to Review for Similar Tasks
- `backend/app/limiter.py` — source of truth for `RATE_LIMITS` keys and limiter instance export
- `backend/app/api/surveys.py` — reference implementation of rate-limited POST endpoints (decorator order, import style)
- `backend/tests/test_rate_limiting.py` — reference for test structure, fixtures, and 429 assertion pattern
- `backend/app/api/logic.py` — target file; note the `from __future__ import annotations` removal requirement

## Gotchas and Pitfalls
- **`from __future__ import annotations` + `request: Request` = silent 400 errors**: Pydantic models defined locally in the file become `ForwardRef`s; FastAPI misidentifies body params as query params. Fix: remove the import entirely.
- **Do not use `Body(...)` to work around ForwardRef issues**: it causes `PydanticUserError: TypeAdapter not fully defined` — a different crash that is harder to diagnose.
- **Duplicate `request: Request` parameter**: If the endpoint already had `request` in its signature for another reason, adding it again causes a `TypeError` at startup. Always read the full signature first.
- **Slow tests from brute-force loops**: If no test-scoped rate limit override exists, 60 real HTTP requests per test case adds significant latency to the test suite. Check for an override fixture in `conftest.py` before writing the loop.
- **Wrong decorator order is silent**: `@limiter.limit` above `@router.post` will not error at startup but rate limiting will not function — always verify against existing working examples.
```
