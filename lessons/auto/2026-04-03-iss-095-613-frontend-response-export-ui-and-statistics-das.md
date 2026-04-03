---
date: "2026-04-03"
ticket_id: "ISS-095"
ticket_title: "6.13: Frontend — Response Export UI and Statistics Dashboard"
categories: ["frontend", "data-visualization", "file-download", "typescript", "react"]
outcome: "success"
complexity: "medium"
files_modified: []
---

# Lessons Learned: 6.13: Frontend — Response Export UI and Statistics Dashboard

## What Worked Well
- Placing both new components in `src/components/responses/` kept them co-located with the existing `ResponseTable` component, making the directory a coherent unit for all response-related UI
- Using a URL search param (`?view=statistics`) to persist the active tab meant deep-linking and browser back/forward navigation worked for free with no extra effort
- The existing `apiClient` abstraction made adding `responseType: 'blob'` for file download trivial — no special fetch wrapper was needed
- CSS-only progress bars (styled `div` with `width` set inline) eliminated any chart library dependency while still being fully accessible via ARIA `progressbar` role
- TypeScript type guards (`isChoiceStats`, `isNumericStats`, `isRatingStats`, `isTextStats`) kept the discriminated union handling clean and explicit inside `StatisticsDashboard`
- Cancellation flag pattern (`let cancelled = false` + cleanup return) was already established in the codebase and prevented state updates on unmounted components in both the statistics fetch and the responses list fetch

## What Was Challenging
- The backend statistics response uses a discriminated union (`QuestionStatsUnion`) without a literal discriminant field that TypeScript can narrow automatically — the type guards had to inspect for specific field names (`options`, `mean`, `average`, `distribution`) rather than a single `type` field, making them slightly fragile if the backend schema ever adds overlapping fields
- `RatingQuestionStats` and `NumericQuestionStats` both have numeric aggregate fields, requiring careful guard ordering: `isNumericStats` checks for `mean` AND absence of `average` to avoid false positives against rating stats
- Deciding the correct fallback for `average_completion_time_seconds: null` (dash character `—`) needed to be consistent with how other nullable numeric metrics are displayed across the dashboard

## Key Technical Insights
1. When triggering a file download from a `Blob`, always `URL.revokeObjectURL` immediately after `a.click()` — the click is synchronous and the browser queues the download, so revocation does not abort it
2. For a column-filtered export, omitting the `columns` query param entirely (rather than sending all columns) is preferable: passing no filter is semantically "give me everything" and avoids a potentially unbounded query string
3. Skeleton loading states should mirror the real layout closely (same card structure, similar skeleton proportions) to prevent layout shift; using `Skeleton` components from the existing UI kit achieves this cheaply
4. Initializing `selectedColumns` state with a lazy initializer (`() => new Set(...)`) prevents the full question list from being re-evaluated on every render and ensures the set is only constructed once on mount
5. The `useSearchParams` + `useEffect` sync pattern (read params on init, write params on state change) is the established pattern in this codebase for URL-persisted UI state — follow it consistently rather than using a router utility

## Reusable Patterns
- `formatDuration(seconds: number | null): string` — human-readable seconds formatter (handles `null`, seconds, minutes, hours) is generic and could be moved to a shared `utils/format.ts`
- `formatPercent(value: number): string` — rounds to one decimal place; useful wherever percentage values are displayed
- The `ProgressBar` component (accessible `role="progressbar"`, CSS width, smooth transition) is a lightweight zero-dependency bar chart primitive reusable for any percentage visualization
- The cancellation flag pattern for async `useEffect` loads is already standard in this codebase; continue using it for any new data-fetching effects
- Discriminated union type guards using `'field' in stats` checks work well for backend unions that lack a literal `type` discriminant — document the dependency on field names so future schema changes trigger a review

## Files to Review for Similar Tasks
- `frontend/src/components/responses/ExportDialog.tsx` — reference for Dialog + checkbox column selection + Blob file download pattern
- `frontend/src/components/responses/StatisticsDashboard.tsx` — reference for skeleton loading, discriminated union rendering, and CSS progress bar visualization
- `frontend/src/services/responseService.ts` — reference for `responseType: 'blob'` axios config and the pattern of building query params from an options object
- `frontend/src/types/survey.ts` — canonical location for all backend-matching TypeScript types; add new API shape types here
- `frontend/src/pages/ResponsesPage.tsx` — reference for tab-based view switching with URL param persistence and lazy question loading for a child dialog

## Gotchas and Pitfalls
- Passing `columns` only when a subset is selected (i.e., `columns.length < questions.length`) avoids sending a redundant full list to the backend; omitting the param is the correct "all columns" signal
- The `ExportDialog` initializes `selectedColumns` from the `questions` prop on mount; if questions load asynchronously after the dialog is first rendered, the set will start empty — the parent (`ResponsesPage`) pre-fetches questions before the dialog can be opened, which is the correct guard
- `isTextStats` is defined as the negation of the other three guards; this means it will match any unrecognized stats shape, which is a safe fallback but should be kept last in the render logic
- Rating stats use `distribution` entries with `value: string` (not `number`), matching the backend schema; do not assume numeric keys even though the values represent rating scale integers
- Do not conditionally render `ExportDialog` based on loading state — mount it unconditionally (with a null-guard on `surveyId`) so its internal state is preserved between opens