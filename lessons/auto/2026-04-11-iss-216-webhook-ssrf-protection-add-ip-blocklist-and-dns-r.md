---
date: "2026-04-11"
ticket_id: "ISS-216"
ticket_title: "Webhook SSRF Protection — Add IP blocklist and DNS resolution check"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-216"
ticket_title: "Webhook SSRF Protection — Add IP blocklist and DNS resolution check"
categories: ["security", "webhooks", "ssrf", "validation", "testing"]
outcome: "success"
complexity: "high"
files_modified:
  - "backend/app/utils/ssrf_protection.py"
  - "backend/app/schemas/webhook.py"
  - "backend/app/services/webhook_service.py"
  - "backend/tests/test_ssrf_protection.py"
  - "backend/tests/test_webhooks.py"
  - "backend/tests/test_webhook_service.py"
---

# Lessons Learned: Webhook SSRF Protection — Add IP blocklist and DNS resolution check

## What Worked Well
- Layered defense strategy: static IP/hostname blocking at the schema layer plus async DNS resolution re-validation at delivery time covers both bypass variants and DNS rebinding
- Isolating SSRF logic into `backend/app/utils/ssrf_protection.py` kept the schema and service layers clean and made the utility independently testable
- `pytest.mark.parametrize` with descriptive IDs for each IP bypass category (loopback, RFC1918, link-local, encoded variants) produced self-documenting test failure output
- Patching `socket.getaddrinfo` at the call-site module level (`app.utils.ssrf_protection.socket.getaddrinfo`) correctly intercepted DNS calls without side effects on other modules

## What Was Challenging
- SSRF bypasses are more numerous than expected: hex (`0x7f000001`), octal (`0177.0.0.1`), decimal (`2130706433`), IPv6 mapped (`::ffff:127.0.0.1`), and shorthand forms all needed explicit handling via the `ipaddress` module
- `socket.getaddrinfo` is a blocking syscall — it cannot be called directly in an async context without blocking the event loop; the correct pattern using `run_in_executor` is non-obvious and easy to get wrong
- `asyncio.run()` inside an async function raises `RuntimeError` under pytest-asyncio's function-scoped event loops; this is a subtle trap when wrapping blocking calls
- The `from __future__ import annotations` import in schema/router files silently breaks Pydantic `@field_validator` resolution when FastAPI processes the model, causing ForwardRef failures rather than clear error messages

## Key Technical Insights
1. **Two-phase validation is essential for SSRF**: Schema-layer validation catches literal IP bypass variants at creation time; DNS resolution at delivery time is required to catch DNS rebinding attacks where a hostname initially resolves to a public IP but later resolves to a private one.
2. **Use `asyncio.get_event_loop().run_in_executor(None, socket.getaddrinfo, host, None)`** for async DNS resolution — this reuses the current event loop's thread pool and is compatible with pytest-asyncio's function-scoped event loops. Never use `asyncio.run()` inside an async function and never call `getaddrinfo` directly from a coroutine.
3. **The `ipaddress` module normalizes all IP encoding variants**: parsing a raw string through `ipaddress.ip_address()` correctly handles hex, octal, decimal, and IPv6 forms, making it the canonical tool for detecting private/blocked ranges regardless of encoding.
4. **`from __future__ import annotations` must be absent from files with Pydantic `@field_validator` + FastAPI endpoints**: Python 3.11+ supports union types natively; the import causes all locally-defined models to become `ForwardRef`s that Pydantic cannot resolve at request time.
5. **Mock at the call-site, not the definition site**: Patching `app.utils.ssrf_protection.socket.getaddrinfo` (where the name is looked up) rather than `socket.getaddrinfo` globally ensures tests intercept the correct reference and avoids false-passing tests.
6. **DNS rebinding tests must assert both conditions**: verify the HTTP request was never made (assert the httpx mock was not called) AND that an exception was raised/logged — testing only one side leaves the protection incompletely verified.

