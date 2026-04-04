---
date: "2026-04-04"
ticket_id: "ISS-104"
ticket_title: "7.9: Frontend — Participant Management UI"
categories: ["frontend", "react", "typescript", "msw", "vitest"]
outcome: "success"
complexity: "high"
files_modified: []
---

# Lessons Learned: 7.9: Frontend — Participant Management UI

## What Worked Well
- Following the established QuotasPage/WebhooksPage patterns kept the implementation consistent and predictable — component structure, service layer shape, and test setup required minimal deviation
- Separating concerns cleanly: service layer handles all API calls, page component manages state, sub-components are purely presentational
- MSW mock handlers with realistic mock data (two named participants with varied states) made tests expressive and easy to reason about
- Using a dedicated `ParticipantCreateResponse` type (extending `ParticipantResponse` with `token`) cleanly modeled the one-time token display requirement at the type level
- Breaking the UI into three focused sub-components (ParticipantTable, ParticipantForm, CsvImportDialog) kept ParticipantsPage manageable despite its 583-line complexity

## What Was Challenging
- ParticipantsPage accumulated significant local state: participants list, filter values, pagination, modal open/close flags, form state, delete target, import results — all colocated in one component. This is the natural cost of following the existing pattern, but it produces a wide component.
- The one-time token display requirement (show token immediately on creation, never again) required careful UX sequencing: create → receive token → show token modal → dismiss → re-fetch list with masked token. Any mismatch in this flow confuses the user.
- CSV batch import required client-side parsing, row preview, submission, and a results summary modal — effectively a multi-step sub-workflow embedded in the page.
- Masked token display (show only last 4 chars) is a purely cosmetic transform that must not alter the underlying data, requiring discipline to apply only at the render layer.

## Key Technical Insights
1. The `ParticipantCreateResponse` type extends `ParticipantResponse` with a `token: string` field — the token is present only in the creation response, never in list or get responses. Design types to reflect this distinction explicitly.
2. Token masking belongs in the render layer only. Store and pass the raw `ParticipantResponse` (no token) through state; apply the mask transform (`****${token.slice(-4)}`) exclusively in ParticipantTable's cell render.
3. For "token shown once" UX: open a dedicated token display modal immediately after `createParticipant` resolves, before re-fetching the list. Do not include the token in any other state slot that persists after modal close.
4. MSW handlers for paginated endpoints must inspect `searchParams` for `page`, `per_page`, `email`, `completed`, and `valid` and return correctly sliced and filtered mock data — otherwise filter/pagination tests will all pass trivially against unfiltered responses.
5. Batch import (`POST /participants/batch`) should return a results object summarising created count and per-row errors, not just a flat list. Design the `CsvImportDialog` to surface per-row errors in the results modal.
6. `attributes` is `Record<string, unknown> | null`. The dynamic key-value builder in ParticipantForm must serialize to this shape on submit and deserialize from it when pre-populating an edit form. Use an intermediate `{ key: string; value: string }[]` array as the form's internal representation.

## Reusable Patterns
- **Service layer shape**: `list(surveyId, params)`, `get(surveyId, id)`, `create(surveyId, payload)`, `createBatch(surveyId, payload)`, `update(surveyId, id, payload)`, `delete(surveyId, id)` — apply this signature to any survey-scoped resource service.
- **One-time secret display**: after creation, store the secret in a dedicated piece of state (`createdToken`), open a display modal, and clear that state on modal close. Never persist the secret elsewhere.
- **Dynamic key-value form field**: maintain an array of `{ key, value }` rows in local state; add/remove rows via index; serialize to `Record<string, string>` on submit; deserialize from record on edit pre-population.
- **MSW handler with filter/pagination**: extract all query params in the handler, apply filters with `.filter()`, slice with `.slice((page-1)*per_page, page*per_page)`, return `{ items, total, page, per_page, pages }`.
- **Delete confirmation pattern**: store the target item in `deleteTarget` state; show confirmation modal when non-null; on confirm call delete then set `deleteTarget` to null and re-fetch.

## Files to Review for Similar Tasks
- `frontend/src/pages/ParticipantsPage.tsx` — canonical example of a full CRUD page with filters, pagination, and multi-modal flows
- `frontend/src/components/participants/ParticipantForm.tsx` — dynamic key-value attribute builder and one-time token display after creation
- `frontend/src/components/participants/CsvImportDialog.tsx` — client-side CSV parse, preview, batch submit, and results summary
- `frontend/src/services/participantService.ts` — minimal, typed service layer for a survey-scoped resource
- `frontend/src/pages/__tests__/ParticipantsPage.test.tsx` — 605-line test suite demonstrating MSW override patterns per test case, skeleton/loading assertions, and modal flow testing
- `frontend/src/mocks/handlers.ts` — participant mock handlers with filtering and pagination logic

## Gotchas and Pitfalls
- Do not render the token anywhere in the participant list row — once the creation modal is dismissed the token is gone. If re-fetched, the API returns `ParticipantResponse` without a token field; the masked display is constructed from `external_id` or a placeholder, not from the original token.
- `uses_remaining: null` means unlimited — render it as "Unlimited" in the table, not as "0" or blank. Treat `null` and `0` as distinct values.
- `valid_from` and `valid_until` are ISO datetime strings or `null`. When pre-populating the edit form, slice to `YYYY-MM-DDTHH:mm` format for `<input type="datetime-local">` compatibility; do not pass the full ISO string with timezone offset directly.
- CSV import: the `email` column is required but all other columns (attribute key-value pairs, `uses_remaining`, `valid_from`, `valid_until`) are optional. Validate presence of `email` client-side before submitting to avoid unhelpful batch errors.
- Filter state changes should reset pagination to page 1 — failing to reset means users can end up on a non-existent page after narrowing results.
- MSW handlers must be registered with `server.use(...)` per test (not globally) when testing different response scenarios (empty list, error, different page sizes) to avoid test coupling.