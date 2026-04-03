---
date: "2026-04-03"
ticket_id: "ISS-103"
ticket_title: "7.8: Webhook HMAC-SHA256 Signing and Retry Logic"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-103"
ticket_title: "7.8: Webhook HMAC-SHA256 Signing and Retry Logic"
categories: ["webhooks", "security", "async", "testing", "retry-logic"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/app/services/webhook_service.py", "backend/tests/test_webhook_service.py"]
---

# Lessons Learned: 7.8: Webhook HMAC-SHA256 Signing and Retry Logic

## What Worked Well
- Using stdlib `hmac` and `hashlib` directly for HMAC-SHA256 signing avoided any external dependency issues and produced clean, readable code
- Patching `asyncio.sleep` with `AsyncMock` made retry backoff tests run in milliseconds instead of 370+ seconds
- Using `httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)` cleanly separated timeout phases per spec
- Retry gate logic (only retry on `httpx.TimeoutException`, `httpx.ConnectError`, and HTTP 5xx) was well-defined upfront and prevented ambiguity about 4xx behavior
- Running an import smoke-test before pytest caught any broken imports with clean tracebacks rather than cryptic pytest errors

## What Was Challenging
- Ensuring httpx.AsyncClient mocks correctly implemented the async context manager protocol (`__aenter__`/`__aexit__`) — missing this produces confusing `AttributeError` or `RuntimeWarning` about unclosed sessions rather than a clear failure
- Verifying exponential backoff values precisely: tests must assert `asyncio.sleep` was called with exact values `[10, 60, 300]` in order, not just that it was called some number of times
- Distinguishing first-attempt success (sleep never called) from retry-success scenarios in test assertions required explicit call count checks, not just implicit timing

## Key Technical Insights
1. HMAC-SHA256 signing: `hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()` — stdlib only, format header as `f'sha256={sig}'`
2. `httpx.Timeout` with named phases (`connect=5.0, read=10.0, write=5.0, pool=5.0`) is required when the spec independently specifies connection and read timeouts; a scalar timeout applies the same value to all phases
3. Retry semantics: gate retries on `httpx.TimeoutException`, `httpx.ConnectError`, and `response.status_code >= 500` only — HTTP 4xx must pass through immediately without retry
4. Backoff delays are index-driven: attempt 0 → 10s, attempt 1 → 60s, attempt 2 → 300s; after 3 retries exhausted, log final failure
5. `asyncio.sleep` must be patched at the module level where it is called (e.g., `patch("app.services.webhook_service.asyncio.sleep")`) not at the stdlib level
6. Do not use `passlib.CryptContext` anywhere in this codebase — bcrypt >= 4.x incompatibility breaks at runtime; use `bcrypt` directly if password hashing is ever needed

## Reusable Patterns
- **HMAC signing**: `import hmac, hashlib; sig = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest(); header = f'sha256={sig}'`
- **Timeout config**: `httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)`
- **Mock async HTTP client**:
  ```python
  mock_client = AsyncMock()
  mock_response = MagicMock()
  mock_response.status_code = 200
  mock_client.__aenter__.return_value = mock_client
  mock_client.__aexit__.return_value = None
  mock_client.post.return_value = mock_response
  ```
- **Patch sleep in retry tests**: `@patch("app.services.webhook_service.asyncio.sleep", new_callable=AsyncMock)`
- **Assert backoff sequence**: `mock_sleep.assert_has_calls([call(10), call(60)])`
- **Assert no sleep on first-attempt success**: `mock_sleep.assert_not_called()`
- **Import smoke-test before pytest**: `python -c "from app.services.webhook_service import WebhookService"`

## Files to Review for Similar Tasks
- `backend/app/services/webhook_service.py` — reference for HMAC signing, retry loop, timeout config, and structured logging pattern
- `backend/tests/test_webhook_service.py` — reference for async context manager mocking, sleep patching, and retry assertion patterns

## Gotchas and Pitfalls
- **httpx mock must be async context manager**: `AsyncMock` alone is insufficient — explicitly set `__aenter__` and `__aexit__` on the mock or use `spec=httpx.AsyncClient`
- **asyncio.sleep patch scope**: patch at `app.services.webhook_service.asyncio.sleep`, not `asyncio.sleep` globally
- **DATABASE_URL scheme**: every test run must override to `postgresql+asyncpg://` — the default `postgresql://` (psycopg2) scheme is incompatible with the async engine
- **Fixture scope**: all async SQLAlchemy fixtures in `conftest.py` must use `scope="function"` — `scope="session"` causes event loop mismatch errors with asyncpg and has no workaround
- **Real sleep in tests**: if `asyncio.sleep` is not mocked, a full retry sequence (10s + 60s + 300s per webhook) will make the test suite take over 6 minutes — always mock it
- **Do not retry 4xx**: client errors must not trigger retries; only transient failures (timeouts, connection errors, server errors) should be retried
```
