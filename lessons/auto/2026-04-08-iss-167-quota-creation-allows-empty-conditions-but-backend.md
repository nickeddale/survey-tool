---
date: "2026-04-08"
ticket_id: "ISS-167"
ticket_title: "Quota creation allows empty conditions but backend rejects them"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-167"
ticket_title: "Quota creation allows empty conditions but backend rejects them"
categories: ["frontend-validation", "pydantic", "ux", "error-handling"]
outcome: "success"
complexity: "low"
files_modified:
  - frontend/src/components/quotas/QuotaForm.tsx
  - frontend/src/components/quotas/ConditionBuilder.tsx
  - backend/app/schemas/quota.py
  - backend/tests/test_quotas.py
  - frontend/src/components/quotas/__tests__/QuotaForm.test.tsx
  - frontend/src/pages/__tests__/QuotasPage.test.tsx
---

# Lessons Learned: Quota creation allows empty conditions but backend rejects them

## What Worked Well
- The fix was cleanly split between frontend validation (block submission early, show inline error) and backend improvement (better error message), keeping responsibilities clear
- Adding frontend validation as a local state variable (`conditionsError`) set before the API call guard was straightforward and consistent with the pattern used in other forms
- The empty-state message update in ConditionBuilder.tsx was a one-line change that removed false user expectations without requiring structural refactoring

## What Was Challenging
- The ticket description said the backend returned a "400 error" but FastAPI's Pydantic validators return 422 (RequestValidationError) — this required confirming the actual status code before writing backend tests rather than trusting the ticket
- Needed to verify whether the existing Pydantic v2 validator already surfaced field-level detail in the 422 response body before deciding whether to rewrite it — Pydantic v2 field validators raising ValueError do include the field path in `detail` automatically

## Key Technical Insights
1. FastAPI maps `RequestValidationError` (raised by Pydantic schema validation) to HTTP 422, not 400 — always assert 422 in backend tests for Pydantic field validation failures
2. Pydantic v2 `@field_validator` raising `ValueError` already includes the field path in the 422 `detail` array — you may only need to improve the message string rather than restructure the validator
3. Frontend empty-state UI copy that implies a state is valid (e.g., "No conditions — quota applies to all responses") creates misleading affordance; empty-state messages should never imply the state is submission-ready if the backend will reject it
4. Check any modified FastAPI router/schema file for `from __future__ import annotations` before adding `request: Request` parameters — this causes locally-defined Pydantic models to become unresolvable `ForwardRef`s, silently turning body params into query params and producing 400 errors

## Reusable Patterns
- **Frontend inline validation guard**: Set a local error state variable (e.g., `conditionsError`) before the API call, return early if invalid, clear it on successful submit — do not rely on API error responses for field-level frontend UX
- **Backend 422 assertion**: All backend tests for Pydantic schema validation failures should assert `status_code == 422` and check `response.json()["detail"]` for field path context
- **Empty-state copy audit**: When an empty state is shown in a form, verify whether that empty state is actually submittable — if not, the copy must communicate the constraint, not normalize the empty state

## Files to Review for Similar Tasks
- `backend/app/schemas/quota.py` — Pydantic v2 field validator pattern with `@field_validator`
- `frontend/src/components/quotas/QuotaForm.tsx` — inline validation state pattern before API call
- `frontend/src/components/quotas/ConditionBuilder.tsx` — empty-state message conventions
- `backend/tests/test_quotas.py` — function-scoped async fixture pattern for quota endpoint tests
- `frontend/src/components/quotas/__tests__/QuotaForm.test.tsx` — Vitest pattern for asserting validation errors without API calls

## Gotchas and Pitfalls
- Ticket descriptions may report "400" when the actual FastAPI response is 422 — always read the code and confirm before writing test assertions
- Do not add `from __future__ import annotations` to FastAPI router files that handle request bodies — it breaks Pydantic model resolution at runtime
- Pydantic v2 validators already emit field paths in 422 responses — read the actual error shape before deciding the backend needs structural changes, as the message string alone may be sufficient
- Empty conditions in quota creation is a UX disconnect issue, not a missing feature — the backend constraint was intentional; the fix is frontend enforcement, not backend relaxation
```
