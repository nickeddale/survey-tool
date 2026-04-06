---
date: "2026-04-06"
ticket_id: "ISS-147"
ticket_title: "FE-04: Extract shared loading skeleton component"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-147"
ticket_title: "FE-04: Extract shared loading skeleton component"
categories: ["frontend", "refactoring", "components", "skeleton", "typescript"]
outcome: "success"
complexity: "low"
files_modified:
  - frontend/src/components/common/DashboardSkeleton.tsx
  - frontend/src/components/common/SurveyListSkeleton.tsx
  - frontend/src/components/common/index.ts
  - frontend/src/pages/DashboardPage.tsx
  - frontend/src/pages/SurveysPage.tsx
---

# Lessons Learned: FE-04: Extract shared loading skeleton component

## What Worked Well
- The implementation plan's explicit warnings about barrel file collision and closure variable capture prevented common silent failures before they occurred
- Reading target page files first (DashboardPage, SurveysPage) before writing any new code confirmed whether inline skeleton functions closed over page-level state — essential for determining what props the extracted components needed
- Checking `components/common/` for an existing `index.ts` before creating one avoided overwriting and silently removing exports used elsewhere
- The className-by-className diff approach between original inline JSX and extracted component output served as a reliable, browser-free visual regression check
- Extracted components were pure presentational (no hooks, no data fetching), making the move to `components/common/` straightforward

## What Was Challenging
- Inline functions defined inside page components have implicit closure access to page-level state; distinguishing what was a closure capture vs. a derived constant required careful reading before extraction
- Ensuring the barrel `index.ts` appended rather than replaced exports required an explicit read-before-write discipline even when the implementation plan already warned about it

## Key Technical Insights
1. Inline skeleton functions inside page components may silently capture page-level variables via closure — any such variable must become an explicit prop on the extracted component or a runtime error or wrong render will occur without a compile-time warning
2. `components/common/index.ts` barrel files are append-only during extraction tasks — creating a new file at that path without reading first will silently remove all existing exports, breaking pages that depend on them
3. Pure presentational components (no hooks, no side effects) are safe candidates for `components/common/`; any component with hooks must have its hook wiring resolved before extraction
4. `tsc --noEmit` run after all refactors catches broken imports as clear TypeScript errors rather than confusing build failures — run it before `npm run build` as a faster first gate
5. Accessibility attributes (`aria-label`, `aria-busy`, `data-testid`) and exact `className` strings must be carried over verbatim from inline implementations to extracted components — these are invisible to visual inspection but affect test coverage and screen reader behavior

## Reusable Patterns
- **Read-before-extract**: Always read the source page file to identify closure variables before creating the extracted component's prop interface
- **Barrel append discipline**: Read `index.ts` (or confirm absence) before writing — append new exports, never overwrite
- **className diff check**: After extraction, compare className strings between original inline JSX and new component render to verify visual parity without a browser
- **TypeScript smoke test gate**: Run `tsc --noEmit` in the frontend directory as the first post-refactor check before a full build
- **Presentational purity gate**: Confirm extracted components contain no hooks or data fetching before placing them in `components/common/`

## Files to Review for Similar Tasks
- `frontend/src/components/common/index.ts` — barrel file; always read before modifying
- `frontend/src/components/common/DashboardSkeleton.tsx` — reference for stat-card + survey-list skeleton pattern
- `frontend/src/components/common/SurveyListSkeleton.tsx` — reference for repeating survey-row skeleton pattern
- `frontend/src/pages/DashboardPage.tsx` — shows how to import and use DashboardSkeleton
- `frontend/src/pages/SurveysPage.tsx` — shows how to import and use SurveyListSkeleton

## Gotchas and Pitfalls
- **Closure capture is invisible at the call site** — an inline `LoadingSkeleton` that references a page-level `count` or config value looks like a zero-prop component but will break silently when extracted without that prop
- **Overwriting `index.ts` removes all prior exports** — other pages importing from `components/common` will get `undefined` or module-not-found errors with no warning at the barrel file itself
- **Skeleton components must preserve exact `className` strings** — Tailwind purges unused classes at build time; any class string that doesn't appear verbatim in source will be stripped, causing invisible style regressions in production
- **Accessibility attributes are not caught by TypeScript** — `aria-busy`, `aria-label`, and `data-testid` omissions pass the type checker and build but break screen reader support and automated tests
- **`tsc --noEmit` vs `npm run build` order matters** — TypeScript errors surface more clearly and faster via `tsc --noEmit`; running build first produces noisier output that obscures the root import error
```
