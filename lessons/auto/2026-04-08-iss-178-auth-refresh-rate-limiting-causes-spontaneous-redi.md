---
date: "2026-04-08"
ticket_id: "ISS-178"
ticket_title: "Auth refresh rate limiting causes spontaneous redirects on protected pages"
categories: ["testing", "api", "ui", "bug-fix", "feature", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-178"
ticket_title: "Auth refresh rate limiting causes spontaneous redirects on protected pages"
categories: ["frontend", "auth", "rate-limiting", "interceptors"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/services/apiClient.ts
  - frontend/src/services/__tests__/apiClient.test.ts
---

# Lessons Learned: Auth refresh rate limiting causes spontaneous redirects on protected pages

## What Worked Well
- The existing interceptor architecture (isRefreshing flag + request queue) provided a clean hook point to insert 429-specific logic without restructuring
- Parsing the `Retry-After` header with a sensible default (5s) covered both RFC-compliant servers and misconfigured ones
- Scoping the 429 retry logic specifically to `/auth/refresh` kept non-auth endpoints unaffected and avoided unintended side effects

## What Was Challenging
- Differentiating a rate-limit failure from a true auth failure required threading error type information through the promise rejection chain so the outer interceptor could make the right redirect decision
- The `isRefreshing` flag needed careful handling during the retry delay window — a second request arriving mid-delay should join the queue rather than trigger a second refresh attempt
- Testing async delay logic (Retry-After) with fake timers in Vitest required coordinating `vi.useFakeTimers` with promise resolution order

## Key Technical Insights
1. **429 ≠ 401**: A rate-limited refresh endpoint does not mean the user is unauthenticated. Treating them identically is the root cause — rate limits are transient, auth failures are not.
2. **Retry-After header**: RFC 7231 allows this as either a delay-seconds integer or an HTTP-date. Robust implementations should handle both; defaulting to a fixed backoff (5s) is acceptable when absent.
3. **Queue flushing on 429**: When a 429 occurs and a retry is scheduled, the queued requests should be held (not rejected) until the retry resolves or permanently fails. Premature queue rejection causes cascading request failures.
4. **No redirect on 429 retry failure**: If the retry also returns 429, the correct behavior is to reject the pending requests with an `ApiError` and let callers handle it — not to call `redirectToLogin`, which would destroy unsaved user work.

## Reusable Patterns
- **Rate-limit-aware refresh interceptor**: Check `error.response?.status === 429 && isRefreshEndpoint(config.url)` before the 401 branch; delay via `setTimeout` wrapped in a `Promise`, then retry once before giving up.
- **Retry-After parsing utility**: `const retryAfter = parseInt(response.headers['retry-after'] ?? '5', 10) * 1000` — reusable for any endpoint that needs backoff respect.
- **Distinguishing transient vs permanent auth errors**: Attach a `isRateLimit: true` flag to the rejected error object so upstream consumers (stores, components) can show "please wait" UI instead of forcing re-login.

## Files to Review for Similar Tasks
- `frontend/src/services/apiClient.ts` — interceptor logic, `isRefreshing` flag, request queue, `performRefresh`, `redirectToLogin`
- `frontend/src/services/__tests__/apiClient.test.ts` — patterns for mocking axios responses, testing interceptor branches, fake timer usage
- `frontend/src/store/authStore.ts` — how auth state reacts to refresh failures; may need updates if `isRateLimit` errors need to surface in UI

## Gotchas and Pitfalls
- **Do not call `redirectToLogin` on 429**: This is the original bug. Any future modification to the refresh error path must preserve the 429 guard.
- **isRefreshing flag during delay**: If the retry is sleeping, `isRefreshing` should remain `true` so concurrent requests queue correctly instead of attempting independent refreshes.
- **Fake timers + async interceptors**: `vi.useFakeTimers` / `vi.runAllTimersAsync()` must be called after the intercepted request is in-flight but before awaiting the result — ordering matters or the delay never resolves in tests.
- **Retry-After as HTTP-date**: Some servers send a date string instead of seconds. If this matters, add a branch: `isNaN(delay) ? new Date(header).getTime() - Date.now() : delay * 1000`.
- **ISS-174 coupling**: The underlying frequency of refresh attempts is elevated due to `cookie_secure` preventing refresh token persistence. ISS-178 is a mitigation; fully resolving the refresh storm requires also resolving ISS-174.
```
