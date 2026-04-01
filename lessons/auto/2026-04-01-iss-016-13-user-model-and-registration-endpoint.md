---
date: "2026-04-01"
ticket_id: "ISS-016"
ticket_title: "1.3: User Model and Registration Endpoint"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-016"
ticket_title: "1.3: User Model and Registration Endpoint"
categories: ["authentication", "database", "testing", "migrations", "security"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/user.py
  - backend/app/schemas/user.py
  - backend/app/services/auth_service.py
  - backend/app/api/auth.py
  - backend/alembic/versions/0002_create_users_table.py
  - backend/tests/test_auth.py
---

# Lessons Learned: 1.3: User Model and Registration Endpoint

## What Worked Well
- Using bcrypt directly (hashpw/checkpw/gensalt) instead of passlib CryptContext avoided a hard runtime crash with bcrypt 5.0.0
- Python-side UUID default (`default=uuid.uuid4`) worked reliably without requiring the pgcrypto extension
- Manually authoring the Alembic migration preserved all column constraints (server_default, onupdate) that autogenerate silently drops
- Splitting Pydantic schemas into UserCreate/UserResponse/UserUpdate kept input validation separate from output serialization, preventing accidental password_hash exposure
- Catching `sqlalchemy.exc.IntegrityError` as the authoritative duplicate-email guard correctly handles race conditions that application-level pre-checks miss

## What Was Challenging
- The ticket's own technical notes recommended passlib CryptContext, which fails at runtime with bcrypt 5.0.0 — the implementation had to deviate from the spec
- `alembic revision --autogenerate` silently produced an incomplete migration (dropped server_default on timestamps, omitted onupdate) with no warning, requiring manual authoring
- The environment-default DATABASE_URL uses the psycopg2 scheme, which silently fails with the async engine — required an explicit override for every test run
- Session-scoped async SQLAlchemy fixtures cause event loop mismatch errors with asyncpg; no workaround exists other than function scope

## Key Technical Insights
1. **passlib 1.7.x + bcrypt 5.x incompatibility**: passlib accesses `bcrypt.__about__` which no longer exists. Use `bcrypt.hashpw/checkpw/gensalt` directly for all password hashing.
2. **Alembic autogenerate is unreliable for timestamps**: `server_default=sa.text('now()')` and `onupdate` are silently dropped. Always manually author migrations when these are required.
3. **UUID PK must use Python-side default**: `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — `server_default=gen_random_uuid()` requires pgcrypto which may not be enabled.
4. **IntegrityError as the authoritative duplicate guard**: Application-level pre-checks for duplicate emails are advisory only. A DB-level `IntegrityError` must also be caught and mapped to 409 to handle concurrent inserts correctly.
5. **Pydantic field omission is not the same as verified exclusion**: A field absent from `UserResponse` is not guaranteed absent from the response body unless verified with an explicit test assertion (`assert 'password_hash' not in response.json()`).
6. **asyncpg requires function-scoped fixtures**: `@pytest_asyncio.fixture(scope='function')` for all engine/session/client fixtures — session scope causes event loop mismatch with asyncpg under pytest-asyncio.

## Reusable Patterns
- **Password hashing**: `bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()` / `bcrypt.checkpw(plain.encode(), hashed.encode())`
- **UUID PK**: `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)`
- **Timestamp columns**: `Column(DateTime(timezone=True), server_default=func.now(), nullable=False)`
- **Registration flow**: pre-check duplicate → hash password → INSERT → catch `IntegrityError` → raise `ConflictError` with `code='CONFLICT'`
- **Test DATABASE_URL override**: `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest`
- **Import smoke-test before alembic**: `python -c 'from app.models.user import User; from app.database import Base'`
- **409 error body**: `{"detail": {"code": "CONFLICT", "message": "A user with this email already exists"}}`

## Files to Review for Similar Tasks
- `backend/app/models/user.py` — UUID PK pattern, timezone-aware timestamps, index on email
- `backend/app/services/auth_service.py` — direct bcrypt usage pattern
- `backend/app/api/auth.py` — IntegrityError catch, ConflictError raise, 201 response pattern
- `backend/alembic/versions/0002_create_users_table.py` — manually authored migration with explicit server_default and constraints
- `backend/tests/test_auth.py` — function-scoped fixtures, DATABASE_URL override, password_hash exclusion assertion

## Gotchas and Pitfalls
- **Never follow ticket notes blindly when they reference passlib** — verify bcrypt version compatibility before using CryptContext
- **Never use `alembic revision --autogenerate` for tables with server_default or onupdate** — always manually author and verify the generated SQL
- **Never use session-scoped async fixtures with asyncpg** — there is no workaround; function scope is required
- **Always explicitly test that `password_hash` is absent from response JSON** — Pydantic model exclusion alone is not a sufficient security guarantee
- **Always ensure `User` is imported in both `alembic/env.py` and `app/models/__init__.py`** — missing either causes a silent migration gap with no error
- **Always override DATABASE_URL to the asyncpg scheme in test runs** — the environment default psycopg2 scheme silently fails and produces confusing errors
```
