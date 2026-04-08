---
date: "2026-04-08"
ticket_id: "ISS-169"
ticket_title: "Webhook creation dialog doesn't show signing secret and doesn't auto-close"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-169"
ticket_title: "Webhook creation dialog doesn't show signing secret and doesn't auto-close"
categories: ["backend", "frontend", "schemas", "security", "ux"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/schemas/webhook.py
  - backend/app/api/webhooks.py
  - backend/app/services/webhook_service.py
  - frontend/src/types/survey.ts
  - frontend/src/pages/WebhooksPage.tsx
  - frontend/src/components/webhooks/WebhookForm.tsx
  - frontend/src/mocks/handlers.ts
---

# Lessons Learned: Webhook creation dialog doesn't show signing secret and doesn't auto-close

## What Worked Well
- The API key creation pattern from ISS-005 provided a clear, proven blueprint: service returns `(model, plaintext_secret)` tuple, endpoint includes plaintext in a distinct create-only response schema
- Separating `WebhookCreateResponse` (with required `secret: str`) from `WebhookResponse` (no secret field) structurally prevented accidental secret leakage in list/get endpoints
- The frontend "show once" flow was already scaffolded with `createdSecret` state — the fix was connecting the backend response correctly rather than redesigning the UI

## What Was Challenging
- Root cause was a silent failure: the backend was returning `WebhookResponse` (no secret field) so the frontend always received `null`, meaning `createdSecret` was never set, so the Done button never appeared and users had no path to close the dialog
- The bug had a compounding effect — the missing secret and the stuck dialog were both symptoms of the same missing schema field, which made it appear like two separate issues requiring separate fixes
- Verifying the plaintext-before-hashing invariant required tracing through the service layer to confirm the secret was still available at return time

## Key Technical Insights
1. **Never share a Pydantic base schema with `Optional[secret]`** — use two structurally distinct classes (`WebhookCreateResponse` and `WebhookResponse`). Pydantic field omission is not the same as field exclusion; an optional field on a shared base can leak into responses via misconfigured `response_model`.
2. **Plaintext secrets must be captured before hashing** — the service layer must return `(model, plaintext_secret)` as a tuple so the endpoint can include the plaintext in the create response before it is permanently discarded.
3. **`response_model` alone is not a sufficient test** — explicitly assert in tests that the create response body contains a non-null `secret` key, and that list/get response bodies do NOT contain a `secret` key. Schema validation can silently exclude fields without surfacing errors.
4. **UI stuck states often trace to missing backend data** — the dialog not closing was not a frontend logic bug; it was downstream of the backend never returning the secret, which prevented the Done button from rendering.
5. **Check `from __future__ import annotations`** in any backend router file before adding `request: Request` for rate limiting — this causes Pydantic `ForwardRef` resolution failures that manifest as 400 errors on body params.

## Reusable Patterns
- **Service tuple pattern**: `return (orm_model, plaintext_secret)` from any `create_*` function that generates a hashed secret; endpoint unpacks and includes plaintext only in the create response schema
- **Distinct create-response schema**: `class WebhookCreateResponse(WebhookResponse): secret: str` — required, not optional, on a subclass that is never used for list/get endpoints
- **Show-once frontend flow**: set `createdSecret` from the POST response, do NOT call `closeForm()` immediately, render a secret-display UI with a Done button that calls `closeForm()` — same pattern as API key creation
- **MSW handler update**: whenever the backend create response schema changes, update the corresponding MSW mock handler to include the new field so frontend tests remain accurate

## Files to Review for Similar Tasks
- `backend/app/schemas/webhook.py` — schema separation pattern between create and read responses
- `backend/app/api/webhooks.py` — how `response_model=WebhookCreateResponse` is applied only to the POST endpoint
- `backend/app/services/webhook_service.py` — tuple return pattern for plaintext secret before hashing
- `backend/tests/test_webhooks.py` — explicit assertions for secret presence in create response and secret absence in list/get responses
- `frontend/src/pages/WebhooksPage.tsx` — `createdSecret` state and Done button close flow
- `frontend/src/pages/__tests__/WebhooksPage.test.tsx` — frontend test coverage for secret display and dialog close behavior

## Gotchas and Pitfalls
- **Do not assert on schema validation alone** — a misconfigured `response_model` can silently exclude fields; always assert the raw response body JSON contains or excludes the `secret` key explicitly in tests
- **Dialog stuck on success is a symptom, not the root cause** — trace back to what state the dialog's close/done logic depends on before touching frontend code
- **`from __future__ import annotations` + `request: Request`** in a FastAPI router causes ForwardRef resolution failures for locally-defined Pydantic models; remove the import rather than using `Body(...)` as a workaround
- **Hashed secrets are unrecoverable** — if the plaintext is not returned at creation time, it is gone; there is no migration path to expose it later without resetting the secret
- **Optional secret on a shared schema is a security anti-pattern** — even if the field is excluded in serialization, it signals that secret exposure is acceptable in some response contexts and invites future regressions
```
