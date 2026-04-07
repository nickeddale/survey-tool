---
date: "2026-04-07"
ticket_id: "ISS-163"
ticket_title: "Public survey page requires authentication — cannot load without login"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-07"
ticket_id: "ISS-163"
ticket_title: "Public survey page requires authentication — cannot load without login"
categories: ["authentication", "public-api", "fastapi", "react", "rate-limiting"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/survey_service.py
  - backend/app/api/surveys.py
  - frontend/src/services/surveyService.ts
  - frontend/src/pages/SurveyResponsePage.tsx
  - backend/tests/test_surveys.py
  - frontend/src/mocks/handlers.ts
  - frontend/src/pages/__tests__/SurveyResponsePage.test.tsx
---

# Lessons Learned: Public survey page requires authentication — cannot load without login

## What Worked Well
- The existing `SurveyFullResponse` schema was already shaped correctly for the public endpoint — no new schema needed
- Clear separation between the new `get_survey_full_public()` service function and existing ownership-filtered functions prevented accidental privilege escalation
- The implementation plan flagged the `from __future__ import annotations` footgun in advance, allowing it to be removed proactively
- Reusing the pattern from `responses.py` for public endpoints gave a working template to follow

## What Was Challenging
- Ensuring the new service function genuinely omitted the `user_id` filter — all existing service functions enforce ownership, making it easy to accidentally copy that constraint
- Verifying no router-level or middleware-level auth dependency silently re-applied authentication to the new `/public` route
- Confirming eager loading (`selectinload`) was applied at every level of the relationship chain (groups → questions → options) to avoid `MissingGreenlet` errors from async SQLAlchemy

## Key Technical Insights
1. **`from __future__ import annotations` + `@limiter.limit` + `request: Request` is a FastAPI footgun**: locally-defined Pydantic models become unresolvable `ForwardRef`s, causing body parameters to be misidentified as query params and returning 400 errors. Remove the import; Python 3.11+ handles `str | None` and `list[str]` natively.
2. **Async SQLAlchemy requires explicit `selectinload` for every relationship level**: accessing a relationship without eager loading raises `MissingGreenlet`. For `groups → questions → options`, all three levels must be chained in the query.
3. **Return 404 (not 403) for non-active surveys**: returning 403 would leak the fact that a survey exists. 404 is correct for draft/closed/archived surveys on the public endpoint.
4. **Public endpoints must have no `get_current_user` dependency**: even an `Optional` current user dependency can trigger token validation errors for unauthenticated callers depending on how FastAPI resolves it. Use no auth dependency at all.
5. **Participant token enforcement is survey-data-driven, not middleware-driven**: the enforcement only applies when a `Participant` row exists; the public endpoint is unaffected by this mechanism.

## Reusable Patterns
- **Public service function pattern**: query by `id` and `status == 'active'` only — no `user_id` filter. Name it clearly (e.g., `get_survey_full_public`) to distinguish it from ownership-enforced variants.
- **Eager loading chain for survey full response**: `selectinload(Survey.groups).selectinload(QuestionGroup.questions).selectinload(Question.options)`
- **Public router endpoint pattern**: no `Depends(get_current_user)`, include `request: Request` for rate limiting, return 404 for any non-active status.
- **MSW handler for public endpoint**: register a handler for `GET /api/v1/surveys/:id/public` in `handlers.ts` that returns full survey fixture data without checking for an auth token.
- **Frontend public fetch**: `getPublicSurvey()` in `surveyService.ts` should call the `/public` path without attaching `Authorization` headers (do not reuse the authenticated `getSurvey()` wrapper).

## Files to Review for Similar Tasks
- `backend/app/api/surveys.py` — check for router-level auth dependencies and `from __future__ import annotations` before adding rate-limited public endpoints
- `backend/app/services/survey_service.py` — reference `get_survey_full_public()` as the canonical pattern for ownership-free queries with full eager loading
- `backend/app/api/responses.py` — existing public endpoint pattern to follow for new unauthenticated routes
- `frontend/src/mocks/handlers.ts` — add MSW handler for any new public backend endpoint used in frontend tests
- `frontend/src/pages/SurveyResponsePage.tsx` — reference for how to conditionally call public vs. authenticated service methods based on auth state

## Gotchas and Pitfalls
- **Do not copy existing service functions** that filter by `user_id` when implementing public access — the ownership check must be deliberately and visibly absent.
- **Check for router-level `dependencies=` in the `APIRouter(...)` call**: a global `Depends(get_current_user)` at the router level will silently apply to every route including ones intended to be public.
- **Do not add `Body(...)` to work around `ForwardRef` errors** — it causes a different `PydanticUserError: TypeAdapter not fully defined` crash. The correct fix is removing `from __future__ import annotations`.
- **Rate limiter tests require resetting state between tests**: the conftest must reset the rate limiter or tests may spuriously hit 429 limits based on ordering.
- **Frontend tests must not include an `Authorization` header** in the mock setup for the public endpoint — the whole point is that unauthenticated access works.
- **Participant token enforcement is not triggered by the public endpoint**: it only activates when a `Participant` row exists for the survey, and the public endpoint bypasses the auth layer entirely anyway.
```
