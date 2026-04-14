---
date: "2026-04-14"
ticket_id: "ISS-240"
ticket_title: "Email invitations: Frontend API URL path mismatch causes all calls to 404"
categories: ["testing", "api", "ui", "bug-fix", "feature"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-14"
ticket_id: "ISS-240"
ticket_title: "Email invitations: Frontend API URL path mismatch causes all calls to 404"
categories: ["api", "frontend", "bug-fix", "url-routing"]
outcome: "success"
complexity: "low"
files_modified:
  - frontend/src/services/emailInvitationService.ts
  - frontend/src/mocks/handlers.ts
  - frontend/src/services/__tests__/emailInvitationService.test.ts
---

# Lessons Learned: Email invitations: Frontend API URL path mismatch causes all calls to 404

## What Worked Well
- The root cause was immediately identifiable by comparing the frontend service URL construction against the backend router prefix
- The fix was mechanical and low-risk: a consistent string substitution across three files
- MSW mock handlers using the same incorrect paths meant tests were passing despite the bug, which made the scope of the fix clear and bounded

## What Was Challenging
- The bug was completely silent during development because MSW mocks mirrored the wrong frontend paths, so no test failures surfaced the mismatch
- The feature appeared to work in test environments but was entirely non-functional in production or against a real backend

## Key Technical Insights
1. Frontend service URL paths must be verified against the actual backend router prefix at integration time, not just assumed to match by convention
2. MSW handlers that mirror incorrect frontend paths provide a false sense of test coverage — they validate request/response shape but not URL correctness against the real API
3. Backend FastAPI routers using hyphenated resource names (e.g., `email-invitations`) while frontend developers default to non-hyphenated slugs (e.g., `invitations`) is a common divergence point

## Reusable Patterns
- When adding a new frontend service, cross-reference the backend router file directly to copy the exact route prefix string rather than inferring it from the resource name
- After writing MSW handlers, do a quick diff of handler URL patterns against backend router decorators to catch mismatches before they reach production
- Consider adding an integration smoke test or contract test that exercises real backend routes to catch URL mismatches that unit tests with mocks will never catch

## Files to Review for Similar Tasks
- `backend/app/api/email_invitations.py` — source of truth for route prefixes
- `frontend/src/services/emailInvitationService.ts` — all URL construction for this resource
- `frontend/src/mocks/handlers.ts` — MSW patterns must stay in sync with service URLs
- `frontend/src/services/__tests__/emailInvitationService.test.ts` — hardcoded URL strings must match service and handler URLs

## Gotchas and Pitfalls
- FastAPI routers commonly use hyphenated slugs (`email-invitations`) while JavaScript developers tend to write camelCase or non-hyphenated resource names — always check the actual router file
- Tests passing with MSW does not guarantee the API paths are correct against the real backend; MSW intercepts at the network layer before any real HTTP request is made
- A global find-and-replace is required across service, mock handlers, and test files — missing any one of the three leaves inconsistencies that will cause failures or mask bugs
```
