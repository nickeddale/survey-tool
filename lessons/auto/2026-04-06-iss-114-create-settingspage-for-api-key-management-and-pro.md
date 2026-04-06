---
date: "2026-04-06"
ticket_id: "ISS-114"
ticket_title: "Create SettingsPage for API key management and profile editing"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-114"
ticket_title: "Create SettingsPage for API key management and profile editing"
categories: ["frontend", "authentication", "api-keys", "react", "settings-ui"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/types/auth.ts
  - frontend/src/services/apiKeyService.ts
  - frontend/src/pages/SettingsPage.tsx
  - frontend/src/App.tsx
  - frontend/src/components/AppLayout.tsx
  - frontend/src/pages/__tests__/SettingsPage.test.tsx
---

# Lessons Learned: Create SettingsPage for API key management and profile editing

## What Worked Well
- Reading `backend/app/api/auth.py` before writing `apiKeyService.ts` confirmed the exact endpoint paths and prevented mismatches between ticket description (`/api/v1/auth/api-keys`) and plan steps (`/auth/keys`)
- Reading existing service files and `authStore` before writing new code allowed the service class pattern, auth token injection, and error handling conventions to be copied verbatim without guessing
- Reading `AppLayout.tsx` and `App.tsx` in full before modifying them preserved existing NavLink patterns, mobile overlay state, and ProtectedRoute structure without regressions
- Separating `ApiKeyCreateResponse` (contains `key` field) from `ApiKeyResponse` (contains only `key_prefix`) at the TypeScript type layer enforced the show-once contract before runtime
- Storing the newly-created full API key exclusively in transient component state prevented accidental persistence to authStore or localStorage

## What Was Challenging
- The ticket description and implementation plan referenced different endpoint paths (`/api/v1/auth/api-keys` vs `/auth/keys`) — this ambiguity required reading the backend router directly rather than trusting either source
- Determining whether an axios interceptor transforms snake_case responses to camelCase required explicit verification before choosing field names in MSW mock handlers
- Profile update field names (`name`, `email`, `password`) had to be confirmed against the backend `UserUpdate` schema rather than assumed — schema field naming is not always predictable from context

## Key Technical Insights
1. The backend never returns the full API key after the initial POST response. The GET list endpoint returns only `key_prefix`. Any UI that attempts to re-fetch or reconstruct the full key after creation will fail silently — the show-once display must source the key exclusively from the POST response body and hold it in ephemeral component state.
2. `ApiKeyResponse` field names from the backend are snake_case: `id`, `name`, `key_prefix`, `scopes`, `is_active`, `last_used_at`, `expires_at`, `created_at`. `ApiKeyCreateResponse` adds a `key` field. TypeScript type mismatches against these names cause silent `undefined` rendering with no runtime errors.
3. MSW mock handler field names must match what the frontend actually receives after any axios transform interceptors. If the app has a camelCase transform interceptor, MSW handlers should return camelCase; if not, use snake_case matching the backend exactly.
4. The ProtectedRoute + AppLayout route wrapping pattern in `App.tsx` must be preserved exactly when adding new routes — adding a route outside this block silently bypasses authentication.
5. Both desktop sidebar and mobile overlay in `AppLayout.tsx` must be updated simultaneously when adding a new NavLink — omitting one leaves the nav item missing on that viewport.

## Reusable Patterns
- **Show-once secret display**: Store secret in `useState`, render in a dismissable alert/modal, clear state on close. Never write to any persistent store. Include a copy-to-clipboard button since the user cannot retrieve it again.
- **Separate create vs list response types**: Define `ApiKeyCreateResponse` extending `ApiKeyResponse` with an added `key` field. Use `ApiKeyResponse` for list items. This makes the show-once contract visible and compiler-enforced.
- **Explicit absence assertion in tests**: In the API keys list test, assert that list item elements do NOT contain the full key string — only `key_prefix`. This mirrors the backend pattern and catches accidental key exposure in list rendering.
- **Read before modify**: For any file that wires routes or navigation (`App.tsx`, `AppLayout.tsx`), always read the full file before editing. These files accumulate stateful patterns (mobile overlay toggles, nested route guards) that are easy to break by partial reading.
- **Service class pattern**: Copy the existing service class structure (base URL from config, Authorization header from token store, axios instance) verbatim from an existing service file rather than reconstructing it from memory.

## Files to Review for Similar Tasks
- `frontend/src/services/apiKeyService.ts` — canonical example of API key service class with list/create/revoke methods
- `frontend/src/pages/SettingsPage.tsx` — reference for tabbed settings layout, show-once key display, and profile update form patterns
- `frontend/src/types/auth.ts` — shows how to separate create-response types (with secret field) from list-response types (without secret field)
- `frontend/src/components/AppLayout.tsx` — shows the exact NavLink pattern for both desktop sidebar and mobile overlay
- `frontend/src/App.tsx` — shows how to add a route inside the ProtectedRoute + AppLayout block correctly
- `backend/app/api/auth.py` — source of truth for endpoint paths, HTTP methods, and response schema field names

## Gotchas and Pitfalls
- **Endpoint path ambiguity**: Ticket descriptions and implementation plan steps may reference different paths for the same endpoint. Always read the backend router file as the authoritative source before writing frontend service methods.
- **Silent undefined from field name mismatch**: If TypeScript types use camelCase but the backend (and MSW mocks) return snake_case, components render `undefined` silently. Verify whether an axios response interceptor transforms field names before deciding which casing to use in types and mocks.
- **One-time key loss**: If component state holding the full API key is cleared prematurely (tab switch, unmount, accidental re-render resetting state), the user permanently loses access to the key. Use a stable state location (not derived/computed) and only clear it on explicit user dismissal.
- **Mobile nav omission**: `AppLayout.tsx` maintains separate desktop sidebar and mobile overlay nav sections. Adding a NavLink to only one section leaves a missing nav item on the other viewport — always update both simultaneously.
- **Profile field name assumptions**: `UserUpdate` schema field names must be read from the backend schema definition. Common mismatches include `full_name` vs `name`, `new_password` vs `password`, and nested vs flat structures for password change.
- **MSW snake_case vs camelCase in tests**: If the app has no axios transform interceptor, MSW handlers must return snake_case field names matching the backend exactly. Returning camelCase in mocks while the real backend returns snake_case creates tests that pass but do not reflect production behavior.
```
