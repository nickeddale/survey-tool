# Survey Tool -- Project Plan

## Project Overview

Survey Tool is a full-stack survey platform inspired by LimeSurvey. It provides two primary interfaces for creating, managing, and collecting survey responses:

1. **REST API** -- Programmatic survey creation, management, and response collection via API keys.
2. **Web UI** -- A React-based dashboard featuring a drag-and-drop survey builder, user authentication, and response viewing/export.

The project is scoped across **7 implementation phases**, progressing from backend scaffolding and auth through to advanced features like quotas, assessments, and webhooks.

---

## Tech Stack

### Backend

| Component | Technology |
|-----------|------------|
| Language | Python 3.12 |
| Framework | FastAPI |
| ORM | SQLAlchemy (async) |
| Migrations | Alembic |
| Database | PostgreSQL 16 |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Settings | pydantic-settings |
| Testing | pytest + pytest-asyncio + httpx |

### Frontend

| Component | Technology |
|-----------|------------|
| Framework | React 18 |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | TailwindCSS |
| UI Primitives | shadcn/ui |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| State Management | Zustand |
| HTTP Client | Axios |
| Routing | React Router |

### Infrastructure

| Component | Technology |
|-----------|------------|
| Containerization | Docker + docker-compose |
| Database | PostgreSQL 16 (via docker-compose) |
| Frontend Serving | nginx (proxying /api to backend) |

### Authentication Strategy

- **Web UI sessions**: Email/password login returning JWT access + refresh tokens (`Authorization: Bearer <jwt>`)
- **Programmatic access**: API keys with configurable scopes (`X-API-Key: <key>`)

Both mechanisms resolve to a user. All surveys are scoped to the authenticated user.

---

## Project Structure

