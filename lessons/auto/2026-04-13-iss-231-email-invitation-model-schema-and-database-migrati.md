---
date: "2026-04-13"
ticket_id: "ISS-231"
ticket_title: "Email Invitation model, schema, and database migration"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-13"
ticket_id: "ISS-231"
ticket_title: "Email Invitation model, schema, and database migration"
categories: ["database", "sqlalchemy", "alembic", "pydantic", "email"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/models/email_invitation.py
  - backend/app/schemas/email_invitation.py
  - backend/app/models/__init__.py
  - backend/alembic/versions/0024_add_email_invitations.py
  - backend/alembic/env.py
---

# Lessons Learned: Email Invitation model, schema, and database migration

## What Worked Well
- Following the dual-registration pattern (both `models/__init__.py` and `alembic/env.py`) prevented silent migration failures from the start
- Manually authoring the migration rather than using autogenerate preserved all `server_default`, `onupdate`, and FK `ondelete` directives correctly
- Using Python-side `default=uuid.uuid4` for UUID PKs avoided pgcrypto dependency issues
- Composite index on `(survey_id, status)` was planned upfront, avoiding a follow-up migration

## What Was Challenging
- Alembic autogenerate silently corrupts timestamp defaults and FK ondelete rules — requires discipline to always write migrations by hand for tables with these features
- The `./backend:/app` volume mount masks Docker build artifacts; if `.egg-info` is absent from the host filesystem, alembic cannot import the new model inside the container
- Nullable FK with `SET NULL` on delete requires careful column definition (`nullable=True`) in both the ORM model and the migration to avoid constraint errors

## Key Technical Insights
1. **Never use `alembic revision --autogenerate`** for tables with timestamp server defaults, FK `ondelete` rules, or composite indexes — autogenerate silently drops or misrenders all three.
2. **Register new models in two places**: `app/models/__init__.py` (for app runtime) and `alembic/env.py` (for migration autogenerate baseline detection). Missing either causes silent failures.
3. **UUID PK default belongs in Python**: use `default=uuid.uuid4` on the column, not `server_default=gen_random_uuid()` — the pgcrypto extension is not guaranteed to be enabled.
4. **Import smoke-test before any alembic command**: `python -c "from app.models.email_invitation import EmailInvitation"` surfaces broken imports with clean tracebacks rather than cryptic alembic errors.
5. **Timestamp columns**: use `server_default=func.now()` in the ORM model and `server_default=sa.text('now()')` in the hand-authored migration — these are not equivalent and both must be set explicitly.

## Reusable Patterns
- New model checklist: (1) create model file, (2) import in `models/__init__.py`, (3) import in `alembic/env.py`, (4) run import smoke-test, (5) hand-author migration, (6) verify up/down.
- FK with `CASCADE`: `sa.ForeignKey("surveys.id", ondelete="CASCADE")` in migration + `cascade="all, delete-orphan"` on the ORM relationship.
- FK with `SET NULL`: column must be `nullable=True`; use `sa.ForeignKey("participants.id", ondelete="SET NULL")` in migration.
- Composite index declaration in hand-authored migration: `sa.Index("ix_email_invitations_survey_id_status", "survey_id", "status")`.
- Scope Docker test commands to `docker-compose up -d postgres` only — never unscoped `docker-compose up`, which will fail on the frontend nginx stub.

## Files to Review for Similar Tasks
- `backend/alembic/versions/0023_add_email_invitations.py` — immediate predecessor migration; confirms down_revision chain and naming convention
- `backend/app/models/participant.py` — confirms FK target table name and relationship `back_populates` convention
- `backend/app/models/survey.py` — confirms survey FK target and existing relationship declarations
- `backend/alembic/env.py` — shows where new model imports must be added for baseline detection
- `backend/app/models/__init__.py` — shows import registration pattern with `# noqa: F401`

## Gotchas and Pitfalls
- **Autogenerate corruption**: `alembic revision --autogenerate` will silently drop `server_default` and `onupdate` on timestamp columns and may misrender `ondelete` on FK constraints. Always hand-author migrations for any table with these features.
- **Dual import requirement**: adding the model import to only one of `models/__init__.py` or `alembic/env.py` causes silent failures — both are required.
- **Volume mount masking**: the `./backend:/app` bind mount in docker-compose hides the installed package from the Docker build; if `.egg-info` is missing on the host, the module will not be importable inside the container even if it imports fine locally.
- **pgcrypto unavailability**: `gen_random_uuid()` requires the pgcrypto extension, which is not enabled by default in the project's Postgres container. Always use Python-side `default=uuid.uuid4`.
- **Nullable FK and SET NULL**: forgetting `nullable=True` on the participant FK column will cause a DB constraint violation when the participant is deleted and Postgres attempts to set the FK to NULL.
```
