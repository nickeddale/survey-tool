---
date: "2026-04-03"
ticket_id: "ISS-082"
ticket_title: "5.12: Expression Language Test Suite"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-082"
ticket_title: "5.12: Expression Language Test Suite"
categories: ["testing", "expressions", "pytest", "security"]
outcome: "success"
complexity: "medium"
files_modified: ["backend/tests/test_expressions.py", "backend/tests/test_logic.py"]
---

# Lessons Learned: 5.12: Expression Language Test Suite

## What Worked Well
- Using `pytest.mark.parametrize` with descriptive `ids=[...]` made failure output immediately actionable — failed cases named the specific operator or function rather than a numeric index like `test_evaluator[3]`
- Reading EXPRESSION_LANGUAGE.md directly and hardcoding verbatim input strings and expected outputs for the 12 integration tests prevented doc-to-implementation drift
- Verifying error code string constants (SYNTAX_ERROR, UNKNOWN_VARIABLE, TYPE_MISMATCH, UNSUPPORTED_FUNCTION) directly from source files rather than trusting the ticket description caught at least one potential naming mismatch before tests were written
- Running `python -c 'import tests.test_expressions; import tests.test_logic'` as an import smoke-test before invoking pytest surfaced import errors as clean tracebacks rather than cryptic pytest collection failures
- Cross-referencing existing test files (test_expressions_lexer.py, test_expressions_parser.py, test_expressions_evaluator.py, test_logic_validate_expression.py) before writing parametrize tables prevented duplicate test cases and avoided CI bloat

## What Was Challenging
- Determining the exact layer (evaluator vs. engine wrapper) at which timeout enforcement occurs required reading expression_engine.py carefully before writing the timeout security test — the exception type and error code differ depending on where enforcement happens
- Structuring security tests for the 4096-char length limit and 100ms timeout without fake timers required asserting on real raised exceptions and error codes, which meant the test design had to match the actual enforcement mechanism precisely
- Avoiding verbatim duplication of cases from existing test files while still being self-contained and comprehensive required deliberate cross-referencing rather than writing from scratch

## Key Technical Insights
1. Broadly-caught exceptions can produce false-passing tests for error code cases — every parametrized error code case must include an explicit assertion on the error code string, not just that an exception was raised
2. Async fixtures in test files that include timeout/security tests must use `scope='function'`; session-scoped async fixtures cause event loop mismatch errors under pytest-asyncio
3. Fake timer patches (monkeypatch of `time` or `asyncio`) must never be combined with async infrastructure in timeout tests — they block promise/coroutine resolution and produce false failures; use real timers and assert on raised exceptions
4. Error code constant names in source code can drift from documentation over time; always read the source implementation files directly to confirm exact string values before writing assertions

## Reusable Patterns
- Import smoke-test before pytest run: `python -c 'import tests.test_expressions; import tests.test_logic'`
- Parametrize IDs pattern: `pytest.mark.parametrize('expr,expected', [...], ids=['op_gt_int', 'func_len_string', ...])`
- Security test pattern for timeout: assert on specific exception type and error code from `expression_engine.py`, not a broad base exception
- Integration test pattern: read doc file directly, copy input strings and expected outputs verbatim into parametrize tuples
- Error code verification pattern: grep source files for the constant names before hardcoding them in test assertions

## Files to Review for Similar Tasks
- `backend/app/services/expression_engine.py` — timeout enforcement layer and error code constants
- `backend/app/services/expressions/evaluator.py` — evaluator-level error codes and exception hierarchy
- `docs/EXPRESSION_LANGUAGE.md` — canonical source for integration test inputs and expected outputs
- `backend/tests/test_expressions_lexer.py`, `test_expressions_parser.py`, `test_expressions_evaluator.py`, `test_logic_validate_expression.py` — existing coverage to cross-reference before writing new parametrize tables

## Gotchas and Pitfalls
- Do not assume a passing test means the correct error code was returned — always add an explicit assertion on the error code string in every error code parametrize case
- Do not use fake timers (`pytest monkeypatch` of `time` or `asyncio`) alongside async infrastructure in timeout security tests — they block resolution and produce misleading failures
- Do not paraphrase or reconstruct EXPRESSION_LANGUAGE.md examples from memory — copy them verbatim to avoid subtle input/output mismatches
- Do not use session-scoped async fixtures; always use `scope='function'` to avoid event loop mismatch errors
- Do not mark all parametrized test cases complete until each variant has individually passed — a single failing variant is easy to miss in verbose output; pipe pytest output to a file and review fully
- Duplicate parametrize cases from existing test files create CI bloat and maintenance debt when the implementation changes — cross-reference before writing new tables
```
