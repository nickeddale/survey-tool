---
date: "2026-04-08"
ticket_id: "ISS-183"
ticket_title: "ISS-178 regression: builder page still redirects away after ~30 seconds"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-183"
ticket_title: "ISS-178 regression: builder page still redirects away after ~30 seconds"
categories: ["auth", "frontend", "jwt", "rate-limiting", "spa-routing"]
outcome: "success"
complexity: "medium"
files_modified: ["frontend/src/services/apiClient.ts", "frontend/src/store/authStore.ts", "frontend/src/utils/jwt.ts"]
---

# Lessons Learned: ISS-178 regression: builder page still redirects away after ~30 seconds

## What Worked Well
- Tracing the redirect to a single root cause: `redirectToLogin()` in the proactive refresh catch block, distinct from the ISS-178 reactive fix
- Using a module-level cooldown timestamp (`proactiveRefreshCooldownUntil`) to throttle proactive refresh retries without touching localStorage
- Keeping `redirectToLogin()` as a single authoritative call site in the response interceptor's 401 handler — the request interceptor clears tokens silently
- The `isRefreshing` flag + `failedQueue` pattern correctly serialized concurrent inflight requests during the refresh cycle

## What Was Challenging
- Distinguishing the proactive refresh failure path (request interceptor) from the reactive 429 path (response interceptor) — both affected the builder, but required separate fixes
- Backend 401 responses have two shapes (plain string `detail` vs structured `{code, message}` object), requiring a `typeof` guard before accessing `.code`
- Determining whether backend token rotation occurs on receipt vs on success before safely adding 429 retry logic to `authStore.initialize()`
- The silent hang symptom when `isRefreshing` is left `true` after a failed proactive refresh — all subsequent requests queue indefinitely with no visible error

## Key Technical Insights
1. **Proactive refresh ≠ reactive refresh**: ISS-178 fixed the response interceptor (reactive 429s after a request); ISS-183's root cause was the request interceptor's proactive refresh catch block calling `redirectToLogin()` on any failure including 429. These are separate code paths requiring separate fixes.
2. **Single redirect authority**: only the response interceptor's 401 handler should call `redirectToLogin()`. The request interceptor should clear tokens and drain the queue silently, letting a subsequent real 401 trigger navigation.
3. **isRefreshing flag MUST be reset in catch**: leaving it `true` after a failed proactive refresh causes all queued requests to hang indefinitely — a silent failure that manifests as UI freezing, not as a visible error or redirect.
4. **JWT base64url padding**: `isTokenExpiringSoon` silently returns `false` if `atob()` fails due to missing padding. Always pad before decoding: `base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')`.
5. **Module-level cooldown timestamp**: after a proactive refresh failure, set `proactiveRefreshCooldownUntil = Date.now() + cooldownMs` as a module-level variable. Skip proactive refresh if `Date.now() < proactiveRefreshCooldownUntil`. Do NOT use localStorage/sessionStorage — module-level is cleared on page reload as intended.
6. **429 retry is only safe if backend does not rotate on receipt**: verify backend token rotation timing before adding retry to `authStore.initialize()`. If rotation happens before rate-limiting fires, a retry call will fail with 401 (token already consumed).
7. **Threshold reduction reduces refresh storm**: lowering `isTokenExpiringSoon` from 60s to ~30s reduces the window during which every request triggers a proactive refresh attempt, directly reducing rate-limit pressure.

## Reusable Patterns
- **isRefreshing + failedQueue**: set `isRefreshing = true` before first refresh, push `{resolve, reject}` for concurrent requests, drain queue on success, reject all + reset flag in `finally` or explicit `catch`.
- **Silent proactive failure**: `catch` block in proactive refresh path calls `clearTokens()`, drains queue with rejections, resets `isRefreshing = false`, sets cooldown timestamp — no `redirectToLogin()`.
- **429 Retry-After**: parse `Retry-After` header as integer seconds (cap at 60s), `await sleep(retryAfter * 1000)`, retry once. If still 429, treat as auth failure and clear tokens.
- **401 shape guard**: `typeof error.response?.data?.detail === 'object'` before accessing `.code` or `.message`.
- **MSW test shape**: 429 mock handlers must return `{detail: {code: 'RATE_LIMITED', message: '...'}}` — not `{message: '...'}` — to match real backend shape. Use `onUnhandledRequest: 'error'` to catch missing handlers.

## Files to Review for Similar Tasks
- `frontend/src/services/apiClient.ts` — request interceptor (proactive refresh), response interceptor (reactive 401/429), isRefreshing flag, failedQueue, cooldown timestamp
- `frontend/src/store/authStore.ts` — `initialize()` method, refreshToken call, 429-aware retry logic, clearTokens
- `frontend/src/utils/jwt.ts` — `isTokenExpiringSoon`, base64url padding, expiry threshold constant
- `frontend/src/contexts/AuthContext.tsx` — how auth state changes propagate to router
- `frontend/src/components/ProtectedRoute.tsx` — how `isAuthenticated` state triggers navigation
- `frontend/src/services/__tests__/apiClientProactiveRefresh.test.ts` — test coverage for proactive refresh 429 + no-redirect assertion

## Gotchas and Pitfalls
- **Do not call `redirectToLogin()` in the request interceptor catch block** — this was the exact root cause of ISS-183 and a regression from ISS-178.
- **Do not store cooldown in localStorage/sessionStorage** — localStorage survives page reload (unintended persistence), sessionStorage is cleared on tab close (inconsistent). Module-level variable is correct.
- **Do not retry `/auth/refresh` without verifying backend rotation semantics** — a second attempt after a destructive rotation returns 401 and silently logs the user out.
- **Do not skip `isRefreshing = false` reset in catch** — silent indefinite queue hang is harder to debug than a redirect.
- **Do not assume uniform 401 shape** — FastAPI middleware defaults return plain string `detail`, custom error handlers return structured objects. Always guard with `typeof`.
- **Do not reduce `isTokenExpiringSoon` threshold without verifying base64url padding** — a silent decode failure makes the check always return `false`, so the threshold change has no effect and the problem appears unchanged.
```
