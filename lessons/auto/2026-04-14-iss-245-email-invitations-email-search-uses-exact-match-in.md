---
date: "2026-04-14"
ticket_id: "ISS-245"
ticket_title: "Email invitations: Email search uses exact match instead of partial/substring match"
categories: ["testing", "database", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-14"
ticket_id: "ISS-245"
ticket_title: "Email invitations: Email search uses exact match instead of partial/substring match"
categories: ["backend", "database", "search", "ux"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/email_invitation_service.py"
  - "backend/tests/test_email_invitations.py"
---

# Lessons Learned: Email invitations: Email search uses exact match instead of partial/substring match

## What Worked Well
- The fix was surgical: a single-line change swapping `==` for `.ilike(f"%{value}%")` in the service layer
- SQLAlchemy's `.ilike()` ORM method maps cleanly to PostgreSQL's `ILIKE` operator with no raw SQL needed
- The existing `test_list_invitations_filter_by_email` test was extended in-place to cover partial matching, keeping coverage co-located with the exact-match assertion
- A dedicated `test_list_invitations_filter_by_email_partial` test was also added as a standalone regression guard

## What Was Challenging
- No frontend changes were required because the API parameter name and transport were already correct — the bug was purely in the backend filter predicate, which required reading the service code to confirm
- Distinguishing "exact match works, partial doesn't" from a frontend encoding issue required reading both layers before isolating the root cause to the service

## Key Technical Insights
1. SQLAlchemy column `.ilike(pattern)` produces a case-insensitive `ILIKE` on PostgreSQL; wrapping the search term in `%…%` converts it to a substring search: `EmailInvitation.recipient_email.ilike(f"%{recipient_email}%")`
2. `ILIKE` is PostgreSQL-specific. If the database were ever swapped to SQLite (e.g. in tests), `.ilike()` still works because SQLAlchemy translates it to `LIKE` with `LOWER()` on backends that lack native `ILIKE`
3. Other filter columns in the same function (`status`, `invitation_type`) correctly use exact equality — only free-text user-entered fields benefit from substring matching; enum/type filters should stay exact

## Reusable Patterns
- For any text search field exposed to users, default to `.ilike(f"%{value}%")` rather than `==` unless the field is a controlled enum or identifier
- When extending a filter test, add the partial-match assertion as a second block within the same test *and* as a separate focused test — belt-and-suspenders coverage catches regression at two levels

## Files to Review for Similar Tasks
- `backend/app/services/email_invitation_service.py:234-243` — the filter-building block; any new filter added here should consciously choose between exact (`==`) and substring (`.ilike`) matching
- `backend/tests/test_email_invitations.py:371-431` — the two email-filter tests demonstrate both full-address and partial-term assertions as the canonical pattern for search tests

## Gotchas and Pitfalls
- Using `==` for a user-visible search box is a silent UX failure: the endpoint returns 200 with an empty list rather than an error, making it hard to notice during development when tests only exercise full addresses
- `%` and `_` are wildcard characters in SQL `LIKE`/`ILIKE` patterns. If user-supplied search terms can contain these characters, the value must be escaped before interpolation (e.g. via `sqlalchemy.dialects.postgresql.ILIKE` or manual escaping) to avoid unintended wildcard expansion — this was not a concern here but is a risk for more general search inputs
- The existing test only searched by full email address (`specific@example.com`), so the regression was invisible until a manual end-to-end test exposed it; search filter tests should always include at least one partial-term assertion
```
