---
date: "2026-04-09"
ticket_id: "ISS-191"
ticket_title: "ISS-191: resolve-flow still crashes — option.label should be option.title"
categories: ["testing", "api", "ui", "bug-fix", "feature", "documentation", "config"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-09"
ticket_id: "ISS-191"
ticket_title: "ISS-191: resolve-flow still crashes — option.label should be option.title"
categories: ["bug-fix", "attribute-error", "piping", "survey-logic"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/api/logic.py"]
---
```

# Lessons Learned: ISS-191: resolve-flow still crashes — option.label should be option.title

## What Worked Well
- The bug was precisely located and described in the ticket, making implementation straightforward
- The fix was a single-character-group change (`label` → `title`) with no side effects
- The existing test suite provided confidence that the change did not regress other behavior

## What Was Challenging
- The bug only surfaced during E2E testing (Round 5), not during unit or integration tests — attribute name mismatches are silent until runtime
- The fallback/except path is inherently less-tested code, making it a hotspot for this class of bug

## Key Technical Insights
1. The `AnswerOption` model uses `option.title` not `option.label` — any code iterating answer options must use `.title` for the display text attribute
2. Error-handling/fallback paths (inside `except` blocks) are frequently written quickly and are more prone to copy-paste or naming errors than primary code paths
3. A `AttributeError` in a fallback path converts a recoverable piping error into a hard 500, compounding the original issue — fallback paths need the same rigor as primary paths

## Reusable Patterns
- When writing fallback paths that mirror primary logic, immediately verify all attribute names against the actual model definition rather than inferring from context
- Add at least a smoke test for every `except` block that constructs a response — if the fallback raises, the user still gets a 500

## Files to Review for Similar Tasks
- `backend/app/api/logic.py` — contains the resolve-flow and piping fallback logic; audit all `option.*` attribute accesses
- `backend/app/models/` — source of truth for `AnswerOption` and related model field names
- `backend/app/services/expressions/piping.py` — primary piping path that the except block shadows; keep attribute names consistent between both

## Gotchas and Pitfalls
- `option.label` does not exist on `AnswerOption`; the correct attribute is `option.title` — this will not raise at import time, only at runtime when the except branch is reached
- The fallback path was introduced by a prior fix (ISS-187) and was never exercised by the test suite, so the typo survived review and CI
- Any future refactor that renames model fields must grep for all attribute accesses, including inside except blocks and fallback paths that are not covered by happy-path tests
