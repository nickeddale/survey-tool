---
date: "2026-04-03"
ticket_id: "ISS-073"
ticket_title: "5.3: Expression Evaluator"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-073"
ticket_title: "5.3: Expression Evaluator"
categories: ["expression-language", "ast", "evaluator", "testing", "python"]
outcome: "success"
complexity: "high"
files_modified:
  - "backend/app/services/expressions/evaluator.py"
  - "backend/app/services/expressions/functions.py"
  - "backend/app/services/expressions/__init__.py"
  - "backend/tests/test_expressions_evaluator.py"
---

# Lessons Learned: 5.3: Expression Evaluator

## What Worked Well
- Dispatching on operator strings via a dict lookup rather than if/elif chains kept the evaluator clean and easy to extend
- Structuring functions.py so each built-in raises EvaluationError directly eliminated the need for exception re-wrapping in the dispatcher
- Running an import smoke-test (`python -c "from app.services.expressions.evaluator import evaluate, Evaluator, EvaluationError"`) immediately after file creation caught broken imports as clean tracebacks before any integration work
- Reading __init__.py before adding exports prevented name collisions with existing lexer/parser symbols
- Applying the 10000-char truncation to the string representation of the resolved value (after type coercion) avoided ambiguous behavior on numeric and collection types

## What Was Challenging
- SIGALRM-based timeout is only valid in the main thread on Linux; evaluator call contexts that run in worker threads required a fallback using `concurrent.futures.ThreadPoolExecutor` with a timeout parameter
- Timeout tests using real wall-clock sleep are inherently flaky in CI due to variable runner speed — deterministic timeout testing required mocking or injecting a configurable timeout threshold
- Operator string case in BinaryOp/UnaryOp nodes had to be verified against ast_nodes.py before writing the dispatch table; a silent case mismatch produces misleading "unsupported operator" errors with no obvious cause

## Key Technical Insights
1. Truncate variable values **after** string coercion, not before. Applying the 10000-char limit to the raw value before converting to string produces undefined behavior for integers and lists.
2. SIGALRM is not thread-safe on Linux. If the evaluator may be called from a non-main thread (e.g., inside a web framework worker), provide a `concurrent.futures` fallback or accept a configurable timeout parameter.
3. All 8 built-in functions must raise `EvaluationError` (not `ValueError` or `TypeError`) for type mismatches. The dispatcher should be a thin router, not an exception translator.
4. Verify operator string literals from ast_nodes.py exhaustively before writing the dispatch table — a single case mismatch (e.g., `'AND'` vs `'and'`) silently falls through to an unhandled-node error with no indication of the real cause.
5. Short-circuit evaluation for `and`/`or` must evaluate the left operand first and only evaluate the right operand if needed — do not resolve both sides eagerly before applying the operator.
6. Do not use passlib anywhere in this module. If regex_match or any other function needs encoding/hashing, use `hashlib` or the standard library. bcrypt 5.0.0 is installed; passlib 1.7.x raises `AttributeError` at runtime.

## Reusable Patterns
- **Import smoke-test pattern**: After creating any new module, run `python -c "from <module> import <symbols>"` before writing tests or integration code.
- **Dispatch table pattern**: Use a `dict` mapping operator strings to callables for BinaryOp/UnaryOp evaluation instead of if/elif chains. Populate the table from constants verified against ast_nodes.py.
- **EvaluationError with position**: Include both a `message` and a `position` attribute (character offset from the AST node) on EvaluationError to keep error propagation consistent across the lexer → parser → evaluator pipeline.
- **Deterministic timeout testing**: Inject a configurable `timeout_ms` parameter into `evaluate()` and override it in tests rather than relying on real sleep durations.
- **Coerce-then-truncate**: Always convert a resolved variable to its string representation before applying length limits.
- **Thread-safe timeout fallback**: Wrap SIGALRM-based timeout in a check for main-thread context (`threading.current_thread() is threading.main_thread()`); use `concurrent.futures.ThreadPoolExecutor` otherwise.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/ast_nodes.py` — source of truth for all node types and operator string literals; must be read before writing any evaluator dispatch table
- `backend/app/services/expressions/parser.py` — confirms which AST structures are actually produced; reveals edge cases (e.g., nested function calls, chained comparisons) the evaluator must handle
- `backend/app/services/expressions/__init__.py` — must be read before adding exports to detect shadowing of existing lexer/parser symbols
- `backend/tests/test_expressions_parser.py` — documents expected AST shapes and edge cases; use as the primary reference for evaluator test case design
- `backend/tests/test_expressions_evaluator.py` — reference for timeout mocking pattern and EvaluationError assertion style

## Gotchas and Pitfalls
- **passlib is broken at runtime**: Do not import or use passlib anywhere in evaluator.py or functions.py. Use `hashlib` or stdlib only.
- **SIGALRM thread restriction**: Signal-based timeout silently does nothing (or raises) when called from a non-main thread. Always guard with a thread check.
- **Flaky CI timeout tests**: Any test that sleeps a real number of milliseconds and asserts on timeout behavior will fail intermittently on slow CI runners. Mock the timeout or parameterize it.
- **Operator string case mismatch**: A dispatch table that maps `'AND'` when ast_nodes.py uses `'and'` will produce a generic "unsupported operator" error with no indication that the table is wrong — always verify exact string literals from the source node definitions.
- **Truncation order matters**: Truncating a list or integer before string coercion is undefined behavior. Coerce first, then slice the string.
- **EvaluationError specificity in tests**: Assert that `EvaluationError` is raised (not `Exception` or `KeyError`) for every error path — missing variable, type mismatch, invalid regex pattern, and timeout. Catching the wrong exception type produces false-positive test passes.
- **__init__.py name collision risk**: The existing __init__.py may already export a symbol with the same name (e.g., a parser-level helper also named `evaluate`). Read the file before adding exports; a collision causes silent import shadowing.
```
