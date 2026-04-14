---
date: "2026-04-14"
ticket_id: "ISS-244"
ticket_title: "Email invitations: Email search input not passed to API"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-14"
ticket_id: "ISS-244"
ticket_title: "Email invitations: Email search input not passed to API"
categories: ["frontend", "react", "bug-fix", "api-integration"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/pages/EmailInvitationsPage.tsx"]
---

# Lessons Learned: Email invitations: Email search input not passed to API

## What Worked Well
- The bug description was precise and actionable — it identified the exact file, line numbers, and the missing line of code
- The fix was surgical: two small changes (add param to object, add to dependency array) with no side effects
- Resetting to page 1 on search change was considered proactively to avoid stale pagination bugs

## What Was Challenging
- Nothing technically challenging; the main risk was missing the useCallback dependency array update, which would cause the search to silently not re-fire on state change

## Key Technical Insights
1. In React, `useCallback` with a stale dependency array is a common source of "UI appears to work but doesn't" bugs — state used inside the callback must be listed as a dependency or the callback captures a stale closure
2. Search inputs that update filter params should always reset pagination to page 1, otherwise a user on page 3 searching for a specific email may see an empty result set instead of the first page of filtered results
3. Silent UI bugs (input that does nothing) are often caused by state being read in a handler but never forwarded to the API call — worth auditing all filter/search states against the params construction block

## Reusable Patterns
- Filter param construction pattern: build a `params` object incrementally with `if (value) params.key = value` guards, then spread or pass to API — this makes it easy to add new filters without restructuring
- Dependency hygiene: whenever adding a state variable to a `useCallback` body, immediately add it to the dependency array in the same edit
- Pagination reset: add `setPage(1)` to every filter/search `onChange` handler to keep pagination coherent with current filter state

## Files to Review for Similar Tasks
- `frontend/src/pages/EmailInvitationsPage.tsx` — primary page for invitation management; contains `loadInvitations`, filter state, and search input wiring
- Any other page-level components under `frontend/src/pages/` that use `useCallback` for data fetching with multiple filter states

## Gotchas and Pitfalls
- Forgetting to update `useCallback` dependencies is a silent failure — React will not warn at runtime, and the filter will appear wired up but use stale state
- If `emailSearch` is an empty string (not null/undefined), a guard like `if (emailSearch)` correctly omits the param; ensure the backend treats absence of `recipient_email` as "no filter" rather than erroring
- UI elements that visually respond (typing in an input, selecting a dropdown) give false confidence that filtering is working end-to-end — always verify with network inspection that the API call includes the expected query params
```
