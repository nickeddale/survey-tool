---
date: "2026-04-02"
ticket_id: "ISS-050"
ticket_title: "2.7-fix: Add returnTo URL preservation to ProtectedRoute"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-050"
ticket_title: "2.7-fix: Add returnTo URL preservation to ProtectedRoute"
categories: ["react-router", "authentication", "frontend", "ux"]
outcome: "success"
complexity: "low"
files_modified:
  - frontend/src/components/ProtectedRoute.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/components/__tests__/ProtectedRoute.test.tsx
  - frontend/src/pages/__tests__/LoginPage.test.tsx
---

# Lessons Learned: 2.7-fix: Add returnTo URL preservation to ProtectedRoute

## What Worked Well
- The scope was well-defined and contained to exactly four files with clear responsibilities
- Using query params (`?returnTo=`) rather than React Router state keeps the redirect URL shareable and bookmarkable
- Encoding the full `pathname + search` (not just `pathname`) ensures existing query strings on the original URL are preserved
- Updating tests in the same PR as the implementation kept coverage honest

## What Was Challenging
- Test setup requires routes for redirect targets to be present in the test `Routes` tree; missing routes silently succeed without rendering the expected path, making assertions misleading
- `useSearchParams` must be consumed inside a component rendered within a `MemoryRouter` — forgetting this causes hook errors in tests
- Verifying the encoded `returnTo` value in tests requires awareness of `encodeURIComponent` output (e.g., `/surveys/123` → `%2Fsurveys%2F123`)

## Key Technical Insights
1. `useLocation()` returns both `pathname` and `search`; concatenating them (`location.pathname + location.search`) before encoding preserves the full URL including any existing query string on the protected page.
2. `useSearchParams()` is the idiomatic React Router v6 way to read query params; `new URLSearchParams(window.location.search)` works but bypasses the router abstraction.
3. The `<Navigate>` component in ProtectedRoute should use `replace: true` so the `/login?returnTo=...` entry does not pollute the browser history stack — pressing Back after login goes to the page before the protected route, not back to the login page.
4. The `returnTo` value must be validated or sanitised before use to prevent open-redirect attacks; restricting to relative paths (i.e., paths starting with `/` and not `//`) is sufficient.

## Reusable Patterns
- **ProtectedRoute redirect pattern**: `<Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />`
- **LoginPage consume pattern**: `const [searchParams] = useSearchParams(); const returnTo = searchParams.get('returnTo') ?? '/dashboard'; navigate(returnTo, { replace: true });`
- **Test helper**: pass `initialEntries={['/login?returnTo=%2Fsurveys%2F123']}` to `MemoryRouter` to simulate an authenticated redirect
- **Safety check**: `const safePath = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';`

## Files to Review for Similar Tasks
- `frontend/src/components/ProtectedRoute.tsx` — canonical example of redirect-with-returnTo
- `frontend/src/pages/LoginPage.tsx` — canonical example of consuming and validating returnTo after auth
- `frontend/src/components/__tests__/ProtectedRoute.test.tsx` — test patterns for encoded query params in redirect URLs
- `frontend/src/pages/__tests__/LoginPage.test.tsx` — test patterns for `MemoryRouter` + `initialEntries` with query params

## Gotchas and Pitfalls
- Forgetting `replace: true` on both the ProtectedRoute redirect and the post-login navigate creates double history entries and confuses the Back button
- Using only `location.pathname` silently drops query strings on the originally requested URL
- In tests, omitting a route for the returnTo target (e.g., `/surveys/123`) means the router renders nothing and the location assertion may still pass even if navigation logic is wrong — always add the target route
- An empty or missing `returnTo` param should default gracefully; `?? '/dashboard'` is safer than `|| '/dashboard'` because an empty string is falsy but `??` only catches `null`/`undefined`
- Open-redirect risk: never navigate to an absolute URL from `returnTo`; validate that the value is a relative path before use
```
