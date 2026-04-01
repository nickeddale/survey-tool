---
date: "2026-04-01"
ticket_id: "ISS-018"
ticket_title: "1.5: API Key Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-018"
ticket_title: "1.5: API Key Model and CRUD Endpoints"
categories: ["api-keys", "authentication", "fastapi", "sqlalchemy", "alembic", "postgresql"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/models/api_key.py"
  - "backend/app/schemas/api_key.py"
  - "backend/app/services/api_key_service.py"
  - "backend/app/api/auth.py"
  - "backend/app/dependencies.py"
  - "backend/app/models/__init__.py"
  - "backend/alembic/versions/0004_create_api_keys_table.py"
  - "backend/tests/test_api_keys.py"
---

# Lessons Learned: 1.5: API Key Model and CRUD Endpoints

## What Worked Well
- Using `hashlib.sha256` directly for key hashing — clean, no external dependencies, no version compatibility issues
- Python-side UUID generation (`default=uuid.uuid4`) worked reliably without requiring pgcrypto extension
- Splitting schemas into `ApiKeyResponse` (no full key) and `ApiKeyCreateResponse` (with full key) cleanly enforced the "return once" contract at the type level
- Checking `X-API-Key` header first in `get_current_user` before falling back to Bearer JWT kept the dependency chain simple and backward-compatible
- Manually authoring the Alembic migration (rather than autogenerating) preserved `server_default` on timestamps and correct `JSONB` typing

## What Was Challenging
- Nullable `expires_at` required careful guard logic — `expires_at is not None and expires_at < datetime.utcnow()` — easy to write as just `expires_at < datetime.utcnow()` which raises `TypeError` for `None`
- Ensuring `last_used_at` is updated within the same DB session (not fire-and-forget) to avoid responding before the write commits
- Alembic silently omitting the `api_keys` table when `ApiKey` was not imported in both `alembic/env.py` and `app/models/__init__.py` — no error is raised, the table is simply absent
- `alembic revision --autogenerate` silently degrading `JSONB` to `TEXT` and dropping `server_default` on `DateTime` columns — undetectable without inspecting the generated file

## Key Technical Insights
1. **API key generation pattern**: `key = 'svt_' + secrets.token_hex(20)` yields the required `svt_` prefix + 40 hex chars. Store `hashlib.sha256(key.encode()).hexdigest()` as `key_hash` and `key[:8]` as `key_prefix`. Return the full `key` only in the create response.
2. **Never use `alembic revision --autogenerate`** for tables with `DateTime(timezone=True)` columns using `server_default` or `JSONB` columns — it silently drops `server_default` and may render JSONB as TEXT.
3. **Dual import requirement for Alembic**: `ApiKey` must be imported in both `alembic/env.py` and `app/models/__init__.py`. Missing either causes a silent migration gap — the table won't be created and no error is raised.
4. **`lazy='raise'` on ORM relationships**: Declaring `lazy='raise'` on the `user` back-reference in `ApiKey` and the `api_keys` relationship on `User` surfaces accidental implicit lazy loads as clear `ORM` errors rather than confusing `MissingGreenlet` tracebacks.
5. **Pydantic field exclusion must be tested explicitly**: Omitting `key_hash` from a response schema class does not guarantee it is absent from serialization in all edge cases. An explicit assertion that `"key_hash"` is not in the response JSON body is required.
6. **`expires_at` nullable guard**: Always check `expires_at is not None and expires_at < datetime.utcnow()`. Omitting the null check raises `TypeError` at runtime for non-expiring keys.

## Reusable Patterns
- **API key generation**: `key = 'svt_' + secrets.token_hex(20)` → `key_hash = hashlib.sha256(key.encode()).hexdigest()` → `key_prefix = key[:8]`
- **UUID PK (Python-side)**: `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — never `server_default`
- **Timestamp migration DDL**: `sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)`
- **JSONB migration DDL**: `sa.Column('scopes', postgresql.JSONB(), nullable=True)`
- **Unique index in migration**: `sa.Index('ix_api_keys_key_hash', 'key_hash', unique=True)` — explicitly in migration DDL, not relying on ORM `unique=True` reflection
- **Import smoke-test before alembic**: `python -c "from app.models.api_key import ApiKey"` — catches broken imports with clean tracebacks
- **`get_current_user` extension order**: Check `X-API-Key` header → SHA-256 hash → query `ApiKey` → validate `is_active` and `expires_at` → update `last_used_at` in same session → fall back to Bearer JWT
- **Function-scoped async fixtures**: `@pytest_asyncio.fixture(scope='function')` for all engine/session/client fixtures — session-scoped causes asyncpg event loop mismatch with no workaround
- **Test DATABASE_URL override**: `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest ...`

## Files to Review for Similar Tasks
- `backend/app/models/api_key.py` — canonical pattern for `Mapped`/`mapped_column` ORM model with UUID PK, FK, JSONB, and `lazy='raise'` relationships
- `backend/app/services/api_key_service.py` — reference implementation for secure token generation, hash storage, and `last_used_at` update within session
- `backend/app/dependencies.py` — multi-auth `get_current_user` pattern (API key header → JWT Bearer fallback)
- `backend/alembic/versions/0004_create_api_keys_table.py` — manually authored migration with correct JSONB, server_default timestamps, and explicit unique index
- `backend/tests/test_api_keys.py` — full test suite pattern: function-scoped fixtures, key creation, list/prefix assertion, revoke, X-API-Key auth, expired/inactive rejection, last_used_at update

## Gotchas and Pitfalls
- **`alembic revision --autogenerate` is destructive for this schema**: Silently drops `server_default` on all `DateTime` columns and renders `JSONB` as `TEXT`. Always author migrations manually for this project.
- **Missing `ApiKey` import in `alembic/env.py` or `app/models/__init__.py`**: Causes a completely silent migration gap — the `api_keys` table is skipped with no warning or error. Always import in both locations and run the smoke-test before migrating.
- **`passlib.CryptContext` is broken with bcrypt >= 4.x**: `bcrypt 5.0.0` lacks `bcrypt.__about__`. Use `bcrypt.hashpw/checkpw/gensalt` directly for passwords. API key hashing uses `hashlib.sha256` — no bcrypt needed there.
- **`expires_at is None` must be checked before comparison**: `None < datetime.utcnow()` raises `TypeError`. Guard every expiry check with `expires_at is not None and ...`.
- **Full key value must never appear outside the create response**: Verify with an explicit assertion in tests that `key_hash` (and the full key string) are absent from list and get responses.
- **Session-scoped async pytest fixtures always break with asyncpg**: The event loop mismatch has no workaround. All engine, session, and client fixtures must use `scope='function'`.
- **`last_used_at` update must be awaited in the same session**: Fire-and-forget updates may not commit before the response is returned, leaving `last_used_at` stale.
```
