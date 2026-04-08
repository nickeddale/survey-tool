---
date: "2026-04-08"
ticket_id: "ISS-175"
ticket_title: "ISS-163 regression: redirectToLogin fires on public survey routes when auth refresh fails"
categories: ["testing", "api", "ui", "bug-fix", "feature", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-175"
ticket_title: "ISS-163 regression: redirectToLogin fires on public survey routes when auth refresh fails"
categories: ["auth", "axios-interceptors", "public-routes", "regression"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/services/apiClient.ts"
  - "frontend/src/services/responseService.ts"
  - "frontend/src/services/__tests__/apiClient.test.ts"
---

# Lessons Learned: ISS-163 regression: redirectToLogin fires on public survey routes when auth refresh fails

## What Worked Well
- The existing `AUTH_PASSTHROUGH_PATHS` pattern in `apiClient.ts` provided a clear model for the fix — extending it to check `window.location.pathname` against public route patterns was a natural, low-risk change
- `getPublicSurvey` already used raw axios instead of `apiClient`, making it an obvious template for migrating `createResponse` and `completeResponse`
- The two-pronged fix (suppress redirect + migrate to raw axios) was complementary: the raw axios migration eliminates the 401 path entirely for submissions, while the pathname guard is a safety net for any remaining apiClient calls on public routes

## What Was Challenging
- The bug was subtle: the public survey page loaded successfully (unauthenticated GET worked), but the redirect fired after a failed background refresh attempt — a timing issue that only manifested after a brief visible render
- Identifying that `redirectToLogin()` could be triggered by the proactive-refresh path *and* the 401 response handler required reading the full interceptor logic carefully — both paths needed the guard

## Key Technical Insights
1. Axios interceptors run globally regardless of whether the originating call was for a public or protected resource. Any unauthenticated user hitting a 401 (or triggering a failed refresh) will execute the interceptor's redirect logic unless explicitly suppressed.
2. The safest way to keep public-route service calls out of the auth interceptor flow entirely is to use raw axios (bypassing `apiClient`) — this is preferable to relying solely on URL pattern matching at redirect time.
3. Checking `window.location.pathname` (the browser's current page URL) rather than the request URL is the correct approach when the goal is "is the user currently on a public page?" — the request URL may be an API endpoint like `/api/v1/responses`, not `/s/{id}`.
4. The proactive refresh path (e.g., a timer or interceptor that refreshes tokens before expiry) must also be guarded, not just the 401 response handler — both are entry points to `redirectToLogin()`.

## Reusable Patterns
- **Public route guard in interceptors:** Define a `PUBLIC_ROUTE_PATTERNS` array (e.g., `['/s/']`) and an `isPublicRoute()` helper that checks `window.location.pathname.startsWith(pattern)`. Gate any `redirectToLogin()` call behind `!isPublicRoute()`.
- **Raw axios for public endpoints:** Service methods that are called from unauthenticated pages should use a plain `axios` instance (no auth interceptors) rather than the app's `apiClient`. Follow the `getPublicSurvey` pattern as the canonical example.
- **Two-layer defense:** Combine (1) raw axios for the service call and (2) pathname guard in the interceptor. Either alone is fragile; together they are robust.

## Files to Review for Similar Tasks
- `frontend/src/services/apiClient.ts` — interceptor logic, `AUTH_PASSTHROUGH_PATHS`, `redirectToLogin()` call sites
- `frontend/src/services/responseService.ts` — which methods use `apiClient` vs raw axios; `getPublicSurvey` as the raw axios reference implementation
- `frontend/src/services/__tests__/apiClient.test.ts` — tests for auth passthrough and public route suppression behavior

## Gotchas and Pitfalls
- Checking the **request URL** instead of `window.location.pathname` is wrong here — API endpoint paths (`/api/v1/responses`) do not reveal that the user is on a public survey page.
- Only guarding the 401 handler but not the proactive-refresh failure path leaves a hole — the redirect can still fire from the refresh path even if the 401 path is guarded.
- If `AUTH_PASSTHROUGH_PATHS` is extended naively (adding `/s/` to the request-URL passthrough list), it won't help because public survey submissions hit `/api/v1/responses`, not `/s/*` — the distinction between page URL and request URL must be kept clear.
- Raw axios calls skip all apiClient interceptors including any request-side auth header injection — ensure public endpoints genuinely require no auth token, or selectively re-add headers as needed.
```
