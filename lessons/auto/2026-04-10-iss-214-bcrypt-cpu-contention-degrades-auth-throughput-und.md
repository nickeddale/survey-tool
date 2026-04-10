---
date: "2026-04-10"
ticket_id: "ISS-214"
ticket_title: "bcrypt CPU contention degrades auth throughput under load"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-10"
ticket_id: "ISS-214"
ticket_title: "bcrypt CPU contention degrades auth throughput under load"
categories: ["performance", "async", "authentication", "rate-limiting", "configuration"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/app/services/auth_service.py", "backend/app/config.py", "backend/app/limiter.py", "backend/tests/conftest.py", "backend/tests/test_auth.py"]
---

# Lessons Learned: bcrypt CPU contention degrades auth throughput under load

## What Worked Well
- The existing codebase already used `run_in_executor` for bcrypt, so the migration to `asyncio.to_thread` was a targeted modernization rather than a from-scratch implementation
- Adding `BCRYPT_ROUNDS` as a pydantic-settings v2 field with a sensible default (12) made it trivial to configure lower rounds (4) for test environments without touching production behavior
- A module-level `ThreadPoolExecutor` singleton cleanly bounded concurrent bcrypt operations without per-request overhead
- Tightening rate limits on auth endpoints (login 10→5/min, register 5→3/min) was a low-risk, high-value abuse mitigation that required only config changes in `limiter.py`

## What Was Challenging
- Determining the correct mechanism to override `settings.bcrypt_rounds` in tests — the Settings singleton must be patched via monkeypatch on the object, never by setting `os.environ` directly after import, since pydantic-settings reads env at instantiation time
- Ensuring the bounded `ThreadPoolExecutor` did not interfere with the default loop executor used elsewhere in the application
- Keeping test suite fast while validating round-count behavior — verifying the cost factor of a produced hash requires inspecting the bcrypt hash prefix (`$2b$04$` for rounds=4), which is not immediately obvious

## Key Technical Insights
1. `asyncio.to_thread()` (Python 3.9+) is the idiomatic replacement for `loop.run_in_executor(None, fn)` — it implicitly uses the running loop's default executor and is cleaner to read
2. bcrypt >= 4.x (5.0.0 installed) breaks passlib at runtime with `AttributeError: module 'bcrypt' has no attribute '__about__'` — always use `bcrypt.hashpw` / `bcrypt.checkpw` / `bcrypt.gensalt` directly
3. A module-level `ThreadPoolExecutor(max_workers=N)` passed explicitly to `asyncio.to_thread` (via `loop.run_in_executor(executor, fn)`) caps thread proliferation; without it, high auth load can spawn unbounded threads that compete for OS scheduler time
4. Configurable bcrypt rounds are essential for CI/CD speed: rounds=4 reduces hash time from ~300ms to ~1ms, keeping auth tests from dominating the test suite runtime
5. The bcrypt cost factor is embedded in the hash string — `$2b$<rounds>$...` — making it straightforward to assert in tests that the configured rounds were actually used
6. CPU-bound work offloaded to a thread pool still benefits from multi-worker deployment (gunicorn/uvicorn workers) because each worker has its own event loop and thread pool; the two fixes (to_thread + multi-worker) are multiplicative, not redundant

## Reusable Patterns
- **Configurable bcrypt rounds via pydantic-settings v2:**
  ```python
  bcrypt_rounds: int = Field(default=12, description="Cost factor; use 4 in test environments")
  ```
  Override in tests with `monkeypatch.setattr(settings, "bcrypt_rounds", 4)` before the service function is called.

- **Module-level bounded executor for CPU-bound async work:**
  ```python
  _bcrypt_executor = ThreadPoolExecutor(max_workers=4)

  async def hash_password(plain: str) -> str:
      loop = asyncio.get_running_loop()
      return await loop.run_in_executor(_bcrypt_executor, _sync_hash, plain)
  ```

- **Asserting bcrypt round count in tests:**
  ```python
  hashed = await hash_password("secret")
  assert hashed.startswith(f"$2b${settings.bcrypt_rounds:02d}$")
  ```

- **Import smoke-test before any auth_service modification:**
  ```bash
  python -c 'from app.services.auth_service import hash_password, verify_password'
  ```
  Catches broken imports (circular deps, missing attrs) before they appear as cryptic runtime failures.

## Files to Review for Similar Tasks
- `backend/app/services/auth_service.py` — canonical example of offloading CPU-bound work to a bounded thread pool executor with configurable parameters
- `backend/app/config.py` — pydantic-settings v2 pattern for adding new environment-configurable fields with `SettingsConfigDict`
- `backend/app/limiter.py` — slowapi rate limiter instance and per-endpoint limit strings; reference for tightening or adding new endpoint limits
- `backend/tests/conftest.py` — how `settings.bcrypt_rounds` is overridden for tests and how function-scoped async fixtures are structured

## Gotchas and Pitfalls
- **Never use passlib CryptContext with bcrypt >= 4.x** — it raises `AttributeError: module 'bcrypt' has no attribute '__about__'` at runtime. Use `bcrypt.hashpw`/`checkpw`/`gensalt` directly.
- **Never set `os.environ["BCRYPT_ROUNDS"]` in tests after import** — pydantic-settings reads env at instantiation; the singleton is already built. Use `monkeypatch.setattr(settings, "bcrypt_rounds", 4)` instead.
- **All async pytest fixtures must be `scope="function"`** — session-scoped async SQLAlchemy engines cause event loop mismatch errors with asyncpg under pytest-asyncio; there is no clean workaround.
- **`asyncio.get_event_loop()` is deprecated in async contexts** — use `asyncio.get_running_loop()` or `asyncio.to_thread()` instead; the old pattern can silently create a new loop in some contexts.
- **`frozenset(answers.items())` in `relevance.py:278` fails for list-valued `multiple_choice` answers** — any new auth tests that also submit survey responses to trigger completion must avoid list-valued answers or the test fails with `unhashable type: 'list'` unrelated to the bcrypt fix.
- **Rate limit changes affect integration tests** — if tests hit the same auth endpoints repeatedly in a single test run, tightened limits (5/min, 3/min) can cause unexpected 429s; ensure `conftest.py` resets the rate limiter between tests.
- **The DATABASE_URL default uses the psycopg2 scheme** — any test invocation must explicitly override to `postgresql+asyncpg://`; omitting this fails silently with the async engine.
```
