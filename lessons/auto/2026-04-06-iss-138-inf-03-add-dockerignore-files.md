---
date: "2026-04-06"
ticket_id: "ISS-138"
ticket_title: "INF-03: Add .dockerignore files"
categories: ["testing", "database", "ui", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-138"
ticket_title: "INF-03: Add .dockerignore files"
categories: ["infrastructure", "docker", "optimization"]
outcome: "success"
complexity: "low"
files_modified:
  - backend/.dockerignore
  - frontend/.dockerignore
---

# Lessons Learned: INF-03: Add .dockerignore files

## What Worked Well
- Exploring the directory structure first allowed comprehensive identification of all artifacts to exclude before writing any files
- Separating backend (Python) and frontend (Node) concerns made pattern selection straightforward — each ecosystem has well-known artifact directories
- The acceptance criteria were explicit and measurable, making verification simple

## What Was Challenging
- Nothing significantly challenging; this was a well-scoped infrastructure task with clear requirements
- Ensuring glob patterns like `**/__pycache__` covered nested directories (not just top-level) required attention

## Key Technical Insights
1. `.dockerignore` glob syntax differs slightly from `.gitignore` — patterns like `**/__pycache__` are needed to catch nested Python cache dirs, not just root-level ones
2. Excluding `Dockerfile` and `.dockerignore` itself from the build context is a good practice to avoid leaking build tooling into images
3. For Python projects, both `__pycache__/` and `*.pyc`/`*.pyo` patterns are needed — the directory pattern doesn't always catch loose compiled files
4. Frontend builds should exclude `dist/` and `dist-ssr/` to prevent stale build artifacts from entering the image context when doing multi-stage builds
5. Excluding `.env` and `.env.*` at the `.dockerignore` level is a defense-in-depth measure even if secrets are managed via runtime env injection

## Reusable Patterns
- **Backend Python `.dockerignore` baseline:** `__pycache__/`, `**/__pycache__/`, `*.pyc`, `*.pyo`, `.pytest_cache/`, `.mypy_cache/`, `tests/`, `.env`, `.env.*`, `venv/`, `.venv/`, `*.egg-info/`, `.git/`, `Dockerfile`, `.dockerignore`
- **Frontend Node `.dockerignore` baseline:** `node_modules/`, `dist/`, `dist-ssr/`, `.env`, `.env.*`, `.env.local`, `coverage/`, `.vite/`, `*.tsbuildinfo`, `.git/`, `Dockerfile`, `.dockerignore`, `*.log`
- Always exclude `.git/` — it can be surprisingly large and has no place in a runtime image

## Files to Review for Similar Tasks
- `backend/Dockerfile` — to understand build stages and confirm excluded files aren't needed mid-build
- `frontend/Dockerfile` — same rationale; multi-stage builds may COPY node_modules explicitly in earlier stages before exclusions matter
- `.gitignore` files — useful starting reference when building `.dockerignore`; the two overlap significantly but serve different purposes

## Gotchas and Pitfalls
- `.dockerignore` is evaluated relative to the build context root (the directory passed to `docker build`), not the Dockerfile location — patterns must account for this
- Excluding `node_modules/` in `.dockerignore` is correct for build context, but the Dockerfile must still run `npm install` inside the container; the exclusion just prevents the host's `node_modules` from being sent to the daemon
- `tests/` exclusion is Python-specific here; a frontend project may have test files co-located with source that should NOT be excluded if they affect the build
- Overly aggressive exclusions (e.g., excluding all `*.json`) can break builds if `package.json` or similar config files are accidentally matched
```
