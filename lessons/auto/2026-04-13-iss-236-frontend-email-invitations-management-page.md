---
date: "2026-04-13"
ticket_id: "ISS-236"
ticket_title: "Frontend Email Invitations management page"
categories: ["frontend", "react", "ui-patterns", "testing", "forms"]
outcome: "success"
complexity: "medium"
files_modified: []
---

# Lessons Learned: Frontend Email Invitations management page

## What Worked Well
- The ParticipantsPage pattern provided a clear, well-understood template. Copying its state management structure (separate loading/error states per concern: list, stats, form, delete, resend) kept the page's complexity organized.
- Separating `loadInvitations` and `loadStats` into independent `useCallback` functions made it easy to refresh only what changed (e.g., after a delete, both are refreshed; stats failure is explicitly non-blocking).
- Using `data-testid` attributes consistently across all components and modals made test selectors stable and readable without relying on fragile text or role queries.
- The `EmailInvitationTableSkeleton` named export alongside the default export in the same file is an effective co-location pattern — the page imports both from one path.
- Inline `ConfirmDeleteModal` and `BatchResultsModal` as private components within `EmailInvitationsPage.tsx` avoided unnecessary file proliferation for components that are strictly page-local.
- The `parseCsv` helper was copied verbatim from `CsvImportDialog` without abstraction — correct choice for a one-off, avoids premature DRY.

## What Was Challenging
- Managing multiple overlapping modal states (form, delete, batch, batch results) required careful boolean/object state tracking. Any ordering mistake (e.g., closing batch before setting result) would cause the results modal to flash-render then disappear.
- The email search filter is submitted via form submit (not reactive on change), while status/type filters are reactive. This asymmetry is intentional for UX but required a separate `handleEmailSearch` handler that manually calls `loadInvitations()` with `setPage(1)`, which is slightly disconnected from the `useCallback` dependency chain.
- The resend button is conditionally rendered only for `failed` or `bounced` statuses — this is a business rule that required explicit coverage in tests to guard against regressions.
- Batch dialog uses a hidden `<input type="file">` triggered by a visible button, a pattern that can be tricky to test. Using `userEvent.upload()` on the hidden `data-testid="batch-file-input"` element (not the visible button) was required.

## Key Technical Insights
1. **Stats failure is intentionally non-blocking**: The `loadStats` catch block is empty. Stats are supplementary; a stats API error should not degrade the primary table view.
2. **Page-decrement on delete**: When the last item on a non-first page is deleted, `setPage(p => p - 1)` triggers a re-fetch via `loadInvitations` through the `useEffect` dependency on `page`. This avoids an explicit reload call and correctly handles the edge case.
3. **Rate formatting**: `Math.round(rate * 100)` converts decimal rates (0–1) to integer percentages. This drops sub-percent precision, which is appropriate for a summary card display.
4. **Resend also applies to bounced**: Both `failed` and `bounced` statuses expose the resend action. This matches backend behavior where both can be retried.
5. **`useCallback` + `useEffect` pattern**: Wrapping data loaders in `useCallback` with explicit dependencies, then triggering them from `useEffect`, makes the dependency graph explicit and avoids stale closures without reaching for `useRef`.
6. **CSV column lookup is case-insensitive by convention**: `rowToInvitationItem` checks both `row['email']` and `row['Email']` — a pragmatic dual-key pattern for user-supplied CSVs without full case normalization.

## Reusable Patterns
- **MetricCard + grid layout**: The `MetricCard` local component inside `EmailStatsCards` (label, large value, optional subtitle) is identical in shape to the `StatisticsDashboard` pattern and can be extracted to a shared UI component if a third use case appears.
- **Fixed-overlay modal pattern**: All modals use `fixed inset-0 z-50 flex items-center justify-center bg-black/50` with a `Card` child. This is consistent across the entire app and should continue to be used for new modals.
- **Skeleton as named export**: Exporting `ComponentNameSkeleton` as a named export from the same file as the component is a clean pattern for table/list loading states.
- **`pageNumbers()` helper**: The delta-based pagination helper (show pages within ±2 of current) is copy-paste reusable for any paginated page.
- **Batch results modal as a second-step follow-up**: Closing the upload dialog and opening a results modal is a good UX pattern for async batch operations where the user needs feedback before continuing.

## Files to Review for Similar Tasks
- `frontend/src/pages/ParticipantsPage.tsx` — canonical reference for this page's state structure and layout
- `frontend/src/components/participants/CsvImportDialog.tsx` — source of the `parseCsv` pattern reused in `EmailBatchDialog`
- `frontend/src/pages/QuotasPage.tsx` — another example of a survey sub-resource page with delete confirmation
- `frontend/src/mocks/handlers.ts` — contains `mockEmailInvitations` fixture used across all tests; update this when the API schema changes
- `frontend/src/types/survey.ts` — `EmailInvitationResponse`, `EmailInvitationStats`, `EmailInvitationCreate`, `EmailInvitationBatchCreate`, `EmailInvitationBatchResponse` types defined here (ISS-235)

## Gotchas and Pitfalls
- **`useCallback` deps must include both loaders when refreshing after mutation**: `handleFormSubmit`, `handleDelete`, and `handleResend` all call `Promise.all([loadInvitations(), loadStats()])`. Both callbacks must appear in the `useCallback` dependency array or React will use stale versions.
- **`void` before fire-and-forget promises**: `handleBatchComplete` uses `void Promise.all(...)` because it is a sync function (not async) but needs to trigger async refreshes. Forgetting `void` triggers the `@typescript-eslint/no-floating-promises` lint rule.
- **Empty state vs. filtered-empty state are different**: `hasFilters` must be checked to distinguish "no invitations exist" (show CTA) from "no results for current filters" (show filter-empty message). Collapsing these into one state is a common mistake.
- **Hidden file input testing**: `userEvent.upload()` must target the hidden `<input type="file">` element directly (via `data-testid="batch-file-input"`), not the visible button that triggers it via `.click()`.
- **Stats cards show skeleton when stats is null, not just when isLoading**: The condition `if (isLoading || !stats)` ensures the skeleton persists until both loading finishes and data is available, preventing a brief flash of zero-value cards.
- **Route ordering matters in App.tsx**: `/surveys/:id/email-invitations` must be declared before `/surveys/:id` so React Router does not greedily match the detail page route. The current ordering is correct.