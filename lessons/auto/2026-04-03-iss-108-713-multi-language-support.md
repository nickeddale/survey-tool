---
date: "2026-04-03"
ticket_id: "ISS-108"
ticket_title: "7.13: Multi-Language Support"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-108"
ticket_title: "7.13: Multi-Language Support"
categories: ["database-migrations", "multi-language", "jsonb", "translation", "frontend-components", "api-design"]
outcome: "success"
complexity: "high"
files_modified:
  - backend/alembic/versions/0015_add_translations_jsonb_columns.py
  - backend/app/models/survey.py
  - backend/app/models/question_group.py
  - backend/app/models/question.py
  - backend/app/models/answer_option.py
  - backend/app/services/translation_service.py
  - backend/app/schemas/survey.py
  - backend/app/schemas/question_group.py
  - backend/app/schemas/question.py
  - backend/app/schemas/answer_option.py
  - backend/app/api/surveys.py
  - backend/app/api/question_groups.py
  - backend/app/api/questions.py
  - backend/app/api/answer_options.py
  - backend/app/services/export_service.py
  - frontend/src/components/survey-builder/TranslationEditor.tsx
  - frontend/src/components/survey-builder/BuilderToolbar.tsx
  - frontend/src/services/surveyService.ts
  - frontend/src/store/builderStore.ts
  - frontend/src/types/survey.ts
---

# Lessons Learned: 7.13: Multi-Language Support

## What Worked Well
- Structuring the translations JSONB column as `{"fr": {"title": "...", "description": "..."}, "es": {...}}` gave a clean, self-contained per-entity format that was easy to query, overlay, and export without joins or extra tables.
- Writing the Alembic migration manually (rather than using `--autogenerate`) ensured the JSONB type and server_default were authored correctly from the start, preventing silent DDL errors.
- Centralizing language overlay logic in `translation_service.apply_translation()` kept API endpoints thin and made fallback behavior easy to test in isolation.
- Using `default=dict` (not `default={}`) on ORM model columns avoided the classic mutable default pitfall before it could cause bugs.
- Running an import smoke-test before every Alembic command (`python -c "from app.models.survey import Survey; ..."`) surfaced broken imports as clean tracebacks instead of cryptic migration failures.

## What Was Challenging
- Alembic autogenerate silently downcasts JSONB columns to TEXT and silently drops `server_default` and `onupdate` directives — making it unreliable for JSONB work without post-generation inspection and manual correction.
- Ensuring all four model files were imported in both `alembic/env.py` and `app/models/__init__.py` before migration commands was easy to forget and produced silent migration gaps with no error.
- The `DATABASE_URL` environment default uses the psycopg2 scheme (`postgresql://`), but the async engine requires `postgresql+asyncpg://`. The mismatch produces a confusing error that is hard to trace back to the URL scheme.
- Session-scoped async SQLAlchemy fixtures under pytest-asyncio cause event loop mismatch errors with asyncpg — the error message does not clearly point to fixture scope as the cause.
- Propagating the `?lang=` parameter consistently from URL query param → service layer → API call → response rendering required touching a wide surface of files and was easy to miss at any layer.

## Key Technical Insights
1. **Never trust Alembic autogenerate for JSONB.** Always author JSONB migration DDL manually using `sa.dialects.postgresql.JSONB` with `server_default=sa.text("'{}'")`. Inspect generated DDL before applying even when autogenerate is used as a starting point.
2. **Mutable ORM defaults must use a callable.** Use `Column(JSONB, default=dict)` or `default=lambda: {}` — never `default={}`. A shared mutable dict silently corrupts all new rows created in the same session.
3. **Model imports must be complete before any Alembic operation.** Missing imports in `alembic/env.py` cause columns to be silently omitted from migrations. The smoke-test pattern (`python -c "from app.models.X import X"`) is the fastest guard.
4. **asyncpg requires the `+asyncpg` URL scheme.** The psycopg2-compatible default scheme fails at runtime with an unhelpful error. Always override `DATABASE_URL` to `postgresql+asyncpg://` for async test runs.
5. **pytest-asyncio async fixtures must use `scope="function"`.** `scope="session"` causes event loop mismatch with asyncpg; the framework does not raise a helpful error pointing to scope as the cause.
6. **Language fallback logic belongs in a service, not in endpoint handlers.** Keeping `apply_translation(entity, lang, fallback_lang)` in a dedicated `translation_service` made it independently testable and reusable across GET survey, response form, and export paths.
7. **JSONB translation columns scale better than translation tables for survey content.** The nested structure avoids JOIN complexity at read time and keeps export/import as simple field inclusion rather than related-record orchestration.

