# Contributing to Survey Tool

Thanks for your interest in contributing! This guide will help you get started.

## Development Environment Setup

The easiest way to get everything running is with Docker Compose:

```bash
git clone https://github.com/your-username/survey_tool.git
cd survey_tool
docker compose up
```

This starts PostgreSQL (port 5432), the backend API (port 8000), and the frontend dev server (port 3000).

## Backend

- **Stack**: FastAPI + Python 3.12 + SQLAlchemy (async) + PostgreSQL 16
- **Run tests** (in Docker, since Python 3.12 is required):
  ```bash
  docker compose up -d postgres
  docker run --rm --network host \
    -e DATABASE_URL="postgresql+asyncpg://survey:survey@localhost:5432/survey_test" \
    -e JWT_SECRET=testsecret \
    -e CORS_ORIGINS="http://localhost:3000" \
    -v $(pwd)/backend:/app \
    survey_tool-backend:latest \
    python -m pytest tests/ -q
  ```
- **Seed dev data**: `docker compose exec backend python -m app.cli seed`

## Frontend

- **Stack**: React + TypeScript + Tailwind CSS + Zustand
- **Install dependencies**: `cd frontend && npm install`
- **Run tests**: `npm run test:run` (Vitest)
- **Lint**: `npm run lint` (ESLint)
- **Build**: `npm run build`

## Code Style

- **Backend**: snake_case for files, functions, and variables. Test names follow `test_<action>_<condition>_<expected>`.
- **Frontend**: PascalCase for components and types, camelCase for functions and variables. Prettier is configured (no semicolons, single quotes, trailing commas).

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Make your changes, including tests where applicable.
3. Ensure all tests pass and linting is clean.
4. Open a pull request with a clear description of the changes.

## Architecture

See the [docs/](docs/) directory for detailed documentation on architecture, API reference, question types, expression language, and database schema.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating.