```
survey_tool/
├── backend/
│   ├── alembic/
│   │   ├── versions/
│   │   └── env.py
│   ├── alembic.ini
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── config.py               # Settings (pydantic-settings)
│   │   ├── database.py             # SQLAlchemy engine, session, Base
│   │   ├── dependencies.py         # get_db, get_current_user, pagination
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── survey.py
│   │   │   ├── question_group.py
│   │   │   ├── question.py
│   │   │   ├── answer_option.py
│   │   │   ├── response.py
│   │   │   ├── response_answer.py
│   │   │   ├── participant.py
│   │   │   ├── quota.py
│   │   │   ├── assessment.py
│   │   │   ├── api_key.py
│   │   │   └── webhook.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── survey.py
│   │   │   ├── question_group.py
│   │   │   ├── question.py
│   │   │   ├── answer_option.py
│   │   │   ├── response.py
│   │   │   ├── participant.py
│   │   │   ├── quota.py
│   │   │   ├── assessment.py
│   │   │   └── webhook.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py             # Login, register, refresh, API keys
│   │   │   ├── users.py            # User profile management
│   │   │   ├── surveys.py
│   │   │   ├── question_groups.py
│   │   │   ├── questions.py
│   │   │   ├── answer_options.py
│   │   │   ├── responses.py
│   │   │   ├── participants.py
│   │   │   ├── quotas.py
│   │   │   ├── assessments.py
│   │   │   └── webhooks.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py     # Password hashing, JWT, API key validation
│   │   │   ├── survey_service.py
│   │   │   ├── question_service.py
│   │   │   ├── response_service.py
│   │   │   ├── expression_engine.py
│   │   │   ├── quota_service.py
│   │   │   ├── assessment_service.py
│   │   │   ├── export_service.py
│   │   │   └── webhook_service.py
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── pagination.py
│   │       └── errors.py
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_auth.py
│   │   ├── test_surveys.py
│   │   ├── test_questions.py
│   │   ├── test_responses.py
│   │   ├── test_logic.py
│   │   ├── test_quotas.py
│   │   ├── test_assessments.py
│   │   └── test_webhooks.py
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                    # API client layer
│   │   │   ├── client.ts           # Axios instance with auth interceptors
│   │   │   ├── surveys.ts
│   │   │   ├── questions.ts
│   │   │   ├── responses.ts
│   │   │   └── auth.ts
│   │   ├── store/                  # Zustand state management
│   │   │   ├── authStore.ts
│   │   │   └── surveyStore.ts
│   │   ├── hooks/                  # Custom React hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── useSurveys.ts
│   │   │   └── useQuestions.ts
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── DashboardPage.tsx       # Survey list + stats
│   │   │   ├── SurveyBuilderPage.tsx   # Drag-and-drop builder
│   │   │   ├── SurveyPreviewPage.tsx   # Live preview
│   │   │   ├── ResponsesPage.tsx       # View/export responses
│   │   │   ├── SettingsPage.tsx        # API keys, profile
│   │   │   └── NotFoundPage.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx        # Sidebar + topbar layout
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── ProtectedRoute.tsx
│   │   │   ├── survey-builder/
│   │   │   │   ├── SurveyBuilder.tsx       # Main builder container
│   │   │   │   ├── GroupPanel.tsx          # Question group with drag zone
│   │   │   │   ├── QuestionCard.tsx        # Draggable question card
│   │   │   │   ├── QuestionEditor.tsx      # Edit question properties
│   │   │   │   ├── AnswerOptionsEditor.tsx # Edit answer choices
│   │   │   │   ├── QuestionTypePicker.tsx  # Sidebar palette of types
│   │   │   │   ├── LogicEditor.tsx         # Condition/branching UI
│   │   │   │   └── QuestionPreview.tsx     # Inline preview
│   │   │   ├── responses/
│   │   │   │   ├── ResponseTable.tsx
│   │   │   │   ├── ResponseDetail.tsx
│   │   │   │   └── ExportDialog.tsx
│   │   │   └── common/
│   │   │       ├── Button.tsx
│   │   │       ├── Input.tsx
│   │   │       ├── Modal.tsx
│   │   │       ├── DataTable.tsx
│   │   │       └── StatusBadge.tsx
│   │   ├── types/                  # TypeScript types matching API schemas
│   │   │   ├── survey.ts
│   │   │   ├── question.ts
│   │   │   ├── response.ts
│   │   │   └── auth.ts
│   │   └── utils/
│   │       └── formatters.ts
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── Dockerfile
├── docs/
│   ├── PROJECT_PLAN.md
│   ├── API_REFERENCE.md
│   ├── DATABASE_SCHEMA.md
│   ├── QUESTION_TYPES.md
│   ├── EXPRESSION_LANGUAGE.md
│   └── GETTING_STARTED.md
├── docker-compose.yml              # PostgreSQL + backend + frontend
└── .env.example
```

---

## Implementation Phases

### Phase 1 -- Backend Foundation

**Goal**: Project scaffolding, database, user auth, core survey CRUD, and project documentation.

#### Documentation

- [x] `docs/PROJECT_PLAN.md` -- Full project plan (this document)
- [x] `docs/API_REFERENCE.md` -- All endpoints with request/response examples
- [x] `docs/DATABASE_SCHEMA.md` -- ER diagram description and all table definitions
- [x] `docs/QUESTION_TYPES.md` -- Each question type with settings and validation rules
- [x] `docs/EXPRESSION_LANGUAGE.md` -- Expression syntax, operators, functions, and examples
- [x] `docs/GETTING_STARTED.md` -- Setup, running locally, and creating a first survey via API

See: [API Reference](API_REFERENCE.md), [Database Schema](DATABASE_SCHEMA.md), [Question Types](QUESTION_TYPES.md), [Expression Language](EXPRESSION_LANGUAGE.md), [Getting Started](GETTING_STARTED.md)

#### Backend Setup

- [x] `pyproject.toml` -- FastAPI, SQLAlchemy[asyncio], asyncpg, Alembic, pydantic-settings, python-jose[cryptography], passlib[bcrypt], pytest, pytest-asyncio, httpx
- [x] `docker-compose.yml` -- PostgreSQL 16
- [x] `app/config.py` -- DATABASE_URL, JWT_SECRET, JWT_EXPIRY, etc.
- [x] `app/database.py` -- Async engine, async session factory, Base
- [x] `app/main.py` -- FastAPI app, CORS, error handlers, router includes

