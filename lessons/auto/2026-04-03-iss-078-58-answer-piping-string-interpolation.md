---
date: "2026-04-03"
ticket_id: "ISS-078"
ticket_title: "5.8: Answer Piping / String Interpolation"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-03"
ticket_id: "ISS-078"
ticket_title: "5.8: Answer Piping / String Interpolation"
categories: ["string-interpolation", "expression-evaluation", "survey-engine"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/expressions/piping.py"
  - "backend/app/services/expressions/__init__.py"
  - "backend/tests/test_expressions_piping.py"
---

# Lessons Learned: 5.8: Answer Piping / String Interpolation

## What Worked Well
- Reusing the existing lexer/parser/evaluator pipeline for placeholder evaluation meant nested function calls like `{count({Q_multi})}` worked without any new infrastructure.
- The `_format_value` helper cleanly centralised all formatting rules (None → "", list → comma-space join, numerics → raw str), keeping `pipe()` itself focused on substitution logic.
- The established `MagicMock` helper pattern from prior test modules (`_make_question`, `_make_option`) made test setup concise and consistent with the rest of the test suite.
- Exporting the new public API from `__init__.py` with an explicit `__all__` section followed the module's existing convention perfectly.

## What Was Challenging
- The original plan specified a simple regex (`(?<!\\)\{([^}]+)\}`) for placeholder detection, but that approach is fundamentally incompatible with nested braces like `{count({Q_multi})}`. The regex was abandoned in favour of a depth-counting character scanner (`_scan_placeholders`), which required extra design work.
- Distinguishing bare variable references (`Q1`) from compound expressions (`count({Q_multi})`) required an additional regex guard (`_SIMPLE_VAR_RE`) to decide whether to re-wrap the inner content in `{}` before passing it to the lexer — a non-obvious subtlety.
- Escaped brace handling (`\{`, `\}`) had to be threaded through both the scanner (skip escape sequences during depth counting) and the final output (unescape after substitution), in two separate places.

## Key Technical Insights
1. **Regex is insufficient for nested braces.** The ticket's proposed regex `(?<!\\)\{([^}]+)\}` fails the moment placeholders contain nested braces. A depth-tracking scanner is the correct tool for this class of problem.
2. **The lexer expects `{var}` syntax, not bare identifiers.** Simple variable references inside a piping placeholder (`Q1`) must be re-wrapped as `{Q1}` before tokenising; compound expressions that already contain inner braces must not be double-wrapped.
3. **Unescape after substitution, not before.** Unescaping `\{` → `{` must happen on output segments (literal text between placeholders), never on the raw input before scanning, or the scanner will incorrectly treat the unescaped brace as a placeholder boundary.
4. **`evaluate()` returns `None` for unknown variables** rather than raising, so missing context keys resolve cleanly to empty string without special-casing in `pipe()`.
5. **`pipe_all` uses `getattr(question, "parent_id", None)` defensively** to remain compatible with both ORM objects and mock objects that may or may not have the attribute.

## Reusable Patterns
- **Depth-counting brace scanner** (`_scan_placeholders`): generically useful for any template language that allows nested balanced delimiters; extract or reference for future templating needs.
- **Segment-based string assembly**: building a `parts: List[str]` and joining at the end is more efficient and readable than repeated string concatenation for multi-substitution scenarios.
- **`_SIMPLE_VAR_RE` guard for expression wrapping**: the pattern of detecting whether content is a bare identifier vs. a compound expression before routing to the lexer is reusable anywhere the expression pipeline is called from a template context.
- **`_make_question` / `_make_option` MagicMock factory functions**: the lightweight ORM-mock pattern used throughout this test suite should be the standard approach for all expression-layer unit tests.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/piping.py` — reference implementation for brace scanning, expression routing, and value formatting.
- `backend/app/services/expressions/evaluator.py` — understand `evaluate()` return semantics (especially `None` for missing variables) before building any new consumer of the expression pipeline.
- `backend/app/services/expressions/relevance.py` — canonical example of the module pattern (dataclass results, public function signatures, error hierarchy) to follow when adding new expression-layer modules.
- `backend/tests/test_expressions_piping.py` — comprehensive test coverage patterns for pipe-style features; also the best example of the MagicMock ORM-object pattern.
- `backend/app/services/expressions/__init__.py` — must be updated whenever a new public symbol is added to the expressions package; follow the existing grouped `__all__` comment convention.

## Gotchas and Pitfalls
- **Do not use the ticket's regex directly.** `(?<!\\)\{([^}]+)\}` is documented in the ticket but is wrong for nested expressions. The depth-counting scanner in `_scan_placeholders` supersedes it.
- **Empty list formats as empty string, not `"[]"`.** `", ".join(...)` on an empty list returns `""`, which is the intended behaviour, but it can be surprising when debugging.
- **`pipe()` does not silently ignore bad expressions** — it raises `PipingError`. Callers that want fault-tolerant rendering must catch this explicitly.
- **Subquestion skipping in `pipe_all` is based on `parent_id is not None`**, not on question type. Any question with a parent_id set will be omitted from the output regardless of other attributes.
- **`None` title/description on a question object is normalised to `""` in `pipe_question`** before calling `pipe()`, so `pipe()` itself never receives `None` as input in normal usage — but `pipe("")` is defined to return `""` safely regardless.
```
