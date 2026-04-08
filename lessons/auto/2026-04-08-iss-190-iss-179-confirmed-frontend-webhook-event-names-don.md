---
date: "2026-04-08"
ticket_id: "ISS-190"
ticket_title: "ISS-179 confirmed: frontend webhook event names don't match backend valid events"
categories: ["testing", "api", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-190"
ticket_title: "ISS-179 confirmed: frontend webhook event names don't match backend valid events"
categories: ["frontend", "webhooks", "api-contract", "typescript"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/types/survey.ts"
  - "frontend/src/components/webhooks/WebhookForm.tsx"
  - "frontend/src/components/webhooks/__tests__/WebhookForm.test.tsx"
---

# Lessons Learned: ISS-179 confirmed: frontend webhook event names don't match backend valid events

## What Worked Well
- The fix was straightforward once the mismatch was identified: a direct string substitution in the frontend constants and types
- The TypeScript union type in `survey.ts` provided a single source of truth for valid event names on the frontend, making the change easy to propagate
- Colocated tests in `__tests__/WebhookForm.test.tsx` made it immediately clear which test fixtures needed updating alongside the implementation

## What Was Challenging
- The bug was silent at the UI level — the form rendered correctly with the wrong event names, and the error only surfaced at submission time as a backend 400 response
- The mismatch between intuitive names (`response.created`) and actual backend event names (`response.started`) is easy to introduce and hard to spot in review

## Key Technical Insights
1. Frontend EVENT_OPTIONS must be kept in sync with backend `VALID_EVENTS` — there is no runtime enforcement of this contract until a form is submitted
2. `response.updated` had no direct backend equivalent; it was replaced with `quota.reached`, which changes the semantics — not just a rename but a deliberate substitution requiring product awareness
3. TypeScript union types for event names (`WebhookEvent`) are only as correct as the strings they enumerate; they provide compile-time safety within the frontend but cannot validate against the backend schema

## Reusable Patterns
- When a frontend dropdown or checkbox list maps to a backend enum/constant, define the allowed values in one place (ideally generated from the backend or explicitly documented) and reference that definition in tests
- Test fixtures for form components should use values drawn from the same constants used in the component, not hardcoded literals, to avoid drift

## Files to Review for Similar Tasks
- `frontend/src/types/survey.ts` — WebhookEvent union type; update here first when backend events change
- `frontend/src/components/webhooks/WebhookForm.tsx` — EVENT_OPTIONS constant; must mirror backend VALID_EVENTS
- `frontend/src/components/webhooks/__tests__/WebhookForm.test.tsx` — test fixtures for webhook events
- Backend source defining `VALID_EVENTS` (webhook service/router) — the authoritative list

## Gotchas and Pitfalls
- Adding a new event option to the backend `VALID_EVENTS` does not automatically surface in the frontend; the frontend EVENT_OPTIONS and WebhookEvent type must be updated manually
- Renaming an event on the backend (e.g., `response.created` → `response.started`) will silently break existing frontend submissions — consider adding a backend compatibility layer or deprecation warning during transitions
- Mock webhook objects in tests (e.g., `mockSurveyWebhook.events`) must be updated whenever event names change, or tests will pass while exercising invalid data
```
