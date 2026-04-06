---
date: "2026-04-06"
ticket_id: "ISS-129"
ticket_title: "CQ-07: Move translation logic from router to service"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-129"
ticket_title: "CQ-07: Move translation logic from router to service"
categories: ["refactoring", "service-layer", "translation", "code-quality"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/translation_service.py
  - backend/app/api/surveys.py
  - backend/app/api/question_groups.py
  - backend/app/api/questions.py
  - backend/app/api/answer_options.py
  - backend/tests/test_translations.py
---

# Lessons Learned: CQ-07: Move translation logic from router to service

## What Worked Well
- The implementation plan clearly identified all four router files that needed refactoring, making the scope well-defined
- Existing integration tests in `test_translations.py` served as a reliable regression guard throughout the refactor
- The fetch→merge→update pattern was consistent across all four routers, making extraction mechanical once the first service function was written
- Incremental refactoring per router (rather than all at once) kept the change surface small and failures easy to isolate

## What Was Challenging
- ORM lazy loading: moving fetch logic into the service layer breaks implicit lazy-loading that worked when the session was open in the router context; `lazy='raise'` surfaces this immediately as `MissingGreenlet` errors at serialization time
- Ensuring all service functions raised `NotFoundError` (not `HTTPException`) required discipline — the existing router code used `HTTPException` directly, which is not appropriate in the service layer
- The GET `/surveys/{id}?lang=` endpoint required an additional `get_translated_survey` service function that was easy to overlook since it is a read path, not the update path

## Key Technical Insights
1. When `lazy='raise'` is set on ORM relationships, any service function that returns a model must explicitly load all relationships the router/schema will access — use `selectinload` in the service query, not post-fetch attribute access
2. Service functions must raise domain errors (`NotFoundError` from `app.utils.errors`), never `HTTPException` — the global exception handler is responsible for HTTP formatting
3. Ownership-scoped fetches (JOIN on `user_id`) belong in the service layer alongside the entity fetch, not split between router and service
4. Import smoke-tests (`python -c 'from app.services.translation_service import update_survey_translations'`) catch broken imports before pytest collection, avoiding cryptic errors
5. The `postgresql+asyncpg://` scheme is required in `DATABASE_URL` for async test runs — the container default psycopg2 scheme silently fails

## Reusable Patterns
- **Service function signature:** `async def update_<entity>_translations(session: AsyncSession, <entity>_id: UUID, user_id: UUID, lang: str, field_values: dict) -> <EntityModel>`
- **Ownership fetch pattern:** `SELECT ... FROM entity JOIN surveys ON ... WHERE surveys.user_id = :user_id AND entity.id = :id`, raise `NotFoundError` if result is `None`
- **Explicit relationship loading:** include `selectinload(Entity.relationship)` in every service query that returns a model to be serialized
- **Thin router pattern:** router handles only HTTP concerns (request parsing, response status, dependency injection); all business logic delegated to service function
- **Incremental test runs:** run `pytest tests/test_translations.py -v` after each individual router refactor, not once at the end

## Files to Review for Similar Tasks
- `backend/app/services/translation_service.py` — canonical example of fetch→merge→persist service function pattern
- `backend/app/api/surveys.py` — reference for what a thin translation router endpoint looks like post-refactor
- `backend/app/utils/errors.py` — `NotFoundError` and other domain errors that service functions must use
- `backend/tests/test_translations.py` — integration and unit test structure for translation service functions

## Gotchas and Pitfalls
- **`lazy='raise'` will cause `MissingGreenlet` errors** if the service returns a detached model with unloaded relationships — always verify which relationships the response schema accesses and load them explicitly
- **Do not import `HTTPException` in service modules** — raise `NotFoundError` so the global handler owns HTTP formatting
- **`DATABASE_URL` scheme matters** — async tests require `postgresql+asyncpg://`; psycopg2 scheme silently fails without a clear error
- **The GET translation path is easy to miss** — `get_one` with a `lang` query parameter also contains inline translation logic that must move to the service layer alongside the update paths
- **Run import smoke-tests before pytest** to surface broken imports early rather than diagnosing pytest collection failures
```