## Reusable Patterns
- **Translation overlay pattern:** `apply_translation(entity_dict, requested_lang, fallback_lang)` — look up `entity["translations"].get(requested_lang)`, fall back to `entity["translations"].get(fallback_lang)`, then overlay matched keys onto the base entity dict.
- **Manually authored JSONB migration:** `sa.Column("translations", sa.dialects.postgresql.JSONB, nullable=False, server_default=sa.text("'{}'"))` — copy this snippet for any new JSONB column migration.
- **Import smoke-test gate:** Run `python -c "from app.models.X import X"` for every affected model before `alembic upgrade head` or `alembic revision`.
- **Function-scoped async fixtures:** All `pytest_asyncio.fixture` decorators for engine/session fixtures should be `scope="function"` in async test suites using asyncpg.
- **`?lang=` query param propagation:** Accept `lang: Optional[str] = Query(None)` in FastAPI endpoint, pass to service, return translated content with `survey.default_language` as fallback — consistent pattern across GET survey and response form endpoints.
- **Side-by-side TranslationEditor:** Source language fields rendered read-only (left panel), target language fields editable (right panel), with debounced PATCH on change and a language selector dropdown at the top.

## Files to Review for Similar Tasks
- `backend/alembic/versions/0015_add_translations_jsonb_columns.py` — canonical example of a manually authored JSONB migration with correct type and server_default.
- `backend/app/services/translation_service.py` — reference for `apply_translation`, `get_supported_languages`, and `merge_translations` patterns.
- `backend/app/models/survey.py` — example of JSONB column ORM declaration with `default=dict`.
- `backend/app/api/surveys.py` — reference for `?lang=` query param acceptance and translation overlay at the API layer.
- `backend/app/services/export_service.py` — shows how to include JSONB translation fields in export/import round-trips without extra orchestration.
- `frontend/src/components/survey-builder/TranslationEditor.tsx` — reusable side-by-side translation UI pattern with debounced PATCH.
- `frontend/src/types/survey.ts` — updated type definitions for `translations: Record<string, Record<string, string>>` on all translatable entities.

## Gotchas and Pitfalls
- **Alembic autogenerate silently renders JSONB as TEXT** — always inspect and manually correct before applying.
- **Alembic autogenerate silently drops `server_default`** — never rely on it to preserve column defaults; manually author them.
- **Missing model import in `alembic/env.py` silently omits the column from the migration** — no error is raised; the column simply does not appear in the generated DDL.
- **`default={}` on an ORM column is a shared mutable object** — all rows created in the same session will mutate the same dict. Use `default=dict` instead.
- **`postgresql://` scheme with asyncpg fails at runtime** — the error does not clearly name the URL scheme as the cause. Always prefix test runs with `DATABASE_URL="postgresql+asyncpg://..."`.
- **`scope="session"` on async fixtures causes event loop mismatch under asyncpg** — the pytest-asyncio error message is opaque; the fix is to change to `scope="function"`.
- **Translation overlay must handle partial translations** — a language key may exist in `translations` without every field present; the overlay must merge only the keys that exist, leaving un-translated fields in the source language rather than blanking them.
- **Export/import must include `translations` explicitly** — JSONB columns are not automatically included in Pydantic `model_dump()` unless the field is declared in the schema; verify schema includes `translations` before assuming it round-trips.
```
