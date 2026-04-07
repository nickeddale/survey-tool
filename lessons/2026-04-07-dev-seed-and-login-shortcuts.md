# Lessons Learned: Dev Seed Script and Login Shortcuts

**Date:** 2026-04-07
**Related Ticket:** N/A
**Commit:** ce12049

## Problem Summary
Manual testing required registering a new user, creating surveys from scratch, adding questions, activating, and submitting responses every time. No seed data, CLI commands, or dev shortcuts existed.

## Approach Taken
Three-part solution:
1. **Backend seed script** (`python -m app.cli seed`) — direct ORM inserts with deterministic UUIDs for idempotency, safety-guarded to development/test environments only
2. **Frontend dev login panel** — one-click login buttons gated on `import.meta.env.DEV` (tree-shaken from production builds)
3. **Docker compose config** — added `ENVIRONMENT=development` to enable the seed safety guard

Key decisions:
- Used direct ORM inserts rather than HTTP API calls to avoid rate limiting, cookie complexity, and auth bootstrapping
- Used `uuid.uuid5()` with a fixed namespace for deterministic IDs so re-runs are idempotent without needing upsert logic
- Seeded surveys in all four lifecycle states (draft, active, closed, archived) to cover every UI state

## Key Lessons
- `lazy="raise"` on all ORM relationships means the seed script must only set foreign key columns directly — never traverse relationships on loaded objects
- `survey_status` is a PostgreSQL ENUM type declared with `create_type=False` in the model, meaning it must already exist from migrations before the seed script runs
- `import.meta.env.DEV` is statically replaced by Vite at build time, making it a reliable zero-cost gate for dev-only UI — no custom env vars needed
- The `ResponseAnswer` unique constraint on `(response_id, question_id)` means answers must be created inside the same existence-check branch as their parent response to avoid partial re-inserts on re-runs

## Potential Improvements
- Add a `reset` subcommand to drop and re-seed data for a clean slate
- Consider a `--verbose` flag to control output detail
- Could add participant tokens to the seed data for testing token-gated survey flows
- A Makefile or npm script alias (`npm run seed`) would reduce the docker compose exec typing
