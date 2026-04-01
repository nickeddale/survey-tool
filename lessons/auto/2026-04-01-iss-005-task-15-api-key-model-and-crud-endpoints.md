---
date: "2026-04-01"
ticket_id: "ISS-005"
ticket_title: "Task 1.5: API Key Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-005"
ticket_title: "Task 1.5: API Key Model and CRUD Endpoints"
categories: ["api-keys", "authentication", "sqlalchemy", "alembic", "fastapi"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/api_key.py
  - backend/app/models/user.py
  - backend/app/schemas/api_key.py
  - backend/app/services/api_key_service.py
  - backend/app/api/auth.py
  - backend/app/dependencies.py
  - backend/alembic/versions/0004_create_api_keys_table.py
  - backend/tests/test_api_keys.py
---

# Lessons Learned: Task 1.5: API Key Model and CRUD Endpoints

## What Worked Well
- Mirroring the refresh token hashing pattern (`hashlib.sha256(key.encode()).hexdigest()`) kept the implementation consistent and required no new dependencies.
- Using a `svt_` prefix + 40 random hex chars produced keys that are instantly identifiable in logs and error messages without exposing the secret portion.
- Separating `ApiKeyCreateResponse` (includes full key) from `ApiKeyResponse` (prefix only) enforced the "show once" contract at the schema layer, making accidental leakage structurally impossible in well-typed code.
- Python-side `default=uuid.uuid4` for the UUID PK avoided the `pgcrypto` extension dependency that `gen_random_uuid()` requires.
- Function-scoped async SQLAlchemy engine fixtures (copied from existing conftest.py) worked reliably with asyncpg under pytest-asyncio.

## What Was Challenging
- Alembic autogenerate silently drops `server_default` and `onupdate` directives on timestamp columns — manually authoring `0004_create_api_keys_table.py` was necessary to preserve `server_default=sa.text('now()')` on `created_at`.
- The environment default `DATABASE_URL` uses the psycopg2 scheme, which silently fails with the async engine. Every local test run required the override: `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker"`.
- The JSONB `scopes` column required manual inspection of the migration DDL — autogenerate can fall back to TEXT for JSONB, producing a valid but incorrect schema.
- Missing `ApiKey` import in `alembic/env.py` causes silent migration gaps (the table is never created) rather than a clear error, making this a hard-to-diagnose failure mode.

## Key Technical Insights
1. **Store hash, return raw once**: SHA-256 hash the full API key immediately after generation; store only the hash. Return the raw key in `ApiKeyCreateResponse` exclusively — it is never retrievable again. Mirrors the refresh token approach from ISS-004.
2. **Schema separation enforces security**: `ApiKeyCreateResponse` and `ApiKeyResponse` must be distinct Pydantic models. Field omission alone does not guarantee exclusion — a shared base class with an optional `key` field can leak the value if the serializer picks it up. Use separate classes.
3. **X-API-Key error shape must match JWT path**: When an API key is invalid, expired, or inactive, raise `HTTP 401` with `WWW-Authenticate: Bearer`. This keeps error shapes consistent with the JWT path and complies with RFC 6750.
4. **Import smoke-test gates Alembic runs**: `python -c "from app.models.api_key import ApiKey"` surfaces broken imports as clean tracebacks. Run this after model creation and again before every alembic command. Broken imports inside alembic produce cryptic, misleading errors.
5. **last_used_at update must be in-request**: Update `last_used_at` inside `get_current_user` on every authenticated API key request — not lazily or in a background task — so the value is accurate for audit and expiry checks.
6. **JSONB requires explicit SA type**: Use `sa.dialects.postgresql.JSONB` (or `postgresql.JSONB`) in the migration DDL. Do not rely on autogenerate to infer it from the model column definition.

## Reusable Patterns
- **Key generation**: `"svt_" + secrets.token_hex(20)` (40 hex chars) — identifiable prefix, opaque suffix.
- **Key hashing**: `hashlib.sha256(key.encode()).hexdigest()` — no external dependency, consistent with refresh token hashing.
- **UUID PK**: `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — Python-side default, no pgcrypto.
- **Async fixture scope**: All async SQLAlchemy engine/session fixtures in `conftest.py` must use `scope="function"`.
- **Test DATABASE_URL override**: Prefix every pytest invocation with `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker"`.
- **Alembic import guard**: Add `from app.models.api_key import ApiKey  # noqa: F401` to both `alembic/env.py` and `app/models/__init__.py` before any alembic command.
- **"show once" assertion**: Include an explicit test that GET /auth/keys response body does not contain the full key string — do not rely on Pydantic field omission alone.

## Files to Review for Similar Tasks
- `backend/app/services/api_key_service.py` — canonical pattern for generate/hash/store/lookup cycle.
- `backend/app/dependencies.py` — pattern for multi-auth `get_current_user` (JWT header vs. X-API-Key header).
- `backend/alembic/versions/0004_create_api_keys_table.py` — reference for manually authored migrations with JSONB, FK constraints, and timestamp server_defaults.
- `backend/app/schemas/api_key.py` — pattern for split create-response vs. list-response schemas to enforce "show once" key visibility.
- `backend/tests/test_api_keys.py` — pattern for API key lifecycle tests including explicit full-key-absent assertion.

## Gotchas and Pitfalls
- **Alembic autogenerate + timestamps**: Never rely on autogenerate for tables with `server_default=sa.text('now()')` or `onupdate`. Always manually author and inspect the migration script.
- **Alembic autogenerate + JSONB**: Autogenerate may render JSONB as TEXT. Inspect the generated DDL before applying.
- **Missing model import = silent migration gap**: If `ApiKey` is not imported in `alembic/env.py` before `target_metadata` is read, the table is silently omitted from migrations. No error is raised.
- **passlib + bcrypt >= 4.x is broken**: Do not use passlib `CryptContext` for any hashing. Use `bcrypt` directly (`hashpw`/`checkpw`/`gensalt`) for passwords; `hashlib.sha256` for tokens and keys.
- **Pydantic field omission ≠ exclusion**: A field absent from a schema's declared fields is excluded, but a field present as `Optional` on a shared base class may be serialized if populated. Use distinct schemas, not optional fields on a shared base.
- **Session-scoped async fixtures**: `scope="session"` on async SQLAlchemy engine fixtures causes event loop mismatch errors with asyncpg under pytest-asyncio. Always use `scope="function"`.
- **psycopg2 scheme in DATABASE_URL**: The container environment default is `postgresql://` (psycopg2). The async engine requires `postgresql+asyncpg://`. Override explicitly — the error on mismatch is not always obvious.
- **Volume mount masks .egg-info**: If alembic cannot resolve `app.*` imports despite correct code, the editable install `.egg-info` may be absent on the host (masked by the volume mount). Verify with `pip show` or reinstall inside the container.
```
