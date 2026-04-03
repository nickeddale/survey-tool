---
date: "2026-04-03"
ticket_id: "ISS-072"
ticket_title: "5.2: Expression Language Parser (AST Generation)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-072"
ticket_title: "5.2: Expression Language Parser (AST Generation)"
categories: ["parser", "ast", "expression-language", "python", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/expressions/ast_nodes.py"
  - "backend/app/services/expressions/parser.py"
  - "backend/app/services/expressions/__init__.py"
  - "backend/tests/test_expressions_parser.py"
---

# Lessons Learned: 5.2: Expression Language Parser (AST Generation)

## What Worked Well
- Recursive descent parsing maps cleanly onto operator precedence levels — one function per precedence tier (parse_or, parse_and, parse_not, parse_comparison, parse_primary) makes the grammar self-documenting and easy to extend.
- Dataclass-based AST nodes with positional fields (start, end) are lightweight and give free equality comparison, which makes assertion-heavy unit tests concise.
- Building on the ISS-071 lexer as a dependency kept the parser implementation focused — no tokenization logic needed, just consuming a well-typed token list.
- The parse_expr(expr_str) helper pattern (tokenize then parse in one call) kept test code readable and reduced boilerplate across parametrized cases.
- Running an import smoke-test immediately after creating each new file and after updating __init__.py caught broken exports before pytest collection surfaced them as cryptic errors.

## What Was Challenging
- Operator precedence for string operators (contains, starts_with, ends_with) and the membership operator (in) needed deliberate placement at the comparison tier — their keyword nature made them easy to overlook when mapping TokenType values to precedence tiers.
- Updating __init__.py without clobbering existing lexer exports (tokenize, Token, TokenType) required reading the file first; a blind rewrite would have silently broken the ISS-071 surface.
- Left-to-right associativity for same-precedence binary operators must be implemented with an iterative loop (not recursion) in each parse_* tier function — accidentally using right-recursion produces correct results for most tests but fails on chained comparisons.

## Key Technical Insights
1. Use `dataclasses.field(default_factory=list)` for any list-typed field in an AST node dataclass (FunctionCall.args, ArrayLiteral.elements). A bare `= []` mutable default raises TypeError at class definition time in Python 3.7+ — it will never reach test time.
2. ParserError should carry an integer `position` attribute (token index or character offset), not just a message string. Tests must assert on the position value, not only on the message — field presence is not the same as field correctness, and position tracking is a stated ticket requirement.
3. The import smoke-test pattern (`python -c 'from app.services.expressions import parse, ParserError'`) should be run after every __init__.py edit. Broken re-exports produce opaque pytest collection failures that are much harder to trace than a direct import traceback.
4. parse_primary must handle the EOF/empty-token case explicitly and raise ParserError with a meaningful message — falling through to an unhandled state produces an IndexError with no position context.
5. Separating tokenize and parse into two explicit steps in the test helper makes it possible to assert on tokenize output independently when a parser test fails unexpectedly, pinpointing whether the fault is in the lexer or the parser.

## Reusable Patterns
- **Precedence-tier function chain:** parse_or → parse_and → parse_not → parse_comparison → parse_primary. Each function calls the next-higher-precedence function for its operands. Add new precedence levels by inserting a new function into the chain.
- **Import smoke-test before full suite:** `python -c 'from <package> import <all public symbols>'` after each new file and after each __init__.py update.
- **Dataclass AST nodes with position fields:** `@dataclass class BinaryOp(ASTNode): op: str; left: ASTNode; right: ASTNode` with `start: int = 0; end: int = 0` on the base class. Cheap, equality-comparable, and IDE-friendly.
- **parse_expr helper:** `def parse_expr(s): return parse(tokenize(s))` — one line, used everywhere in tests.
- **ParserError with position:** `raise ParserError(f"Unexpected token '{tok.value}' at position {tok.start}", position=tok.start)`.
- **Read __init__.py before editing:** always append new exports to the existing block; never rewrite the entire file when adding symbols from a new module.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/parser.py` — reference implementation for recursive descent with Pratt-style precedence tiers.
- `backend/app/services/expressions/ast_nodes.py` — canonical pattern for dataclass AST nodes with position tracking and mutable-list fields.
- `backend/app/services/expressions/__init__.py` — shows how to extend a package's public surface across multiple submodules without clobbering existing exports.
- `backend/tests/test_expressions_parser.py` — parametrized test patterns for precedence, associativity, error cases, and position verification.
- `backend/app/services/expressions/lexer.py` (ISS-071) — upstream dependency; review when debugging unexpected tokenize failures that appear as parser test failures.

## Gotchas and Pitfalls
- **Mutable dataclass defaults:** `args: list = []` on a dataclass field raises TypeError immediately at import time — use `field(default_factory=list)` always.
- **Shadowing lexer exports:** editing __init__.py without reading it first can silently drop tokenize/Token/TokenType, breaking all downstream lexer consumers.
- **Right-recursive same-precedence tiers:** accidentally making parse_and or parse_or right-recursive produces wrong associativity for chained operators (a and b and c becomes a and (b and c) instead of (a and b) and c).
- **String/membership operators as keywords:** contains, starts_with, ends_with, and in are TokenType keywords, not symbolic operators — the comparison tier must match on TokenType, not on a raw string value comparison.
- **Empty expression:** parse() called with only an EOF token (or an empty list) must raise ParserError, not IndexError — guard parse_primary against this case explicitly.
- **Position on synthesized nodes:** when wrapping a sub-expression in a UnaryOp or BinaryOp, set start from the operator token and end from the rightmost child node to keep position ranges accurate for error reporting.
```
