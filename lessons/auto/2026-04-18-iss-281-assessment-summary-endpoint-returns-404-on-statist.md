---
date: "2026-04-18"
ticket_id: "ISS-281"
ticket_title: "Assessment summary endpoint returns 404 on statistics page"
categories: ["testing", "api", "ui", "bug-fix", "feature", "documentation", "config"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```
---
date: "2026-04-18"
ticket_id: "ISS-281"
ticket_title: "Assessment summary endpoint returns 404 on statistics page"
categories: ["routing", "fastapi", "api-integration"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/api/assessments.py"]
---

# Lessons Learned: Assessment summary endpoint returns 404 on statistics page

## What Worked Well
- The implementation plan's systematic approach of verifying the full URL chain (frontend base URL → service call → router prefix → app prefix) before touching any code prevented unnecessary changes.
- Reading the router file directly confirmed the route ordering issue quickly without needing to run the server.

## What Was Challenging
- The root cause was subtle: FastAPI matches routes in registration order, so `/{survey_id}/assessments/{assessment_id}` was shadowing `/{survey_id}/assessments/summary` — the literal segment `summary` was being captured as `{assessment_id}`.
- The 404 symptom was misleading because it suggested the route didn't exist, not that it was being matched by a different route first.

## Key Technical Insights
1. **FastAPI route ordering matters for literal vs. parameterized path segments.** A route like `/{id}/assessments/{assessment_id}` will greedily capture a request to `/{id}/assessments/summary` if it is registered before the summary route. Always register more-specific (literal) routes before parameterized ones at the same path depth.
2. The `/summary` endpoint was correctly defined in `assessments.py` at line 195 and appears before `/{assessment_id}` at line 217 — confirming the fix was to ensure this ordering is preserved and not accidentally reversed.
3. The router prefix (`/surveys`) combined with the app-level `/api/v1` prefix produces the full path `/api/v1/surveys/{survey_id}/assessments/summary` — both sides of the stack were consistent; the issue was purely within the backend route registration order.

## Reusable Patterns
- When adding a literal-segment route (e.g., `/summary`, `/export`, `/count`) to a router that already has parameterized routes at the same depth, always place the literal route *above* the parameterized one in the file.
- Use a quick `grep` for all `@router.get("/{survey_id}/assessments` patterns to audit ordering whenever adding new assessment sub-routes.

## Files to Review for Similar Tasks
- `backend/app/api/assessments.py` — all routes share the `/{survey_id}/assessments` prefix; ordering between `summary` (line 195) and `{assessment_id}` (line 217) is load-bearing.
- `backend/app/main.py` — confirms router inclusion order and `/api/v1` prefix.
- `frontend/src/services/assessmentService.ts` — verify calls use the apiClient whose baseURL already includes `/api/v1`, so service paths should start with `/surveys/`.

## Gotchas and Pitfalls
- **Never place a parameterized catch-all route before a literal route at the same depth.** This is a silent failure in FastAPI — no startup error, no warning, just wrong routing at runtime.
- The 404 from FastAPI's `_get_assessment_or_404` helper (not the router itself) can mask the true cause: the request reached the wrong handler and attempted a UUID parse of the string `"summary"`, which failed, triggering a 404 rather than a routing error.
- When the frontend error message is generic ("Failed to load"), always confirm the actual HTTP status and response body in the browser network tab before assuming the route is missing entirely.
```
