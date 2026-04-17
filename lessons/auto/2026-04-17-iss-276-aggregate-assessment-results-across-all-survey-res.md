---
date: "2026-04-17"
ticket_id: "ISS-276"
ticket_title: "Aggregate assessment results across all survey responses"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-17"
ticket_id: "ISS-276"
ticket_title: "Aggregate assessment results across all survey responses"
categories: ["backend", "frontend", "testing", "api", "react", "fastapi", "pydantic"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/schemas/assessment.py
  - backend/app/services/assessment_service.py
  - backend/app/api/assessments.py
  - backend/tests/test_assessments.py
  - frontend/src/types/survey.ts
  - frontend/src/services/assessmentService.ts
  - frontend/src/components/responses/AssessmentSummary.tsx
  - frontend/src/components/responses/StatisticsDashboard.tsx
---

# Lessons Learned: Aggregate assessment results across all survey responses

## What Worked Well
- Reusing the existing `compute_score` service function kept the summary logic thin — the aggregation layer simply iterated completed responses and tallied results without reimplementing scoring
- Separating the new `AssessmentBandSummary` and `AssessmentSummaryResponse` Pydantic schemas from the existing per-response schemas kept serialization clean and prevented internal field leakage
- The existing router helper pattern (`_parse_survey_id`, `_get_survey_or_404`) made adding the new summary endpoint straightforward with consistent auth and 404 handling
- Returning 404 from the summary endpoint when no assessment rules are defined (rather than an empty result) gave the frontend a clean signal to hide the component entirely

## What Was Challenging
- Ensuring percentage values across all bands summed to ~100% required careful handling of floating-point division and zero-response edge cases
- The frontend component needed explicit try/catch on mount to distinguish a 404 (no rules defined — hide component) from other API errors (show inline error) — Axios treats all 4xx as thrown errors so a missing-data guard alone is insufficient
- MSW mock handlers for Vitest tests had to return the exact `{detail: {code: string, message: string}}` backend error envelope shape, not a simplified `{message: '...'}` — divergence here causes tests to pass locally but behave differently against the real backend

## Key Technical Insights
1. When a "no data" state should silently hide a UI component rather than show an error, model it as a 404 on the backend — not an empty 200 — so the frontend can distinguish it from unexpected failures with a status code check rather than inspecting response shape.
2. Running an import smoke-test (`python -c "from app.services.assessment_service import compute_assessment_summary"`) inside Docker before running pytest surfaces broken imports as clean tracebacks rather than cryptic pytest collection errors.
3. All pytest-asyncio async fixtures must be `scope='function'` — session-scoped async fixtures cause event loop mismatch errors with asyncpg that are difficult to diagnose.
4. Pydantic field omission is not the same as field exclusion: always add explicit test assertions that no internal ORM fields (raw scores, internal IDs) appear in the summary response body.
5. `DATABASE_URL` for Docker-based backend tests must use the `postgresql+asyncpg://` scheme — the default psycopg2 scheme silently fails with the async SQLAlchemy engine.

## Reusable Patterns
- **Aggregation service pattern**: query all relevant IDs, call the existing per-item compute function in a loop, accumulate totals and per-bucket counts, return a structured summary schema. Keep the aggregation function in the same service module as the per-item function.
- **Frontend 404-as-feature pattern**: wrap the API call in `useEffect` with try/catch; on `error.response?.status === 404` set `hasAssessment = false` and return null from render; on other errors set an `errorMessage` state and show an inline error banner.
- **MSW error handler override per test**: use `server.use(http.get(..., () => HttpResponse.json({detail: {code: 'NOT_FOUND', message: '...'}}, {status: 404})))` inside the specific test rather than in the global handler — this keeps the happy-path handler as the default and only overrides for the error case.
- **Backend summary endpoint skeleton**: reuse `_parse_survey_id` + `_get_survey_or_404` helpers, add a single `GET /{survey_id}/assessments/summary` route, delegate all logic to an async service function, return the response schema directly.
- **Percentage safety**: compute `count / total * 100` only when `total > 0`; default to `0.0` otherwise to avoid ZeroDivisionError and NaN in the JSON response.

## Files to Review for Similar Tasks
- `backend/app/services/assessment_service.py` — reference for the `compute_score` signature and how to layer an aggregation function on top of it
- `backend/app/api/assessments.py` — reference for the router helper pattern and how to add a new summary endpoint consistently
- `backend/app/schemas/assessment.py` — reference for `AssessmentBandSummary` / `AssessmentSummaryResponse` schema design
- `frontend/src/components/responses/AssessmentSummary.tsx` — reference for the 404-as-feature hide pattern and inline error handling
- `backend/tests/test_assessments.py` — reference for function-scoped async fixtures and edge-case assertions (no rules → 404, no completed responses, band percentage sum)

## Gotchas and Pitfalls
- **Do not reuse `scope='session'` for async SQLAlchemy fixtures** — always `scope='function'`; session-scoped async fixtures cause asyncpg event loop errors that appear unrelated to the fixture scope.
- **Do not use simplified MSW error shapes** — `{message: '...'}` does not match the backend envelope `{detail: {code, message}}`; frontend error-handling code that reads `error.response.data.detail.code` will throw a runtime error in tests.
- **Do not rely on a missing-data guard alone in the React component** — `if (!data) return null` does not handle the case where the API call threw an error; always pair it with a try/catch that checks the HTTP status code.
- **Do not forget the `true` flag in Jinja2 `| default(..., true)`** — without it, `None` values are not replaced, only `Undefined`. (Applicable if summary data is rendered in email templates.)
- **Always verify the Docker DATABASE_URL scheme** before running tests — the default environment may use `postgresql://` (psycopg2) which silently fails with the asyncpg driver.
- **Explicitly assert no internal fields in the summary response** — Pydantic `exclude` and field omission are easy to get wrong; a regression can leak raw score arrays or ORM IDs without causing a serialization error.
```
