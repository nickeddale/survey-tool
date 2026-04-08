---
date: "2026-04-08"
ticket_id: "ISS-168"
ticket_title: "Statistics completion rate shows 0.4% instead of 40%"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-168"
ticket_title: "Statistics completion rate shows 0.4% instead of 40%"
categories: ["frontend", "bug-fix", "display", "math"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/components/responses/StatisticsDashboard.tsx"]
---

# Lessons Learned: Statistics completion rate shows 0.4% instead of 40%

## What Worked Well
- Root cause was identified precisely in the ticket: backend returns decimals (0.0–1.0), frontend was not converting before appending `%`
- Implementation plan correctly flagged the need to check whether `opt.percentage` values are already on a 0–100 scale before applying the same fix universally
- Scope stayed narrow — single file, single function

## What Was Challenging
- The fix required understanding the contract between backend and frontend: which fields are decimal (0.0–1.0) vs already-percentage (0–100), since a blanket change to `formatPercent` could silently break question option breakdowns

## Key Technical Insights
1. The backend `completion_rate` field is a decimal fraction (0.0–1.0), requiring `* 100` before display — this is a different scale than `opt.percentage` which is already 0–100
2. `Math.round(value * 1000) / 10` achieves one decimal place of precision after converting a 0–1 decimal to percentage (e.g., `0.4 → 40.0`)
3. When a shared formatting helper handles values of different scales, the correct fix is either a dedicated helper for the differently-scaled field, or to normalize the value at the call site before passing to the shared helper

## Reusable Patterns
- When a backend returns a ratio/fraction and the frontend appends `%` directly, always verify whether `* 100` is needed — this is a common source of off-by-100x display bugs
- Audit all callers of a shared format helper before modifying it — some callers may already be passing pre-converted values

## Files to Review for Similar Tasks
- `frontend/src/components/responses/StatisticsDashboard.tsx` — contains `formatPercent` and all statistics display logic
- `backend/app/services/response_query_service.py` (around line 334) — source of `completion_rate` and `opt.percentage` values
- `backend/app/schemas/response.py` — defines the shape and scale of statistics response fields

## Gotchas and Pitfalls
- `formatPercent` is shared between `completion_rate` (0–1 scale) and `opt.percentage` (0–100 scale) — applying a `* 100` fix inside the helper without checking all callers would double-convert question option percentages
- The `%` suffix in a format function does not imply any scale conversion — it is purely cosmetic; conversion must be explicit
```