#### User Auth

- [x] Migration: `users`, `api_keys` tables
- [x] `models/user.py`, `models/api_key.py`
- [x] `services/auth_service.py` -- Register, login, hash password, create/verify JWT, create/verify API key
- [x] `api/auth.py` -- Register, login, refresh, me, API key CRUD
- [x] `dependencies.py` -- `get_current_user` (JWT or API key), `get_db`

#### Core Survey CRUD

- [x] Migration: `surveys`, `question_groups`, `questions`, `answer_options` tables
- [x] Models and Schemas for each entity
- [x] API routes: full CRUD for surveys, groups, questions, answer_options
- [x] Pagination utility (offset-based with total count)
- [x] Standardized error responses
- [x] Tests: auth flows and CRUD for all entities

---

### Phase 2 -- Frontend Foundation

**Goal**: React app with authentication, dashboard, and basic survey list.

- [x] Vite + React 18 + TypeScript project initialization
- [x] TailwindCSS + component library setup (shadcn/ui for primitives)
- [x] `api/client.ts` -- Axios instance with JWT interceptor and refresh logic
- [x] `store/authStore.ts` -- Zustand store for auth state
- [x] `pages/LoginPage.tsx`, `pages/RegisterPage.tsx`
- [x] `components/layout/AppShell.tsx` -- Sidebar navigation and top bar
- [x] `components/layout/ProtectedRoute.tsx` -- Redirect if not authenticated
- [x] `pages/DashboardPage.tsx` -- List surveys with status badges, create button
- [x] `pages/SettingsPage.tsx` -- API key management, profile editing
- [x] React Router setup with protected routes
- [x] Dockerfile for frontend (nginx serving built assets, proxying /api to backend)

---

### Phase 3 -- Survey Builder UI

**Goal**: Full drag-and-drop survey builder in the web UI.

- [x] `pages/SurveyBuilderPage.tsx` -- Main builder layout (3-panel: type palette | canvas | properties)
- [x] `components/survey-builder/QuestionTypePicker.tsx` -- Sidebar palette with all 27 question types, draggable
- [x] `components/survey-builder/SurveyBuilder.tsx` -- Main canvas using @dnd-kit/core and @dnd-kit/sortable
- [x] `components/survey-builder/GroupPanel.tsx` -- Collapsible group with drop zone for questions
- [x] `components/survey-builder/QuestionCard.tsx` -- Draggable card showing question preview
- [x] `components/survey-builder/QuestionEditor.tsx` -- Right panel: edit title, type, required, help text
- [x] `components/survey-builder/AnswerOptionsEditor.tsx` -- Add/remove/reorder answer choices
- [x] `components/survey-builder/QuestionPreview.tsx` -- Inline preview of how question renders
- [x] Auto-save with debounce (PATCH on change)
- [x] Survey settings panel (title, description, welcome/end messages)
- [x] Activate/close survey actions
- [x] `pages/SurveyPreviewPage.tsx` -- Read-only preview of full survey

---

### Phase 4 -- Question Types and Validation (Backend)

**Goal**: Type-specific validation, settings, and import/export.

- [x] `QuestionType` enum with all 27 types
- [x] Per-type validation in `question_service.py` (matrix requires subquestions, radio requires options, etc.)
- [x] Per-type `settings` JSONB schema validation
- [x] Subquestion support (parent_id relationship)
- [x] Question code auto-generation
- [x] Survey structure export (GET `/surveys/{id}/export` returns full nested JSON)
- [x] Survey import (POST `/surveys/import` accepts JSON definition)
- [x] Survey clone endpoint
- [x] Tests: each question type, validation edge cases

See: [Question Types](QUESTION_TYPES.md) for the full list of supported types, their settings, and validation rules.

---

### Phase 5 -- Survey Logic and Expressions

