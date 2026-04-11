---
date: "2026-04-11"
ticket_id: "ISS-223"
ticket_title: "Backend container runs as root — add non-root user"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-223"
ticket_title: "Backend container runs as root — add non-root user"
categories: ["docker", "security", "hardening", "containers"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/Dockerfile", "docker-compose.yml"]
---

# Lessons Learned: Backend container runs as root — add non-root user

## What Worked Well
- Creating `appuser` in the builder stage (as root) and deferring `chown /app` to the prod stage kept the build clean and avoided misleading ownership changes that volume mounts would override
- Adding `USER appuser` only after all root-required setup (apt-get, pip install) avoided permission issues during image build
- `security_opt: [no-new-privileges:true]` in docker-compose.yml is a one-line hardening win with no application changes required
- Smoke-testing with `docker run --rm --entrypoint id <image>` quickly confirms non-root enforcement before a full stack test

## What Was Challenging
- The `./backend:/app` volume mount in the dev stage overrides all image-layer `chown` changes at runtime — non-root enforcement in dev is entirely dependent on host filesystem permissions, not anything done inside the Dockerfile
- The distinction between build-time ownership (meaningful for prod) and runtime ownership (overridden by volume mounts in dev) is non-obvious and easy to get wrong
- pip editable install artifacts (`.egg-info`) are written during image build but masked by the volume mount — if the host directory lacks these artifacts, the app fails to import as non-root in dev

## Key Technical Insights
1. Never run `RUN chown -R appuser /app` in the builder stage if `/app` is populated by a volume mount at runtime — the chown is overridden and the builder-stage `/app` may not even exist yet depending on stage ordering
2. The correct pattern is: create user in builder (root) → pip install as root → `COPY . .` in prod → `RUN chown -R appuser:appuser /app` in prod → `USER appuser` → CMD
3. Dev-stage non-root only works reliably if the host `./backend` directory is readable/writable by the container UID; document this explicitly rather than assuming it will work
4. `no-new-privileges:true` prevents a non-root process from regaining privileges via setuid binaries — a cheap defense-in-depth measure that complements dropping to a non-root user
5. A smoke-test (`docker run --rm --entrypoint python <prod-image> -c 'from app.main import app; print("ok")'`) catches ownership/permission issues before the full stack test and is fast to run

## Reusable Patterns
- **Multi-stage non-root pattern**: `RUN adduser` in builder → all installs as root → `COPY` in prod → `RUN chown` in prod → `USER appuser` in prod
- **Dev non-root pattern**: Add `USER appuser` before `CMD` in dev stage; document that host dir permissions govern actual enforcement
- **Smoke-test commands**:
  - `docker run --rm --entrypoint id <image>` — confirm UID is not 0
  - `docker run --rm --entrypoint python <image> -c 'from app.main import app; print("ok")'` — confirm imports work as non-root
- **docker-compose hardening**: `security_opt: [no-new-privileges:true]` on any backend service; `read_only: true` where applicable

## Files to Review for Similar Tasks
- `backend/Dockerfile` — stage structure (builder → dev → prod), USER directive placement, chown steps
- `docker-compose.yml` — `security_opt`, `read_only`, volume mount configuration for backend service

## Gotchas and Pitfalls
- **Volume mount overrides chown**: `./backend:/app` at dev runtime completely replaces the image's `/app` layer, including any ownership set during build. Do not rely on `RUN chown` in any stage whose `/app` will be volume-mounted.
- **No chown in builder if /app doesn't exist yet**: The builder stage may not have `/app` populated at the point `adduser` runs — attempting `chown /app` there will fail or be a no-op.
- **Editable install artifacts masked by volume mount**: `.egg-info` written during `pip install -e .` in the image is hidden by the host mount. Ensure the host directory has these artifacts, or restructure the install to not rely on them at runtime.
- **Misleading image-layer ownership**: Running `docker inspect` or `docker exec ls -la` on a dev container shows volume-mount ownership (host UID), not image-layer ownership — don't mistake this for a successful chown.
- **`read_only: true` and writable paths**: If adding `read_only: true` to docker-compose, identify all paths the app writes to (logs, uploads, tmp) and mount them as explicit tmpfs or named volumes, or the app will crash on startup.
```
