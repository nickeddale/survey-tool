---
date: "2026-04-01"
ticket_id: "ISS-017"
ticket_title: "1.4: JWT Authentication (Login, Refresh, Middleware)"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-017"
ticket_title: "1.4: JWT Authentication (Login, Refresh, Middleware)"
categories: ["authentication", "jwt", "fastapi", "postgresql", "security"]
outcome: "success"
complexity: "high"
files_modified: ["backend/app/api/auth.py", "backend/app/services/auth_service.py", "backend/app/dependencies.py", "backend/app/schemas/user.py", "backend/app/config.py", "backend/tests/test_auth.py"]
---

# Lessons Learned: 1.4: JWT Authentication (Login, Refresh, Middleware)

## What Worked Well
- Using python-jose with HS256 provided a clean, well-documented JWT implementation with straightforward encode/decode APIs
- Splitting Pydantic schemas into input (LoginRequest, UserUpdateRequest) and output (UserResponse, TokenResponse) models naturally prevented sensitive fields from leaking into responses
- SHA-256 hashing of refresh tokens before DB storage kept the token storage pattern consistent and secure without requiring additional libraries
- Dual auth support (JWT Bearer + X-API-Key) in `get_current_user` was cleanly handled via dependency injection without complicating individual route handlers
- bcrypt direct usage (`bcrypt.checkpw`/`bcrypt.hashpw`/`bcrypt.gensalt`) was more reliable than passlib CryptContext given the environment's bcrypt 5.x

## What Was Challenging
- The bcrypt/passlib incompatibility was a runtime-only failure — no import error, just an `AttributeError` on first password operation; easy to miss without a focused smoke test
- Alembic autogenerate silently drops `server_default` and `onupdate` directives on timestamp columns, requiring manual migration authoring that is easy to overlook
- The psycopg2 vs asyncpg DATABASE_URL scheme mismatch produces silent failures rather than clear connection errors, making test environment setup error-prone
- Ensuring refresh token rotation was atomic required explicit transaction scoping — the default SQLAlchemy async session behavior does not guarantee this without deliberate use of a single transaction block
- UUID primary keys required Python-side `default=uuid.uuid4` because `server_default=gen_random_uuid()` depends on the pgcrypto extension which may not be enabled in all environments

## Key Technical Insights
1. Always include a `type` claim in JWT payloads (`'access'` vs `'refresh'`) and validate it on decode — this prevents refresh tokens from being accepted as access tokens, a subtle but critical security boundary.
2. Store only the SHA-256 hash of the refresh token in the database; the raw token is returned once and never persisted, so token theft from DB does not yield usable credentials.
3. `get_current_user` must emit the `WWW-Authenticate: Bearer` header on all 401 responses per RFC 6750 — this is a correctness requirement, not just convention, and must be preserved across any error-handling refactors.
4. Refresh token rotation (revoke old, insert new) must happen in a single DB transaction — without atomicity, a concurrent retry can produce two valid tokens for the same session.
5. Session-scoped async SQLAlchemy engine fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio; all fixtures must use `scope='function'` with no exceptions.
6. Verifying `password_hash` absence from `/me` responses requires an explicit assertion — Pydantic field omission through `exclude` or schema design is not guaranteed exclusion without a test that checks the raw response body.

## Reusable Patterns
- **Password hashing:** `bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()`
- **Password verification:** `bcrypt.checkpw(plain.encode(), hashed.encode())`
- **Access token:** `jose.jwt.encode({'sub': str(user_id), 'type': 'access', 'exp': datetime.utcnow() + timedelta(minutes=JWT_EXPIRY_MINS)}, SECRET_KEY, algorithm='HS256')`
- **Refresh token generation:** `token = secrets.token_urlsafe(64)`, store `hashlib.sha256(token.encode()).hexdigest()`
- **get_current_user:** extract `Authorization: Bearer <token>`, decode with `jose.jwt.decode`, assert `payload['type'] == 'access'`, fetch user from DB, raise `HTTP_401_UNAUTHORIZED` with `WWW-Authenticate: Bearer` on any failure
- **Atomic token rotation:** wrap revoke + insert in a single `async with session.begin()` block
- **Function-scoped async fixture:** `@pytest_asyncio.fixture(scope='function')` — never `scope='session'`
- **Pre-test import smoke-test:** `python -c 'from app.models.refresh_token import RefreshToken; from app.services.auth_service import create_access_token; from app.dependencies import get_current_user'`
- **Test invocation:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_auth.py -v`

## Files to Review for Similar Tasks
- `backend/app/api/auth.py` — reference for endpoint structure, token response shape, and logout/rotation pattern
- `backend/app/services/auth_service.py` — reference for JWT payload construction, bcrypt usage, and refresh token lifecycle
- `backend/app/dependencies.py` — reference for `get_current_user` implementation with RFC 6750-compliant error responses
- `backend/app/schemas/user.py` — reference for input/output schema split that prevents sensitive field leakage
- `backend/alembic/versions/` — review manually authored migration for refresh_tokens table as a template for future timestamp-column migrations
- `backend/tests/test_auth.py` — reference for async fixture scoping, DATABASE_URL override pattern, and explicit `password_hash` exclusion assertion

## Gotchas and Pitfalls
- **passlib + bcrypt >= 4.x:** passlib CryptContext raises `AttributeError: module 'bcrypt' has no attribute '__about__'` at runtime, not at import time. Never use passlib in this environment; use bcrypt directly.
- **DATABASE_URL scheme:** The container default is `postgresql://` (psycopg2); asyncpg requires `postgresql+asyncpg://`. Always override in test commands or the connection silently fails.
- **Alembic autogenerate:** Silently omits `server_default` and `onupdate` for timestamp columns. Manually author any migration involving `created_at`/`updated_at` and inspect the generated SQL before applying.
- **RefreshToken model imports:** Must be present in both `alembic/env.py` and `app/models/__init__.py` before running any alembic command — missing either causes the migration to be silently skipped with no error.
- **UUID server_default:** `server_default=gen_random_uuid()` requires pgcrypto; use `default=uuid.uuid4` on the Python model column instead.
- **Pydantic field exclusion is not a guarantee:** Always add an explicit test assertion that `password_hash` is absent from the response JSON, not just that the schema doesn't declare it.
- **Token type validation:** Without checking `payload['type'] == 'access'` in `get_current_user`, a refresh token can be used to authenticate API requests — this must be an explicit check, not an assumption.
- **WWW-Authenticate header:** If error handling middleware is later refactored (e.g., ISS-012), verify the `WWW-Authenticate: Bearer` header is preserved on 401 responses from `get_current_user` — generic error handlers often strip custom headers.
```
