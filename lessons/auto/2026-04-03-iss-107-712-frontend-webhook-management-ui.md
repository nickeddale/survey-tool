---
date: "2026-04-03"
ticket_id: "ISS-107"
ticket_title: "7.12: Frontend — Webhook Management UI"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-107"
ticket_title: "7.12: Frontend — Webhook Management UI"
categories: ["frontend", "react", "webhooks", "settings-ui", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/types/survey.ts
  - frontend/src/services/webhookService.ts
  - frontend/src/components/webhooks/WebhookForm.tsx
  - frontend/src/pages/WebhooksPage.tsx
  - frontend/src/pages/__tests__/WebhooksPage.test.tsx
  - frontend/src/App.tsx
  - frontend/src/mocks/handlers.ts
---

# Lessons Learned: 7.12: Frontend — Webhook Management UI

## What Worked Well
- The QuotasPage/AssessmentsPage pattern transferred cleanly: same state shape (list, form, delete, toggle), same `useCallback`+`loadData` pattern, same `LoadingSkeleton`/`ConfirmDeleteModal` sub-component structure, and same `PER_PAGE` constant approach.
- Splitting `WebhookCreateResponse` as a separate interface extending `WebhookResponse` (with `secret: string` instead of `string | null`) kept the type system precise and avoided runtime null checks at the secret-display callsite.
- Keeping the `createdSecret` state in the parent (`WebhooksPage`) rather than inside `WebhookForm` was the right call — the form stays stateless about the post-creation flow and the parent controls when to clear it.
- Using `data-testid` attributes consistently on every interactive element (per established project convention) made the test suite straightforward to write and highly readable.
- The "stay on the form to display the secret, change Cancel to Done" UX pattern was easy to implement: a single `createdSecret` prop drives both the secret panel visibility and the button label/submit button hiding.
- Inline URL validation with the native `URL` constructor (plus protocol check) avoided adding a validation library dependency.

## What Was Challenging
- Webhooks are user-level (not survey-scoped), so the route is `/webhooks` rather than `/surveys/:id/webhooks`. This is a meaningful architectural difference from Quotas/Assessments that required care when wiring the route in `App.tsx` and ensuring the service calls `/webhooks` rather than a nested path.
- The survey selector in the form requires an async prefetch of surveys. Because this is non-critical (the selector degrades gracefully with no options), it needed a separate `useEffect` with a cancellation flag to avoid stale state updates after unmount — a small but easy-to-forget pattern.
- The `WebhookTestResult` response shape (`success`, `status_code`, `error`) is distinct from the webhook resource itself and required a dedicated type rather than reusing an existing interface.
- The toggle-active flow optimistically updates local state (via `setWebhooks` map) rather than reloading the full list — correct for UX, but requires remembering that the page list and the server state can diverge if the PATCH fails; the error surfaces at page level.

## Key Technical Insights
1. `WebhookCreateResponse extends WebhookResponse` with `secret: string` (non-nullable) is the cleanest pattern for endpoints that return a one-time secret. Callers can cast the `createWebhook` return value and access `.secret` safely without a null check.
2. When a form modal must persist after submission (to display a one-time secret), the idiom is: keep `createdSecret` in the page, pass it into the form as a prop, hide the submit button and show "Done" for cancel when the prop is non-null. The form never unmounts mid-flow.
3. Per-row async state (toggling, testing) should use a single `string | null` ID rather than a `Set<string>` — it enforces one in-flight operation at a time and maps cleanly to `disabled={togglingId === webhook.id}`.
4. The MSW handler for `POST /webhooks` must include `secret` in the response (not null) to correctly test the secret-display flow; the mock `GET /webhooks` list correctly returns `secret: null` since the secret is masked after creation.
5. Pagination fallback `data.total_pages ?? Math.max(1, Math.ceil(data.total / PER_PAGE))` is needed because some backend list endpoints omit `total_pages` — always guard against it.

## Reusable Patterns
- `LoadingSkeleton` + `ConfirmDeleteModal` as file-local sub-components is the established page pattern — copy from any of QuotasPage, AssessmentsPage, or WebhooksPage.
- Non-critical parallel data fetch (surveys list for selector) pattern: `useEffect` with `let cancelled = false` + `.catch(() => {})` for graceful degradation.
- Toggle-active via optimistic local state update: `setItems(prev => prev.map(item => item.id === updated.id ? updated : item))` — avoids a full reload for a single field change.
- Test result banner: `{ id, success, message }` state object; cleared before each new test request; styled conditionally on `success`.
- MSW handler pattern for user-level (non-survey-scoped) CRUD: same structure as survey-scoped handlers but with a flat `/resource` path, not `/surveys/:id/resource`.

## Files to Review for Similar Tasks
- `frontend/src/pages/QuotasPage.tsx` — canonical list/form/delete/toggle page pattern
- `frontend/src/pages/AssessmentsPage.tsx` — same pattern, slightly different form fields
- `frontend/src/pages/WebhooksPage.tsx` — this ticket; adds Test action, per-row async state, and user-level routing
- `frontend/src/components/webhooks/WebhookForm.tsx` — reference for one-time secret display UX
- `frontend/src/mocks/handlers.ts` — shows how user-level (non-survey-scoped) endpoints are added alongside survey-scoped ones

## Gotchas and Pitfalls
- Do not nest `/webhooks` under `/surveys/:id` in `App.tsx` — webhooks are user-level. Placing them inside the survey-scoped route group would break navigation and scope isolation.
- The clipboard API (`navigator.clipboard.writeText`) is unavailable in jsdom test environments; the copy handler must catch the rejection silently or tests will produce unhandled promise rejections.
- `WebhookResponse.secret` is `string | null` (null after creation in list responses), but `WebhookCreateResponse.secret` is `string` (returned once on creation). Never rely on `WebhookResponse.secret` being set in the list or edit flows.
- When deleting the last item on a page, decrement the page index rather than reloading at the current page — otherwise the page stays at a now-empty page number. The guard `webhooks.length === 1 && page > 1` handles this.
- The `surveys` fetch for the survey selector fires regardless of whether the form is open. This is intentional (preloads data), but if the page were embedded in a high-frequency render context it would need to be memoized or deferred.
- MSW `server.use(...)` overrides in tests are one-time by default in MSW v2; they replace the default handler for the duration of that test but are cleaned up by `afterEach`. Do not rely on override order across tests.
```
