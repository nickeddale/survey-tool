---
date: "2026-04-08"
ticket_id: "ISS-180"
ticket_title: "Backend 500 on response completion PATCH (status: complete)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-180"
ticket_title: "Backend 500 on response completion PATCH (status: complete)"
categories: ["bug-fix", "expressions", "caching", "multiple-choice"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/services/expressions/relevance.py", "backend/tests/test_responses.py"]
---

# Lessons Learned: Backend 500 on response completion PATCH (status: complete)

## What Worked Well
- MEMORY.md already documented the exact bug and fix pattern before work began — zero investigation overhead
- The fix was surgical: one line changed in `relevance.py` with no collateral changes needed
- Implementation plan correctly warned against over-engineering (no new data structures, no migrations, no model changes)

## What Was Challenging
- Ensuring the regression test actually exercises `relevance.py:278` (the `frozenset` line) rather than just hitting the `status=complete` path — a naive test would pass even without the fix
- The bug only surfaces when a multiple_choice answer is present AND `evaluate_relevance` is invoked during completion, making it easy to write a test that gives a false green

## Key Technical Insights
1. `frozenset(answers.items())` fails with `unhashable type: 'list'` when any answer value is a Python list — as multiple_choice answers are
2. The correct fix preserves cache semantics while restoring hashability: `frozenset((k, tuple(v) if isinstance(v, list) else v) for k, v in answers.items())`
3. Converting list → tuple is safe for cache keys because tuple equality mirrors list equality for identical sequences
4. The bug path: PATCH with `status=complete` → `complete_response()` → `evaluate_relevance()` → `frozenset(answers.items())` → crash
5. `evaluate_relevance` is called unconditionally on completion, so any survey with a multiple_choice answer will trigger the crash regardless of whether it has explicit relevance expressions

## Reusable Patterns
- Cache key construction over dicts with mixed-type values: always guard against unhashable types with `tuple(v) if isinstance(v, list) else v`
- Regression test structure for this bug class: (1) create survey with multiple_choice question, (2) POST response, (3) PATCH partial save with list answer, (4) PATCH `status=complete` and assert 200
- Run backend tests via Docker exclusively — Python 3.12 is not available on host: `docker compose up -d postgres && docker run --rm --network host -e DATABASE_URL=... -e JWT_SECRET=testsecret -e CORS_ORIGINS=http://localhost:3000 -v $(pwd)/backend:/app survey_tool-backend:latest python -m pytest tests/ -q`

## Files to Review for Similar Tasks
- `backend/app/services/expressions/relevance.py` — cache key construction and `evaluate_relevance` entry point
- `backend/app/services/expressions/resolver.py` — confirms multiple_choice answers are returned as Python lists
- `backend/tests/test_responses.py` — completion test patterns and fixture setup

## Gotchas and Pitfalls
- Do NOT change `frozenset` to a `dict` or sorted list — the tuple conversion approach is the minimal correct fix that preserves cache correctness
- Do NOT use `Body(...)` as a workaround for unrelated FastAPI param issues in the same file (separate known pitfall)
- A regression test that omits the partial-save PATCH step (so no list answer is stored) will pass even without the fix — the list value must be present in the answers context when `status=complete` is sent
- The `frozenset` cache is an optimization; if ever removed, the bug disappears — but removing it would be a performance regression, not a valid fix
```
