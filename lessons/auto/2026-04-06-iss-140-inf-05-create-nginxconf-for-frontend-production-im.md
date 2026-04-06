---
date: "2026-04-06"
ticket_id: "ISS-140"
ticket_title: "INF-05: Create nginx.conf for frontend production image"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-140"
ticket_title: "INF-05: Create nginx.conf for frontend production image"
categories: ["nginx", "docker", "frontend", "infrastructure", "spa"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/nginx.conf"]
---

# Lessons Learned: INF-05: Create nginx.conf for frontend production image

## What Worked Well
- Reading the Dockerfile before writing nginx.conf confirmed the exact COPY destination path and stage name, preventing path mismatches
- Reading docker-compose.yml first to confirm the backend service name before hardcoding it in proxy_pass avoided silent runtime failures
- Scoping the build test to `docker compose build frontend` only kept the feedback loop clean and avoided misleading failures from unrelated services (e.g. backend requiring postgres)

## What Was Challenging
- The broken build gave no clear error until the missing file was identified — a missing COPY source fails at build time, but a misconfigured proxy_pass fails silently at runtime, making it easy to conflate the two failure modes
- Verifying whether docker-compose.yml specifies `target: prod` for the frontend service required an explicit check before running the build, since omitting it could silently build the wrong stage

## Key Technical Insights
1. The `proxy_pass` backend hostname in nginx.conf must exactly match the Docker Compose service name — a mismatch builds successfully but fails at runtime with upstream resolution errors that are hard to trace
2. If docker-compose.yml does not specify `target: prod` for the frontend service, Docker builds the final stage by default — always confirm the final Dockerfile stage is the nginx/prod stage, not the builder stage
3. SPA routing requires a `try_files $uri $uri/ /index.html` fallback so that deep routes (e.g. `/surveys/123`) return `index.html` rather than a 404 from nginx
4. Cache headers should be applied selectively: long-lived caching for hashed static assets (JS/CSS bundles), short or no caching for `index.html` itself to ensure SPA updates are picked up

## Reusable Patterns
- Always read the Dockerfile and docker-compose.yml before writing nginx.conf — confirm COPY source paths, stage names, and service names before creating the file
- Use `try_files $uri $uri/ /index.html` as the standard SPA routing fallback for any nginx-served React/Vue/Svelte app
- Proxy `/api/` to the backend using the Compose service name and internal port (not localhost or an external port)
- Enable gzip compression for text assets and set `Cache-Control: no-cache` on `index.html` while using long-TTL headers for hashed bundles
- Scope infrastructure build tests to the single service under test (`docker compose build frontend`) — never `docker compose up` the full stack to validate a single service fix

## Files to Review for Similar Tasks
- `frontend/Dockerfile` — confirm prod stage name, COPY instruction path, and that the nginx stage is the final stage
- `docker-compose.yml` — confirm frontend service `target:` setting and backend service name/port
- `frontend/nginx.conf` — the artifact produced by this ticket; use as a reference template for other SPA frontends

## Gotchas and Pitfalls
- **Silent proxy failure**: a wrong backend hostname in `proxy_pass` passes the build but breaks API calls at runtime — always cross-reference with the Compose service name
- **Wrong build stage**: without `target: prod` in docker-compose.yml, `docker compose build frontend` may build the node builder stage, not the nginx stage — confirm before running
- **index.html caching**: if `index.html` is cached aggressively, users will not pick up new frontend deployments — always serve it with `Cache-Control: no-cache` or equivalent
- **Do not use `docker compose up`** to test this fix — other services (postgres, backend) may be unavailable and produce misleading errors that obscure whether nginx.conf was the actual problem
```
