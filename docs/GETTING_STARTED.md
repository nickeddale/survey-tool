# Getting Started

This guide walks you through setting up the Survey Tool locally and creating your first survey.

## Prerequisites

Ensure the following are installed on your machine:

| Tool              | Minimum Version | Install Guide                          |
| ----------------- | --------------- | -------------------------------------- |
| Python            | 3.12+           | https://www.python.org/downloads/      |
| Node.js           | 20+             | https://nodejs.org/                    |
| Docker            | 24+             | https://docs.docker.com/get-docker/    |
| Docker Compose    | 2.20+           | Included with Docker Desktop           |
| Git               | 2.x             | https://git-scm.com/downloads          |

## Quick Start

The fastest way to get everything running is with Docker Compose:

```bash
git clone <repository-url> survey_tool
cd survey_tool
docker-compose up
```

Once the containers are healthy:

- **Web UI**: http://localhost:3000
- **API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/docs

## Local Development Setup

For active development, run the backend and frontend outside Docker while keeping PostgreSQL in a container.

### Database

Start only the PostgreSQL container:

```bash
docker-compose up -d postgres
```

This exposes PostgreSQL on `localhost:5432` with the default credentials defined in `docker-compose.yml`.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

The API server starts at http://localhost:8000.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts at http://localhost:3000 and proxies API requests to the backend.

## Creating Your First Survey (Web UI)

1. **Register** -- Open http://localhost:3000/register and create an account.
2. **Log in** -- Sign in with your new credentials.
3. **Create a survey** -- Click **New Survey** on the dashboard. Enter a title (e.g., "Customer Satisfaction Survey") and an optional description.
4. **Add questions** -- Use the survey builder to add question groups and questions. Drag to reorder, choose question types (radio, text, checkbox, etc.), and configure answer options.
5. **Activate** -- When the survey is ready, click **Activate** to make it available for responses.
6. **Share** -- Copy the public survey link from the survey detail page and distribute it to respondents.

## Creating Your First Survey (API)

Below is a complete walkthrough using `curl`. All commands assume the API is running at `http://localhost:8000`.

### 1. Register a user

```bash
curl -s -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "SecurePass123!",
    "name": "Alice Johnson"
  }'
```

### 2. Log in to get a JWT

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "SecurePass123!"
  }' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo $TOKEN
```

### 3. Create an API key

```bash
API_KEY=$(curl -s -X POST http://localhost:8000/api/auth/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dev-key"
  }' | python -c "import sys,json; print(json.load(sys.stdin)['key'])")

echo $API_KEY
```

From here you can use either `Authorization: Bearer $TOKEN` or `X-API-Key: $API_KEY`. The examples below use the API key.

### 4. Create a survey

```bash
SURVEY_ID=$(curl -s -X POST http://localhost:8000/api/surveys \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Customer Satisfaction Survey",
    "description": "Help us improve our service by answering a few questions."
  }' | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo $SURVEY_ID
```

### 5. Add a question group

```bash
GROUP_ID=$(curl -s -X POST http://localhost:8000/api/surveys/$SURVEY_ID/groups \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "General Feedback",
    "description": "Tell us about your overall experience.",
    "order": 1
  }' | python -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo $GROUP_ID
```

### 6. Add questions

**Radio question -- Overall satisfaction:**

```bash
Q1_ID=$(curl -s -X POST http://localhost:8000/api/surveys/$SURVEY_ID/groups/$GROUP_ID/questions \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "How satisfied are you with our service?",
    "type": "radio",
    "required": true,
    "order": 1
  }' | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
```

**Text question -- Open feedback:**

```bash
Q2_ID=$(curl -s -X POST http://localhost:8000/api/surveys/$SURVEY_ID/groups/$GROUP_ID/questions \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "What could we do better?",
    "type": "text",
    "required": false,
    "order": 2
  }' | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
```

**Checkbox question -- Topics of interest:**

```bash
Q3_ID=$(curl -s -X POST http://localhost:8000/api/surveys/$SURVEY_ID/groups/$GROUP_ID/questions \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Which of our products do you use? (Select all that apply)",
    "type": "checkbox",
    "required": true,
    "order": 3
  }' | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
