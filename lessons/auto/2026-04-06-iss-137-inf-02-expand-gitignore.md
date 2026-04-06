---
date: "2026-04-06"
ticket_id: "ISS-137"
ticket_title: "INF-02: Expand .gitignore"
categories: ["testing", "feature", "performance", "config"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-137"
ticket_title: "INF-02: Expand .gitignore"
categories: ["infrastructure", "tooling", "configuration"]
outcome: "success"
complexity: "low"
files_modified: [".gitignore"]
---

# Lessons Learned: INF-02: Expand .gitignore

## What Worked Well
- Ticket scope was minimal and well-defined — a single file edit with clear acceptance criteria
- No tests required; verification was straightforward via visual inspection and `git status`
- No risk of breaking existing functionality

## What Was Challenging
- Nothing significant; this was a purely additive change to a configuration file

## Key Technical Insights
1. The root `.gitignore` was minimal at project start (only `.obsidian/` and `.DS_Store`), suggesting the project was bootstrapped without a standard template — worth catching early before build artifacts accumulate in git history
2. Adding these patterns retroactively is safe as long as the artifacts haven't already been committed; if they had been tracked, a `git rm --cached` pass would have been required

## Reusable Patterns
- Standard Python ignore set: `.env`, `venv/`, `__pycache__/`, `.coverage`, `.pytest_cache/`, `.mypy_cache/`
- Standard Node.js ignore set: `node_modules/`, `dist/`
- These sets should be included in any new project scaffold from day one

## Files to Review for Similar Tasks
- `.gitignore` — root-level ignore rules

## Gotchas and Pitfalls
- If any of the newly ignored paths were already tracked by git, adding them to `.gitignore` does NOT untrack them — `git rm --cached <path>` must be run explicitly to stop tracking
- `dist/` can be ambiguous in monorepos; confirm it doesn't conflict with intentionally committed build outputs
- `.env` should always be ignored to prevent accidental credential leaks; verify no `.env` file was previously committed before closing the ticket
```
