---
date: "2026-04-06"
ticket_id: "ISS-121"
ticket_title: "SEC-07: Implement API key scope validation for response detail"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-121"
ticket_title: "SEC-07: Implement API key scope validation for response detail"
categories: ["security", "authentication", "api-keys", "fastapi-dependencies"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/dependencies.py", "backend/app/api/responses.py", "backend/tests/test_responses.py"]
---

# Lessons Learned: SEC-07: Implement API key scope validation for response detail

## What Worked Well
- Reading `app/dependencies.py` before writing any code prevented duplication of header-parsing logic and clarified the correct injection point for scope checking
- The dependency factory pattern (`def require_scope(scope: str) -> Callable`) integrated cleanly with FastAPI's `Depends()` system and matched the existing function-based dependency style in the codebase
- Distinguishing API key vs JWT auth via `X-API-Key` header presence was straightforward once the existing dependency chain was understood
- Raising `ForbiddenError` (HTTP 403) rather than `HTTPException(401)` matched the existing error utility pattern and kept auth error semantics correct

## What Was Challenging
- The misleading docstring at `responses.py:297` claimed scope validation was already present — this kind of stale documentation creates false confidence and must be verified against actual code before trusting it
- Ensuring JWT auth passed through unconditionally required careful attention: the scope check must only activate when `X-API-Key` is the auth mechanism, not on every request

## Key Technical Insights
1. A docstring claiming a security check exists is not the same as the check existing — always verify implementation against documentation, especially for security-critical paths
2. `require_scope` must raise `ForbiddenError` (HTTP 403), not `HTTPException(401)` — 401 signals missing/invalid credentials; 403 signals valid credentials with insufficient permissions; conflating these breaks RFC 7235 semantics and client error handling
3. JWT auth must pass through the scope check unconditionally — scope enforcement only applies to API key auth; adding a scope gate on the JWT path would be a silent regression
4. Running `python -c 'from app.dependencies import require_scope'` as an import smoke-test immediately after editing `dependencies.py` catches broken exports before pytest surfaces them as cryptic collection errors
5. The dependency factory pattern — an outer function returning an async inner function — is the idiomatic FastAPI approach and allows `Depends(require_scope('responses:read'))` to read cleanly at the endpoint signature level

## Reusable Patterns
- **Scope-check dependency factory:**
  ```python
  def require_scope(scope: str):
      async def _check(request: Request, db: AsyncSession = Depends(get_db)):
          api_key_header = request.headers.get("X-API-Key")
          if api_key_header:
              api_key = await load_api_key(db, api_key_header)
              if not api_key or scope not in (api_key.scopes or []):
                  raise ForbiddenError("Insufficient API key scope")
      return _check
  ```
- **Test coverage matrix for scope-gated endpoints:** (1) API key with required scope → 200, (2) API key without required scope → 403, (3) API key with empty/None scopes → 403, (4) JWT auth → 200 unaffected
- **403 body shape assertion:** Always assert the full `{detail: {code, message}}` envelope, not just the status code — field presence is not the same as field correctness
- **Import smoke-test after editing dependencies.py:** `python -c 'from app.dependencies import require_scope'`

## Files to Review for Similar Tasks
- `backend/app/dependencies.py` — existing dependency chain; understand `get_current_user`, API key loading, and auth type signals before adding any new dependency
- `backend/app/utils/errors.py` — `ForbiddenError` and structured error envelope pattern
- `backend/app/models/api_key.py` — `scopes` field type (confirm list vs string before membership checks)
- `backend/tests/test_responses.py` — fixture patterns for creating surveys, responses, and API keys with/without specific scopes
- `backend/tests/conftest.py` — shared fixtures and API key creation helpers

## Gotchas and Pitfalls
- **Stale docstrings on security checks:** A comment saying "scope check" is performed is not proof the check exists — grep for actual `require_scope` or equivalent usage before closing a security ticket
- **403 vs 401 confusion:** `require_scope` raises 403 (forbidden), not 401 (unauthorized) — placing a scope check next to `get_current_user` (which raises 401) makes it easy to copy the wrong exception type
- **Re-implementing header parsing:** If `get_current_user` or a sibling dependency already parses `X-API-Key`, do not re-read the raw header inside `require_scope` — find the correct injection point to avoid duplicating auth logic and creating subtle ordering bugs
- **JWT passthrough regression:** Failing to gate the scope check on API key presence will silently break JWT-authenticated callers — always include an explicit JWT-returns-200 test to catch this
- **None/empty scopes:** API keys with `scopes=None` or `scopes=[]` must fail the check — guard against `None` before the membership test to avoid `TypeError`
```
