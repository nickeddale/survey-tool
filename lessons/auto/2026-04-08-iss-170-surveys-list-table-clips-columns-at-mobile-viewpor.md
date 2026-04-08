---
date: "2026-04-08"
ticket_id: "ISS-170"
ticket_title: "Surveys list table clips columns at mobile viewport widths"
categories: ["testing", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-170"
ticket_title: "Surveys list table clips columns at mobile viewport widths"
categories: ["frontend", "responsive-design", "tailwind", "ui"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/pages/SurveysPage.tsx"]
---

# Lessons Learned: Surveys list table clips columns at mobile viewport widths

## What Worked Well
- The implementation plan was precise and accurate — reading the file first to understand markup before making changes prevented guesswork
- Tailwind's `hidden sm:table-cell` pattern is a clean, minimal solution for responsive table columns with no JS required
- The table wrapper already had `overflow-x-auto`, so the fix was purely additive (adding visibility classes) rather than structural
- Hiding lower-priority columns (Questions, Created) preserved the most actionable columns (Title, Status, Actions) at narrow widths

## What Was Challenging
- Nothing significantly challenging; the ticket was well-scoped with a clear implementation plan and a single affected file

## Key Technical Insights
1. `overflow-x-auto` on a table wrapper alone is not sufficient if columns never overflow — they instead clip or collapse. Column-level responsive visibility must be paired with it.
2. Tailwind's `hidden sm:table-cell` (not `hidden sm:block`) is the correct pattern for table cells — using `sm:block` on a `<td>` or `<th>` breaks table layout.
3. Both `<th>` header cells and every corresponding `<td>` body cell must receive the same responsive class — missing one causes misaligned columns.
4. Columns containing the primary action (Actions) should always remain visible; deprioritize metadata columns (counts, dates) for hiding on mobile.

## Reusable Patterns
- **Responsive table columns**: Add `hidden sm:table-cell` to both `<th>` and all corresponding `<td>` elements for columns to hide on mobile
- **Column priority order for mobile**: Title/Name > Status/State > Actions > Metadata (counts, dates, IDs)
- **Pattern precedent**: `AppLayout.tsx` uses `hidden sm:block` for nav items — same Tailwind breakpoint strategy applies to tables

## Files to Review for Similar Tasks
- `frontend/src/pages/SurveysPage.tsx` — reference implementation for responsive table pattern
- `frontend/src/components/AppLayout.tsx` — reference for `hidden sm:block` responsive visibility pattern

## Gotchas and Pitfalls
- Do not use `sm:block` on table cells (`<td>`/`<th>`) — use `sm:table-cell` to preserve correct table display behavior
- All sibling `<td>` cells in every row must mirror the `<th>` visibility class; a single missed row cell will cause column count mismatches
- Verify the Actions column has no accidental overflow or min-width constraints that could still cause clipping even after other columns are hidden
```
