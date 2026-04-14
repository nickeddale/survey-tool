---
date: "2026-04-14"
ticket_id: "ISS-242"
ticket_title: "Email invitations: Pagination field name mismatch - pages vs total_pages"
categories: ["frontend", "api-contract", "pagination", "bug-fix"]
outcome: "success"
complexity: "low"
files_modified: []
---

# Lessons Learned: Email invitations: Pagination field name mismatch - pages vs total_pages

## What Worked Well
- The backend schema (`EmailInvitationListResponse` in `schemas/email_invitation.py:47`) was already correct and consistent with the rest of the backend — using `pages` for total page count across all paginated schemas.
- The TypeScript type definition in `frontend/src/types/survey.ts` (`EmailInvitationListResponse` at line 573) was also already correct, defining `pages: number`.
- The fix required only changing the frontend page component to read `data.pages` instead of `data.total_pages`, which was a one-line change.
- The mismatch was isolated: only `EmailInvitationsPage.tsx` was reading the wrong field name; the type definition and service tests already used the correct field.

## What Was Challenging
- The bug was invisible at low data volumes: pagination only breaks when there are enough records to span multiple pages, so it could pass casual manual testing.
- `total_pages` is a plausible and readable field name (used by some other paginated schemas in the project, e.g. `QuotaListResponse` at line 77), making the bug non-obvious without explicitly cross-referencing the backend schema.

## Key Technical Insights
1. The project has two different pagination field naming conventions in use: some schemas use `pages` (backend standard used in `EmailInvitationListResponse`, `ParticipantListResponse`, etc.) and some use `total_pages`. When wiring up a new paginated endpoint, always verify which convention the backend schema uses rather than assuming.
2. TypeScript type correctness does not guarantee runtime correctness — the type (`pages: number`) was correct but the consuming code read a different key (`total_pages`), which TypeScript did not catch because `data.total_pages` would evaluate to `undefined` (not a type error on a loosely typed access or if the type wasn't enforced at the read site).
3. When pagination silently shows "Page 1 of 1" with no error, the first thing to check is the field name for total page count in the API response.

## Reusable Patterns
- Always verify backend schema field names against the TypeScript interface AND the consuming component when implementing pagination — three separate places can independently diverge.
- For `PaginatedListResponse`-style types in this project: backend uses `pages` (not `total_pages`) for the `EmailInvitation` and `Participant` resources. Check other resources individually.
- When a UI shows pagination stuck at "1 of 1", inspect the network response and compare field names to what the component reads — this is a classic contract mismatch symptom.

## Files to Review for Similar Tasks
- `backend/app/schemas/email_invitation.py` — source of truth for pagination field names in the backend schema
- `frontend/src/types/survey.ts` — TypeScript interfaces; confirm `pages` vs `total_pages` per resource
- `frontend/src/pages/EmailInvitationsPage.tsx` — the consuming component; check where `setTotalPages` is called and what field it reads
- `frontend/src/mocks/handlers.ts` — MSW mock responses must also use the correct field names for tests to be meaningful

## Gotchas and Pitfalls
- The inconsistency between `pages` and `total_pages` exists within the same codebase — different paginated resources use different conventions. Do not assume either name is universal.
- Reading `data.total_pages` when the backend returns `data.pages` silently yields `undefined`, which JavaScript coerces to `NaN` or falsy depending on context; `Math.max(1, undefined)` returns `1`, masking the bug entirely rather than throwing an error.
- Frontend tests and MSW mocks that use hardcoded `pages: 1` will pass even when the component reads the wrong field, because `Math.max(1, undefined) === 1` matches `Math.max(1, 1) === 1`. Tests must include multi-page scenarios to catch this class of bug.