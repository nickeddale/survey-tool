---
date: "2026-04-10"
ticket_id: "ISS-211"
ticket_title: "Backend CPU saturation under load — single-process bottleneck"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-10"
ticket_id: "ISS-211"
ticket_title: "Backend CPU saturation under load — single-process bottleneck"
categories: ["performance", "infrastructure", "docker", "concurrency"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/Dockerfile", "backend/pyproject.toml", "backend/gunicorn.conf.py", "docker-compose.yml", "backend/app/config.py", "backend/app/limiter.py", "backend/app/services/auth_service.py", "backend/app/api/auth.py", "backend/app/cli.py"]
---

# Lessons Learned: Backend CPU saturation under load — single-process bottleneck

## What Worked Well
- The gunicorn + UvicornWorker pattern is well-supported and required minimal application-level changes — the FastAPI app itself needed no modification
- Using `NUM_WORKERS` as an environment variable allowed runtime tuning without image rebuilds
- Scoping `docker compose up` to `postgres` and `backend` only during validation prevented false negatives from unrelated frontend issues
- The import smoke-test (`python -c 'from app.main import app'`) caught worker startup issues early, before running the full integration suite

## What Was Challenging
- The volume mount `./backend:/app` in docker-compose masks Docker build artifacts (`.egg-info`); after adding gunicorn to pyproject.toml and rebuilding the image, the host filesystem also needed `pip install -e '.[dev]'` to stay in sync — otherwise the container resolved a stale install
- gunicorn.conf.py is loaded before the FastAPI app initializes, making it unsafe to import `app.config.settings` unconditionally; this required treating `os.environ.get` in that file as an intentional, documented exception to the project's pydantic-settings convention
- The `2*cores+1` worker formula originates from sync (non-async) worker assumptions; for uvicorn workers on I/O-bound workloads, a conservative cap (e.g. `min(4, 2*cpu_count()+1)`) is safer and avoids unnecessary memory pressure
- Gunicorn worker startup failures surface as cryptic timeout errors rather than clean tracebacks — the import smoke-test was essential to catch these before running integration tests

## Key Technical Insights
1. **Per-process rate limiting trade-off**: slowapi's in-memory rate limiter is scoped to a single process. With N gunicorn workers, each IP effectively gets N × rate_limit requests before global blocking. This is an accepted trade-off for this deployment; strict global limits require a Redis-backed limiter.
2. **Bcrypt blocks the event loop**: `bcrypt.hashpw` is CPU-bound and stalls the uvicorn event loop during login/register. Wrapping it in `run_in_executor(None, ...)` prevents starving other coroutines in the same worker, even when multiple workers are in use.
3. **gunicorn.conf.py is pre-app context**: Any config read in gunicorn.conf.py must use raw `os.environ.get` — the pydantic-settings `Settings` object cannot be safely instantiated there in all environments.
4. **UvicornWorker + gunicorn is the correct async pattern**: Running `uvicorn --workers N` is unsupported for production (workers don't share state correctly); the canonical approach is `gunicorn -k uvicorn.workers.UvicornWorker`.
5. **Volume mounts shadow build artifacts**: The `./backend:/app` bind mount is a development convenience that can hide stale or missing `.egg-info` metadata — always re-run `pip install -e '.[dev]'` on the host after changing pyproject.toml.

## Reusable Patterns
- **gunicorn.conf.py template**: Set `workers = int(os.environ.get("NUM_WORKERS", min(4, 2 * cpu_count() + 1)))`, `worker_class = "uvicorn.workers.UvicornWorker"`, plus `timeout`, `keepalive`, and `bind` — and add a comment marking `os.environ.get` as an intentional exception to the `app.config.settings` convention.
- **Bcrypt in executor**: `await asyncio.get_event_loop().run_in_executor(None, bcrypt.hashpw, password.encode(), salt)` for all password hash/verify calls in async endpoints.
- **Validation sequence**: (1) import smoke-test inside container, (2) `docker compose up -d postgres backend`, (3) full test suite — never skip step 1.
- **Host egg-info sync**: After any pyproject.toml dependency change, run `pip install -e '.[dev]'` on host to keep volume-mounted `.egg-info` consistent with the rebuilt image.

## Files to Review for Similar Tasks
- `backend/gunicorn.conf.py` — worker count formula, UvicornWorker class, bind/timeout/keepalive settings, intentional `os.environ` usage
- `backend/Dockerfile` — prod stage CMD switching from bare `uvicorn` to `gunicorn -c gunicorn.conf.py`
- `backend/app/config.py` — `num_workers` field pattern (pydantic-settings v2 `SettingsConfigDict`) for any new optional env vars
- `backend/app/limiter.py` — per-process in-memory limitation comment; reference point if Redis backend is ever added
- `backend/app/services/auth_service.py` — bcrypt `run_in_executor` pattern for CPU-bound crypto in async services
- `docker-compose.yml` — `NUM_WORKERS` env var passthrough to backend service

## Gotchas and Pitfalls
- **Never run `docker compose up` without scoping services during validation** — the frontend service can fail for unrelated reasons and mask real backend errors.
- **Do not import `app.config.settings` at module load time in gunicorn.conf.py** — gunicorn loads this file before the app is initialized; it will fail in some environments.
- **The `2*cores+1` formula is for sync workers** — apply a conservative cap for async uvicorn workers to avoid memory pressure on containers with many cores.
- **Rebuilding the image is not enough after pyproject.toml changes** — the `./backend:/app` volume mount means the running container uses the host filesystem, not the image's; the host `.egg-info` must also be updated.
- **Worker startup errors are silent without the smoke-test** — gunicorn reports them only as worker timeout, not import errors; always run `python -c 'from app.main import app'` first.
- **Rate limits are per-worker with in-memory slowapi** — document this clearly in limiter.py so future developers don't assume global enforcement without a Redis backend.
```
