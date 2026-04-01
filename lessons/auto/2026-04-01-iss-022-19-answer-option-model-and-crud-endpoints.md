---
date: "2026-04-01"
ticket_id: "ISS-022"
ticket_title: "1.9: Answer Option Model and CRUD Endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-022"
ticket_title: "1.9: Answer Option Model and CRUD Endpoints"
categories: ["models", "crud", "migrations", "testing", "fastapi"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/answer_option.py
  - backend/app/schemas/answer_option.py
  - backend/app/services/answer_option_service.py
  - backend/app/api/answer_options.py
  - backend/app/models/__init__.py
  - backend/app/main.py
  - backend/alembic/versions/0008_create_answer_options_table.py
  - backend/tests/test_answer_options.py
---

# Lessons Learned: 1.9: Answer Option Model and CRUD Endpoints

## What Worked Well
- Following the established Question/QuestionGroup patterns made implementation predictable and consistent.
- Manually authoring the Alembic migration (rather than using `--autogenerate`) preserved `server_default=sa.text('now()')`, FK CASCADE, UniqueConstraint, and the composite index exactly as intended.
- Python-side `default=uuid.uuid4` for UUID PKs avoided any dependency on the `pgcrypto` extension.
- Adding the model import to both `alembic/env.py` and `app/models/__init__.py` prevented silent migration gaps.
- Catching `sqlalchemy.exc.IntegrityError` and mapping it to HTTP 409 correctly handled duplicate code conflicts, including race conditions that application-level pre-checks would miss.

## What Was Challenging
- Maintaining the full ownership verification chain (Survey→QuestionGroup→Question→AnswerOption) required careful query design to ensure 404 is returned at each level before proceeding.
- Auto-generating option codes (A1, A2...) required querying the current max sort_order or count to determine the next suffix, which needed to be correct under concurrent writes.
- The reorder endpoint required updating sort_order for all options in a single transaction to avoid partial states.

## Key Technical Insights
1. **Double import guard is mandatory**: The model must be imported in both `alembic/env.py` and `app/models/__init__.py`. Omitting `env.py` causes the table to be silently skipped during migration generation with no error raised.
2. **Never use `--autogenerate` for migrations**: Autogenerate silently drops `server_default=sa.text('now()')` on `created_at` and does not emit `onupdate` directives. Always manually author DDL.
3. **Python-side UUID default**: Use `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` — never `server_default=gen_random_uuid()`, which requires the `pgcrypto` extension.
4. **IntegrityError → 409**: Catching `sqlalchemy.exc.IntegrityError` at the endpoint/service level is the correct pattern for unique constraint violations; pre-checks alone are not race-condition safe.
5. **Test DATABASE_URL override is required**: The container default uses the psycopg2 scheme; always prefix pytest with `DATABASE_URL="postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker"`.
6. **Import smoke-test before alembic**: Always run `python -c "from app.models.answer_option import AnswerOption"` before any `alembic` command to catch import errors early.

## Reusable Patterns
- **UUID PK**: `Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)`
- **Timestamp**: `Column(DateTime, server_default=sa.text('now()'), nullable=False)` — manually authored in migration
- **Ownership chain verification**: Walk Survey→QuestionGroup→Question→Resource, returning 404 at the first missing link
- **Auto-code generation**: Query `COUNT(*)` or `MAX(sort_order)` within the question scope to derive the next A{n} code
- **Reorder endpoint**: Accept a list of `{id, sort_order}` pairs and bulk-update in a single transaction
- **Async test fixtures**: Always `scope="function"` for async SQLAlchemy engine/session fixtures to avoid event loop mismatch errors with asyncpg

## Files to Review for Similar Tasks
- `backend/app/models/question.py` — reference model pattern (UUID PK, FK, timestamps, relationships)
- `backend/app/schemas/question.py` — reference schema pattern (Create, Update, Response, ListResponse)
- `backend/app/services/question_service.py` — reference service pattern (ownership verification, CRUD helpers)
- `backend/app/api/questions.py` — reference router pattern (nested prefix, dependency injection)
- `backend/alembic/versions/0007_*.py` — reference migration pattern (manual DDL, FK CASCADE, UniqueConstraint, composite index)
- `backend/tests/test_questions.py` — reference test pattern (fixtures, ownership checks, conflict assertions)

## Gotchas and Pitfalls
- **Silent migration gap**: Forgetting to add the model import to `alembic/env.py` causes the table to be omitted from the migration with no warning — always verify both import locations.
- **psycopg2 vs asyncpg scheme**: The container `DATABASE_URL` defaults to `postgresql://` (psycopg2); async tests will silently fail or error unless overridden to `postgresql+asyncpg://`.
- **Session-scoped async fixtures**: Using `scope="session"` on async SQLAlchemy engine fixtures causes event loop mismatch errors under pytest-asyncio — always use `scope="function"`.
- **gen_random_uuid() dependency**: `server_default=gen_random_uuid()` requires `pgcrypto`; use Python-side `default=uuid.uuid4` instead.
- **Race conditions on duplicate codes**: Application-level uniqueness checks (SELECT before INSERT) are not safe under concurrent load — rely on the database UniqueConstraint and catch `IntegrityError`.
- **Partial reorder state**: Updating sort_order values one-by-one outside a transaction can leave options in an inconsistent order if an error occurs mid-way — always perform bulk reorder within a single transaction.
```
