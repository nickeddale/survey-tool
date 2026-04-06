---
date: "2026-04-06"
ticket_id: "ISS-133"
ticket_title: "REL-04: Add idempotency key to webhook delivery"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-133"
ticket_title: "REL-04: Add idempotency key to webhook delivery"
categories: ["webhooks", "idempotency", "database-migrations", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/webhook_service.py"
  - "backend/app/models/webhook_delivery_log.py"
  - "backend/app/models/webhook.py"
  - "backend/alembic/versions/0017_create_webhook_delivery_logs_table.py"
  - "backend/alembic/env.py"
  - "backend/app/models/__init__.py"
  - "backend/tests/test_webhook_service.py"
---

# Lessons Learned: REL-04: Add idempotency key to webhook delivery

## What Worked Well
- Generating the delivery UUID once in `_dispatch_task()` before the retry loop ensured all retry attempts shared the same `X-Webhook-Delivery-Id` header value without extra coordination logic
- Manually authoring the migration (rather than using `alembic revision --autogenerate`) preserved `server_default=sa.text('now()')` on timestamp columns and correctly rendered the payload column as `sa.dialects.postgresql.JSONB`
- Adding the model import to both `alembic/env.py` and `app/models/__init__.py` before running any alembic command prevented silent migration gaps
- Running the import smoke-test (`python -c "from app.models.webhook_delivery_log import WebhookDeliveryLog"`) before touching alembic surfaced any import errors as clean tracebacks rather than cryptic alembic failures
- Using Python-side `default=uuid.uuid4` for UUID primary keys was consistent with the rest of the project and avoided any pgcrypto extension dependency

## What Was Challenging
- Verifying the next available migration sequence number required manually inspecting existing files to confirm 0015 and 0016 existed before creating 0017, since a gap would break `alembic upgrade head`
- The status column required a deliberate decision to use `String` instead of a PostgreSQL ENUM to avoid the `CREATE TYPE IF NOT EXISTS` limitation in asyncpg
- Ensuring the `WebhookDeliveryLog` row was updated to `delivered` or `failed` after `_deliver_webhook` returned required careful placement around the retry loop to capture final state correctly

## Key Technical Insights
1. asyncpg does NOT support `CREATE TYPE IF NOT EXISTS` — if a status ENUM is ever needed, use the `DO $$ BEGIN IF NOT EXISTS (...) THEN CREATE TYPE ... END IF; END $$` workaround via `conn.exec_driver_sql()`, not `conn.execute(text(...))`
2. Alembic autogenerate silently drops `server_default` and `onupdate` on timestamp columns and may render JSONB columns as TEXT — always manually author migrations for tables with these column types
3. Background `asyncio.create_task` in `_deliver_webhook` binds to the module-level event loop; function-scoped test event loops will mismatch. Mock `dispatch_webhook_event` at the call-site module level (e.g. `app.services.response_service.dispatch_webhook_event`), not at `_deliver_webhook`, to intercept before the task is scheduled
4. A missing model import in `alembic/env.py` causes a silent migration gap with no error — the table simply never appears in the generated migration
5. UUID PKs should use `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — Python-side default, no `server_default=gen_random_uuid()` which requires the pgcrypto extension

## Reusable Patterns
- **Idempotency key generation**: Generate one `uuid.uuid4()` per logical delivery in the dispatch function before the retry loop; pass it as a parameter to the delivery function so all attempts share the same ID
- **Delivery log lifecycle**: Insert row with `status=pending` before first attempt; update to `delivered` or `failed` with `attempt_count` and `last_error` after the retry loop resolves
- **Migration authoring checklist**: Use `sa.dialects.postgresql.JSONB` for JSON columns, use `sa.text('now()')` for timestamp `server_default`, verify migration sequence number, add model import to `alembic/env.py` and `app/models/__init__.py`, run import smoke-test, then run `alembic upgrade head`
- **Webhook test mocking**: Patch at `app.services.response_service.dispatch_webhook_event` (or equivalent call-site), not at the internal delivery function, to avoid event loop binding issues in tests

## Files to Review for Similar Tasks
- `backend/app/services/webhook_service.py` — retry loop structure, delivery_id injection, `_dispatch_task` signature
- `backend/alembic/versions/0014_create_webhooks_table.py` — migration conventions: naming, FK constraints, index patterns used in this project
- `backend/alembic/env.py` — model import registration pattern required for autogenerate and upgrade
- `backend/app/models/webhook_delivery_log.py` — ORM model with UUID PK, FK to webhooks, JSONB payload column
- `backend/tests/test_webhook_service.py` — header assertion pattern, retry UUID consistency test, delivery log integration test structure

## Gotchas and Pitfalls
- Never use `alembic revision --autogenerate` for tables with JSONB columns or `server_default` timestamps — it will silently corrupt the migration
- Always check the migrations directory for the highest existing sequence number before naming a new file — gaps cause `alembic upgrade head` failures
- Do not mock `_deliver_webhook` directly in tests that run under function-scoped event loops; the background task will have already bound to a different loop
- `String` is safer than PostgreSQL ENUM for status columns when asyncpg is in use; if ENUM is required, use the `DO $$` workaround exclusively via `conn.exec_driver_sql()`
- Adding a model file alone is not sufficient — both `alembic/env.py` and `app/models/__init__.py` must import the model or alembic will not see the table
```
