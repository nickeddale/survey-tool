---
date: "2026-04-01"
ticket_id: "ISS-014"
ticket_title: "1.1: Project Scaffolding and Docker Setup"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-014"
ticket_title: "1.1: Project Scaffolding and Docker Setup"
categories: ["docker", "fastapi", "postgresql", "project-scaffolding", "pydantic-settings"]
outcome: "success"
complexity: "medium"
files_modified: ["docker-compose.yml", "backend/Dockerfile", "backend/pyproject.toml", ".env.example", "backend/app/config.py"]
---

# Lessons Learned: 1.1: Project Scaffolding and Docker Setup

## What Worked Well
- Pydantic-settings v2 `SettingsConfigDict` pattern loaded env vars cleanly with sensible defaults and no boilerplate
- Dockerfile layer ordering (system deps → `pyproject.toml` copy → pip install → source copy) maximized cache reuse across rebuilds
- Scoping `docker-compose up -d postgres` to the postgres service only avoided failures from the unimplemented frontend stub
- Import smoke-test (`python -c "from app.config import settings"`) surfaced misconfiguration early with a clean traceback before any docker or alembic commands ran

## What Was Challenging
- The volume mount `./backend:/app` in docker-compose masks Docker build artifacts including `.egg-info`, requiring editable install to also be run on the host filesystem
- The frontend stub service references `./frontend/nginx.conf` which does not exist, causing `docker-compose up` (unscoped) to fail
- Environment default `DATABASE_URL` uses the psycopg2 scheme (`postgresql://`), which is incompatible with the async SQLAlchemy engine that requires `postgresql+asyncpg://`
- passlib 1.7.x is incompatible with bcrypt >= 4.x due to missing `bcrypt.__about__` — replacing passlib with direct bcrypt usage was required

## Key Technical Insights
1. Never rely on `docker-compose up` succeeding for stub services that reference files not yet created — always scope validation commands to only the services that are fully configured
2. The `DATABASE_URL` scheme must be `postgresql+asyncpg://` for async SQLAlchemy; a plain `postgresql://` scheme will fail silently or raise a confusing error at engine creation time
3. passlib 1.7.x and bcrypt >= 4.x are fundamentally incompatible — use `bcrypt.hashpw`/`bcrypt.checkpw`/`bcrypt.gensalt` directly; do not add passlib as a dependency
4. Volume mounts in docker-compose that shadow the build layer mean any pip install artifacts (`.egg-info`) built inside the image are invisible at runtime unless they also exist on the host; always run `pip install -e .` on the host after cloning
5. pydantic-settings v2 requires `model_config = SettingsConfigDict(...)` — the v1 inner `class Config` pattern is not compatible and will produce silent misconfiguration
6. asyncpg 0.30+ may introduce breaking changes with SQLAlchemy 2.x async dialect; pin to `<0.30` until explicit re-testing is done

## Reusable Patterns
- **pydantic-settings v2 config**: `model_config = SettingsConfigDict(env_file='.env', case_sensitive=False)` on `BaseSettings` subclass
- **CORS_ORIGINS**: Store as comma-separated string in `.env`/`.env.example`; add a `cors_origins_list` computed `@property` on `Settings` that splits on comma
- **Dockerfile layer order**: `apt-get install gcc libpq-dev` → `COPY pyproject.toml` → `pip install -e '.[dev]'` → `COPY . .`
- **PostgreSQL healthcheck**: `pg_isready -U <user> -d <db>` combined with `depends_on: condition: service_healthy` in docker-compose prevents backend startup race conditions
- **Import smoke-test**: `python -c "from app.config import settings; print(settings.database_url)"` as a post-install sanity check before running migrations or tests
- **pytest config**: `asyncio_mode = 'auto'` in `[tool.pytest.ini_options]` in `pyproject.toml` to avoid per-test `@pytest.mark.asyncio` decoration
- **DATABASE_URL override for tests**: Always export `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker"` when running tests locally to override the environment default psycopg2 scheme

## Files to Review for Similar Tasks
- `backend/app/config.py` — reference implementation of pydantic-settings v2 pattern with `DATABASE_URL` scheme validation and `cors_origins_list` property
- `backend/Dockerfile` — canonical layer-order example for Python async backends requiring C extensions
- `docker-compose.yml` — pg_isready healthcheck and `depends_on: condition: service_healthy` pattern
- `backend/pyproject.toml` — dependency pinning conventions including `asyncpg<0.30` and direct `bcrypt` (no passlib)

## Gotchas and Pitfalls
- **passlib + bcrypt incompatibility**: passlib[bcrypt] in `pyproject.toml` breaks at runtime with bcrypt >= 4.x — remove passlib entirely and use bcrypt directly
- **Volume mount masks .egg-info**: `./backend:/app` in docker-compose means the container sees the host filesystem; `.egg-info` built inside the image is invisible — run `pip install -e .` on the host too
- **Frontend stub breaks unscoped docker-compose**: `docker-compose up` without a service argument will attempt to start the frontend stub and fail on missing `./frontend/nginx.conf` — always scope to `postgres` or `backend` only until frontend is implemented
- **psycopg2 scheme in environment**: The system `DATABASE_URL` environment variable may default to `postgresql://` (psycopg2 scheme) — `postgresql+asyncpg://` is required; validate or assert the correct scheme in `config.py` at startup
- **JWT_SECRET default**: The default value `change-me-in-production` in `config.py` is intentionally insecure for local dev — it must be overridden via environment variable in any deployed environment; consider raising at startup if the value is the default and `ENV != "development"`
```