**Goal**: Conditional display, skip logic, and answer piping.

#### Backend

- [x] `services/expression_engine.py` -- Safe expression evaluator
- [x] Relevance field evaluation on questions and groups
- [x] `POST /logic/validate-expression` -- Validates expression syntax
- [x] `POST /logic/resolve-flow` -- Given answers, returns visible question IDs

#### Frontend

- [x] `components/survey-builder/LogicEditor.tsx` -- Visual condition builder ("Show this question IF [Q1] [equals] [value]" with AND/OR grouping and expression preview)
- [x] Tests: expression parsing, evaluation, complex branching

See: [Expression Language](EXPRESSION_LANGUAGE.md) for the full expression syntax, operators, and built-in functions.

---

### Phase 6 -- Response Collection and Viewing

**Goal**: Submit, validate, store, export, and view responses.

#### Backend

- [x] Migration: `responses`, `response_answers` tables
- [x] `services/response_service.py` -- Start, submit answers, complete, validate
- [x] Answer validation per question type
- [x] Relevance-aware validation (only validate visible questions)
- [x] `services/export_service.py` -- JSON and CSV export
- [x] Survey statistics endpoint

#### Frontend

- [x] `pages/ResponsesPage.tsx` -- Table of responses with filters
- [x] `components/responses/ResponseTable.tsx` -- Sortable, paginated
- [x] `components/responses/ResponseDetail.tsx` -- View individual response
- [x] `components/responses/ExportDialog.tsx` -- Choose format, columns, download
- [x] Dashboard stats (response count, completion rate, recent activity)
- [x] Tests: response submission, validation, export

See: [API Reference](API_REFERENCE.md) for response submission and export endpoint details.

---

### Phase 7 -- Access Control, Quotas, and Advanced Features

**Goal**: Participants, quotas, assessments, webhooks, and multi-language support.

- [x] Migration: `participants`, `quotas`, `assessments`, `webhooks` tables
- [x] Participant token system for survey access control
- [x] Rate limiting (slowapi)
- [x] Quota service: enforce limits on response submission
- [x] Assessment service: score responses, return messages
- [x] Webhook service: register, async delivery with retries, HMAC signing
- [x] Webhook events: `response.started`, `response.completed`, `survey.activated`, `survey.closed`, `quota.reached`
- [x] Multi-language: `translations` JSONB on surveys, groups, questions, and options
- [x] Survey versioning (version field + history)
- [x] OpenAPI spec polish (tags, descriptions, examples)
- [x] Tests: quotas, assessments, webhooks, multi-language

See: [Database Schema](DATABASE_SCHEMA.md) for the participants, quotas, assessments, and webhooks table definitions. See: [API Reference](API_REFERENCE.md) for all related endpoints.

---

## Verification Plan

### Per-Phase Verification

After completing each phase, run the following checks:

1. **Backend tests**: `pytest tests/ -q`
2. **Frontend dev server**: `npm run dev` and manually verify all pages
3. **Backend dev server**: `uvicorn app.main:app --reload`
4. **API verification**: Confirm endpoints via Swagger UI at `/docs`

### End-to-End Smoke Test (Phase 6+)

Once response collection is in place, run a full end-to-end verification:

1. Register a new user and log in via the web UI
2. Create a survey with question groups and questions using the drag-and-drop builder
3. Create the same survey programmatically via the API using an API key
4. Activate the survey and submit responses via the API
5. View responses in the web UI and export as CSV
6. Verify that conditional logic correctly hides and shows questions based on answers

---

## Related Documentation

- [API Reference](API_REFERENCE.md) -- All endpoints with request/response examples
- [Database Schema](DATABASE_SCHEMA.md) -- ER diagram description and all table definitions
- [Question Types](QUESTION_TYPES.md) -- Each question type with settings and validation rules
- [Expression Language](EXPRESSION_LANGUAGE.md) -- Expression syntax, operators, functions, and examples
- [Getting Started](GETTING_STARTED.md) -- Setup, running locally, and creating a first survey via API
