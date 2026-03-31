# Milestone 1: Backend Foundation

## Overview

This milestone establishes the entire backend infrastructure for the survey tool. It delivers a fully functional FastAPI application with PostgreSQL persistence, user authentication via JWT and API keys, and complete CRUD operations for the core survey structure (surveys, question groups, questions, and answer options).

By the end of this milestone, a developer can register a user, authenticate via JWT or API key, create and manage surveys with nested question groups, questions, and answer options through the REST API, and transition surveys through their lifecycle states (draft, active, closed, archived). The API follows consistent patterns for pagination, error handling, and authorization.

This phase lays the groundwork that every subsequent milestone depends on. The database schema, auth middleware, and CRUD patterns established here will be reused and extended throughout the project.

## Prerequisites

- None -- this is the first milestone.

## Success Criteria

- Docker Compose brings up PostgreSQL 16, and the FastAPI backend connects successfully.
- Alembic migrations create all Phase 1 tables (`users`, `api_keys`, `surveys`, `question_groups`, `questions`, `answer_options`).
- User registration, login, token refresh, and API key CRUD all work end-to-end.
- Full CRUD for surveys, question groups, questions, and answer options passes automated tests.
- Survey status transitions (draft -> active -> closed -> archived) enforce valid state machine rules.
- All list endpoints return paginated results with `items`, `total`, `page`, `per_page`.
- All error responses follow the standardized `{"detail": {"code": "...", "message": "..."}}` format.
- `pytest -q` passes with coverage of auth flows and all CRUD operations.

## Architecture Notes

- **Async throughout**: SQLAlchemy async sessions with asyncpg driver. All route handlers are `async def`.
- **Dependency injection**: FastAPI's `Depends()` for `get_db` (async session), `get_current_user` (JWT or API key resolution), and pagination parameters.
- **Service layer**: Business logic lives in `app/services/`, not in route handlers. Routes handle HTTP concerns (status codes, headers); services handle domain logic.
- **UUID primary keys**: All tables use `UUID` primary keys with `gen_random_uuid()` defaults.
- **JSONB columns**: `settings`, `scopes`, `validation` columns use JSONB for flexible schema-per-type storage.
- **Cascade deletes**: Survey -> groups -> questions -> answer_options all cascade on delete.

## Tasks

### Task 1.1: Project Scaffolding and Docker Setup
**Estimated Complexity:** Medium
**Dependencies:** None

**Description:**
Set up the backend project structure with FastAPI, Docker, and docker-compose. Create the `backend/` directory with `pyproject.toml` declaring all dependencies (FastAPI, SQLAlchemy[asyncio], asyncpg, Alembic, pydantic-settings, python-jose[cryptography], passlib[bcrypt], pytest, pytest-asyncio, httpx, uvicorn). Create a `Dockerfile` for the backend service and a `docker-compose.yml` at the project root that defines three services: `postgres` (PostgreSQL 16), `backend` (FastAPI), and eventually `frontend` (stub for now).

Create the `.env.example` file with all required environment variables: `DATABASE_URL`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRY_MINS`, `CORS_ORIGINS`, `LOG_LEVEL`. Create `app/config.py` using pydantic-settings to load these values with sensible defaults for local development.

**Acceptance Criteria:**
- [ ] `docker-compose up -d postgres` starts PostgreSQL 16 and it accepts connections on port 5432
- [ ] `pip install -e ".[dev]"` installs all dependencies without errors
- [ ] `app/config.py` loads settings from environment variables with defaults
- [ ] `.env.example` documents all required configuration
- [ ] Backend Dockerfile builds successfully

**Technical Notes:**
- Use `pydantic_settings.BaseSettings` with `env_file = ".env"` support
- PostgreSQL connection string format: `postgresql+asyncpg://survey:survey@localhost:5432/survey`
- Pin major dependency versions in `pyproject.toml` for reproducibility

---

### Task 1.2: Database Engine and Alembic Setup
**Estimated Complexity:** Medium
**Dependencies:** Task 1.1

**Description:**
Create `app/database.py` with the async SQLAlchemy engine, async session factory, and declarative `Base`. Configure `sessionmaker` with `class_=AsyncSession` and `expire_on_commit=False`. Initialize Alembic with `alembic init alembic` and configure `alembic/env.py` to use the async engine and import all models for autogeneration support.

Set up `alembic.ini` to read the database URL from the environment (via `app/config.py`). Create the initial migration that sets up PostgreSQL extensions (e.g., `uuid-ossp` or use `gen_random_uuid()` from pgcrypto) and ENUM types (`survey_status`, `response_status`, `quota_action`, `assessment_scope`).

