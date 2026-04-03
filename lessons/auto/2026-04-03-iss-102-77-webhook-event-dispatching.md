---
date: "2026-04-03"
ticket_id: "ISS-102"
ticket_title: "7.7: Webhook Event Dispatching"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-102"
ticket_title: "7.7: Webhook Event Dispatching"
categories: ["webhooks", "async", "background-tasks", "event-dispatching", "httpx"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/webhook_service.py"
  - "backend/app/services/response_service.py"
  - "backend/app/services/survey_service.py"
  - "backend/app/services/quota_service.py"
---

# Lessons Learned: 7.7: Webhook Event Dispatching

## What Worked Well
- Fire-and-forget pattern via `asyncio.create_task` kept webhook delivery non-blocking and decoupled from the request lifecycle
- Extracting scalar values from ORM objects before scheduling background tasks eliminated session lifetime issues entirely
- Using `async with httpx.AsyncClient() as client:` inside `_deliver_webhook` guaranteed connection cleanup without manual management
- Broad `try/except Exception` around the HTTP delivery call ensured broken webhook endpoints never surfaced as API errors
- Integrating dispatch calls at well-defined points (after flush/commit) in each service kept trigger logic clean and predictable

## What Was Challenging
- SQLAlchemy async session lifecycle: the request-scoped session is closed before a fire-and-forget task runs, causing `DetachedInstanceError` if ORM objects are passed into the task — required careful extraction of all needed scalars before calling `create_task`
- Ensuring `asyncio.create_task` had an active running event loop in all call contexts, including tests
- Querying both survey-scoped and global webhooks correctly required an explicit `OR` predicate; a simple equality filter silently dropped all global webhooks
- JSONB/array event filtering needed to happen at the database level to avoid loading all active webhooks into memory on every dispatch

## Key Technical Insights
1. Never pass a request-scoped SQLAlchemy session into `asyncio.create_task`. Extract all scalar data (URLs, IDs, payload dicts) before scheduling the task and pass only those scalars.
2. `asyncio.create_task` requires an active running event loop. In tests, mock the task or use `await asyncio.gather(task)` to exercise fire-and-forget logic without real async complexity.
3. Global webhook matching requires `OR(Webhook.survey_id == survey_id, Webhook.survey_id.is_(None))` — omitting the `is_(None)` branch silently breaks all global webhooks.
4. Event type filtering should use a database-level JSONB contains/overlap query, not Python-side filtering after loading all rows.
5. All exceptions inside fire-and-forget tasks must be caught internally; uncaught exceptions produce `Task exception was never retrieved` RuntimeWarnings and can crash the event loop in some configurations.
6. If the `Webhook` model has a `secret` field, consumers will expect an `X-Webhook-Signature` HMAC-SHA256 header — confirm this requirement before delivery is considered complete.

## Reusable Patterns
- **Session-safe fire-and-forget**: Extract scalars from ORM objects → build payload dict → call `asyncio.create_task(_deliver(url, payload, secret))` with no session reference inside the task.
- **Safe HTTP delivery**:
  ```python
  async def _deliver_webhook(url: str, payload: dict, secret: str | None) -> None:
      try:
          async with httpx.AsyncClient() as client:
              await client.post(url, json=payload, timeout=10)
      except Exception as exc:
          logger.warning("Webhook delivery failed for %s: %s", url, exc)
  ```
- **Webhook query predicate**:
  ```python
  select(Webhook).where(
      Webhook.is_active == True,
      or_(Webhook.survey_id == survey_id, Webhook.survey_id.is_(None)),
      Webhook.events.contains([event]),
  )
  ```
- **Test isolation**: Use function-scoped async fixtures and mock `httpx.AsyncClient` with `unittest.mock.AsyncMock` — never session-scoped async engine fixtures, which cause event loop mismatch errors with asyncpg.

## Files to Review for Similar Tasks
- `backend/app/services/webhook_service.py` — canonical fire-and-forget async delivery implementation
- `backend/app/services/response_service.py` — example of integrating dispatch after DB flush
- `backend/app/services/quota_service.py` — example of replacing a no-op stub with a real async dispatch call
- `backend/tests/test_webhook_service.py` — reference for mocking httpx and testing fire-and-forget behavior

## Gotchas and Pitfalls
- Passing ORM objects (not scalars) into `asyncio.create_task` will cause `DetachedInstanceError` or closed connection errors at runtime, often silently swallowed unless logging is in place.
- Using `scope="session"` for async SQLAlchemy fixtures under pytest-asyncio with asyncpg causes event loop mismatch errors; always use `scope="function"`.
- A webhook query that omits `Webhook.survey_id.is_(None)` will never fire global webhooks — this is a silent bug with no error.
- `asyncio.create_task` called outside a running event loop raises `RuntimeError`; ensure dispatch functions are only called from async contexts.
- Without a broad `try/except` in the delivery function, a single failed HTTP call generates `Task exception was never retrieved` warnings that can obscure other log output.
- If `secret` is present on the webhook model but no signature header is sent, consumers attempting HMAC verification will reject all payloads silently.
```
