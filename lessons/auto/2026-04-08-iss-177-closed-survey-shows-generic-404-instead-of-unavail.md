---
date: "2026-04-08"
ticket_id: "ISS-177"
ticket_title: "Closed survey shows generic 404 instead of UnavailableScreen"
categories: ["testing", "api", "ui", "bug-fix", "feature"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-177"
ticket_title: "Closed survey shows generic 404 instead of UnavailableScreen"
categories: ["backend", "api", "frontend-integration", "error-handling"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/services/survey_service.py", "backend/tests/test_surveys.py"]
---

# Lessons Learned: Closed survey shows generic 404 instead of UnavailableScreen

## What Worked Well
- The frontend already had the correct UnavailableScreen component and status-check logic in place — the fix was purely a backend filter removal
- The implementation plan was accurate: a single-line query filter change in the service layer resolved the entire issue
- The existing 404 logic in the API layer (raise NotFoundError when survey is None) remained correct and required no modification
- Clear separation between "survey doesn't exist" (404) and "survey exists but is not active" (200 with status) was already established in the frontend

## What Was Challenging
- Nothing was particularly challenging; the root cause was immediately obvious once the public endpoint query was inspected

## Key Technical Insights
1. Filtering by status at the database query level in a public-facing endpoint conflates two distinct cases: "not found" and "found but unavailable" — these should be handled separately
2. When a frontend component already handles a state (e.g., closed/archived), the blocker is often an overly restrictive backend query rather than missing frontend logic
3. The service layer is the right place to control what data is returned; the API layer should only decide what HTTP response to issue based on that data

## Reusable Patterns
- Pattern: public resource endpoints should return the resource regardless of its lifecycle status, and let the caller (API layer or frontend) decide how to present each status
- Pattern: always distinguish "resource not found" (404) from "resource found in non-actionable state" (200 + status field) — the latter gives clients richer information for user-facing messaging

## Files to Review for Similar Tasks
- `backend/app/services/survey_service.py` — query filters on public-facing fetch methods
- `backend/app/api/surveys.py` — how NotFoundError is raised and when
- `frontend/src/pages/SurveyResponsePage.tsx` — status-based conditional rendering logic
- `frontend/src/pages/__tests__/SurveyResponsePage.test.tsx` — mock handlers should return survey objects with varied statuses rather than 404s for closed/archived scenarios

## Gotchas and Pitfalls
- If a public endpoint silently returns 404 for non-active resources, frontend components designed to handle those states (like UnavailableScreen) will never be exercised — this can mask missing test coverage for those paths for a long time
- Frontend tests that mock the backend with a 404 for closed surveys will pass even when the UnavailableScreen logic is broken; prefer mocking with a 200 + non-active status to test the actual rendering path
- Removing a status filter from a public endpoint is safe only if the API layer still prevents unauthorized data access — confirm that no sensitive fields are exposed for surveys in non-active states
```
