---
date: "2026-04-08"
ticket_id: "ISS-170"
ticket_title: "Surveys list table clips columns at mobile viewport widths"
categories: ["responsive-design", "tailwind-css", "tables"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/pages/SurveysPage.tsx"]
---

# Lessons Learned: Surveys list table clips columns at mobile viewport widths

## What Worked Well
- The fix was surgical — a single file change with two complementary approaches: `min-w-[600px]` on the `<table>` element to activate the existing `overflow-x-auto` wrapper, and `hidden sm:table-cell` to hide secondary columns on mobile
- Making table rows clickable (`onClick={() => navigate(...)}`) provided a clean mobile UX fallback so actions remain reachable even when the Actions column is hidden
- The `whitespace-nowrap` class on the Created date cell prevented awkward mid-word wrapping at intermediate widths

## What Was Challenging
- The root cause was non-obvious: `overflow-x-auto` on a wrapper div does nothing unless the child element has an explicit minimum width that exceeds the viewport — without `min-w-[600px]` on the table, the table simply collapsed rather than overflowing
- Deciding between horizontal scroll vs. card layout vs. progressive column hiding required evaluating three valid approaches before settling on the combination of min-width scroll + hidden columns

## Key Technical Insights
1. **`overflow-x-auto` requires an overflowing child**: A wrapper with `overflow-x-auto` only produces a scrollbar if its child has a fixed or minimum width wider than the wrapper. Without `min-w-[600px]` (or similar) on the `<table>`, the table compresses to fit and no scroll appears.
2. **`hidden sm:table-cell` for responsive columns**: Tailwind's `hidden` sets `display: none`; pairing it with `sm:table-cell` restores the correct display value at the `sm` breakpoint (640px). Using just `sm:block` would break table layout — `table-cell` is the correct restore value.
3. **Row-level click + cell-level stopPropagation**: When rows are made clickable for navigation, action buttons inside cells must call `e.stopPropagation()` (or wrap the cell in `onClick={(e) => e.stopPropagation()}`) to prevent double-navigation.
4. **Link inside clickable row**: A `<Link>` inside a clickable `<tr>` needs `onClick={(e) => e.stopPropagation()}` to avoid the row handler also firing.

## Reusable Patterns
- **Responsive table boilerplate**: `<div className="overflow-x-auto ..."><table className="w-full min-w-[600px] ...">` — always pair these two together for tables that need mobile scroll
- **Secondary column hiding**: `<th className="hidden sm:table-cell ...">` / `<td className="hidden sm:table-cell ...">` — apply the same class to both `th` and `td` for a column to hide it consistently
- **Clickable row with nested links/buttons**: set `cursor-pointer` and `onClick` on `<tr>`, add `onClick={(e) => e.stopPropagation()}` on the Actions `<td>`, and `onClick={(e) => e.stopPropagation()}` on any `<Link>` children

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveysPage.tsx` — canonical example of the responsive table pattern in this codebase
- Other list pages (`WebhooksPage`, `ParticipantsPage`, `ResponsesPage`) may need the same `min-w-[...]` fix if they share the overflow-x-auto wrapper pattern without a table min-width

## Gotchas and Pitfalls
- Do not add `min-w-[...]` to the wrapper `<div>` — it must go on the `<table>` itself; putting it on the wrapper defeats the overflow scroll mechanism
- Hiding the Actions column on mobile only works safely because row-click navigation was added simultaneously — removing one without the other leaves mobile users unable to access actions
- `whitespace-nowrap` on date cells is important; without it, short viewport widths cause dates to wrap mid-format (e.g., "Apr\n8, 2026") which looks broken even when the column is visible