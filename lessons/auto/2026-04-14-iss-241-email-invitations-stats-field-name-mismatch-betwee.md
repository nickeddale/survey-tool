---
date: "2026-04-14"
ticket_id: "ISS-241"
ticket_title: "Email invitations: Stats field name mismatch between backend and frontend"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-14"
ticket_id: "ISS-241"
ticket_title: "Email invitations: Stats field name mismatch between backend and frontend"
categories: ["api-contract", "typescript", "frontend", "bug-fix"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/types/survey.ts"
  - "frontend/src/components/email-invitations/EmailStatsCards.tsx"
  - "frontend/src/mocks/handlers.ts"
  - "frontend/src/services/__tests__/emailInvitationService.test.ts"
---

# Lessons Learned: Email invitations: Stats field name mismatch between backend and frontend

## What Worked Well
- The fix was straightforward: updating the frontend TypeScript interface to match the backend's actual response shape rather than the other way around, since the backend naming (`sent`, `delivered`, `bounced`, `failed`) is cleaner and avoids a redundant `total_` prefix.
- The MSW mock handler in `handlers.ts` was already returning the correct (`sent`, `delivered`, `bounced`, `failed`) field names, which meant it was modelling the real backend correctly even while the TypeScript type was wrong. This helped confirm the right direction for the fix.
- The component (`EmailStatsCards.tsx`) was a pure presentational component with no logic, making the field-name change trivial and low-risk.

## What Was Challenging
- The mismatch was entirely silent at runtime — TypeScript would not have caught it because both sides used `number` types; the fields simply resolved to `undefined` and displayed as 0 or blank, with no console error.
- The divergence had apparently existed since the feature was first written, suggesting the frontend type was defined speculatively (or from an outdated spec) without being validated against a real API response.

## Key Technical Insights
1. TypeScript interfaces for API responses only provide compile-time safety when the field names actually match. A mismatch between `total_sent: number` and an API returning `sent` will type-check cleanly and fail silently at runtime.
2. The MSW mock handler was the ground truth that reflected real backend behavior — when the mock and the TypeScript type disagree, the mock is usually right (since it was written to match observable API behavior).
3. Prefer aligning the frontend type to the backend response over adding a backend Pydantic alias, unless there is a strong REST naming convention reason. Adding `total_` prefixes to already-unambiguous flat fields adds noise without benefit.
4. The `open_rate` and `click_rate` fields were correctly named in both places, which confirms the mismatch was limited to the four delivery-status counters and introduced during initial type authoring.

## Reusable Patterns
- When stats or metrics cards show all zeros unexpectedly, check for API contract field-name mismatches before assuming a data or calculation bug.
- Always verify a new TypeScript interface against an actual API call (or the MSW mock) before shipping — a one-line `console.log(response.data)` during development would have caught this immediately.
- For endpoints that return flat stats objects (no Pydantic schema enforced), the MSW handler is the de-facto contract document and should be treated as authoritative when there is a disagreement.

## Files to Review for Similar Tasks
- `frontend/src/types/survey.ts` — all API response interfaces; audit any `total_` prefixed fields against actual backend responses.
- `frontend/src/mocks/handlers.ts` — the stats mock handler at line ~1630 is the reference for the correct stats shape.
- `backend/app/services/email_invitation_service.py` lines 329–340 — the dict returned by the stats function is the canonical field list.
- `backend/app/api/email_invitations.py` — no Pydantic response schema for the stats endpoint means the dict keys are the only contract; a schema would prevent future drift.

## Gotchas and Pitfalls
- TypeScript does not catch extra or missing keys on plain `number` fields when both sides compile successfully — use `exactOptionalPropertyTypes` or runtime validation (e.g., Zod) for API boundaries if drift is a recurring problem.
- The absence of a Pydantic response schema on the backend stats endpoint means there is no single authoritative schema file to check; adding one (`EmailInvitationStatsResponse`) would make future mismatches immediately visible via OpenAPI docs or schema generation.
- Renaming fields in one layer without a coordinated search across the other layer (types, components, mocks, tests) risks leaving stale references — always grep for all occurrences of the old field name before closing the ticket.
```