## Reusable Patterns
- **SSRF utility module pattern**: Create a standalone `utils/ssrf_protection.py` with a synchronous `is_safe_url(url: str) -> bool` (for schema validators) and an async `resolve_and_validate_url(url: str) -> None` (for service delivery). Keep both in one module for cohesion.
- **Blocked range set pattern**: Define `BLOCKED_NETWORKS` as a module-level list of `ipaddress.ip_network()` objects; check any resolved address with `any(addr in net for net in BLOCKED_NETWORKS)` for readable, maintainable coverage.
- **Schema validator pattern**: Use `@field_validator("url")` in the Pydantic model; call `is_safe_url()` synchronously (no DNS at this layer); raise `ValueError` with a user-facing message like `"Webhook URL targets a blocked or private address"`.
- **Pre-delivery guard pattern**: In `_deliver_webhook()`, call `await resolve_and_validate_url(url)` before opening the `httpx.AsyncClient` context. Log the blocked attempt at WARNING level with the hostname and resolved IP for auditability.
- **Parametrized SSRF test pattern**: Group test cases by category using `pytest.mark.parametrize` with explicit `ids=` matching the category name (e.g., `"loopback-ipv4"`, `"rfc1918-10"`, `"hex-encoded"`) so CI output pinpoints which bypass class failed.
- **Import smoke-test pattern**: Before running the full test suite in Docker, run `python -c "from app.utils.ssrf_protection import is_safe_url, resolve_and_validate_url"` to surface import errors as clean Python tracebacks rather than cryptic pytest collection failures.

## Files to Review for Similar Tasks
- `backend/app/utils/ssrf_protection.py` — reference implementation of the two-phase SSRF utility
- `backend/app/schemas/webhook.py` — example of `@field_validator` with synchronous SSRF check in a Pydantic model (note: no `from __future__ import annotations`)
- `backend/app/services/webhook_service.py` — `_deliver_webhook()` shows correct placement of async DNS re-validation before HTTP delivery
- `backend/tests/test_ssrf_protection.py` — comprehensive parametrized unit tests covering all IP encoding bypass variants
- `backend/tests/test_webhook_service.py` — DNS rebinding test pattern: mocking `getaddrinfo` at call-site and asserting both no-HTTP-call and exception raised

## Gotchas and Pitfalls
- **Never call `socket.getaddrinfo` directly in a coroutine** — it blocks the event loop. Always wrap with `loop.run_in_executor(None, ...)`.
- **Never use `asyncio.run()` inside an `async def`** — it creates a new event loop and raises `RuntimeError` under pytest-asyncio with function-scoped event loops.
- **Remove `from __future__ import annotations`** from any file that combines FastAPI endpoints with Pydantic `@field_validator` — the import defers annotation evaluation, turning model types into unresolvable `ForwardRef`s.
- **Patch `socket.getaddrinfo` at the module where it is imported** (`app.utils.ssrf_protection.socket.getaddrinfo`), not at `socket.getaddrinfo` globally — patching the wrong reference produces tests that pass even when the guard is broken.
- **Validate both IPv4 and IPv6 forms** including IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`) — the `ipaddress` module's `ipv4_mapped` property is needed to unwrap these before range checking.
- **DNS rebinding requires re-validation at delivery time** — schema-only validation is bypassable by registering a public IP, passing validation, then updating DNS to point at a private IP before the webhook fires.
- **Metadata hostname blocklist must be explicit**: `169.254.169.254` is caught by the link-local range, but named endpoints like `metadata.google.internal` resolve to that IP only via DNS — the hostname itself must also be blocked by string match to prevent resolution from leaking.
- **Cloud metadata endpoint is the highest-severity target**: `169.254.169.254` serves IAM credentials in AWS, GCP, and Azure — ensure it appears in the first parametrize test case and is treated as a P0 regression if its test ever fails.
```
