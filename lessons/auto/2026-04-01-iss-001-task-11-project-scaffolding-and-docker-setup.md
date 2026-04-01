---
date: "2026-04-01"
ticket_id: "ISS-001"
ticket_title: "Task 1.1: Project Scaffolding and Docker Setup"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```
---
date: "2026-04-01"
ticket_id: "ISS-001"
ticket_title: "Task 1.1: Project Scaffolding and Docker Setup"
categories: ["scaffolding", "docker", "fastapi", "pydantic-settings", "project-setup"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/pyproject.toml"
  - "backend/Dockerfile"
  - "backend/app/__init__.py"
  - "backend/app/main.py"
  - "backend/app/config.py"
  - "docker-compose.yml"
  - ".env.example"
---

# Lessons Learned: Task 1.1: Project Scaffolding and Docker Setup

## What Worked Well
- Using `pyproject.toml` with `setuptools` as the build backend cleanly separates core and dev dependencies via `[project.optional-dependencies]`, and `pip install -e ".[dev]"` installs everything in one shot.
- Copying `pyproject.toml` before the full source copy in the Dockerfile maximizes Docker layer caching: dependency installation is only re-run when the dependency manifest changes, not on every code edit.
- Declaring `asyncio_mode = "auto"` in `[tool.pytest.ini_options]` avoids per-test `@pytest.mark.asyncio` boilerplate for the async-heavy test suite that follows in later milestones.
- The `depends_on: condition: service_healthy` pattern in docker-compose ensures the backend never starts before PostgreSQL is actually ready to accept connections, eliminating a common race condition.
- Representing `CORS_ORIGINS` as a comma-separated string in the env file with a `cors_origins_list` property on `Settings` keeps the `.env` format simple while giving the app a proper `list[str]`.

## What Was Challenging
- The `pyproject.toml` was pinned to `requires-python = ">=3.11"`, but the Dockerfile base image is `python:3.12-slim`. This is intentional and consistent, but easy to accidentally misalign if the two files are edited independently.
- The frontend stub service mounts `./frontend/nginx.conf`, which does not exist at this stage. Running `docker-compose up frontend` without that file present will fail; the file must be created before the frontend service is usable.
- `passlib[bcrypt]` requires the `bcrypt` C extension, which in turn requires `gcc`. This system dependency must be explicitly installed in the Dockerfile (`apt-get install gcc libpq-dev`) or the pip install step fails silently on slim images.
- pydantic-settings v2 uses `model_config = SettingsConfigDict(...)` rather than the v1 `class Config` inner class. Any copy-pasted examples from pydantic v1 or older tutorials will fail with a deprecation error or silent misconfiguration.

## Key Technical Insights
1. **Layer order matters in Dockerfiles**: Copy only `pyproject.toml` first, run `pip install`, then copy the full source. This means rebuilds triggered by application code changes reuse the cached dependency layer and are dramatically faster.
2. **`pip install -e .` inside Docker requires the source to be present**: Because of the editable install (`-e`), the `COPY . .` step must follow `pip install`, and the volume mount in docker-compose (`./backend:/app`) will overlay the container's `/app` at runtime—ensuring hot-reload works without a rebuild.
3. **pydantic-settings `case_sensitive=False`** means `DATABASE_URL`, `database_url`, and `Database_Url` all resolve to the same field, which avoids subtle bugs when env vars come from different sources (shell exports vs `.env` file casing conventions).
4. **PostgreSQL healthcheck with `pg_isready -U <user> -d <db>`** is more reliable than a TCP port check because it verifies the specific database and role are ready, not just that the port is open.
5. **`asyncpg` requires the `postgresql+asyncpg://` URL scheme**: SQLAlchemy will silently fail or raise a confusing error if a plain `postgresql://` URL is used with an async engine. Document and default to the correct scheme in `.env.example`.

## Reusable Patterns
- **Dockerfile template for Python slim images with C-extension dependencies**: `apt-get install gcc libpq-dev` → `COPY pyproject.toml` → `pip install -e ".[dev]"` → `COPY . .`
- **pydantic-settings BaseSettings skeleton** (`config.py`) with `SettingsConfigDict`, typed fields, sensible defaults, and a computed `_list` property for comma-separated env vars.
- **docker-compose healthcheck + `condition: service_healthy`** pattern for any service that depends on a database being ready before starting.
- **`[project.optional-dependencies]` dev group** in `pyproject.toml` for keeping test/lint tools out of the production dependency set while still installable in one command.

## Files to Review for Similar Tasks
- `backend/pyproject.toml` — dependency version ranges and build system configuration; reference when adding new packages in future milestones.
- `backend/Dockerfile` — layer-caching pattern and required system packages; extend this file for additional C-extension dependencies.
- `backend/app/config.py` — pydantic-settings v2 pattern; extend with new env vars here rather than scattering config reads across the codebase.
- `docker-compose.yml` — service dependency and healthcheck wiring; reference when adding new services (e.g., Redis, Celery worker) in later milestones.

## Gotchas and Pitfalls
- **Missing `frontend/nginx.conf` breaks `docker-compose up`**: The frontend stub service will fail to start until that file exists. Either create a minimal placeholder early or exclude the frontend service from initial smoke tests with `docker-compose up -d postgres backend`.
- **Editable install + volume mount interaction**: The `pip install -e .` inside the container creates a `.egg-info` directory. When the host `./backend` is volume-mounted over `/app`, the `.egg-info` from the build layer is masked. Ensure the egg-info is also present on the host (run `pip install -e .` locally or copy it) or the editable install will break at runtime.
- **`JWT_SECRET` default is intentionally insecure**: `config.py` ships with `"change-me-in-production"` as the default. A linter or secrets scanner will flag this; it is expected and acceptable for local dev, but must be overridden in any deployed environment.
- **`asyncpg` version pinned to `<0.30`**: asyncpg 0.30+ may introduce breaking changes with SQLAlchemy 2.x async dialect. Re-test this constraint when upgrading either package.
- **pytest `testpaths = ["tests"]`**: The `tests/` directory does not exist yet at this milestone. pytest will exit with a warning (no tests collected) rather than an error, but the directory should be created before CI is wired up.
```
