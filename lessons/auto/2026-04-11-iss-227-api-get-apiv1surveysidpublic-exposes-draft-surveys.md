---
date: "2026-04-11"
ticket_id: "ISS-227"
ticket_title: "[API] GET /api/v1/surveys/{id}/public — Exposes draft surveys to unauthenticated users"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-227"
ticket_title: "[API] GET /api/v1/surveys/{id}/public — Exposes draft surveys to unauthenticated users"
categories: ["security", "api", "access-control", "testing"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/api/surveys.py", "backend/tests/test_surveys.py"]
---

# Lessons Learned: [API] GET /api/v1/surveys/{id}/public — Exposes draft surveys to unauthenticated users

## What Worked Well
- The fix was surgical: a single status check added to the route handler in `get_public()` was sufficient — no service layer changes needed
- The existing `NotFoundError` helper from `backend/app/utils/errors.py` provided a consistent 404 shape without requiring a new exception class
- Renaming existing tests (rather than adding new ones) kept the test suite lean while accurately reflecting the new expected behavior
- Using a uniform `'Survey not found'` message for all non-active statuses (draft, closed, archived) correctly prevents status enumeration by unauthenticated callers

## What Was Challenging
- The bug was subtle: the service function `get_survey_full_public()` documented that the caller is responsible for status checks, but the route handler never implemented that contract — easy to miss without reading both layers together
- Test names originally asserted the wrong behavior (`returns_200_for_draft_survey`), requiring both a name change and an assertion flip — easy to update one without the other

## Key Technical Insights
1. **Separation of concerns creates implicit contracts**: when a service function documents "caller is responsible for X", that contract must be enforced at the call site. A code review checklist should verify that documented preconditions are actually checked by callers.
2. **404 over 403 for unauthenticated access to non-public resources**: returning 403 or any status-specific message leaks survey existence and state to unauthenticated users. A uniform 404 with a generic message is the correct posture for public endpoints.
3. **UUIDs are not access control**: survey IDs can be leaked via referrer headers, logs, or enumeration. Status checks at the API boundary are the only reliable guard.
4. **`asyncio_mode = 'auto'` in pytest-asyncio**: no `@pytest.mark.asyncio` decorator is needed on async test functions — adding it is harmless but unnecessary and can cause confusion when reading tests.

## Reusable Patterns
- **Status guard in public route handlers**: after fetching a resource for a public endpoint, always assert `resource.status == 'active'` (or equivalent) before returning data. If not active, raise `NotFoundError('Resource not found')` with a generic message.
- **Import smoke-test before running pytest**: `python -c 'from app.api.surveys import router'` surfaces broken imports as clean tracebacks rather than cryptic collection errors during test discovery.
- **Reuse existing error helpers**: check `backend/app/utils/errors.py` before raising `HTTPException` inline — the project's `NotFoundError` (and similar helpers) produce a consistent error envelope expected by clients.
- **Test matrix for public endpoints**: after any access-control fix, explicitly assert all five cases — active → 200, draft → 404, closed → 404, archived → 404, nonexistent → 404, another user's active → 200.
- **Docker test invocation with correct DB scheme**: always use `postgresql+asyncpg://` in the `DATABASE_URL` passed to the test container — the default environment uses psycopg2 and will fail silently with async SQLAlchemy.

## Files to Review for Similar Tasks
- `backend/app/api/surveys.py` — route handlers, especially any `get_*` endpoints that serve unauthenticated callers
- `backend/app/utils/errors.py` — canonical error helpers (`NotFoundError`, etc.) to reuse instead of raising `HTTPException` inline
- `backend/tests/test_surveys.py` — public endpoint test slice (lines ~562–676) as a reference for the five-case access-control test matrix
- `backend/app/services/surveys.py` — service-layer docstrings that document caller responsibilities (preconditions not enforced internally)

## Gotchas and Pitfalls
- **Never return 403 or expose survey status on a public endpoint** — any status-specific response enables existence and state enumeration. Always use 404 with a generic message.
- **Renaming a test is not enough**: when flipping an assertion from 200 to 404, verify the test still exercises the same fixture/DB state. The fixture itself should not need to change — only the assertion and the name.
- **`postgresql+asyncpg://` is required for the test container** — the default `DATABASE_URL` uses the psycopg2 scheme; async SQLAlchemy queries will fail silently if the wrong scheme is used.
- **Service-layer documentation is not enforcement**: a comment saying "caller must check status" does not prevent the bug — the check must exist in the route handler. Do not assume service functions enforce their own documented preconditions.
```