**Acceptance Criteria:**
- [ ] `app/database.py` exports `engine`, `async_session`, `Base`, and a `get_db` async generator
- [ ] `alembic revision --autogenerate` detects model changes
- [ ] `alembic upgrade head` runs without errors against a fresh database
- [ ] ENUM types `survey_status` (draft, active, closed, archived) and `response_status` (incomplete, complete, disqualified) are created

**Technical Notes:**
- In `alembic/env.py`, set `target_metadata = Base.metadata` and import all models
- Use `run_async` pattern in env.py for async migrations
- File: `backend/app/database.py`, `backend/alembic/env.py`, `backend/alembic.ini`

---

### Task 1.3: User Model and Registration Endpoint
**Estimated Complexity:** Medium
**Dependencies:** Task 1.2

**Description:**
Create the `users` table model in `app/models/user.py` with columns: `id` (UUID PK), `email` (VARCHAR 255, UNIQUE, NOT NULL), `password_hash` (VARCHAR 255, NOT NULL), `name` (VARCHAR 255, NOT NULL), `is_active` (BOOLEAN, default true), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ). Create corresponding Pydantic schemas in `app/schemas/user.py`: `UserCreate` (email, password, name), `UserResponse` (id, email, name, is_active, created_at, updated_at), and `UserUpdate` (optional name, password).

Implement the registration endpoint `POST /api/v1/auth/register` in `app/api/auth.py`. The endpoint should hash the password using bcrypt via passlib, create the user record, and return a 201 response with the user profile (excluding password_hash). Return 409 CONFLICT if the email is already registered.

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/register` creates a user and returns 201 with `UserResponse`
- [ ] Passwords are hashed with bcrypt (never stored in plaintext)
- [ ] Duplicate email returns 409 with `{"detail": {"code": "CONFLICT", "message": "A user with this email already exists"}}`
- [ ] Email validation rejects invalid formats
- [ ] Password minimum length is enforced (8 characters)

**Technical Notes:**
- Use `passlib.context.CryptContext(schemes=["bcrypt"])` in `app/services/auth_service.py`
- Pydantic `EmailStr` for email validation
- Generate migration: `alembic revision --autogenerate -m "create users table"`
- Files: `app/models/user.py`, `app/schemas/user.py`, `app/api/auth.py`, `app/services/auth_service.py`

---

### Task 1.4: JWT Authentication (Login, Refresh, Middleware)
**Estimated Complexity:** Large
**Dependencies:** Task 1.3

**Description:**
Implement JWT-based authentication with access and refresh tokens. The `POST /api/v1/auth/login` endpoint accepts email/password, verifies credentials, and returns `access_token`, `refresh_token`, `token_type`, and `expires_in`. The `POST /api/v1/auth/refresh` endpoint accepts a refresh token and returns a new token pair. The `POST /api/v1/auth/logout` endpoint invalidates the refresh token.

Create the `get_current_user` dependency in `app/dependencies.py` that extracts the JWT from the `Authorization: Bearer` header, decodes it using python-jose, and resolves the user from the database. This dependency will be used on all protected endpoints. Also implement `GET /api/v1/auth/me` to return the current user's profile and `PATCH /api/v1/auth/me` to update name/password.

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/login` returns JWT access + refresh tokens on valid credentials
- [ ] `POST /api/v1/auth/login` returns 401 on invalid email or password
- [ ] `POST /api/v1/auth/refresh` returns a new token pair given a valid refresh token
- [ ] `POST /api/v1/auth/refresh` returns 401 on expired or invalid refresh token
- [ ] `GET /api/v1/auth/me` returns the authenticated user's profile
- [ ] `PATCH /api/v1/auth/me` updates name and/or password
- [ ] Protected endpoints return 401 when no token is provided
- [ ] Access tokens expire after `JWT_EXPIRY_MINS` (default 60)

**Technical Notes:**
- Use `python-jose` with `HS256` algorithm; sign with `JWT_SECRET` from config
- Access token payload: `{"sub": user_id, "type": "access", "exp": ...}`
- Refresh token payload: `{"sub": user_id, "type": "refresh", "exp": ...}` with longer expiry (7 days)
- Files: `app/services/auth_service.py`, `app/api/auth.py`, `app/dependencies.py`

---

### Task 1.5: API Key Model and CRUD Endpoints
**Estimated Complexity:** Medium
**Dependencies:** Task 1.4

