---
date: "2026-04-03"
ticket_id: "ISS-083"
ticket_title: "6.1: Response Model and Submission Endpoint"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-083"
ticket_title: "6.1: Response Model and Submission Endpoint"
categories: ["database", "api", "testing", "alembic", "pydantic"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/response.py
  - backend/app/models/response_answer.py
  - backend/app/schemas/response.py
  - backend/app/services/response_service.py
  - backend/app/api/responses.py
  - backend/app/main.py
  - backend/alembic/versions/0010_create_participants_responses_tables.py
  - backend/tests/test_responses.py
---

# Lessons Learned: 6.1: Response Model and Submission Endpoint

## What Worked Well
- Splitting Pydantic schemas into distinct input (ResponseCreate, AnswerInput) and output (ResponseResponse, ResponseAnswerResponse) schemas kept the API contract clean and prevented accidental field leakage.
- Using Python-side `default=uuid.uuid4` for UUID primary keys avoided reliance on the pgcrypto extension (`gen_random_uuid()`), which may not be enabled in all environments.
- Registering custom error classes (NotFoundError, UnprocessableError, ConflictError) via `app.add_exception_handler` kept error formatting consistent and avoided raw HTTPException usage in the service layer.
- Running an import smoke-test before every Alembic command caught broken imports early as clean tracebacks rather than cryptic Alembic errors.
- Manually authoring and inspecting the Alembic migration script ensured TIMESTAMPTZ columns retained their `server_default` directives, which autogenerate silently drops.

## What Was Challenging
- Alembic autogenerate silently drops `server_default` and `onupdate` directives on TIMESTAMPTZ columns, requiring manual review and patching of every generated migration script before applying it.
- The DATABASE_URL environment default uses the psycopg2 scheme, which is silently incompatible with the async engine used in tests. Overriding to `postgresql+asyncpg://` was required for every pytest invocation.
- Session-scoped async SQLAlchemy fixtures cause event loop mismatch errors with asyncpg; all async fixtures must use `scope='function'`.
- New models (Response, ResponseAnswer) had to be imported in both `alembic/env.py` and `app/models/__init__.py` — missing either caused silent migration gaps with no error raised.

## Key Technical Insights
1. Alembic autogenerate cannot be trusted for tables with TIMESTAMPTZ server defaults — always manually author and inspect migration scripts for these columns.
2. The unique constraint on `(response_id, question_id)` in response_answers raises an `IntegrityError` at the DB level; the service layer must catch this and raise `ConflictError` (HTTP 409) so the global exception handler formats it correctly.
3. IP address capture should prefer the `X-Forwarded-For` header over the raw client host to handle reverse proxy deployments correctly.
4. Pydantic field omission from an output schema does not guarantee the field is absent from serialized responses without an explicit test assertion confirming its exclusion.
5. The `gen_random_uuid()` server_default requires the pgcrypto extension, which is not guaranteed to be enabled; Python-side `default=uuid.uuid4` is universally safe.

## Reusable Patterns
- Import smoke-test before alembic: `python -c 'from app.models.response import Response; from app.models.response_answer import ResponseAnswer'`
- Always override DATABASE_URL for pytest: `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest`
- Custom error pattern: define `NotFoundError`, `UnprocessableError`, `ConflictError` with a `to_response()` method; register each via `app.add_exception_handler` in `main.py`.
- UUID primary keys: `id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — never use `server_default=text("gen_random_uuid()")`.
- Public endpoints (no auth): omit `get_current_user` from the FastAPI dependency list; extract IP and metadata directly from the `Request` object.
- Alembic model registration: import new models in both `alembic/env.py` (before `target_metadata`) and `app/models/__init__.py` before running `alembic revision` or `alembic upgrade`.

## Files to Review for Similar Tasks
- `backend/app/models/response.py` — reference for TIMESTAMPTZ column patterns, ENUM type usage, and Python-side UUID defaults.
- `backend/app/models/response_answer.py` — reference for UniqueConstraint in `__table_args__` on composite columns.
- `backend/app/services/response_service.py` — reference for IntegrityError catch-and-convert pattern and custom error class usage in service layer.
- `backend/app/api/responses.py` — reference for public (no-auth) endpoint pattern with Request object for IP/metadata extraction.
- `backend/alembic/versions/0010_create_participants_responses_tables.py` — reference for manually authored TIMESTAMPTZ migrations with server defaults and ENUM types.
- `backend/app/utils/errors.py` — canonical source for custom exception classes and `to_response()` pattern.
- `backend/tests/test_responses.py` — reference for async fixture scoping, DATABASE_URL override, and response schema field exclusion assertions.

## Gotchas and Pitfalls
- **Silent migration gaps:** Omitting a model import from `alembic/env.py` causes the table to be absent from the generated migration with no error or warning.
- **Autogenerate drops server_default:** Alembic autogenerate silently removes `server_default` from TIMESTAMPTZ columns — always patch the generated script manually.
- **pgcrypto not guaranteed:** Never use `server_default=text("gen_random_uuid()")` — use `default=uuid.uuid4` in Python instead.
- **Async engine scheme mismatch:** The default DATABASE_URL uses psycopg2; the async engine silently fails to connect unless the scheme is `postgresql+asyncpg://`.
- **Event loop mismatch:** Session-scoped async SQLAlchemy fixtures cause asyncpg event loop errors — always use `scope='function'`.
- **Raw IntegrityError propagation:** The unique constraint on `(response_id, question_id)` must be caught in the service layer and converted to `ConflictError`; letting the raw DB exception reach the endpoint produces an unformatted 500 response.
- **Survey-not-active rejection:** Raise `UnprocessableError` (not raw `HTTPException`) so the global exception handler produces a correctly structured `{detail: {code, message}}` response body.
```
