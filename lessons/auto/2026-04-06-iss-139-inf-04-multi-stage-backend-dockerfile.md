---
date: "2026-04-06"
ticket_id: "ISS-139"
ticket_title: "INF-04: Multi-stage backend Dockerfile"
categories: ["testing", "api", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-139"
ticket_title: "INF-04: Multi-stage backend Dockerfile"
categories: ["docker", "infrastructure", "python", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/Dockerfile", "docker-compose.yml"]
---

# Lessons Learned: INF-04: Multi-stage backend Dockerfile

## What Worked Well
- Three-stage structure (builder → dev → prod) cleanly separated concerns: build tooling, development workflow, and lean production runtime
- Pinning both builder and prod stages to the same `python:3.12-slim` tag ensured ABI compatibility for compiled C-extension `.so` files (asyncpg, bcrypt)
- Using `pip install --no-cache-dir .` (non-editable, no `[dev]` extras) in the builder stage correctly populated site-packages for prod consumption
- Copying only `/usr/local/lib/python3.12/site-packages` and `/usr/local/bin/uvicorn` from builder kept the prod layer lean
- Installing `libpq5` (runtime shared library) rather than `libpq-dev` (build headers) in the prod stage reduced image size and attack surface
- Verification order — import C-extensions first, then assert pytest is absent — caught linkage issues before false confidence from the pytest check

## What Was Challenging
- Distinguishing `libpq5` (runtime) from `libpq-dev` (build headers) — both sound plausible for a prod stage but only `libpq5` is correct
- Ensuring `docker-compose.yml` explicitly targets the `dev` stage; without an explicit `target: dev`, Compose defaults to the last stage (`prod`), breaking local development (missing pytest, httpx, etc.)
- Editable installs (`pip install -e .`) are incompatible with multi-stage copying — the `.egg-link` points back to the source tree which is absent in the prod stage

## Key Technical Insights
1. **libpq split**: `libpq-dev` provides compile-time headers; `libpq5` provides the runtime shared library. Only `libpq5` belongs in the prod stage — asyncpg's `.so` files link against it at runtime.
2. **ABI compatibility**: Compiled C extensions (asyncpg, bcrypt) embed the Python ABI version and glibc linkage into their `.so` files. Mismatched base image tags between builder and prod stages will cause import failures (`cannot open shared object file`, `SIGILL`).
3. **Non-editable install for prod**: `pip install -e .` creates a `.egg-link` referencing the source tree path. When only site-packages are copied to the prod stage, that source tree is absent and the install is broken. Always use `pip install .` in the builder stage for prod artifact production.
4. **Verification sequence**: Always verify C-extension linkage (`import asyncpg; import bcrypt`) before asserting dev tools are absent. A broken linkage could produce a false-negative pytest absence test.
5. **docker-compose target**: Multi-stage Dockerfiles require an explicit `build.target` in `docker-compose.yml` for local dev — omitting it silently uses the prod stage, causing confusing test failures in development.

## Reusable Patterns
- **Three-stage Python Dockerfile template**: `builder` (gcc + libpq-dev + `pip install .`) → `dev` (FROM builder, add `pip install '.[dev]'`) → `prod` (FROM python:3.12-slim, libpq5, COPY site-packages and binaries from builder, COPY app source, CMD uvicorn)
- **Runtime-only system deps in prod**: Replace all `-dev` packages with their runtime equivalents (`libpq-dev` → `libpq5`, `libssl-dev` → `libssl3`, etc.)
- **Post-build smoke test**: `docker run --rm backend:prod python -c "import asyncpg; import bcrypt; from app.main import app"` as a mandatory step before any CI gate that checks for pytest absence
- **docker-compose dev target**: Always set `target: dev` in the `build:` block of `docker-compose.yml` when using a multi-stage Dockerfile with a dev stage

## Files to Review for Similar Tasks
- `backend/Dockerfile` — canonical three-stage Python multi-stage build example for this project
- `docker-compose.yml` — shows `build.target: dev` pattern for directing Compose to the dev stage
- `backend/pyproject.toml` — defines `[project.optional-dependencies]` split between core and `[dev]` extras; the separation is what makes prod-only installs possible

## Gotchas and Pitfalls
- **Never use `pip install -e .` in builder for prod artifacts** — editable installs break when the source tree is not present at the same path in the prod stage
- **`libpq-dev` in prod is wrong** — it installs unnecessary header files and increases image size; use `libpq5`
- **Forgetting `target: dev` in docker-compose.yml** — Compose will silently use the prod stage, stripping pytest and httpx from the dev environment and causing confusing import errors during local testing
- **Mismatched Python base image tags** — even a minor version difference (3.12.1 vs 3.12.3) can cause `.so` ABI mismatches; always pin to the same tag in both builder and prod `FROM` lines
- **Checking pytest absence before C-extension import** — a broken prod image may lack pytest simply because Python itself fails to initialize; always verify imports first
```
