---
date: "2026-04-11"
ticket_id: "ISS-218"
ticket_title: "Open Redirect / XSS via returnTo parameter on login page"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-218"
ticket_title: "Open Redirect / XSS via returnTo parameter on login page"
categories: ["security", "frontend", "input-validation", "xss", "open-redirect"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/pages/LoginPage.tsx"
  - "frontend/src/utils/validation.ts"
  - "frontend/src/utils/__tests__/validation.test.ts"
  - "frontend/src/pages/__tests__/LoginPage.test.tsx"
---

# Lessons Learned: Open Redirect / XSS via returnTo parameter on login page

## What Worked Well
- Centralizing the validation logic in a single `sanitizeReturnTo` utility function made it easy to apply consistently across both call sites in LoginPage.tsx and to test exhaustively in isolation
- The fix was minimal and surgical — two lines replaced in LoginPage.tsx, one new utility function — with no architectural changes required
- Existing test infrastructure (MemoryRouter, `renderLoginPage` helper, MSW server) required no modification; the new integration tests composed cleanly with the existing pattern
- Defining the fallback inside `sanitizeReturnTo` (rather than at each call site) eliminated the possibility of forgetting to apply the fallback at one location

## What Was Challenging
- The attack surface covers several distinct bypass vectors (absolute URL, protocol-relative `//`, `javascript:`, `data:`) that each require their own test case; easy to miss one without a systematic checklist
- `decodeURIComponent` must be called before validation, not after — attackers can encode the colon or slashes to bypass naive prefix checks on the raw query string value

## Key Technical Insights
1. A safe internal-only redirect must satisfy two independent conditions: (a) the value starts with exactly one `/` (ruling out protocol-relative `//evil.com`), and (b) no `:` appears before the first `/` (ruling out `javascript:`, `https:`, `data:`, etc.). Neither condition alone is sufficient.
2. Protocol-relative URLs (`//evil.com`) start with `/` so a simple `startsWith('/')` check is not enough — the check must be `startsWith('/') && !startsWith('//')`.
3. Always decode the parameter with `decodeURIComponent` before validating — percent-encoded payloads like `javascript%3Aalert(1)` would bypass validation performed on the raw string.
4. A fallback to a known-safe destination (`/dashboard`) is preferable to returning an error; it degrades gracefully for malformed or expired links without blocking the user after a successful login.
5. `navigate()` in React Router will follow `javascript:` URIs in some browser/version combinations, making this a genuine XSS vector rather than just a UX issue.

## Reusable Patterns
- **`sanitizeReturnTo(value: string | null): string`** — validate redirect targets to internal paths only. Reuse this anywhere a `returnTo`, `redirect`, `next`, or `callback` query parameter is consumed.
- General rule for redirect validation: decode first, then assert `startsWith('/') && !startsWith('//') && !includes(':')` (or no `:` before first `/`).
- Place URL/redirect utilities in `frontend/src/utils/validation.ts` alongside other input-validation helpers so they are discovered and reused rather than duplicated inline.

## Files to Review for Similar Tasks
- `frontend/src/pages/LoginPage.tsx` — reference for how `sanitizeReturnTo` is imported and applied at both `handleSubmit` and `DevLoginPanel` call sites
- `frontend/src/utils/validation.ts` — contains `sanitizeReturnTo`; extend here for any future redirect-safety helpers
- `frontend/src/utils/__tests__/validation.test.ts` — exhaustive unit tests for all attack vectors; use as a checklist template for any new redirect-handling code
- `frontend/src/pages/__tests__/LoginPage.test.tsx` — integration tests using MemoryRouter and encoded `returnTo` params; reference pattern for testing query-param-driven navigation

## Gotchas and Pitfalls
- **Validate after decoding**: always call `decodeURIComponent` before the safety check, otherwise percent-encoded variants bypass the guard
- **`startsWith('/')` is not sufficient**: `//evil.com` passes that check; explicitly reject values that start with `//`
- **Both call sites must be patched**: LoginPage had two independent `navigate(returnTo ...)` usages (main login handler and the dev panel shortcut); missing one leaves a bypass
- **Do not use a blocklist**: trying to block known bad prefixes (`javascript:`, `https:`, `http:`) is fragile — use an allowlist approach (must start with single `/`)
- **Empty string is invalid**: an empty `returnTo` should fall back to `/dashboard`, not result in a navigate to the empty string (which some routers interpret as the current URL or root)
```
