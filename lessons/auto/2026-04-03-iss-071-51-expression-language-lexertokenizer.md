---
date: "2026-04-03"
ticket_id: "ISS-071"
ticket_title: "5.1: Expression Language Lexer/Tokenizer"
categories: ["testing", "api", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-03"
ticket_id: "ISS-071"
ticket_title: "5.1: Expression Language Lexer/Tokenizer"
categories: ["lexer", "expressions", "tokenizer", "backend", "python"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/expressions/__init__.py"
  - "backend/app/services/expressions/lexer.py"
  - "backend/tests/test_expressions_lexer.py"
---

# Lessons Learned: 5.1: Expression Language Lexer/Tokenizer

## What Worked Well
- Reading EXPRESSION_LANGUAGE.md and the milestone doc before writing any code gave a complete picture of all token rules, escape sequences, and variable patterns upfront, preventing mid-implementation surprises.
- Defining `TokenType(str, Enum)` allowed token type values to compare equal to plain strings, eliminating the need for `isinstance` checks in downstream consumer code.
- Using explicit `__all__ = ['tokenize', 'Token', 'TokenType', 'LexerError']` in `__init__.py` made the public surface unambiguous and consistent with the existing `app/models/__init__.py` pattern.
- Running a smoke-test import (`python -c "from app.services.expressions import tokenize, Token, TokenType, LexerError"`) immediately after creating the package files caught any import-resolution issues before the test suite was written.
- Pinning the exactly-4096-char and exactly-4097-char boundary tests as separate named test functions made boundary failures immediately identifiable without parameterization confusion.

## What Was Challenging
- The `contains` keyword disambiguation required a lookahead that consumed whitespace without advancing the main cursor. A naive check of only the immediately next character fails silently when whitespace separates `contains` from `(`.
- Ensuring `LexerError` did not duplicate an existing error base class required reading `backend/app/utils/errors.py` before finalizing the inheritance chain — the existing `UnprocessableError` hierarchy made this a real risk.
- Verifying that `__init__.py` re-exports work correctly is separate from verifying that `lexer.py` works correctly; the smoke-test import is the only reliable check for the package surface.

## Key Technical Insights
1. `contains` has dual classification: it is a `STRING_OP` when used bare (no following `(`), and a `FUNCTION` when followed by `(` with optional whitespace. The lookahead must skip whitespace before checking for `(` and must not advance the main cursor if the condition is not met.
2. `LexerError` should carry a `position: int` field as a structured attribute on the exception object, not only embedded in the message string, so downstream callers can inspect error location programmatically.
3. Variable patterns use a permissive character scan (letters, digits, underscore, dot) followed by strict regex validation against `[A-Za-z_][A-Za-z0-9_.]*` — doing both in one pass conflates scanning and validation and is harder to debug.
4. Multi-char operators (`==`, `!=`, `>=`, `<=`) must be matched before their single-char prefixes (`=`, `!`, `>`, `<`) in the operator dispatch, or the two-char forms will never be reached.
5. The 4096-character limit should be enforced at the start of `tokenize()` before any scanning begins, not lazily during iteration, so the error position is always `0` for oversized input.

## Reusable Patterns
- `class TokenType(str, Enum)` for any token type enum that needs to serialize to JSON or compare equal to string literals without extra conversion.
- Lookahead without cursor advancement: save current position, skip whitespace in a local variable, check condition, discard local variable — never mutate `self._pos` in the lookahead path.
- `LexerError(ValueError)` with `self.position = position` set in `__init__` before calling `super().__init__(message)`.
- Explicit `__all__` in every new package `__init__.py`, mirroring the pattern used in `app/models/__init__.py`.
- Smoke-test import as the first check after creating a new package, before writing any test file.
- Separate named test functions for each side of an integer boundary (e.g., `test_length_limit_exactly_4096`, `test_length_limit_4097_raises`) rather than a single parameterized test.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/lexer.py` — reference implementation for a hand-written character-by-character lexer with position tracking.
- `backend/app/services/expressions/__init__.py` — reference for explicit `__all__` re-export pattern in a new services sub-package.
- `backend/app/utils/errors.py` — check before defining any new error class to avoid duplicating the existing error hierarchy.
- `backend/app/services/validators/__init__.py` — reference for module layout and `__all__` conventions in the validators/services layer.
- `backend/tests/test_expressions_lexer.py` — reference for boundary tests, error-case assertions, and position-tracking tests.
- `docs/EXPRESSION_LANGUAGE.md` — authoritative source for all token rules; must be read before implementing any expression-related component.

## Gotchas and Pitfalls
- Do not check only the immediately next character for `contains` disambiguation — whitespace between `contains` and `(` will break the classification silently.
- Do not rely on `__init__.py` passing its own import without running the smoke-test; it is possible for `lexer.py` to be internally correct while `__init__.py` fails to expose the public API.
- Do not define `LexerError` inheriting from a custom project base class without first reading `backend/app/utils/errors.py` — the existing hierarchy may already define a suitable parent or may conflict.
- Do not embed error position only in the message string — always set it as a structured field so callers do not need to parse the message.
- Do not enforce the 4096-char limit lazily mid-scan — enforce it at the top of `tokenize()` for a consistent error position and simpler scan logic.
- Do not match single-char operators before their two-char prefix variants — operator dispatch must always try the longer match first.
```
