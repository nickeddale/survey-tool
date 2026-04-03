---
date: "2026-04-03"
ticket_id: "ISS-076"
ticket_title: "5.6: Conditional Display / Relevance Expressions"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-076"
ticket_title: "5.6: Conditional Display / Relevance Expressions"
categories: ["expressions", "survey-engine", "testing", "async", "caching"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/expressions/relevance.py"
  - "backend/app/services/expressions/__init__.py"
  - "backend/app/services/expression_engine.py"
  - "backend/tests/test_expressions_relevance.py"
---

# Lessons Learned: 5.6: Conditional Display / Relevance Expressions

## What Worked Well
- Building on the existing expression pipeline (lexer, parser, evaluator, resolver) meant the relevance layer only needed to orchestrate existing primitives rather than re-implement evaluation logic.
- Null relevance defaulting to always-visible was a clean, simple rule that required no special-casing in most paths.
- Group-level hiding logic composed naturally: collect hidden groups first, then mark all child questions hidden unconditionally before evaluating question-level expressions.
- Using `frozenset(answers.items())` as the cache key correctly handles both key identity and value identity, avoiding false cache hits when different keys map to the same values.
- DFS cycle detection on the dependency graph caught circular references cleanly before any evaluation was attempted.

## What Was Challenging
- Circular import risk was real: relevance.py imports from evaluator.py and resolver.py, and __init__.py re-exports all three. Required careful import graph review before finalizing module structure.
- pytest collection errors from broken imports surface as cryptic failures rather than Python tracebacks, making the root cause hard to identify without a prior import smoke-test.
- Async SQLAlchemy fixture scoping: session-scoped async engines cause event loop mismatch errors with asyncpg under pytest-asyncio with no viable workaround.

## Key Technical Insights
1. Always verify the import graph before adding a new module to an existing package that already has cross-imports. A new file that imports from two siblings while __init__.py imports all three can easily create a cycle.
2. Cache keying for answer dicts must use `frozenset(answers.items())` (key-value tuples), not `frozenset(answers.values())`, to distinguish cases where different keys share the same values.
3. Group-level hiding must take priority over question-level relevance: evaluate group expressions first, collect hidden group IDs, then force-hide all questions belonging to those groups before evaluating individual question expressions.
4. Circular reference detection via dependency graph DFS must extract variable references from parsed expression ASTs rather than raw text to avoid false positives from variable names appearing in string literals or comments.
5. `asyncio_mode = 'auto'` in pyproject.toml eliminates per-test `@pytest.mark.asyncio` decoration — confirm this is set before writing any async tests.
6. The default DATABASE_URL uses the psycopg2 scheme; async engines require `postgresql+asyncpg://` or the engine fails silently without a clear error.

## Reusable Patterns
- **Import smoke-test gate:** Before running pytest on any new module, run `python -c 'from app.services.expressions.relevance import evaluate_relevance, RelevanceResult'` to surface import errors as clear tracebacks.
- **Cache key pattern:** `cache_key = frozenset(answers.items())` — safe for any dict-keyed memoization of evaluation results.
- **Async fixture scope:** All async SQLAlchemy fixtures must declare `scope='function'`; never use `scope='session'` with asyncpg/pytest-asyncio.
- **pytest invocation with async DB:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/<db>' pytest backend/tests/test_expressions_relevance.py`
- **Post-export smoke-test:** After updating __init__.py to add new exports, re-run the import smoke-test before the full suite to catch any newly introduced circular chains.
- **Group-before-question evaluation order:** Always resolve group visibility before question visibility so that group hiding can override question-level expressions unconditionally.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/relevance.py` — reference implementation for relevance evaluation, group-level hiding, cycle detection, and caching.
- `backend/app/services/expressions/__init__.py` — shows safe export pattern that avoids circular imports across evaluator, resolver, and relevance modules.
- `backend/app/services/expression_engine.py` — helpers for extracting variable references from parsed expressions, useful for any future dependency graph work.
- `backend/tests/test_expressions_relevance.py` — canonical test patterns for mock survey/group/question objects, cache hit assertions, and circular reference error expectations.
- `backend/app/services/expressions/resolver.py` — variable resolution API that relevance.py depends on; review before extending the expression pipeline further.

## Gotchas and Pitfalls
- **Silent async engine failure:** Using `postgresql+psycopg2://` instead of `postgresql+asyncpg://` in tests does not raise an obvious error — queries simply never complete or return wrong results.
- **Session-scoped async fixtures:** There is no workaround for event loop mismatch errors with session-scoped async engines under asyncpg/pytest-asyncio. Always use `scope='function'`.
- **Circular import from __init__.py:** Adding a new module to the package that cross-imports siblings will silently break if __init__.py imports all siblings at the top level. Verify the import order and use lazy imports if necessary.
- **frozenset(answers.values()) cache bug:** Using only values (not items) as the cache key causes false cache hits when two different answer dicts share the same value set under different keys — a subtle correctness bug.
- **pytest collection vs. import errors:** A broken import in relevance.py will appear as a pytest collection error with no Python traceback, not as an ImportError. Always run the smoke-test first.
- **Cycle detection scope:** Cycle detection must run across the full set of expressions before any evaluation begins, not lazily during evaluation, or partial evaluation may occur before the cycle is detected.
```
