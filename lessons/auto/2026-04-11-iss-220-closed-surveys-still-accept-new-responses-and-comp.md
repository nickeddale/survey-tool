---
date: "2026-04-11"
ticket_id: "ISS-220"
ticket_title: "Closed surveys still accept new responses and completions"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-220"
ticket_title: "Closed surveys still accept new responses and completions"
categories: ["security", "validation", "api", "testing"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/response_submit_service.py"
  - "backend/tests/test_responses.py"
---

# Lessons Learned: Closed surveys still accept new responses and completions

## What Worked Well
- The existing `create_response` status check pattern (`survey.status != 'active'`) was already correct and covered both `draft` and `closed` — no change needed there
- The `UnprocessableError` helper and message format were already established, making it straightforward to mirror the same pattern in `_complete_response_core`
- Accessing `response.survey.status` via the eagerly-loaded `selectinload` relationship avoided a separate DB query and kept the fix minimal

## What Was Challenging
- The draft-survey completion test required a non-obvious setup: responses cannot be created on draft surveys via the API, so the test must activate the survey, create a response, then revert the survey to draft via a direct DB `update()` statement before attempting completion
- Confirming that `response.survey` was actually eager-loaded (via `selectinload`) before relying on `response.survey.status` in an async context — lazy access would raise `MissingGreenlet` or similar asyncpg errors

## Key Technical Insights
1. `_complete_response_core` had no survey status check at all — only response-level status checks (already complete, disqualified). The completion path was entirely unguarded against closed surveys.
2. The `selectinload` relationship on `Response -> Survey` was already configured, so `response.survey.status` is safe to access without an additional query in async context.
3. The existing `create_response` check (`status != 'active'`) correctly covers all non-active statuses including `closed` — the bug was solely in the completion path.
4. Running an import smoke-test (`python -c 'from app.services.response_submit_service import _complete_response_core'`) inside Docker before the full pytest run catches broken imports with a clean traceback rather than a cryptic test failure.

## Reusable Patterns
- **Status guard pattern for completion endpoints:** After loading the response object (with `selectinload` on survey), check `response.survey.status != 'active'` and raise `UnprocessableError(f"Survey is not accepting responses: status is '{response.survey.status}'")`
- **Draft-survey completion test setup:** activate survey → create response via API → `session.execute(update(Survey).where(...).values(status='draft'))` → `session.commit()` → attempt PATCH complete → assert 422
- **Mirror the creation check:** Whenever a new endpoint interacts with a survey resource, verify it has the same status guard as the creation endpoint — gaps often appear in secondary actions (complete, submit page, etc.)
- **Avoid `multiple_choice` answer types in completion-path tests** due to `frozenset(answers.items())` raising `unhashable type: list` in `relevance.py:278`

## Files to Review for Similar Tasks
- `backend/app/services/response_submit_service.py` — `_complete_response_core`: the completion guard lives here
- `backend/app/services/response_service.py` — `create_response`: reference implementation of the status check pattern
- `backend/app/utils/errors.py` — `UnprocessableError`: the standard error type for invalid state transitions
- `backend/tests/test_responses.py` — existing draft/closed creation tests and new completion tests

## Gotchas and Pitfalls
- **Do not assume creation-path guards cover completion paths.** Each endpoint must be audited independently for status enforcement.
- **Lazy-loaded relationships crash in async context.** Always verify `selectinload` is configured before accessing `response.survey` in async service code; do not add a raw `await session.get(Survey, ...)` without checking whether the relationship is already loaded.
- **Draft completion test cannot use the normal API flow.** You must create the response while the survey is active, then downgrade the survey status via a direct DB update — there is no API endpoint for reverting to draft.
- **`from __future__ import annotations` in router files breaks FastAPI ForwardRef resolution** when `request: Request` is added as a parameter alongside locally-defined Pydantic models. Remove this import if present before adding new endpoint parameters.
- **DATABASE_URL must use `postgresql+asyncpg://` scheme** when running Docker-based pytest — the psycopg2 scheme will fail with a confusing error.
- **Error message must match exactly:** `"Survey is not accepting responses: status is 'closed'"` — tests assert on the `detail` field and will fail on minor wording differences.
```