```

### 7. Add answer options

Add options to the radio question:

```bash
for option in '{"text":"Very Satisfied","value":"5","order":1}' \
              '{"text":"Satisfied","value":"4","order":2}' \
              '{"text":"Neutral","value":"3","order":3}' \
              '{"text":"Dissatisfied","value":"2","order":4}' \
              '{"text":"Very Dissatisfied","value":"1","order":5}'; do
  curl -s -X POST http://localhost:8000/api/surveys/$SURVEY_ID/questions/$Q1_ID/options \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$option" > /dev/null
done
```

Add options to the checkbox question:

```bash
for option in '{"text":"Web Platform","value":"web","order":1}' \
              '{"text":"Mobile App","value":"mobile","order":2}' \
              '{"text":"Desktop Client","value":"desktop","order":3}' \
              '{"text":"API","value":"api","order":4}'; do
  curl -s -X POST http://localhost:8000/api/surveys/$SURVEY_ID/questions/$Q3_ID/options \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$option" > /dev/null
done
```

### 8. Activate the survey

```bash
curl -s -X POST http://localhost:8000/api/surveys/$SURVEY_ID/activate \
  -H "X-API-Key: $API_KEY"
```

### 9. Submit a response

Responses can be submitted without authentication:

```bash
curl -s -X POST http://localhost:8000/api/surveys/$SURVEY_ID/responses \
  -H "Content-Type: application/json" \
  -d '{
    "answers": [
      {"question_id": "'$Q1_ID'", "value": "4"},
      {"question_id": "'$Q2_ID'", "value": "Faster shipping options would be great."},
      {"question_id": "'$Q3_ID'", "value": ["web", "mobile"]}
    ]
  }'
```

### 10. Export responses

```bash
curl -s http://localhost:8000/api/surveys/$SURVEY_ID/responses/export \
  -H "X-API-Key: $API_KEY" \
  -o responses.csv
```

## Project Structure

```
survey_tool/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI application entry point
│   │   ├── models/            # SQLAlchemy ORM models
│   │   ├── routers/           # API route handlers
│   │   ├── schemas/           # Pydantic request/response schemas
│   │   ├── services/          # Business logic layer
│   │   └── core/              # Config, security, database setup
│   ├── alembic/               # Database migrations
│   ├── tests/                 # Backend test suite
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/        # Reusable React components
│   │   ├── pages/             # Route-level page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── api/               # API client and types
│   │   └── App.tsx            # Root component and routing
│   ├── public/
│   ├── tests/                 # Frontend test suite
│   └── package.json
├── docker-compose.yml
└── docs/
```

## Running Tests

### Backend

```bash
cd backend
pytest -q
```

### Frontend

```bash
cd frontend
npm test
```

## Environment Variables

The application is configured via environment variables. Set these in a `.env` file at the project root or export them in your shell.

| Variable          | Description                                      | Default                                          |
| ----------------- | ------------------------------------------------ | ------------------------------------------------ |
| `DATABASE_URL`    | PostgreSQL connection string                     | `postgresql://survey:survey@localhost:5432/survey` |
| `JWT_SECRET`      | Secret key used to sign JWT tokens               | *(required in production)*                       |
| `JWT_ALGORITHM`   | Algorithm for JWT signing                        | `HS256`                                          |
| `JWT_EXPIRY_MINS` | Token expiration time in minutes                 | `60`                                             |
| `CORS_ORIGINS`    | Comma-separated list of allowed origins          | `http://localhost:3000`                          |
| `VITE_API_URL`    | API base URL used by the frontend                | `http://localhost:8000`                          |
| `LOG_LEVEL`       | Logging level (`DEBUG`, `INFO`, `WARNING`, etc.) | `INFO`                                           |
| `REDIS_URL`       | Redis connection string (for rate limiting/cache) | `redis://localhost:6379/0`                       |

## Next Steps

- [API Reference](./API_REFERENCE.md) -- Full endpoint documentation with request/response schemas.
- [Question Types](./QUESTION_TYPES.md) -- Supported question types and their configuration options.
- [Expression Language](./EXPRESSION_LANGUAGE.md) -- Conditional logic and skip patterns for surveys.
- [Database Schema](./DATABASE_SCHEMA.md) -- Entity-relationship diagram and table definitions.
