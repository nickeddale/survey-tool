---
date: "2026-04-06"
ticket_id: "ISS-141"
ticket_title: "INF-06: Externalize DB credentials from docker-compose.yml"
categories: ["database", "feature", "security", "documentation", "config", "testing"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-141"
ticket_title: "INF-06: Externalize DB credentials from docker-compose.yml"
categories: ["infrastructure", "docker", "security", "configuration"]
outcome: "success"
complexity: "low"
files_modified: ["docker-compose.yml", ".env.example"]
---

# Lessons Learned: INF-06: Externalize DB credentials from docker-compose.yml

## What Worked Well
- The `${VAR:-default}` syntax in Docker Compose is clean and self-documenting — the default value is visible inline, making the compose file readable without a separate reference
- Updating `.env.example` alongside the compose changes ensures developers immediately know which variables are available to override
- Running `docker compose config` as a validation step is fast and catches interpolation errors without needing to spin up containers

## What Was Challenging
- The healthcheck command required the same variable substitution treatment as the environment block — easy to overlook since it's a separate section of the service definition
- DATABASE_URL in the backend service concatenates multiple credential variables, so all three (user, password, db) must be consistent across both the postgres service and backend service definitions

## Key Technical Insights
1. Docker Compose interpolates `${VAR:-default}` at parse time, meaning the default is used when the variable is unset or empty — this satisfies the AC of working without a `.env` file out of the box
2. `docker compose config` renders the final interpolated configuration to stdout, making it the definitive validation tool for variable substitution correctness
3. Credentials appear in multiple places in a typical compose file: the database service `environment` block, healthcheck commands that reference the db/user, and derived connection strings in dependent services — all locations must be updated together

## Reusable Patterns
- Pattern for externalizing any compose credential: `${VAR_NAME:-safe_default}` inline, add the var to `.env.example` with a comment, validate with `docker compose config`
- For healthcheck commands using `pg_isready`, the pattern is: `pg_isready -U ${POSTGRES_USER:-survey} -d ${POSTGRES_DB:-survey}`
- For asyncpg DATABASE_URL: `postgresql+asyncpg://${POSTGRES_USER:-survey}:${POSTGRES_PASSWORD:-survey}@postgres:5432/${POSTGRES_DB:-survey}`

## Files to Review for Similar Tasks
- `docker-compose.yml` — reference for the established variable naming conventions and default values used in this project
- `.env.example` — reference for which environment variables are exposed and their expected format

## Gotchas and Pitfalls
- Forgetting to update the healthcheck section when updating the environment block — the healthcheck runs as a shell command and hardcoded values there will not respect the externalized variables
- Using `${VAR:?error}` (error if unset) instead of `${VAR:-default}` would break the out-of-the-box requirement — always use `:-default` when defaults are desired
- If a `.env` file exists with different values than the defaults, `docker compose config` output will reflect those values, not the defaults — run without a `.env` to verify true default behavior
```
