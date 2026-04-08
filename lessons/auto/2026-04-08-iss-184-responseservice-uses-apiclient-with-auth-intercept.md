---
date: "2026-04-08"
ticket_id: "ISS-184"
ticket_title: "responseService uses apiClient (with auth interceptors) for public operations"
categories: ["testing", "api", "ui", "bug-fix", "feature", "security", "ci-cd", "refactoring"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-08"
ticket_id: "ISS-184"
ticket_title: "responseService uses apiClient (with auth interceptors) for public operations"
categories: ["frontend", "auth", "api-client", "refactor"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/services/responseService.ts"
---
```

# Lessons Learned: responseService uses apiClient (with auth interceptors) for public operations

## What Worked Well
- The fix was straightforward: existing methods `createResponse()` and `completeResponse()` already used the correct pattern (raw axios + `BASE_URL` prefix + explicit `Content-Type` header), providing a clear template to follow
- The scope was well-contained to a single file with a consistent pattern across methods

## What Was Challenging
- Identifying the bug required understanding the auth interceptor chain — the issue is subtle because the calls succeed most of the time, only misfiring when a token refresh cycle happens to coincide with a public route call
- Determining which methods should keep `apiClient` (authenticated operations: `listResponses`, `getResponseDetail`, `exportResponses`, `getSurveyStatistics`) vs. which should use raw axios (public operations) required reading the API contract carefully

## Key Technical Insights
1. `apiClient` in this codebase carries auth interceptors that handle token refresh and 401 redirect logic — using it on public routes means those routes are silently affected by auth state changes
2. Public survey response endpoints (`saveProgress`, `resolveFlow`) do not require authentication; attaching auth headers is at best wasteful and at worst causes 401 handling loops when tokens expire mid-session
3. The correct pattern for public API calls: `axios.post(\`${BASE_URL}/api/v1/...\`, body, { headers: { 'Content-Type': 'application/json' } })` — no `apiClient`, no auth headers

## Reusable Patterns
- **Public vs. authenticated service method split**: Any service file that mixes public and authenticated API calls must use raw axios for the public ones and `apiClient` only for the authenticated ones
- **Pattern reference**: `createResponse()` and `completeResponse()` in `responseService.ts` are canonical examples of the correct public-endpoint call pattern

## Files to Review for Similar Tasks
- `frontend/src/services/responseService.ts` — the fixed file; check method-level axios vs. apiClient usage
- `frontend/src/services/apiClient.ts` — understand what interceptors are attached before deciding which client to use
- Any other `frontend/src/services/*.ts` files that expose both public and authenticated operations

## Gotchas and Pitfalls
- Forgetting to prefix the URL with `BASE_URL` when switching from `apiClient` to raw axios — `apiClient` likely has a `baseURL` configured, but raw axios does not
- Not removing the `apiClient` import after migration can mask the issue in code review; always verify the import is only retained if still needed by authenticated methods in the same file
- The bug only manifests intermittently (during token refresh windows), making it easy to overlook in manual testing — always audit service files at PR time for this pattern mismatch
