---
date: "2026-04-16"
ticket_id: "ISS-272"
ticket_title: "Translation PATCH endpoints blocked on active surveys"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-272"
ticket_title: "Translation PATCH endpoints blocked on active surveys"
categories: ["backend", "service-layer", "translations", "permissions", "testing"]
outcome: "success"
complexity: "low"
files_modified:
  - backend/app/services/translation_service.py
  - backend/tests/test_translations.py
---

# Lessons Learned: Translation PATCH endpoints blocked on active surveys

## What Worked Well
- The implementation plan correctly identified the root cause upfront: translation service functions were delegating to general update functions that bundled in `check_survey_editable()` as a side effect, rather than as an intentional guard.
- The refactor scope was well-contained — only `translation_service.py` needed changes, with no cascading modifications to routers, schemas, or other services.
- The existing `commit + refresh` async pattern in the codebase provided a clear, consistent template for the direct-persist approach.
- Pre-refactor import smoke-tests (`python -c 'from app.services.translation_service import ...'`) are low-cost and catch broken imports before running the full Docker test suite.

## What Was Challenging
- Distinguishing intentional guards from incidental side effects: `check_survey_editable()` was enforced as a by-product of calling the general update functions, not as an explicit call in translation code. This makes it easy to miss in a code review.
- Ensuring the refactor did not silently remove editability protection from structural fields — the merged payload must contain only translation fields, with no structural fields (title, type, options, required) slipping through.

## Key Technical Insights
1. When a permission check is enforced indirectly (via a shared helper called deep in the call chain), refactoring any part of that chain can silently bypass the check. Always grep all callers before and after refactoring shared service functions.
2. Translations are metadata that describe existing structure — they do not alter survey logic, branching, or response integrity. This makes them safe to update independently of survey status, unlike structural fields.
3. The direct-persist pattern (`fetch entity → merge translations → session.commit() → session.refresh()`) is the correct approach when a subset of fields should bypass a guard that the general update path enforces globally.
4. `asyncio_mode = "auto"` is already configured project-wide — new async test functions do not need `@pytest.mark.asyncio` decorators.
5. All test fixtures must be `scope='function'` — session-scoped async fixtures cause event loop mismatch errors with asyncpg under pytest-asyncio.

## Reusable Patterns
- **Direct-persist for field subsets**: When only a specific field category (e.g., translations, metadata, tags) should bypass a broader editability or validation guard, fetch the entity directly, update only those fields, then `await session.commit(); await session.refresh(entity)`. Do not route through the general update function.
- **Editability guard audit**: Before any service-layer refactor, grep for all callers of functions that contain permission checks. Confirm each caller's intent and whether the guard removal is acceptable for that caller.
- **Import smoke-test**: Run `python -c 'from app.services.<module> import <function>'` before and after any service refactor to catch import errors early without spinning up Docker.
- **Test naming**: `test_<action>_<condition>_<expected>` — e.g., `test_patch_survey_translations_on_active_survey_returns_200`.
- **Docker test command**:
  ```bash
  docker compose up -d postgres
  docker run --rm --network host \
    -e DATABASE_URL="postgresql+asyncpg://survey:survey@localhost:5432/survey_test" \
    -e JWT_SECRET=testsecret \
    -e CORS_ORIGINS="http://localhost:3000" \
    -v $(pwd)/backend:/app \
    survey_tool-backend:latest \
    python -m pytest tests/test_translations.py -q
  ```

## Files to Review for Similar Tasks
- `backend/app/services/translation_service.py` — the refactored direct-persist pattern for translation updates
- `backend/app/services/survey_service.py` — reference for `check_survey_editable()` and the general update pattern it guards
- `backend/tests/test_translations.py` — reference for testing translation endpoints across survey statuses
- `backend/app/api/translations.py` — router entry points for the four translation PATCH endpoints

## Gotchas and Pitfalls
- **DATABASE_URL scheme**: Always use `postgresql+asyncpg://` in Docker test runs. The environment default may use the psycopg2 scheme, which is incompatible with the async engine and produces confusing or silent failures.
- **Scope creep in merged payloads**: Confirm that the translation merge only touches the `translations` field. If any structural fields are included in the request body and merged without going through `check_survey_editable()`, active surveys can be structurally modified silently.
- **Silent guard bypass**: Any code that previously called the general update functions (and thus got `check_survey_editable()` for free) will lose that protection after this refactor. Grep for all callers of the four translation service functions to confirm none of them relied on the editability check as a side effect.
- **Regression check**: After the refactor, explicitly verify that structural update endpoints (PATCH `/surveys/{id}`, PATCH `/groups/{id}`, etc.) still return the correct error on active surveys — the guard must remain intact for non-translation paths.
- **Function-scoped fixtures only**: Do not use session-scoped async fixtures in new tests — they cause event loop mismatch errors with asyncpg under pytest-asyncio with no viable workaround.
```
