# Survey Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An open-source survey platform inspired by LimeSurvey, built with FastAPI and React. Create, manage, and collect survey responses through a modern web UI or REST API.

## Features

- **Survey Builder** with drag-and-drop question ordering
- **Conditional Logic** and skip patterns via a custom expression language
- **Multiple Question Types** — text, number, radio, checkbox, dropdown, boolean, date, ranking, matrix, and more
- **Authentication** — JWT bearer tokens and API keys
- **Response Collection** with CSV export
- **Participant Management** with token-based access and CSV import
- **Quotas** to cap responses based on conditions
- **Assessments** with scoring rules
- **Webhooks** for real-time event notifications
- **Responsive UI** built with Tailwind CSS

## Tech Stack

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| Backend  | FastAPI, SQLAlchemy, PostgreSQL 16, Alembic     |
| Frontend | React 18, TypeScript, Tailwind CSS, Zustand     |
| Infra    | Docker, Docker Compose, Nginx, GitHub Actions   |

## Quick Start

```bash
git clone https://github.com/nickeddale/survey-tool.git
cd survey-tool
docker compose up
```

Once the containers are healthy:

- **Web UI**: http://localhost:3000
- **API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/docs

## Documentation

- [Getting Started](docs/GETTING_STARTED.md) — Setup guide and first survey walkthrough
- [API Reference](docs/API_REFERENCE.md) — Full endpoint documentation
- [Question Types](docs/QUESTION_TYPES.md) — Supported types and configuration
- [Expression Language](docs/EXPRESSION_LANGUAGE.md) — Conditional logic syntax
- [Database Schema](docs/DATABASE_SCHEMA.md) — ERD and table definitions

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding conventions, and PR guidelines.

```bash
# Run backend tests (in Docker)
docker compose up -d postgres
docker compose run --rm backend python -m pytest tests/ -q

# Run frontend tests
cd frontend && npm run test:run

# Lint frontend
cd frontend && npm run lint
```

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
