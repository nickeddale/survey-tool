---
date: "2026-04-06"
ticket_id: "ISS-125"
ticket_title: "CQ-03: Consolidate pagination into shared dependency"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-125"
ticket_title: "CQ-03: Consolidate pagination into shared dependency"
categories: ["refactoring", "fastapi", "pagination", "code-quality"]
outcome: "success"
complexity: "low"
files_modified:
  - backend/app/api/surveys.py
  - backend/app/api/responses.py
  - backend/app/api/participants.py
  - backend/app/api/quotas.py
  - backend/app/api/assessments.py
  - backend/app/api/webhooks.py
  - backend/app/api/questions.py
  - backend/app/api/answer_options.py
  - backend/app/dependencies.py
---

# Lessons Learned: CQ-03: Consolidate pagination into shared dependency

## What Worked Well
- The `PaginationParams` class and `pagination_params` dependency already existed in `dependencies.py`, so no new infrastructure was needed — the task was purely mechanical substitution.
- Grepping for `(page - 1) * per_page` before starting gave a clear, complete inventory of all inline offset calculations and bounded the blast radius accurately.
- Doing an import smoke-test (`python -c "from app.api.<module> import router"`) after each file caught signature mismatches immediately rather than at full test suite runtime.
- The implementation plan warnings about `questions.py` and `answer_options.py` using in-memory slicing proved accurate — those files required extra care to verify ORDER BY presence before switching to DB-level pagination.

## What Was Challenging
- `questions.py` and `answer_options.py` used in-memory slicing rather than DB-level `LIMIT`/`OFFSET`, meaning the migration was not purely a parameter swap — query semantics had to be verified first to ensure ORDER BY clauses were in place.
- Any test that called list-endpoint router functions directly (bypassing FastAPI DI) would have broken silently if not checked in advance; this required a targeted scan of test files before touching router signatures.

## Key Technical Insights
1. FastAPI's `Depends()` replaces individual `page: int = Query(...)` and `per_page: int = Query(...)` parameters with a single injected object. Tests calling the function directly without going through the FastAPI test client will no longer receive those keyword arguments and must be updated to pass a `PaginationParams` instance instead.
2. `PaginationParams.offset` should be a computed property (`(page - 1) * per_page`) not a raw field. Confirm this before using it — if it were a raw field, callers would still need to compute offset themselves, defeating the consolidation goal.
3. In-memory slicing (`items[offset:offset+per_page]`) and DB-level `LIMIT`/`OFFSET` are semantically equivalent only when the underlying query has a deterministic ORDER BY. Without one, results per page can differ across requests on the same dataset.
4. After all refactors, `grep -r '(page - 1) \* per_page' backend/app/api/` returning zero matches is the canonical verification that no inline offset math was missed.

## Reusable Patterns
- **Pre-refactor audit:** `grep -r '(page - 1) \* per_page' backend/app/api/` to enumerate every site before touching any file.
- **Import smoke-test per file:** `python -c "from app.api.<module> import router"` after each edit to surface broken imports early.
- **Split test execution:** Run `pytest backend/tests/test_pagination.py -v` in isolation first, then `pytest backend/tests/ -v` for the full suite. Isolation makes it easy to distinguish pagination-specific regressions from pre-existing failures.
- **Post-refactor verification grep:** Confirm zero occurrences of inline offset math remain before marking the ticket done.
- **Read before editing:** Always read `dependencies.py` and any utility file fully before touching routers — never assume `PaginationParams.offset` exists or has the expected shape.

## Files to Review for Similar Tasks
- `backend/app/dependencies.py` — canonical location for shared FastAPI dependencies; verify signature and computed properties before referencing.
- `backend/app/utils/pagination.py` — pagination utility; confirm alignment with `PaginationParams`.
- `backend/app/api/questions.py` — example of in-memory slicing pattern that required ORDER BY verification before DB-level migration.
- `backend/app/api/answer_options.py` — same in-memory slicing pattern as `questions.py`.

## Gotchas and Pitfalls
- **Do not assume `PaginationParams.offset` exists as a computed property.** Verify before use; a raw field would require callers to compute offset themselves.
- **In-memory slicing hides missing ORDER BY.** When migrating from slice-based to DB-level pagination, always confirm the query has an explicit ORDER BY or page boundaries become non-deterministic.
- **Direct function calls in tests bypass FastAPI DI.** After replacing `page`/`per_page` Query params with `Depends(pagination_params)`, any test calling the router function directly will fail. Scan for direct calls before refactoring.
- **Do not batch file edits without intermediate smoke-tests.** Editing all eight routers before running any check makes it difficult to isolate which file introduced a regression.
```
