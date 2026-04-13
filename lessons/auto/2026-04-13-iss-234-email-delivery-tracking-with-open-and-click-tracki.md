---
date: "2026-04-13"
ticket_id: "ISS-234"
ticket_title: "Email delivery tracking with open and click tracking"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-13"
ticket_id: "ISS-234"
ticket_title: "Email delivery tracking with open and click tracking"
categories: ["email", "tracking", "fastapi", "testing", "jinja2"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/config.py
  - backend/app/api/email_tracking.py
  - backend/app/api/email_invitations.py
  - backend/app/services/email_invitation_service.py
  - backend/app/main.py
  - backend/app/templates/email/invitation.html
  - backend/app/templates/email/reminder.html
  - backend/tests/test_email_tracking.py
---

# Lessons Learned: Email delivery tracking with open and click tracking

## What Worked Well
- The EmailInvitation model already had `opened_at` and `clicked_at` fields, so no migration was needed — the tracking layer dropped cleanly onto the existing schema.
- Separating the tracking router into its own file (`email_tracking.py`) kept auth-free endpoints isolated and made it easy to verify no `get_current_user` dependency crept in.
- Running import smoke-tests (`python -c 'from app.api.email_tracking import router'`) before pytest caught import errors as clean tracebacks rather than cryptic collection failures.
- The stats endpoint pattern (aggregate SQL via a dedicated service method) followed the existing service layer convention and kept the router thin.

## What Was Challenging
- Ensuring the `/email/track/` routes had no auth middleware applied globally required explicitly reviewing `main.py` middleware registration — FastAPI dependency injection can silently apply router-level dependencies to all routes if registered at the wrong scope.
- Template integration required passing both `backend_url` and `invitation_id` into the render context; forgetting either caused silent empty-string rendering without `StrictUndefined`.
- Idempotency behaviour (first open/click sets timestamp, subsequent requests do not overwrite) required a careful conditional update in the service — easy to miss and hard to catch without explicit timestamp-comparison assertions.

## Key Technical Insights
1. **No-auth route isolation**: Register tracking endpoints on a dedicated router and confirm in `main.py` that no router-level `dependencies=[Depends(get_current_user)]` applies to it. A global auth guard on the app or a parent router will silently block unauthenticated tracking pixels embedded in emails.
2. **Idempotency via conditional update**: Use `UPDATE ... WHERE opened_at IS NULL` (or equivalent ORM check) rather than an unconditional set. A test that only asserts `opened_at is not None` after two requests will not catch a bug that overwrites on every hit — assert the timestamp value is identical on the second request.
3. **Stats serialization**: Pydantic schema field omission is not the same as field exclusion — always assert that `open_rate`, `click_rate`, and `breakdown` are present in the actual response body, not just defined in the schema. Computed fields with zero denominators (0 sent) must return `0.0`, not null or a division error.
4. **Click redirect assertion**: Assert the `Location` header equals the exact expected survey URL, not just that the status is 302. This catches URL construction bugs (wrong base, missing invitation ID) that a status-only check misses.
5. **Template rendering smoke test**: After updating `invitation.html` and `reminder.html`, verify with a direct Jinja2 render call (no DB) using `StrictUndefined` — missing `backend_url` or `invitation_id` raise immediately rather than silently producing empty `src` attributes.
6. **`| default('there', true)` pattern**: Use the two-argument form in Jinja2 templates to handle `None` values. The single-argument `| default('x')` only substitutes for `Undefined`, not `None`.

## Reusable Patterns
- **Import smoke-test gate**: `python -c 'from app.api.email_tracking import router'` immediately after creating a new router file, and `python -c 'from app.main import app'` after registering it — surfaces circular imports before pytest collection.
- **Function-scoped async fixtures**: All `@pytest_asyncio.fixture` blocks must use `scope='function'`. Session- or module-scoped async SQLAlchemy fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio — no workaround exists.
- **Idempotency test pattern**: `ts1 = first_request(); ts2 = second_request(); assert ts1 == ts2` — not just `assert ts2 is not None`.
- **Explicit stats field assertions**: For every field in an aggregate response, assert both presence and correct value in the test.
- **Direct bcrypt**: Use `bcrypt.hashpw/checkpw/gensalt` in test fixtures that create users — never `passlib.CryptContext`, which breaks at runtime with bcrypt >= 4.x.
- **`postgresql+asyncpg://` scheme**: Always override `DATABASE_URL` to use this scheme when running Docker tests — the container default uses the psycopg2 scheme and silently fails with the async engine.

## Files to Review for Similar Tasks
- `backend/app/api/email_tracking.py` — reference implementation for auth-free, fast tracking endpoints returning binary responses (GIF) and redirects.
- `backend/app/api/email_invitations.py` — stats endpoint pattern: aggregate service call, Pydantic response model, division-safe rate calculations.
- `backend/app/services/email_invitation_service.py` — `get_invitation_stats()` for aggregate SQL query structure; `send_invitation()` for template context assembly with tracking URLs.
- `backend/app/templates/email/invitation.html` — tracking pixel `<img>` embed and click-through URL wrap pattern.
- `backend/tests/test_email_tracking.py` — idempotency test pattern, GIF bytes assertion, Location header assertion, stats field presence assertions.
- `backend/app/main.py` — router registration; confirm `/email/track/` prefix has no auth dependency.

## Gotchas and Pitfalls
- **Global auth middleware**: If `get_current_user` is added as a router-level dependency to the main app or a parent router, tracking pixel requests from email clients (no token) will get 401s silently. Always test tracking endpoints without any `Authorization` header.
- **Silent Jinja2 empty strings**: Without `StrictUndefined`, a missing `backend_url` in the template context renders as an empty string — the email sends, tracking breaks, and no error is raised. Always use `StrictUndefined` in template unit tests.
- **Zero-denominator open/click rates**: When `total_sent == 0`, return `0.0` explicitly — do not let Python divide by zero or return `None`, as either will fail the stats schema or break frontend consumers.
- **bcrypt >= 4.x + passlib**: `passlib.CryptContext` raises `AttributeError` at import or first use with bcrypt >= 4.x. Any test fixture that creates a hashed password must use `bcrypt` directly.
- **Scope mismatch on async fixtures**: A single `scope='module'` or `scope='session'` async fixture in a test file that otherwise uses `scope='function'` will cause a cryptic event loop error — pytest-asyncio does not always surface the offending fixture name clearly.
- **Pydantic field omission trap**: A field defined in a Pydantic response model with a default value will be omitted from the response if the ORM object doesn't set it — but the schema won't raise. Always assert the field is present in `response.json()`.
```
