---
date: "2026-04-06"
ticket_id: "ISS-119"
ticket_title: "SEC-05: Expand rate limiting to all mutating endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-119"
ticket_title: "SEC-05: Expand rate limiting to all mutating endpoints"
categories: ["rate-limiting", "security", "api", "fastapi", "slowapi"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/limiter.py
  - backend/app/api/auth.py
  - backend/app/api/surveys.py
  - backend/app/api/question_groups.py
  - backend/app/api/questions.py
  - backend/app/api/answer_options.py
  - backend/app/api/responses.py
  - backend/app/api/participants.py
  - backend/app/api/quotas.py
  - backend/app/api/assessments.py
  - backend/app/api/webhooks.py
  - backend/tests/test_rate_limiting.py
---

# Lessons Learned: SEC-05: Expand rate limiting to all mutating endpoints

## What Worked Well
- Reading all target files in parallel before making any edits prevented assumption-based errors across 10+ router files
- Introducing a shared `RATE_LIMITS` dict in `limiter.py` centralized configuration and eliminated magic strings scattered across router files
- Matching the existing decorator ordering established by already-protected endpoints ensured consistency and correctness
- The existing test pattern in `test_rate_limiting.py` (unique IPs or memory backend isolation) was straightforward to replicate for new endpoint tests

## What Was Challenging
- Verifying that every newly-decorated route handler already accepted `request: Request` in its signature — missing this causes slowapi to silently skip or error
- Ensuring new `RATE_LIMITS` dict values exactly matched existing limits on auth/response endpoints to avoid inadvertently changing production behavior
- Coverage across ~60 endpoints required systematic file-by-file discipline to avoid missing any POST/PUT/PATCH/DELETE handler
- Rate limiter in-memory state persisting across test client requests required careful test isolation (distinct IPs or backend reset) to prevent false positives or state bleed between test cases

## Key Technical Insights
1. slowapi requires `request: Request` in every decorated route handler's signature — its absence causes the decorator to silently skip enforcement or raise at runtime; always audit signatures before applying `@limiter.limit`
2. `@limiter.limit` must be placed above the `@router.<verb>` decorator; wrong ordering silently bypasses rate limiting with no error
3. The project's custom exception handler shapes 429 responses as `{"detail": {"code": "RATE_LIMITED", "message": "Too many requests. Please slow down."}}` — slowapi's default format does not match; tests must assert this exact shape
4. slowapi rate limit strings must follow the `"N/period"` format (e.g. `"60/minute"`) — integer values are not accepted
5. In-memory backend state persists across requests within a test session; tests must use unique source IPs per test case or explicitly reset backend state to avoid cross-test contamination
6. Centralizing limits in a `RATE_LIMITS` dict makes auditing and future adjustments trivial — a single source of truth is far preferable to string literals in every decorator

## Reusable Patterns
- Define `RATE_LIMITS = {"default_mutating": "60/minute", ...}` in `limiter.py` and import it in all router files rather than hardcoding strings
- Before applying decorators to any router, run a grep for `request: Request` in each handler signature and add the parameter where missing
- Read all affected files in a single parallel batch before writing any edits — avoids editing based on stale assumptions
- Use `X-Forwarded-For` header injection or a fixture that sets a unique IP per test to isolate limiter state between test cases
- Write at least one POST and one DELETE test per router file to ensure broad coverage without testing every single endpoint exhaustively
- Assert both status code `429` and full response body shape in rate limit tests — status code alone does not confirm correct error format

## Files to Review for Similar Tasks
- `backend/app/limiter.py` — canonical location for `RATE_LIMITS` dict and limiter instance; always read before modifying limits
- `backend/tests/test_rate_limiting.py` — reference for IP isolation pattern, 429 body assertion shape, and fixture setup
- `backend/app/api/auth.py` — original reference for correct `@limiter.limit` / `@router.<verb>` decorator ordering
- `backend/app/api/responses.py` — original pre-existing rate-limited endpoint; confirms `request: Request` signature requirement in practice

## Gotchas and Pitfalls
- Applying `@limiter.limit` without `request: Request` in the handler signature causes silent bypass or a runtime error — verify every signature before and after editing
- Wrong decorator order (`@router.post` above `@limiter.limit`) silently disables rate limiting — always put `@limiter.limit` on top
- Do not define new `RATE_LIMITS` dict entries for auth/response endpoints without first reading their existing decorator values — mismatches silently change production limits
- The 429 response body is shaped by the project's custom exception handler, not slowapi's default — do not assume slowapi's default format matches
- Rate limiter state is global within a test session; N+1 hits to the same endpoint across different tests will trigger 429 prematurely unless IPs are isolated per test
- Relying solely on decorator presence as proof of correct rate limiting is insufficient — actually run the test suite against the test database to confirm 429 responses are produced
```
