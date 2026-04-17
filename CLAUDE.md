# Survey Tool

Full-stack survey platform (FastAPI + React) inspired by LimeSurvey. REST API and web UI for creating, managing, and collecting survey responses.

## Quick Reference

```bash
# Backend tests (run in Docker — requires Python 3.12)
docker compose up -d postgres
docker run --rm --network host \
  -e DATABASE_URL="postgresql+asyncpg://survey:survey@localhost:5432/survey_test" \
  -e JWT_SECRET=testsecret \
  -e CORS_ORIGINS="http://localhost:3000" \
  -v $(pwd)/backend:/app \
  survey_tool-backend:latest \
  python -m pytest tests/ -q

# Seed dev data (creates users, surveys, responses)
docker compose exec backend python -m app.cli seed
# Dev logins: creator@example.com / password123, creator2@example.com / password123

# Frontend
cd frontend && npm run build        # TypeScript check + production build
cd frontend && npm run test:run     # Vitest single run
cd frontend && npm run lint         # ESLint

# Docker (full stack)
docker compose up                   # postgres:5432, backend:8000, frontend:3000
docker compose build backend        # Rebuild backend image
```

## Project Structure

```
backend/
  app/
    api/           # FastAPI routers (one per resource)
    models/        # SQLAlchemy ORM models
    schemas/       # Pydantic request/response schemas
    services/      # Business logic layer
      expressions/ # Lexer, parser, evaluator for survey logic
      validators/  # Per-question-type validation modules
    utils/         # Pagination, error helpers
    config.py      # pydantic-settings (DATABASE_URL, JWT_SECRET, etc.)
    dependencies.py # get_current_user, get_db, pagination
    limiter.py     # slowapi rate limiter instance
  alembic/versions/ # Numbered migrations (0001_, 0002_, ...)
  tests/           # pytest-asyncio tests

frontend/
  src/
    pages/         # Route-level components
    components/    # Domain-organized (survey-builder/, responses/, etc.)
    services/      # API client layer (Axios-based)
    store/         # Zustand stores (authStore, builderStore)
    types/         # TypeScript type definitions
    contexts/      # React contexts (AuthContext)
    hooks/         # Custom React hooks
    mocks/         # MSW handlers for testing
    test/          # Vitest setup
```

## Architecture

- **Backend pattern**: Router -> Service -> Model. All endpoints under `/api/v1/`.
- **Frontend pattern**: Page -> Components -> Services/Stores. Zustand for state, Axios for HTTP.
- **Auth**: JWT bearer tokens + API key (`X-API-Key` header). Both resolve to a user.
- **Database**: PostgreSQL 16 via async SQLAlchemy (asyncpg driver). URL must use `postgresql+asyncpg://` scheme.
- **Expression engine**: Custom lexer/parser in `services/expressions/` for survey conditional logic.

## Conventions

### Backend
- snake_case everywhere (files, functions, variables)
- Test naming: `test_<action>_<condition>_<expected>` (e.g., `test_register_success_returns_201`)
- Alembic migrations: `{NNNN}_{description}.py` with simple numeric revision IDs
- Custom ENUM types: survey_status, quota_action, assessment_scope, response_status (created in migration 0001)
- pytest-asyncio with `asyncio_mode = "auto"` — no need for `@pytest.mark.asyncio`

### Frontend
- PascalCase for components/types, camelCase for functions/variables
- Prettier: no semicolons, single quotes, trailing commas (es5), 100 char width
- Path alias: `@/*` maps to `./src/*`
- Tests colocated in `__tests__/` directories, using Vitest + React Testing Library + MSW

## Testing

### Backend
- Tests use function-scoped fixtures that create/drop all tables per test
- `conftest.py` creates ENUM types, overrides `get_db` dependency, resets rate limiter
- Default test DB URL falls back to `test-postgres:5432/survey_tool` if `DATABASE_URL` not set
- Key fixtures: `engine`, `session` (AsyncSession), `client` (httpx.AsyncClient)

### Frontend
- Vitest with jsdom environment and globals enabled
- MSW server in `src/test/setup.ts`: listen/resetHandlers/close lifecycle
- Mock handlers in `src/mocks/handlers.ts`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes | — | PostgreSQL connection string (asyncpg) |
| JWT_SECRET | Yes | — | Secret for JWT signing |
| JWT_EXPIRY_MINS | No | 60 | Access token TTL |
| CORS_ORIGINS | No | — | Comma-separated allowed origins |
| LOG_LEVEL | No | INFO | Logging level |

## Known Issues

- Backend requires Python 3.12+ (not available on host — use Docker)
- Port 5432 may conflict with other local Postgres instances; use `docker compose` with care
