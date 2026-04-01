---
date: "2026-04-01"
ticket_id: "ISS-004"
ticket_title: "Task 1.4: JWT Authentication (Login, Refresh, Middleware)"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-004"
ticket_title: "Task 1.4: JWT Authentication (Login, Refresh, Middleware)"
categories: ["authentication", "jwt", "fastapi", "postgresql", "sqlalchemy"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/app/models/refresh_token.py
  - backend/app/models/__init__.py
  - backend/app/schemas/user.py
  - backend/app/services/auth_service.py
  - backend/app/dependencies.py
  - backend/app/api/auth.py
  - backend/app/main.py
  - backend/alembic/versions/0003_create_refresh_tokens_table.py
  - backend/alembic/env.py
  - backend/tests/test_auth.py
  - backend/tests/conftest.py
---

# Lessons Learned: Task 1.4: JWT Authentication (Login, Refresh, Middleware)

## What Worked Well
- Established bcrypt direct usage pattern (`bcrypt.checkpw`/`bcrypt.hashpw`/`bcrypt.gensalt`) carried forward cleanly from ISS-003, avoiding the passlib incompatibility entirely.
- Function-scoped async SQLAlchemy engine fixtures in conftest.py prevented event loop mismatch errors with asyncpg under pytest-asyncio — this pattern was already documented and applied correctly from the start.
- Storing only a hash of the refresh token in the DB (never the raw token) kept the implementation secure without added complexity.
- Manually authoring the Alembic migration for `refresh_tokens` ensured `server_default` timestamps and `onupdate` directives were preserved exactly as intended.
- UUID primary keys with `default=uuid.uuid4` (Python-side) on the RefreshToken model avoided dependency on the `pgcrypto` extension (`gen_random_uuid()`).
- Pydantic v2 schema separation (distinct input/output schemas) ensured `password_hash` and raw token secrets were never leaked in response bodies.

## What Was Challenging
- Alembic surfaces broken model imports as cryptic top-level errors rather than clean Python tracebacks — an import smoke-test before every alembic command is essential.
- The environment-default `DATABASE_URL` uses the psycopg2 scheme, which is silently incompatible with the async engine; every local test run requires an explicit scheme override.
- Token rotation logic (revoke old refresh token, issue new pair atomically) required careful ordering to avoid issuing a new token if the revocation write failed.
- Ensuring `password_hash` was absent from `/me` endpoint responses required an explicit test assertion — field omission in a Pydantic response model is not the same as confirmed field exclusion.

## Key Technical Insights
1. **Never use passlib CryptContext with bcrypt >= 4.x.** Use `bcrypt.checkpw(plain.encode(), hashed.encode())` and `bcrypt.hashpw(plain.encode(), bcrypt.gensalt())` directly. bcrypt 5.0.0 is installed; passlib 1.7.x lacks `bcrypt.__about__` and will raise `AttributeError` at runtime.
2. **Refresh token DB storage must store a hash, not the raw token.** Generate a random token (e.g., `secrets.token_urlsafe(64)`), hash it with `hashlib.sha256`, store the hash. On validation, hash the incoming token and compare.
3. **Alembic autogenerate silently drops `server_default` and `onupdate` directives.** Always manually author migrations for tables with timestamp defaults, then inspect the generated script before applying.
4. **Run an import smoke-test before every alembic command:** `python -c "from app.models.refresh_token import RefreshToken"`. Broken imports surface as clean tracebacks here but as cryptic errors inside alembic.
5. **All async SQLAlchemy engine fixtures must use `scope="function"`.** Session-scoped async engines cause event loop mismatch errors with asyncpg under pytest-asyncio — there is no workaround short of changing the scope.
6. **New models must be imported in both `alembic/env.py` and `app/models/__init__.py`** before running any alembic command. Adding only one of these is a common source of silent migration failures.
7. **The `get_current_user` FastAPI dependency should raise `HTTP 401` with `WWW-Authenticate: Bearer` on any token failure** — expired, malformed, or missing — to comply with RFC 6750 and produce predictable error shapes for clients.

## Reusable Patterns
- **Password verification:** `bcrypt.checkpw(plain.encode(), hashed.encode())`
- **Password hashing:** `bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()`
- **Refresh token generation and storage:** `token = secrets.token_urlsafe(64)`, store `hashlib.sha256(token.encode()).hexdigest()`
- **Access token creation:** `jose.jwt.encode({"sub": str(user_id), "exp": datetime.utcnow() + expires_delta}, SECRET_KEY, algorithm="HS256")`
- **get_current_user dependency:** Extract `Authorization: Bearer <token>` header, decode with `jose.jwt.decode`, fetch user from DB, raise `HTTP_401_UNAUTHORIZED` on any failure.
- **Token rotation:** Within a single DB transaction — revoke old refresh token record, create new refresh token record, return new token pair.
- **Pydantic schema split:** `LoginRequest` / `UserUpdateRequest` as input schemas (may include password as plain text); `UserResponse` / `TokenResponse` as output schemas (never include `password_hash` or raw secrets).
- **Function-scoped conftest fixture:**
  ```python
  @pytest_asyncio.fixture(scope="function")
  async def db_engine():
      engine = create_async_engine(DATABASE_URL, ...)
      async with engine.begin() as conn:
          await conn.run_sync(Base.metadata.create_all)
      yield engine
      await engine.dispose()
  ```
- **Local test DATABASE_URL override:** `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker" pytest`

## Files to Review for Similar Tasks
- `backend/app/services/auth_service.py` — JWT creation/decoding and refresh token DB helpers
- `backend/app/dependencies.py` — `get_current_user` Bearer token dependency
- `backend/app/api/auth.py` — login, refresh, logout, /me endpoints
- `backend/app/models/refresh_token.py` — RefreshToken SQLAlchemy model with user FK
- `backend/alembic/versions/0003_create_refresh_tokens_table.py` — manually authored migration reference
- `backend/tests/test_auth.py` — full auth flow test coverage including negative cases
- `backend/tests/conftest.py` — function-scoped async engine fixture pattern

## Gotchas and Pitfalls
- **passlib + bcrypt >= 4.x is broken at runtime** — always use bcrypt directly, never import passlib CryptContext.
- **`DATABASE_URL` environment default uses psycopg2 scheme** — must override to `postgresql+asyncpg://` for every local test run or the async engine will fail to connect.
- **Session-scoped async fixtures fail with asyncpg** — always use `scope="function"` for engine/session fixtures; session scope cannot be fixed with workarounds.
- **Alembic autogenerate silently corrupts timestamp migrations** — never trust autogenerated scripts for tables with `server_default` or `onupdate`; always review and patch manually.
- **Missing model imports in `alembic/env.py` cause silent migration gaps** — add `from app.models.refresh_token import RefreshToken  # noqa: F401` before any alembic run.
- **Pydantic field omission ≠ field exclusion** — a field absent from the response model class definition must be verified absent in tests; do not assume it is excluded from serialization without an explicit assertion.
- **Refresh token rotation must be atomic** — revoke the old token and insert the new one in the same DB transaction to prevent issuing duplicate valid tokens on concurrent requests.
- **`pgcrypto` extension may not be enabled** — do not use `gen_random_uuid()` as a column `server_default`; use Python-side `default=uuid.uuid4` instead.
```
