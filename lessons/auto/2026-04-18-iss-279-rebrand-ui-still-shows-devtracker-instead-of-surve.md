---
date: "2026-04-18"
ticket_id: "ISS-279"
ticket_title: "Rebrand: UI still shows 'DevTracker' instead of 'Survey Tool'"
categories: ["testing", "ui", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-18"
ticket_id: "ISS-279"
ticket_title: "Rebrand: UI still shows 'DevTracker' instead of 'Survey Tool'"
categories: ["frontend", "rebrand", "text-content", "testing"]
outcome: "success"
complexity: "low"
files_modified:
  - frontend/src/components/AppLayout.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/RegisterPage.tsx
  - frontend/index.html
  - frontend/src/components/__tests__/AppLayout.test.tsx
---
```

# Lessons Learned: Rebrand: UI still shows 'DevTracker' instead of 'Survey Tool'

## What Worked Well
- The implementation plan precisely identified all affected files upfront, making execution straightforward with no surprises
- Colocated tests in `__tests__/` directories made it easy to find and update the corresponding test assertions alongside the source changes
- The prior ticket (ISS-278) had already updated CLAUDE.md and test mocks, so this ticket had a clean, well-scoped scope

## What Was Challenging
- The root issue was an incomplete rebrand in ISS-278 — user-facing UI strings were missed while infrastructure-level references were updated, showing how rebrands can be easy to do partially
- The browser tab title lives in `frontend/index.html` rather than in any React component, which is easy to overlook when searching only `.tsx` files

## Key Technical Insights
1. A grep/search for the old brand name across the entire repo (not just backend or just frontend) is the most reliable way to audit a rebrand — `grep -r "DevTracker" frontend/` would have caught all occurrences at once
2. `<title>` in `index.html` is the source of truth for the browser tab title in a Vite/React SPA; it is not dynamically set by any React component unless `react-helmet` or similar is used
3. Test assertions on visible text strings must be kept in sync with UI copy changes — a failing test here is the intended safety net

## Reusable Patterns
- For any rebrand or copy change: run a case-insensitive full-repo search for the old string before marking the ticket done (`grep -ri "oldname" .`)
- Update tests immediately alongside the source change, not as a separate step, to avoid broken test suites mid-branch
- Treat `index.html` as a UI file that needs review during any branding or copy audit, not just component files

## Files to Review for Similar Tasks
- `frontend/index.html` — browser tab title and any meta tags with brand references
- `frontend/src/components/AppLayout.tsx` — primary navbar/shell, contains the most visible brand placement
- `frontend/src/pages/LoginPage.tsx` and `RegisterPage.tsx` — unauthenticated entry points that typically include brand messaging
- `frontend/src/components/__tests__/AppLayout.test.tsx` — layout-level tests that assert on visible text

## Gotchas and Pitfalls
- Partial rebrands (updating some layers but not others) are a common source of follow-up tickets; always audit the full surface before closing a rebrand ticket
- Searching only TypeScript/TSX files will miss `index.html`, plain HTML templates, and any static assets with embedded text
- If the project ever adopts `react-helmet` or `@tanstack/react-head` for dynamic titles, the `index.html` title becomes a fallback only — document that change clearly so future rebrand audits look in the right place
