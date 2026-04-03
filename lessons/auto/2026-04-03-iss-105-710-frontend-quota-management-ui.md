---
date: "2026-04-03"
ticket_id: "ISS-105"
ticket_title: "7.10: Frontend — Quota Management UI"
categories: ["frontend", "react", "typescript", "ui-components", "testing"]
outcome: "success"
complexity: "high"
files_modified: []
---

# Lessons Learned: 7.10: Frontend — Quota Management UI

## What Worked Well
- The class-based service singleton pattern (`quotaService`) followed existing conventions cleanly and made testing straightforward with MSW intercepts.
- Extracting `ProgressBar` and `ConfirmDeleteModal` as inline sub-components within `QuotasPage.tsx` kept related logic co-located without requiring separate files for simple, page-scoped UI pieces.
- Bidirectional conversion functions (`conditionRowsToQuotaConditions` / `quotaConditionsToConditionRows`) exported from `ConditionBuilder.tsx` made the `in` operator's comma-separated string ↔ array translation explicit and testable in isolation.
- Granular per-action loading state (`togglingId`, `deleteLoading`, `formLoading`) produced a responsive UI without full-page spinners on partial updates.
- Optimistic toggle of `is_active` made the UI feel instant while the PATCH request was in flight.
- MSW mock handlers with two representative quota fixtures (one at partial fill, one at full fill with `hide_question` action) covered both action types and multiple progress bar color states in tests without extra setup.

## What Was Challenging
- Managing multiple orthogonal state slices (list, questions, form, delete, toggle) within a single page component required careful naming discipline to avoid confusion — a dedicated reducer or co-located state object would have been cleaner at this scale.
- The adaptive value input in `ConditionBuilder` (plain string for most operators, comma-separated for `in`, placeholder variation by operator) required a non-obvious UX convention that needed to be documented in placeholder text rather than enforced structurally.
- Auto-navigating to the previous page when the last item on a page is deleted is a subtle pagination edge case that is easy to omit and requires explicit handling after the delete response.
- Loading survey questions inside the quota form non-blockingly (so the form opens immediately) required a cancellation-token-style pattern to avoid state updates on unmounted components.

## Key Technical Insights
1. The `QuotaOperator` union type (`eq | neq | gt | lt | gte | lte | in | contains`) must be kept in sync with the backend schema; divergence here causes silent API errors rather than TypeScript errors because values flow through string form fields.
2. `QuotaCondition.value` typed as `string | number | boolean | string[]` creates a discriminated union problem at the API boundary — the `in` operator always sends `string[]` while others send scalar values, so the conversion functions are load-bearing and must not be bypassed.
3. Progress bar color thresholds (green < 50%, yellow 50–80%, red ≥ 80%) should be treated as a product decision encoded in one place; they were inlined in the `ProgressBar` sub-component, which is the correct single source of truth.
4. The `PATCH` endpoint accepts a partial `QuotaUpdate` payload, so the `is_active` toggle only needs to send `{ is_active: boolean }` — sending the full quota object risks overwriting server-side `current_count`.
5. MSW handlers must validate the Bearer token on every route to match production auth behavior; omitting this causes tests to pass against unprotected mocks and miss real auth regressions.

## Reusable Patterns
- **Service singleton with typed generics**: `class QuotaService { listQuotas(surveyId, params): Promise<QuotaListResponse> }` — copy this pattern for any new resource-scoped API service.
- **Inline sub-components for page-scoped UI**: Defining `ProgressBar` and `ConfirmDeleteModal` inside the page file avoids premature extraction while keeping JSX readable.
- **Conversion function pair for complex form ↔ API transformations**: Export `fooToApi` / `apiToFoo` from the form component that owns the transformation, not from the service layer.
- **Pagination edge-case handler after delete**: `if (items.length === 1 && page > 1) setPage(page - 1)` — apply this pattern any time a delete can empty the current page.
- **Per-row toggle loading state via ID map**: `togglingId: string | null` (or a `Set<string>` for multi-select) prevents double-clicks and shows per-row spinner without blocking the whole list.
- **Non-blocking question/option preload with cancellation**: Load auxiliary data (questions, options) after the modal opens using a `let cancelled = false` guard in the `useEffect` cleanup to prevent state updates on unmounted components.

## Files to Review for Similar Tasks
- `frontend/src/pages/QuotasPage.tsx` — reference for multi-state list page with inline sub-components, pagination, optimistic toggle, and delete with confirmation.
- `frontend/src/components/quotas/ConditionBuilder.tsx` — reference for dynamic row-based condition/filter builders with conversion functions.
- `frontend/src/components/quotas/QuotaForm.tsx` — reference for dual-mode (create/edit) modal form with pre-fill and nested sub-form component.
- `frontend/src/services/quotaService.ts` — reference for resource-scoped API service following the singleton pattern.
- `frontend/src/pages/__tests__/QuotasPage.test.tsx` — reference for testing list, create, edit, delete, toggle, and error states with MSW.
- `frontend/src/mocks/handlers.ts` — reference for adding paginated CRUD mock handlers with auth checks and realistic fixture data.

## Gotchas and Pitfalls
- **Do not send full object on toggle PATCH**: Only send `{ is_active: value }` — sending the full quota will overwrite `current_count` with the stale client value.
- **`in` operator value is an array, not a string**: The UI stores it as a comma-separated string; always pass through `conditionRowsToQuotaConditions` before submitting to the API.
- **Empty conditions array vs. no conditions**: The backend may distinguish between `conditions: []` and omitting the field — always send an explicit empty array when no conditions are defined.
- **Questions load can race with form close**: If the user opens and immediately closes the form before questions load, the `setState` call will target an unmounted component. Always include a `cancelled` flag in the `useEffect` cleanup.
- **Progress bar at exactly 100%**: `current_count` can exceed `limit` if quotas were not enforced strictly server-side — clamp the percentage to 100 in the display calculation to avoid overflow rendering.
- **Pagination after delete on last page**: Without the `page > 1` guard, deleting the last item on page 2+ will request a now-nonexistent page and show an empty list rather than navigating back.