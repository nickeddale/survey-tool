---
date: "2026-04-06"
ticket_id: "ISS-136"
ticket_title: "INF-01: Add CI/CD pipeline with GitHub Actions"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-136"
ticket_title: "INF-01: Add CI/CD pipeline with GitHub Actions"
categories: ["ci-cd", "github-actions", "infrastructure", "testing"]
outcome: "success"
complexity: "medium"
files_modified: [".github/workflows/ci.yml"]
---

# Lessons Learned: INF-01: Add CI/CD pipeline with GitHub Actions

## What Worked Well
- Using `working-directory: ./backend` on all backend job steps ensured correct relative path resolution for `pyproject.toml` and `tests/` without requiring `cd` commands
- The `pip install -e '.[dev]'` pattern installed all dev dependencies (pytest, ruff, mypy) in a single step, consistent with the project's pyproject.toml setuptools pattern
- Adding an import smoke-test step (`python -c "from app.database import engine; from app.config import settings"`) between pip install and pytest surfaces broken imports with clean tracebacks before pytest runs, saving debugging time
- PostgreSQL service container with health check ensured the database was ready before pytest attempted connections
- Splitting backend and frontend into separate jobs allowed them to run in parallel, reducing total CI time

## What Was Challenging
- Ensuring the `DATABASE_URL` scheme was `postgresql+asyncpg://` rather than `postgresql://` — the plain scheme fails silently or raises a confusing async dialect error
- Satisfying C-extension build requirements for `bcrypt` and `asyncpg` required explicitly installing `gcc` and `libpq-dev` via apt-get before pip install, which is easy to overlook on minimal GitHub Actions runners
- Coordinating the PostgreSQL service container health check correctly so that backend steps do not start before the DB is accepting connections

## Key Technical Insights
1. The `DATABASE_URL` must use `postgresql+asyncpg://survey:survey@localhost:5432/survey` — omitting the `+asyncpg` driver suffix will silently fail or produce a confusing SQLAlchemy async dialect error at runtime.
2. `asyncpg` must remain pinned to `<0.30` in `pyproject.toml`; do not add a pip upgrade or version override in the workflow — asyncpg 0.30+ may introduce breaking changes with the SQLAlchemy 2.x async dialect used in this project.
3. `asyncio_mode = 'auto'` must be present in `[tool.pytest.ini_options]` in `pyproject.toml`; without it, async tests require per-test `@pytest.mark.asyncio` decorators to run.
4. All pytest-asyncio fixtures must use `scope='function'`; session-scoped async engine fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio.
5. Do not install or reference `passlib` anywhere in CI — `passlib` 1.7.x raises `AttributeError` at runtime due to missing `bcrypt.__about__` when `bcrypt >= 4.x` is installed. The project uses `bcrypt` directly.
6. PostgreSQL service container credentials must match the docker-compose credentials (`survey/survey@localhost:5432/survey`) exactly to avoid connection errors in tests.

## Reusable Patterns
- **PostgreSQL service container block:**
  ```yaml
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_USER: survey
        POSTGRES_PASSWORD: survey
        POSTGRES_DB: survey
      options: >-
        --health-cmd="pg_isready -U survey -d survey"
        --health-interval=10s
        --health-timeout=5s
        --health-retries=5
      ports:
        - 5432:5432
  ```
- **Backend job env block:** set `DATABASE_URL: postgresql+asyncpg://survey:survey@localhost:5432/survey`
- **System deps before pip install:** `sudo apt-get install -y gcc libpq-dev`
- **Editable install:** `pip install -e '.[dev]'` from `working-directory: ./backend`
- **Import smoke-test step** between install and pytest: `python -c "from app.database import engine; from app.config import settings"`
- **Frontend job:** `npm ci` → ESLint lint → `tsc --noEmit` → `vitest run` → `npm run build`, all from `working-directory: ./frontend`

## Files to Review for Similar Tasks
- `.github/workflows/ci.yml` — canonical reference for this project's CI configuration
- `backend/pyproject.toml` — confirms test commands, linting tools, asyncio_mode, and asyncpg pin
- `frontend/package.json` — confirms exact lint, typecheck, build, and test script names
- `backend/tests/conftest.py` — confirms DATABASE_URL consumption, fixture scopes, and PostgreSQL credentials expected by tests

## Gotchas and Pitfalls
- **Wrong DB scheme:** Using `postgresql://` instead of `postgresql+asyncpg://` in `DATABASE_URL` will cause silent failure or a confusing async dialect error — always use the full asyncpg scheme.
- **asyncpg version pin:** Never override or upgrade `asyncpg` beyond `<0.30` in CI install steps.
- **Missing C build deps:** Omitting `gcc` and `libpq-dev` from apt-get causes `bcrypt` and `asyncpg` pip installs to fail on slim runners.
- **passlib incompatibility:** Do not introduce `passlib` in any CI step; it is incompatible with `bcrypt >= 4.x` and will raise `AttributeError` at runtime.
- **Service container not ready:** Without a proper health check and service dependency, pytest may start before PostgreSQL is accepting connections, causing intermittent connection errors.
- **Session-scoped async fixtures:** Any pytest-asyncio fixture with `scope='session'` that touches the async engine will cause event loop mismatch errors — keep all async fixtures at `scope='function'`.
- **asyncio_mode missing:** If `asyncio_mode = 'auto'` is absent from `pyproject.toml`, async tests silently become no-ops or error without per-test markers.
```
