---
date: "2026-04-06"
ticket_id: "ISS-142"
ticket_title: "INF-07: Fix package.json name"
categories: ["ui", "bug-fix", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-142"
ticket_title: "INF-07: Fix package.json name"
categories: ["infrastructure", "configuration", "frontend"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/package.json"]
---

# Lessons Learned: INF-07: Fix package.json name

## What Worked Well
- The change was minimal and surgical — a single field update in one file
- Clear acceptance criteria made verification straightforward
- No downstream dependencies were broken by the rename

## What Was Challenging
- Nothing technically challenging; the main risk was ensuring no tooling relied on the old package name as an identifier

## Key Technical Insights
1. The `name` field in `package.json` can be referenced by internal scripts, monorepo tooling, or CI pipelines — always check for usages before renaming
2. Package names in `package.json` follow npm naming conventions (lowercase, hyphens allowed, no spaces)
3. For frontend-only apps not published to npm, the `name` field is primarily cosmetic but should still reflect the actual project to avoid confusion

## Reusable Patterns
- When renaming a package, grep the repo for the old name to catch any references in scripts, Docker configs, or CI workflows: `grep -r "devtracker-frontend" .`
- Validate with `npm run build` and `npm run lint` after any `package.json` metadata change to confirm no tooling regressions

## Files to Review for Similar Tasks
- `frontend/package.json` — primary file for frontend metadata and scripts
- `frontend/package-lock.json` — may also contain the `name` field and should stay in sync
- `.github/workflows/` — CI pipelines may reference package names
- `docker-compose.yml` and Dockerfiles — may reference project names in labels or build args

## Gotchas and Pitfalls
- `package-lock.json` also contains the `name` field at the root; if committed, it should be updated in the same change to stay consistent
- Monorepo setups using workspaces reference packages by their `name` field — renaming without updating workspace references breaks resolution
- Some CI caching strategies key on package name; a rename could invalidate or orphan old caches
```
