---
date: "2026-04-03"
ticket_id: "ISS-094"
ticket_title: "6.12: Frontend — Response List and Detail Pages (Admin)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-094"
ticket_title: "6.12: Frontend — Response List and Detail Pages (Admin)"
categories: ["frontend", "react", "admin-ui", "data-display", "routing"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/types/survey.ts
  - frontend/src/services/responseService.ts
  - frontend/src/components/responses/ResponseTable.tsx
  - frontend/src/components/responses/ResponseDetail.tsx
  - frontend/src/pages/ResponsesPage.tsx
  - frontend/src/pages/ResponseDetailPage.tsx
  - frontend/src/App.tsx
  - frontend/src/pages/SurveyDetailPage.tsx
---

# Lessons Learned: 6.12: Frontend — Response List and Detail Pages (Admin)

## What Worked Well
- Following the existing SurveyDetailPage/SurveysPage patterns meant near-zero ramp-up; the loading/error/not-found tri-state render pattern was copy-adapted cleanly.
- Separating the page component (data fetching, navigation) from the display component (ResponseDetail, ResponseTable) kept each file focused and testable in isolation.
- URL-synced filter/pagination state via `useSearchParams` produced a shareable, browser-history-friendly list page with minimal extra complexity.
- Adding admin methods directly to the existing `ResponseService` class (rather than a new service) kept imports simple and matched the pattern already used for public response methods.
- The `cancelled` flag pattern for async effect cleanup prevented stale-state bugs consistently across both page components.

## What Was Challenging
- Matrix answer grouping required regex-matching on question codes (`_SQ\d+` suffix) to reconstruct parent-child relationships from a flat answer list — this logic is not obvious from the backend schema alone and required careful inspection of backend answer shapes.
- The `listResponses` endpoint is shared between public (no-auth) and admin (authenticated) callers; the service's `params` typing had to be written carefully to avoid runtime type errors while remaining flexible enough for both callers.
- Route ordering in App.tsx was critical: `/surveys/:id/responses/:rid` must be declared before `/surveys/:id/responses` and `/surveys/:id` to prevent the more general pattern from swallowing the more specific path. React Router v6 does not guarantee order-based matching the same way v5 did, but nested specificity still matters.
- The ticket spec mentioned a delete action in ResponseTable, but the final implementation omitted the delete button from the table (only a View action) and moved delete entirely to the detail page — a deliberate simplification that reduced scope without losing functionality.

## Key Technical Insights
1. Flat answer arrays from the backend must be client-side grouped for matrix questions. The grouping key is the parent question code extracted by stripping the `_SQ\d+` suffix. Always inspect actual API response shapes, not just schema docs, before writing grouping logic.
2. When an existing service class mixes public and authenticated endpoints, clearly comment the auth boundary (as done with the `// Admin (authenticated) response methods` section divider) to prevent future callers from accidentally using unauthenticated paths for protected data.
3. The `ResponseStatusBadge` component was duplicated between `ResponseTable.tsx` and `ResponseDetail.tsx` with identical logic. For a small project this is acceptable, but if a third caller appears it should be extracted to a shared `components/responses/` utility.
4. `useSearchParams` initialization should read from the URL on first render (lazy initializer pattern) and then write back to the URL on state changes — the two effects (read-once on mount, write-on-change) should be kept separate to avoid infinite loops.
5. Pagination window logic (±2 pages around current) is simpler than a full ellipsis implementation and sufficient for typical response counts; only add ellipsis if datasets regularly exceed ~10 pages.

## Reusable Patterns
- **Cancelled-flag async effect**: `let cancelled = false` / `return () => { cancelled = true }` — use for every data-fetching useEffect to prevent setState-on-unmounted-component.
- **Tri-state page render**: loading → not-found → error → full content. Defined as sequential early returns before the main JSX. Matches SurveyDetailPage exactly; use as the template for all future admin detail pages.
- **URL-synced list state**: initialize state from `useSearchParams`, write back via a separate effect with `replace: true`. Resets page to 1 on filter change by calling `setPage(1)` inside the filter handler.
- **Status badge with fallback**: `RESPONSE_STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'` — gracefully handles unknown statuses without crashing.
- **Truncated UUID display**: `id.slice(0, 8) + '…'` with full UUID in `title` attribute for hover tooltip — consistent across table rows and aria-labels.

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveyDetailPage.tsx` — authoritative template for admin detail pages: loading skeleton, not-found card, ConfirmModal pattern, action button row layout.
- `frontend/src/pages/SurveysPage.tsx` — authoritative template for admin list pages: URL-synced pagination, filter bar, error handling, empty state.
- `frontend/src/components/responses/ResponseDetail.tsx` — matrix answer grouping algorithm; reference when rendering any flat-list-of-answers from the backend.
- `frontend/src/services/responseService.ts` — example of mixed public/admin methods on a single service class with clear auth-boundary comments.
- `frontend/src/App.tsx` — route ordering for nested `:id`/`:rid` params; ensure more-specific paths are declared before less-specific siblings.

## Gotchas and Pitfalls
- **Route order matters**: always declare `/surveys/:id/responses/:rid` before `/surveys/:id/responses` before `/surveys/:id` in App.tsx. Reversing this causes React Router to match the shorter path first and never reach the longer one.
- **Matrix subquestion titles**: the backend may concatenate parent and subquestion titles with ` — ` as a separator. Split on ` — ` and take the first segment to get the parent question title when grouping matrix rows.
- **`pages` vs `total_pages` field**: `SurveyListResponse` uses `total_pages` (optional) while `ResponseListResponse` uses `pages` (required). Do not mix these up when wiring pagination — check the actual type definition, not the field name by memory.
- **Delete omitted from list table**: the ticket spec included a delete action in the table, but inline delete on a list row is risky UX (accidental clicks). Keeping delete only on the detail page is intentional; do not re-add it to ResponseTable without a confirmation mechanism.
- **`e.stopPropagation()` on action buttons in clickable rows**: every action button inside a `<tr onClick>` must call `e.stopPropagation()` to prevent the row click from also firing. Missing this causes double-navigation.
```
