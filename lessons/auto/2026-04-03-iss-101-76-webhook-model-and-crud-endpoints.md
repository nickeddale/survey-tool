---
date: "2026-04-03"
ticket_id: "ISS-101"
ticket_title: "7.6: Webhook Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-101"
ticket_title: "7.6: Webhook Model and CRUD Endpoints"
categories: ["webhooks", "sqlalchemy", "fastapi", "alembic", "security"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/webhook.py
  - backend/app/schemas/webhook.py
  - backend/app/api/webhooks.py
  - backend/app/main.py
  - backend/alembic/versions/0014_create_webhooks_table.py
  - backend/tests/test_webhooks.py
---

# Lessons Learned: 7.6: Webhook Model and CRUD Endpoints

## What Worked Well
- Reusing established async SQLAlchemy/FastAPI patterns from prior tickets (quotas, assessments) kept implementation consistent and predictable
- Manually authoring the Alembic migration avoided autogenerate pitfalls with JSONB and DateTime columns
- Importing the model in both `alembic/env.py` and `app/models/__init__.py` before running any alembic command prevented silent migration gaps
- Running an import smoke-test (`python -c "from app.models.webhook import Webhook"`) before alembic commands surfaced broken imports with clean tracebacks
- Using `secrets.token_hex(16)` at POST time for auto-generated secrets kept secret generation simple and dependency-free

## What Was Challenging
- Ensuring the `secret` field was fully excluded from all response schemas required explicit test assertions — Pydantic field omission alone is not sufficient verification
- JSONB column handling in Alembic required explicit `postgresql.JSONB()` in migration DDL; autogenerate would have silently rendered it as TEXT
- Enforcing user ownership in a single query (`WHERE id = :id AND user_id = :user_id`) rather than fetch-then-check required discipline to avoid inadvertent resource existence leakage

## Key Technical Insights
1. Never use `alembic revision --autogenerate` in this project — it silently drops `server_default` on DateTime columns and misrenders JSONB as TEXT. Always manually author migrations.
2. UUID primary keys must use Python-side `default=uuid.uuid4`, not `server_default=gen_random_uuid()`, because the pgcrypto extension is not guaranteed to be available in all environments.
3. `lazy='raise'` on all ORM relationships is essential for async SQLAlchemy — without it, accidental relationship access raises a confusing `MissingGreenlet` error instead of a clear ORM error.
4. All async pytest fixtures must use `scope='function'`; session-scoped async engines cause event loop mismatch errors with asyncpg under pytest-asyncio.
5. The test DATABASE_URL must always be overridden to `postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker` — the container default uses the psycopg2 scheme.
6. Ownership enforcement must happen at the query layer in a single statement, never as a fetch-then-check pattern, to prevent leaking resource existence to unauthorized users.

## Reusable Patterns
- **UUID PK:** `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — Python-side default only
- **JSONB in migration:** `sa.Column('events', postgresql.JSONB(), nullable=False)`
- **Timestamp columns in migration:** `sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False)` and `sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True)`
- **Timestamp columns in ORM model:** `server_default=func.now()` for `created_at`; `server_default=func.now(), onupdate=func.now()` for `updated_at`
- **Ownership-enforced query:** `SELECT ... FROM webhooks WHERE id = :id AND user_id = :user_id` — single query, no fetch-then-check
- **Secret generation:** `import secrets; secret = secrets.token_hex(16)` at POST time; never expose in any response schema
- **Relationship safety:** `lazy='raise'` on all relationships to User and Survey in async ORM models
- **Pre-migration smoke-test:** `python -c "from app.models.webhook import Webhook"` before every alembic command
- **Model registration:** Import new model in BOTH `alembic/env.py` AND `app/models/__init__.py` before any alembic command

## Files to Review for Similar Tasks
- `backend/app/models/quota.py` — reference for JSONB field patterns and nullable FK patterns
- `backend/app/models/assessment.py` — reference for UUID PK, timestamp columns, and relationship declarations
- `backend/app/api/quotas.py` — reference for paginated list endpoints and ownership-enforced queries
- `backend/app/api/assessments.py` — reference for CRUD endpoint structure, error handling, and dependency injection
- `backend/alembic/versions/0014_create_webhooks_table.py` — canonical example of manually authored migration with JSONB and indexes
- `backend/tests/test_quotas.py` — reference for async test fixture patterns and user isolation tests

## Gotchas and Pitfalls
- **Secret field leakage:** Pydantic schema field exclusion does not guarantee the field is absent from serialized output. Always assert `"secret" not in response.json()` in tests explicitly.
- **JSONB silently becoming TEXT:** Autogenerate and some manual approaches render JSONB as TEXT in migration DDL. Always use `postgresql.JSONB()` explicitly.
- **Silent migration gap:** Omitting the new model import from either `alembic/env.py` or `app/models/__init__.py` causes alembic to generate an empty or incorrect migration with no error raised.
- **MissingGreenlet on relationship access:** Without `lazy='raise'`, async route handlers that accidentally touch a relationship will raise a cryptic `MissingGreenlet` error rather than a clear ORM configuration error.
- **Event loop mismatch in tests:** Session-scoped async fixtures break asyncpg under pytest-asyncio. All fixtures must be `scope='function'`.
- **Wrong DB driver in tests:** The container default `DATABASE_URL` uses `postgresql://` (psycopg2). Tests require `postgresql+asyncpg://` or they will fail silently or with confusing driver errors.
- **Fetch-then-check ownership:** Never retrieve a record and then check ownership in application code — always push the ownership condition into the SQL query to prevent information leakage about resource existence.
```
