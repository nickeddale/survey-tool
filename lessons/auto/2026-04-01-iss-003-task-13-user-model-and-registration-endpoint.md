---
date: "2026-04-01"
ticket_id: "ISS-003"
ticket_title: "Task 1.3: User Model and Registration Endpoint"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-003"
ticket_title: "Task 1.3: User Model and Registration Endpoint"
categories: ["fastapi", "sqlalchemy", "authentication", "postgresql", "pydantic", "bcrypt", "alembic"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/__init__.py
  - backend/app/models/user.py
  - backend/app/schemas/__init__.py
  - backend/app/schemas/user.py
  - backend/app/services/__init__.py
  - backend/app/services/auth_service.py
  - backend/app/api/__init__.py
  - backend/app/api/auth.py
  - backend/app/main.py
  - backend/alembic/env.py
  - backend/alembic/versions/0002_create_users_table.py
---

# Lessons Learned: Task 1.3: User Model and Registration Endpoint

## What Worked Well
- Building on the established async SQLAlchemy session pattern from Task 1.2 kept the database layer consistent and predictable.
- Pydantic v2 field validators handle email format and password length enforcement cleanly at the schema level, keeping validation out of the endpoint and service layers.
- Using `server_default=func.now()` for `created_at`/`updated_at` in the ORM model ensures timestamps are always set by the database, avoiding clock skew from the application layer.
- Scoping `docker-compose up -d postgres` during migration work isolated the Alembic steps from unrelated service failures (e.g. missing `frontend/nginx.conf`).
- Running an import smoke-test before `alembic revision --autogenerate` caught import errors with clean tracebacks rather than cryptic Alembic failures.

## What Was Challenging
- passlib[bcrypt] 1.7.x is incompatible with bcrypt >= 4.x due to the removal of `bcrypt.__about__`. The CryptContext approach fails silently or raises `AttributeError` at runtime. This required switching to direct `bcrypt` calls (`hashpw`/`checkpw`/`gensalt`).
- Alembic `autogenerate` does not reliably render `server_default` for timestamps or `onupdate` directives. The migration script required manual authoring to ensure correct DDL output.
- The `./backend:/app` volume mount masks container build artifacts including `.egg-info`, which can break editable installs and cause `ModuleNotFoundError` when Alembic tries to import `app.models.user`.
- Ensuring `password_hash` is never leaked in `UserResponse` requires explicit field exclusion in the Pydantic schema — relying on field omission by default is not sufficient and must be verified with a test assertion.

## Key Technical Insights
1. **Do not use passlib with bcrypt >= 4.x.** Use `bcrypt` directly: `bcrypt.hashpw(password.encode(), bcrypt.gensalt())` for hashing and `bcrypt.checkpw(plain.encode(), hashed)` for verification. bcrypt 5.0.0 is installed in this environment.
2. **Write Alembic migrations manually for tables with timestamp columns.** `autogenerate` may omit `server_default=sa.text("now()")` and will not render `onupdate` at all. Always review the generated script before applying.
3. **Run an import smoke-test before any Alembic command**: `python -c "from app.models.user import User; from app.database import Base"`. This surfaces broken imports with a clean traceback rather than a misleading Alembic error.
4. **Duplicate email detection must use a database-level unique constraint plus a 409 response.** Catch `sqlalchemy.exc.IntegrityError` in the endpoint and map it to HTTP 409 to handle race conditions that application-level pre-checks would miss.
5. **UUID primary keys** require `default=uuid.uuid4` (Python-side) in the ORM model, not `server_default`, since PostgreSQL's `gen_random_uuid()` requires the `pgcrypto` extension which may not be enabled.
6. **Async session fixtures must use `scope="function"`**. Session-scoped async SQLAlchemy engines cause event loop mismatch errors with asyncpg under pytest-asyncio.

## Reusable Patterns
- **Password hashing service** (`app/services/auth_service.py`): `hash_password(plain: str) -> str` and `verify_password(plain: str, hashed: str) -> bool` using `bcrypt` directly — copy this pattern for any future credential hashing.
- **Async get_db generator**: `yield session` from `async_sessionmaker` inside `try/finally` ensures the session is always closed, consistent with the pattern established in `app/database.py`.
- **Registration endpoint pattern**: check-for-duplicate → hash password → insert → return 201 with response schema. Catch `IntegrityError` for 409 rather than relying solely on a pre-check query.
- **Pydantic v2 schema separation**: `UserCreate` (input, includes password), `UserResponse` (output, never includes password_hash), `UserUpdate` (partial update, all fields optional). Never reuse the same schema for input and output when sensitive fields are involved.
- **Alembic env.py import**: add `from app.models.user import User  # noqa: F401` (or import `Base` metadata) so autogenerate detects the model, but always verify with the smoke-test before running the command.

## Files to Review for Similar Tasks
- `backend/app/services/auth_service.py` — bcrypt hashing pattern (direct, not passlib)
- `backend/app/api/auth.py` — registration endpoint with IntegrityError → 409 mapping
- `backend/app/schemas/user.py` — Pydantic v2 field validators for email and password
- `backend/app/models/user.py` — UUID PK, unique email index, server_default timestamps
- `backend/alembic/versions/0002_create_users_table.py` — manually authored migration with correct server_defaults
- `backend/tests/test_auth.py` — async test fixtures with function-scoped engine

## Gotchas and Pitfalls
- **passlib + bcrypt >= 4.x will break at runtime** with `AttributeError: module 'bcrypt' has no attribute '__about__'`. Do not add passlib as a dependency. Use `bcrypt` directly.
- **Never include `password_hash` in `UserResponse`**. Verify with an explicit test that asserts the field is absent from the response body — field omission is not the same as field exclusion.
- **Alembic autogenerate silently drops `onupdate`**. Always manually inspect and patch the generated migration for `updated_at` columns.
- **Volume mount `./backend:/app` masks `.egg-info`**. If Alembic or pytest cannot resolve `app.*` imports inside the container, check that the editable install artifacts exist on the host filesystem, not only inside the image layer.
- **Do not run `docker-compose up -d` without a service name** during this milestone — the frontend stub will fail due to a missing `nginx.conf` and block the postgres container from being usable.
- **asyncpg is pinned to `<0.30`** — do not upgrade without re-testing the full async engine connection path.
- **Use `pydantic-settings` v2 `SettingsConfigDict` pattern** — never use the v1 `class Config` inner class in any new schema or settings class.
- **Never read `os.environ` directly** in application modules — always import the `Settings` singleton from `app.config`.
```
