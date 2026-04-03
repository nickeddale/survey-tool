---
date: "2026-04-03"
ticket_id: "ISS-075"
ticket_title: "5.5: Variable Resolution System"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-075"
ticket_title: "5.5: Variable Resolution System"
categories: ["expressions", "models", "variable-resolution", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/expressions/resolver.py
  - backend/app/services/expressions/__init__.py
  - backend/app/models/response.py
  - backend/app/models/response_answer.py
  - backend/app/models/participant.py
  - backend/app/models/__init__.py
  - backend/tests/test_expressions_resolver.py
---

# Lessons Learned: 5.5: Variable Resolution System

## What Worked Well
- Flat dict context format mapped cleanly to the existing evaluator.py interface — no changes to downstream evaluation logic were required
- Mock/stub objects for Response, ResponseAnswer, and Participant were sufficient for unit tests; no database fixtures needed for resolver logic
- Separating type conversion logic into a dedicated helper kept build_expression_context readable and individually testable
- Treating unanswered/null answers as Python None aligned naturally with the evaluator's null-handling behavior

## What Was Challenging
- Determining the correct suffix conventions ({Q1_SQ001}, {Q1_other}, {Q1_comment}) required careful reading of the question model and existing AST node definitions before writing any code
- Ensuring RESPONDENT.attribute keys were flattened correctly from JSONB without colliding with question code keys required explicit namespace separation
- Verifying the end-to-end path (resolver output → evaluate()) required understanding the exact context dict format the evaluator expected, which was not immediately obvious from the evaluator signature alone

## Key Technical Insights
1. The expression context dict uses flat string keys — dotted names like RESPONDENT.language must be stored as the literal string key `"RESPONDENT.language"`, not as nested dicts; this matches how the AST evaluator resolves dotted identifiers.
2. Multi-select/checkbox answer values stored as JSONB arrays should be converted directly to Python lists so the evaluator's `in` operator and `count()` function work without additional adaptation.
3. Missing participant should produce zero RESPONDENT keys (not an error or empty nested dict) — the evaluator will naturally return null for any unresolved RESPONDENT reference.
4. Question type drives type conversion at resolution time, not at evaluation time — converting to int/float/bool/list/None in the resolver keeps the evaluator generic and type-agnostic.
5. UUID primary keys must use Python-side `default=uuid.uuid4`, not `server_default=gen_random_uuid()`, because the pgcrypto extension is not guaranteed to be enabled.

## Reusable Patterns
- **Import smoke-test before alembic**: `python -c "from app.models.response import Response; from app.models.response_answer import ResponseAnswer; from app.models.participant import Participant"` — surfaces broken imports with clean tracebacks instead of cryptic alembic errors.
- **Dual model registration**: Import all new models in both `alembic/env.py` AND `app/models/__init__.py` before any alembic command; missing either causes silent migration failures.
- **Manual migration authoring**: Manually write Alembic migrations for tables with timestamp columns — autogenerate silently drops `server_default` for `created_at`/`updated_at` and omits `onupdate` entirely.
- **Function-scoped async fixtures**: All async SQLAlchemy test fixtures must use `scope="function"` — session scope causes asyncpg event loop mismatch errors under pytest-asyncio.
- **asyncpg DATABASE_URL override**: Tests must explicitly set `DATABASE_URL` to `postgresql+asyncpg://` scheme; the environment default may use psycopg2 scheme, causing silent or confusing failures.
- **asyncio_mode = 'auto'**: Set in `[tool.pytest.ini_options]` in pyproject.toml to avoid per-test `@pytest.mark.asyncio` decoration.
- **No passlib**: Use `bcrypt.hashpw`/`bcrypt.checkpw`/`bcrypt.gensalt` directly — passlib 1.7.x is incompatible with bcrypt >= 4.x.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/resolver.py` — reference implementation for flat context dict construction and type conversion dispatch
- `backend/app/services/expressions/evaluator.py` — authoritative source for expected context dict format and how dotted identifiers are resolved
- `backend/app/services/expressions/__init__.py` — public API surface; shows how to export new resolver functions alongside existing evaluator exports
- `backend/tests/test_expressions_resolver.py` — reference test patterns for mock-based resolver unit tests and end-to-end evaluate() integration tests
- `backend/app/models/response.py`, `response_answer.py`, `participant.py` — reference SQLAlchemy model patterns for JSONB columns, UUID PKs, and timestamp columns

## Gotchas and Pitfalls
- Do not store RESPONDENT attributes as a nested dict in the context — the evaluator resolves `RESPONDENT.language` as a flat key lookup, not recursive dict traversal.
- Do not rely on alembic autogenerate for new models with timestamp columns — `server_default=func.now()` and `onupdate` will be silently dropped; always manually inspect and author the migration.
- asyncpg is pinned to `<0.30` — do not upgrade without explicit re-testing of the full async engine connection path.
- Never run `docker-compose up -d` unscoped — the frontend stub will fail on missing nginx.conf; always scope to `postgres` or `backend` only.
- The volume mount `./backend:/app` masks container .egg-info artifacts — if alembic or pytest cannot resolve `app.*` imports, verify editable install artifacts exist on the host.
```
