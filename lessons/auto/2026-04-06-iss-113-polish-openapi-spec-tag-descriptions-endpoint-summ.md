---
date: "2026-04-06"
ticket_id: "ISS-113"
ticket_title: "Polish OpenAPI spec (tag descriptions, endpoint summaries, response examples)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-113"
ticket_title: "Polish OpenAPI spec (tag descriptions, endpoint summaries, response examples)"
categories: ["openapi", "documentation", "fastapi", "pydantic"]
outcome: "success"
complexity: "low"
files_modified:
  - backend/app/main.py
  - backend/app/api/auth.py
  - backend/app/api/surveys.py
  - backend/app/api/question_groups.py
  - backend/app/api/questions.py
  - backend/app/api/answer_options.py
  - backend/app/api/responses.py
  - backend/app/api/participants.py
  - backend/app/api/quotas.py
  - backend/app/api/assessments.py
  - backend/app/api/webhooks.py
  - backend/app/api/logic.py
  - backend/app/schemas/survey.py
  - backend/app/schemas/question.py
  - backend/app/schemas/response.py
  - backend/app/schemas/auth.py
  - backend/app/schemas/question_group.py
  - backend/app/schemas/answer_option.py
  - backend/app/schemas/participant.py
  - backend/app/schemas/quota.py
  - backend/app/schemas/assessment.py
  - backend/app/schemas/webhook.py
---

# Lessons Learned: Polish OpenAPI spec (tag descriptions, endpoint summaries, response examples)

## What Worked Well
- The scope was well-defined and purely additive — no runtime behavior changed, making it safe to work across 22 files without regression risk.
- Grouping `openapi_tags` in main.py in the same order as router includes produced a clean, logically ordered /docs UI with no extra effort.
- Treating the work as batch mechanical edits (summary/description per endpoint, Field metadata per schema) across consistent file structure made it predictable and fast.
- The existing router tag structure was already correct, so no refactoring was needed — only additions.

## What Was Challenging
- No automated test coverage exists for OpenAPI metadata correctness — the only verification path is manual inspection of `/docs` or `/openapi.json`, making it impossible to guard against regressions in CI.
- With 22 files touched, checking each schema file's existing `from pydantic import Field` imports before adding Field metadata required careful per-file review to avoid duplicate imports or aliasing conflicts.
- Keeping `summary=` values consistently under 60 characters and in sentence-case required discipline across dozens of endpoints with no linting enforcement.

## Key Technical Insights
1. `summary=` and `description=` on FastAPI route decorators are purely documentation metadata — they have zero effect on routing, validation, or runtime behavior. No regression risk exists, but also no unit test coverage is possible without dedicated OpenAPI spec tests.
2. `Field(description=..., example=...)` in Pydantic schemas is documentation-only — example values do not enforce validation. Never use example values that imply constraints not enforced by the schema (e.g., don't use `example='active'` on a free-string field).
3. The `openapi_tags` list in FastAPI's app constructor controls tag descriptions and ordering in `/docs`. Tags not in this list still appear but without descriptions — all tags used by routers should have a corresponding entry.
4. Import smoke-testing (`python -c 'from app.main import app; ...'`) is the most reliable fast check after touching many schema/API files, since the test suite won't catch missing Field imports or circular import issues introduced by bulk changes.
5. Boolean schema fields that are typed as strings (e.g., for survey answer submission) must use string examples `'true'`/`'false'`, not Python `True`/`False`, to avoid misleading the OpenAPI consumer.

## Reusable Patterns
- Add `openapi_tags` to FastAPI app init in the same order as `app.include_router(...)` calls — this directly controls tag ordering in `/docs`.
- Use a consistent UUID placeholder for example values: `'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'` or a realistic-looking fixed UUID.
- Only add `Field(description=..., example=...)` to user-facing input/output schemas (request bodies, response models) — internal service-layer models don't need OpenAPI metadata.
- For enum fields, always use one of the valid enum values as the example (e.g., `example='draft'` for a status field with values `draft|active|closed`).
- After bulk schema changes, run: `python -c 'from app.main import app; from app.api import auth, surveys, questions'` as a quick import smoke-test before committing.

## Files to Review for Similar Tasks
- `backend/app/main.py` — canonical location for `openapi_tags` list and app-level description; review when adding new router tag groups.
- Any router file in `backend/app/api/` — all follow the same pattern of `@router.get(..., summary=..., description=...)` and can be used as reference for consistent style.
- `backend/app/schemas/survey.py` and `backend/app/schemas/question.py` — most complete examples of Field metadata with descriptions and examples applied consistently.

## Gotchas and Pitfalls
- Do not add `example` values to list-typed fields in schemas that pass through `relevance.py` evaluation — `frozenset(answers.items())` will raise `unhashable type: 'list'` if a list value is inadvertently submitted through a test exercising completion logic.
- Check each schema file for an existing `from pydantic import Field` import before adding one — some files may import Field indirectly or alias it, causing duplicate import warnings or shadowing.
- The `/docs` UI derives tag ordering from `openapi_tags` — tags not listed there appear at the bottom in undefined order. Always add new tags to the list when adding new routers.
- Do not use Python `True`/`False` as Field example values for string-typed boolean fields — use the strings `'true'`/`'false'` to match the actual accepted input format.
- Manual verification of `/openapi.json` is the only reliable acceptance check for this category of work — the existing pytest suite will not catch wrong or missing summaries, descriptions, or examples.
```
