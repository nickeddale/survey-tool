---
date: "2026-04-06"
ticket_id: "ISS-135"
ticket_title: "REL-06: Add audit logging for auth and survey transitions"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-135"
ticket_title: "REL-06: Add audit logging for auth and survey transitions"
categories: ["logging", "audit", "auth", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/audit_service.py
  - backend/app/api/auth.py
  - backend/app/services/survey_service.py
  - backend/app/services/response_crud_service.py
  - backend/app/main.py
  - backend/app/config.py
  - backend/tests/test_audit_logging.py
---

# Lessons Learned: REL-06: Add audit logging for auth and survey transitions

## What Worked Well
- Keeping `audit_service.py` as a pure stdlib logging module (no SQLAlchemy, no async) avoided all event loop and session entanglement issues that plague background task testing
- Emitting audit entries as `logger.info(json.dumps({...}))` rather than using a custom Formatter subclass made tests trivial: parse with `json.loads(record.getMessage())`
- Patching audit functions at the call-site module level (e.g., `app.api.auth.audit_service.log_auth_event`) rather than at the definition module matched the established webhook mock pattern and worked reliably
- Converting all UUIDs to `str()` before `json.dumps` prevented `TypeError` at runtime without needing a custom JSON encoder

## What Was Challenging
- Determining the exact type of `current_user` passed into survey service transition functions required reading the actual code rather than relying on the plan's description — it was an ORM object, not a raw UUID
- The `caplog` fixture silently fails to capture named logger entries unless `propagate=True` is explicitly set; this is easy to miss and produces false-green tests (no assertion errors, but also no captured logs)
- Locating the participant token decrement call site required careful reading of `response_crud_service.py` — the plan described it generically and it was in a dependency injection path, not a straightforward service function call

## Key Technical Insights
1. `audit_service.py` must never import from `app.database` or use SQLAlchemy sessions — any DB writes for audit trails should be a separate future concern to avoid async session / event loop issues in tests
2. `caplog` requires `logging.getLogger('audit').propagate = True` at test time — configure this in a fixture or directly in test setup, otherwise log entries are emitted but not captured
3. `json.dumps` does not handle UUID objects natively and raises `TypeError` — always call `str(uuid_value)` before serializing IDs
4. `basicConfig` only configures the root logger; explicitly call `logging.getLogger('audit').setLevel(...)` and attach a `StreamHandler` in `main.py`'s startup block to ensure the named audit logger is properly initialized
5. For proxy environments, check `X-Forwarded-For` header in addition to `request.client.host` when capturing client IP in the login endpoint
6. Do not log raw tokens, passwords, or full API keys — log only prefixes or hashed values (use `hashlib.sha256` if any credential-adjacent field must be recorded)

## Reusable Patterns
- **Pure stdlib audit service**: Name the logger `'audit'`, emit `logger.info(json.dumps({...}))`, include `timestamp`, `event_type`, and all relevant IDs as `str`
- **Test fixture for caplog**: Set `logging.getLogger('audit').propagate = True` in a fixture or at the top of each test function before triggering the action under test
- **Call-site patching**: Patch as `patch('app.api.auth.audit_service.log_auth_event')` — the imported reference in the calling module, not the definition in `audit_service.py`
- **IP extraction**: `ip = request.headers.get('X-Forwarded-For', request.client.host)` covers both direct and proxied connections
- **Mixed test strategy**: Use caplog-based tests to assert log content and structure; use mock-based tests to assert call count and exact argument values — both are needed for full confidence

## Files to Review for Similar Tasks
- `backend/app/services/audit_service.py` — canonical pattern for a pure stdlib structured JSON logger
- `backend/tests/test_audit_logging.py` — reference for caplog + mock hybrid test patterns for named loggers
- `backend/app/api/auth.py` — shows how to thread `Request` into an endpoint for IP capture alongside audit logging
- `backend/app/services/survey_service.py` — shows how to call audit logging after a successful DB commit in a transition function
- `backend/app/main.py` — shows explicit named logger initialization pattern (not relying on basicConfig)

## Gotchas and Pitfalls
- **Silent caplog miss**: `caplog` will not capture entries from a named logger unless `propagate=True` — no error is raised, tests just never assert on log content
- **UUID serialization**: `json.dumps({'user_id': some_uuid})` raises `TypeError` — always wrap with `str()`
- **ORM object vs UUID**: Survey service transition functions receive a full `User` ORM object as `current_user`, not a bare UUID — extract `current_user.id` explicitly before logging
- **Token call site location**: Participant token decrement may be in a FastAPI dependency, not directly in the service function — read the actual code before assuming where to insert the audit call
- **passlib proximity**: Do not import or reference passlib anywhere in or near `audit_service.py`; keep the module dependency footprint minimal
- **basicConfig trap**: Calling only `basicConfig` does not guarantee the `'audit'` named logger gets a handler — always configure it explicitly in the app startup block
```
