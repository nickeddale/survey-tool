---
date: "2026-04-03"
ticket_id: "ISS-074"
ticket_title: "5.4: Expression Validation Endpoint"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-074"
ticket_title: "5.4: Expression Validation Endpoint"
categories: ["fastapi", "expression-validation", "async-sqlalchemy", "testing", "semantic-analysis"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/api/logic.py
  - backend/app/services/expression_engine.py
  - backend/app/main.py
  - backend/tests/test_logic_validate_expression.py
---

# Lessons Learned: 5.4: Expression Validation Endpoint

## What Worked Well
- Reusing the existing expression pipeline (lexer/parser/evaluator) as a foundation meant syntax error detection required no new logic — wrap tokenize+parse in a try/except and map caught errors to SYNTAX_ERROR
- Separating the semantic validation into a dedicated `expression_engine.py` facade kept `logic.py` clean and made the validator independently testable via direct function calls
- Using raw column projections (`SELECT code, sort_order FROM questions WHERE survey_id = :survey_id`) instead of ORM relationship traversal avoided MissingGreenlet errors entirely in the async context
- The single-query ownership pattern (`WHERE id = :survey_id AND user_id = :user_id`) correctly returned 404 for both missing and unauthorized surveys without leaking existence

## What Was Challenging
- Walking the AST to collect Variable nodes required understanding the node structure from prior tickets (ISS-071/072); skimming `ast_nodes.py` before implementing the semantic pass was essential
- Forward reference detection depends on sort_order comparisons, which requires the endpoint to carry both the question's sort_order and the referencing question's sort_order through the validation context — easy to omit one and get silent false-negatives
- Ensuring the logic router was not double-registered in `main.py` required an explicit check before adding `include_router`

## Key Technical Insights
1. **Async SQLAlchemy prohibits implicit lazy loading.** Any ORM relationship traversal without `selectinload`/`joinedload` raises `MissingGreenlet` at runtime. For read-only validation endpoints, prefer raw column projections over loading full ORM objects.
2. **All pytest async fixtures must use `scope='function'`.** Session-scoped async engines cause event loop mismatch errors with asyncpg under pytest-asyncio — there is no workaround.
3. **DATABASE_URL default uses psycopg2 scheme.** Always override to `postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker` when running tests, or the async engine will fail silently.
4. **Semantic validation is a separate pass from parsing.** Syntax errors (LexerError/ParserError) are caught first; only on a clean parse does the AST walk for UNKNOWN_VARIABLE, FORWARD_REFERENCE, TYPE_MISMATCH, and UNSUPPORTED_FUNCTION proceed.
5. **Import smoke-test before any alembic or test run.** Running `python -c "from app.api.logic import router"` immediately surfaces broken imports with a clean traceback, saving time spent diagnosing confusing test collection errors.

## Reusable Patterns
- **Survey ownership check:** `SELECT id FROM surveys WHERE id = :survey_id AND user_id = :user_id` — single query, returns 404 for both missing and unauthorized, no existence leak
- **Question code projection:** `SELECT code, sort_order FROM questions WHERE survey_id = :survey_id ORDER BY sort_order` — avoids ORM relationship traversal in async context
- **Two-phase validation:** catch LexerError/ParserError → SYNTAX_ERROR first; on success, walk AST for semantic errors; never mix phases
- **Function-scoped async fixtures:** `@pytest_asyncio.fixture(scope='function')` for all engine/session/client fixtures
- **Test invocation:** `DATABASE_URL='postgresql+asyncpg://postgres:postgres@test-postgres:5432/devtracker' pytest backend/tests/test_logic_validate_expression.py -v`
- **Pydantic v2 schema separation:** distinct `ValidateExpressionRequest` and `ValidateExpressionResponse` schemas; never reuse input schemas for output

## Files to Review for Similar Tasks
- `backend/app/api/logic.py` — route structure, ownership check, two-phase validation orchestration
- `backend/app/services/expression_engine.py` — semantic validator facade, AST walking, ValidationResult assembly
- `backend/app/services/expressions/ast_nodes.py` — node types needed for AST traversal
- `backend/app/services/expressions/evaluator.py` — existing error types and evaluation context
- `backend/tests/test_logic_validate_expression.py` — fixture patterns and error code coverage

## Gotchas and Pitfalls
- **Do not check router registration by memory.** Always `grep` `main.py` for the logic router before adding `include_router` — duplicate registration causes silent route shadowing or startup errors
- **Forward reference context must be explicit.** If `question_sort_order` or `current_sort_order` is `None`, forward reference detection must be skipped gracefully, not raise an exception
- **UNSUPPORTED_FUNCTION detection requires a functions registry.** Check against the actual registered function names in `functions.py`, not a hardcoded list, so the validator stays in sync as functions are added
- **Empty expression is a valid edge case.** Decide and test whether an empty string is a SYNTAX_ERROR or returns an empty parsed_variables with no errors — be consistent with the evaluator's behavior
- **psycopg2 vs asyncpg URL scheme** will silently fail in tests if not overridden — always confirm `DATABASE_URL` before running the test suite
```