**Description:**
Create the `api_keys` table model in `app/models/api_key.py` with columns: `id` (UUID PK), `user_id` (UUID FK -> users), `name` (VARCHAR 255), `key_hash` (VARCHAR 255), `key_prefix` (VARCHAR 8), `scopes` (JSONB, default []), `is_active` (BOOLEAN, default true), `last_used_at` (TIMESTAMPTZ nullable), `expires_at` (TIMESTAMPTZ nullable), `created_at` (TIMESTAMPTZ).

Implement API key generation: create a random key with prefix `svt_`, store the SHA-256 hash, and return the full key only once in the creation response. Implement CRUD endpoints: `POST /api/v1/auth/keys` (create), `GET /api/v1/auth/keys` (list), `DELETE /api/v1/auth/keys/{id}` (revoke). Extend the `get_current_user` dependency to also check for `X-API-Key` header and resolve the user via key hash lookup.

**Acceptance Criteria:**
- [ ] `POST /api/v1/auth/keys` creates a key and returns the full key value (only time it's visible)
- [ ] `GET /api/v1/auth/keys` lists keys with `key_prefix` but never the full key
- [ ] `DELETE /api/v1/auth/keys/{id}` revokes a key (returns 204)
- [ ] `X-API-Key` header authenticates requests and resolves to the owning user
- [ ] Expired keys are rejected (checked against `expires_at`)
- [ ] Inactive keys are rejected (checked against `is_active`)
- [ ] `last_used_at` is updated on each authenticated request
- [ ] Scopes are stored and can be checked (enforcement deferred to later tasks)

**Technical Notes:**
- Generate keys: `svt_` + 40 random hex characters
- Hash with `hashlib.sha256(key.encode()).hexdigest()`
- Store first 8 characters as `key_prefix` for identification in listings
- Valid scopes: `surveys:read`, `surveys:write`, `responses:read`, `responses:write`, `participants:read`, `participants:write`, `webhooks:read`, `webhooks:write`
- Files: `app/models/api_key.py`, `app/schemas/api_key.py` (implied within `app/schemas/user.py` or separate), `app/api/auth.py`

---

### Task 1.6: Survey Model and CRUD Endpoints
**Estimated Complexity:** Large
**Dependencies:** Task 1.4

**Description:**
Create the `surveys` table model in `app/models/survey.py` with all columns from the schema: `id`, `user_id`, `title`, `description`, `status` (survey_status ENUM, default 'draft'), `welcome_message`, `end_message`, `default_language`, `settings` (JSONB), `created_at`, `updated_at`. Create Pydantic schemas for create, update, and response.

Implement full CRUD endpoints under `app/api/surveys.py`: `POST /api/v1/surveys` (create), `GET /api/v1/surveys` (list with pagination, status filter, search), `GET /api/v1/surveys/{id}` (detail, with optional `?include=full` for nested structure), `PATCH /api/v1/surveys/{id}` (update), `DELETE /api/v1/surveys/{id}`. All endpoints are scoped to the authenticated user -- users can only see and modify their own surveys.

**Acceptance Criteria:**
- [ ] `POST /api/v1/surveys` creates a survey in `draft` status (only `title` required)
- [ ] `GET /api/v1/surveys` returns paginated list with `items`, `total`, `page`, `per_page`
- [ ] `GET /api/v1/surveys?status=active` filters by status
- [ ] `GET /api/v1/surveys?search=customer` searches by title
- [ ] `GET /api/v1/surveys/{id}` returns full survey detail
- [ ] `GET /api/v1/surveys/{id}?include=full` returns nested groups, questions, and options
- [ ] `PATCH /api/v1/surveys/{id}` updates only provided fields
- [ ] `DELETE /api/v1/surveys/{id}` removes the survey and returns 204
- [ ] Users cannot access other users' surveys (returns 404)

**Technical Notes:**
- Use `app/services/survey_service.py` for business logic
- Pagination via `app/utils/pagination.py` helper (offset-based: `skip = (page - 1) * per_page`)
- The `?include=full` query triggers eager loading of groups -> questions -> answer_options
- Index: `idx_surveys_user_id_status` on `(user_id, status)`
- Files: `app/models/survey.py`, `app/schemas/survey.py`, `app/api/surveys.py`, `app/services/survey_service.py`

---

### Task 1.7: Question Group Model and CRUD Endpoints
**Estimated Complexity:** Medium
**Dependencies:** Task 1.6

**Description:**
Create the `question_groups` table model in `app/models/question_group.py` with columns: `id` (UUID PK), `survey_id` (UUID FK -> surveys, CASCADE), `title` (VARCHAR 255), `description` (TEXT nullable), `sort_order` (INTEGER, default 0), `relevance` (TEXT nullable), `created_at` (TIMESTAMPTZ). Create Pydantic schemas for create, update, and response.

Implement CRUD endpoints nested under surveys: `POST /api/v1/surveys/{survey_id}/groups`, `GET /api/v1/surveys/{survey_id}/groups`, `GET /api/v1/surveys/{survey_id}/groups/{id}` (includes questions), `PATCH /api/v1/surveys/{survey_id}/groups/{id}`, `DELETE /api/v1/surveys/{survey_id}/groups/{id}`, and `PATCH /api/v1/surveys/{survey_id}/groups/reorder` for bulk sort_order updates.

**Acceptance Criteria:**
- [ ] `POST /surveys/{survey_id}/groups` creates a group with auto-assigned `sort_order` if not provided
- [ ] `GET /surveys/{survey_id}/groups` returns groups ordered by `sort_order`
- [ ] `GET /surveys/{survey_id}/groups/{id}` includes nested `questions` array
- [ ] `PATCH /surveys/{survey_id}/groups/{id}` updates title, description, relevance
- [ ] `DELETE /surveys/{survey_id}/groups/{id}` cascades to delete all questions in the group
- [ ] `PATCH /surveys/{survey_id}/groups/reorder` accepts an `order` array and updates sort_order values
- [ ] Creating a group on a non-existent survey returns 404
- [ ] Groups are scoped to the survey owner (verified via survey ownership)

**Technical Notes:**
- Auto-assign `sort_order`: query max sort_order for the survey and add 1
- Reorder endpoint accepts: `{"order": [{"id": "uuid", "sort_order": 1}, ...]}`
- Index: `idx_question_groups_survey_id_sort` on `(survey_id, sort_order)`
- Files: `app/models/question_group.py`, `app/schemas/question_group.py`, `app/api/question_groups.py`

---

### Task 1.8: Question Model and CRUD Endpoints
**Estimated Complexity:** Large
**Dependencies:** Task 1.7

**Description:**
Create the `questions` table model in `app/models/question.py` with all columns: `id`, `group_id` (FK -> question_groups, CASCADE), `parent_id` (FK -> questions, CASCADE, nullable for subquestions), `question_type` (VARCHAR 50), `code` (VARCHAR 50), `title` (TEXT), `description` (TEXT nullable), `is_required` (BOOLEAN, default false), `sort_order` (INTEGER, default 0), `relevance` (TEXT nullable), `validation` (JSONB, default {}), `settings` (JSONB, default {}), `created_at` (TIMESTAMPTZ).

Implement CRUD endpoints: `POST /api/v1/surveys/{survey_id}/groups/{group_id}/questions`, `GET /api/v1/surveys/{survey_id}/groups/{group_id}/questions`, `GET /api/v1/surveys/{survey_id}/questions/{id}` (detail with answer_options and subquestions), `PATCH /api/v1/surveys/{survey_id}/questions/{id}`, `DELETE /api/v1/surveys/{survey_id}/questions/{id}`, and `PATCH /api/v1/surveys/{survey_id}/groups/{group_id}/questions/reorder`.

**Acceptance Criteria:**
- [ ] `POST .../questions` creates a question with auto-generated `code` (e.g., "Q1", "Q2") if not provided
- [ ] `question_type` is validated against the 18 supported types
- [ ] `GET .../questions` returns questions ordered by `sort_order`
- [ ] `GET .../questions/{id}` includes `answer_options` and `subquestions` arrays
- [ ] `PATCH .../questions/{id}` updates any field including `settings` and `validation` JSONB
- [ ] `DELETE .../questions/{id}` cascades to delete answer_options and subquestions
- [ ] Question codes are unique within a survey
- [ ] Reorder endpoint updates `sort_order` and optionally moves questions between groups

**Technical Notes:**
- Auto-generate codes: query count of questions in survey, assign `Q{n+1}`
- Subquestion codes: `{parent_code}_SQ{n}` (e.g., Q1_SQ001)
- Validate `question_type` against enum: short_text, long_text, huge_text, radio, dropdown, checkbox, ranking, image_picker, matrix, matrix_dropdown, matrix_dynamic, numeric, rating, boolean, date, file_upload, expression, html
- Index: `idx_questions_group_id_sort` on `(group_id, sort_order)`
- Files: `app/models/question.py`, `app/schemas/question.py`, `app/api/questions.py`, `app/services/question_service.py`

---

### Task 1.9: Answer Option Model and CRUD Endpoints
**Estimated Complexity:** Medium
**Dependencies:** Task 1.8

**Description:**
Create the `answer_options` table model in `app/models/answer_option.py` with columns: `id` (UUID PK), `question_id` (UUID FK -> questions, CASCADE), `code` (VARCHAR 50), `title` (TEXT), `sort_order` (INTEGER, default 0), `assessment_value` (INTEGER, default 0). Create Pydantic schemas for create, update, and response.

Implement CRUD endpoints: `POST /api/v1/surveys/{survey_id}/questions/{question_id}/options`, `GET /api/v1/surveys/{survey_id}/questions/{question_id}/options`, `PATCH /api/v1/surveys/{survey_id}/questions/{question_id}/options/{id}`, `DELETE /api/v1/surveys/{survey_id}/questions/{question_id}/options/{id}`, and `PATCH /api/v1/surveys/{survey_id}/questions/{question_id}/options/reorder`.

**Acceptance Criteria:**
- [ ] `POST .../options` creates an answer option with auto-generated `code` (e.g., "A1", "A2") if not provided
- [ ] `GET .../options` returns options ordered by `sort_order`
- [ ] `PATCH .../options/{id}` updates title, code, sort_order, assessment_value
- [ ] `DELETE .../options/{id}` removes the option
- [ ] Reorder endpoint updates `sort_order` for all options of a question
- [ ] Option codes are unique within a question
- [ ] `assessment_value` defaults to 0 and accepts integer values

**Technical Notes:**
- Auto-generate codes: `A{n}` where n is the option position
- Index: `idx_answer_options_question_id_sort` on `(question_id, sort_order)`
- Files: `app/models/answer_option.py`, `app/schemas/answer_option.py`, `app/api/answer_options.py`

---

### Task 1.10: Survey Status Transitions
**Estimated Complexity:** Medium
**Dependencies:** Task 1.6, Task 1.8

**Description:**
Implement survey lifecycle management endpoints: `POST /api/v1/surveys/{id}/activate` (draft -> active), `POST /api/v1/surveys/{id}/close` (active -> closed), and `POST /api/v1/surveys/{id}/archive` (closed -> archived). Each transition enforces valid state machine rules and preconditions.

Activation requires the survey to be in `draft` status and to have at least one question. Closing requires `active` status. Archiving requires `closed` status. Invalid transitions return 422 UNPROCESSABLE with a descriptive message. Modifying a closed or archived survey's content (questions, groups, options) should be prevented at the service layer.

**Acceptance Criteria:**
- [ ] `POST /surveys/{id}/activate` transitions draft -> active and returns the updated survey
- [ ] Activation fails with 422 if survey has no questions
- [ ] Activation fails with 422 if survey is not in draft status
- [ ] `POST /surveys/{id}/close` transitions active -> closed
- [ ] `POST /surveys/{id}/archive` transitions closed -> archived (implementing the full lifecycle)
- [ ] `PATCH /surveys/{id}` returns 422 for closed or archived surveys
- [ ] Creating/modifying questions on a non-draft survey is prevented

**Technical Notes:**
- State machine: draft -> active -> closed -> archived (one-way transitions)
- Add a `check_survey_editable` helper in `survey_service.py` that raises 422 if status != draft
- Call this check in question, group, and option create/update/delete operations
- Files: `app/api/surveys.py`, `app/services/survey_service.py`

---

### Task 1.11: Survey Clone and Export/Import
**Estimated Complexity:** Medium
**Dependencies:** Task 1.9

**Description:**
Implement `POST /api/v1/surveys/{id}/clone` to deep-copy a survey including all groups, questions, answer options, and subquestions. The clone gets a new ID, is owned by the authenticated user, and starts in `draft` status. The title defaults to the original with " (Copy)" appended unless overridden in the request body.

Implement `GET /api/v1/surveys/{id}/export` to return the full survey definition as a portable JSON structure (no internal IDs, uses codes for references). Implement `POST /api/v1/surveys/import` to create a new survey from such a JSON definition, generating new UUIDs for all entities.

**Acceptance Criteria:**
- [ ] `POST /surveys/{id}/clone` creates a complete copy with new UUIDs and `draft` status
- [ ] Cloned survey has title "{original} (Copy)" by default, or a custom title if provided
- [ ] All groups, questions, answer_options, and subquestions are cloned with correct parent references
- [ ] `GET /surveys/{id}/export` returns a self-contained JSON with nested groups/questions/options
- [ ] `POST /surveys/import` creates a new survey from the exported JSON format
- [ ] Import validates the JSON structure and returns 400 on invalid format
- [ ] Export JSON uses question `code` values (not UUIDs) for portability

**Technical Notes:**
- Clone must remap all foreign keys (group_id, parent_id, question_id) to new UUIDs
- Export format matches the structure shown in API_REFERENCE.md under `GET /surveys/{id}/export`
- Import should validate required fields: title, and at least the groups/questions structure
- Files: `app/api/surveys.py`, `app/services/survey_service.py`, `app/services/export_service.py`

---

### Task 1.12: API Error Handling, Pagination, and Middleware
**Estimated Complexity:** Medium
**Dependencies:** Task 1.6

**Description:**
Implement the standardized error handling framework in `app/utils/errors.py`. Create custom exception classes (e.g., `NotFoundError`, `ConflictError`, `ValidationError`, `UnprocessableError`) that map to the standard error response format: `{"detail": {"code": "NOT_FOUND", "message": "..."}}`. Register global exception handlers in `app/main.py` that catch these exceptions and return appropriate HTTP status codes.

Implement the pagination utility in `app/utils/pagination.py` that provides a reusable pattern for all list endpoints. Create CORS middleware configuration in `app/main.py` reading allowed origins from settings. Add request logging middleware.

**Acceptance Criteria:**
- [ ] All 4xx and 5xx responses follow the `{"detail": {"code": "...", "message": "..."}}` format
- [ ] Error codes match: VALIDATION_ERROR (400), UNAUTHORIZED (401), FORBIDDEN (403), NOT_FOUND (404), CONFLICT (409), UNPROCESSABLE (422), RATE_LIMITED (429), INTERNAL_ERROR (500)
- [ ] Pagination helper accepts `page` and `per_page` query params, returns `{"items": [], "total": N, "page": N, "per_page": N}`
- [ ] `per_page` is capped at 100
- [ ] CORS allows origins from `CORS_ORIGINS` config
- [ ] Unhandled exceptions return 500 with `INTERNAL_ERROR` (no stack traces in production)

**Technical Notes:**
- Use `@app.exception_handler(CustomException)` pattern
- Pagination dependency: `def pagination_params(page: int = 1, per_page: int = 20) -> PaginationParams`
- CORS: `CORSMiddleware` with configurable origins from `settings.CORS_ORIGINS`
- Files: `app/utils/errors.py`, `app/utils/pagination.py`, `app/main.py`, `app/dependencies.py`

---

### Task 1.13: Backend Test Infrastructure and Initial Test Suite
**Estimated Complexity:** Large
**Dependencies:** Task 1.12

**Description:**
Set up the testing infrastructure in `backend/tests/`. Create `conftest.py` with fixtures for: an isolated test database (using a separate PostgreSQL database or transaction rollback), an async test client (httpx.AsyncClient), an authenticated user fixture (pre-registered user with JWT), and a factory for creating test surveys, groups, questions, and options.

Write initial test suites: `test_auth.py` covering registration, login, refresh, logout, me, and API key CRUD; `test_surveys.py` covering survey CRUD, status transitions, clone, export, and import; `test_questions.py` covering question and answer option CRUD within surveys.

**Acceptance Criteria:**
- [ ] `pytest -q` runs all tests with database isolation (no test pollution)
- [ ] `test_auth.py`: registration, login, invalid login, token refresh, profile update, API key lifecycle
- [ ] `test_surveys.py`: create, list (with pagination/filters), get, update, delete, activate, close, clone, export/import
- [ ] `test_questions.py`: group CRUD, question CRUD, answer option CRUD, reorder operations
- [ ] Tests verify correct HTTP status codes and response body shapes
- [ ] Test fixtures provide factories for creating surveys with nested structures
- [ ] Tests run against a real PostgreSQL instance (not SQLite)

**Technical Notes:**
- Use `pytest-asyncio` with `asyncio_mode = "auto"` in `pyproject.toml`
- Test client: `httpx.AsyncClient(app=app, base_url="http://test")`
- Database isolation: create/drop test database per session, or use transaction rollback per test
- Helper fixture: `async def authenticated_client(client, test_user)` that returns client with auth headers
- Files: `tests/conftest.py`, `tests/test_auth.py`, `tests/test_surveys.py`, `tests/test_questions.py`
