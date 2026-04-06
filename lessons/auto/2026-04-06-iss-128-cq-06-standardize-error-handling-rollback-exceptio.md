---
date: "2026-04-06"
ticket_id: "ISS-128"
ticket_title: "CQ-06: Standardize error handling (rollback + exception chaining)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-06"
ticket_id: "ISS-128"
ticket_title: "CQ-06: Standardize error handling (rollback + exception chaining)"
categories: ["error-handling", "code-quality", "exception-chaining"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/expressions/functions.py"
  - "backend/app/services/expressions/evaluator.py"
  - "backend/app/services/question_service.py"
  - "backend/app/services/answer_option_service.py"
---
```

# Lessons Learned: CQ-06: Standardize error handling (rollback + exception chaining)

## What Worked Well
- The plan was precise: exact file paths and approximate line numbers were identified upfront, making implementation mechanical and fast.
- Changes were purely additive to exception metadata — no control flow was altered, so existing tests validated correctness without new test authorship.
- The scope was well-bounded: four files, ~5 targeted one-line fixes.
- Separating the explore phase (reading context) from the implement phase prevented blind edits and confirmed assumptions before touching code.

## What Was Challenging
- Identifying all sites required reading multiple files; a project-wide `grep` for `except` blocks without `from` chaining is more reliable than relying on line-number estimates alone.
- `concurrent.futures.TimeoutError` required both capturing the exception (`as exc`) AND adding `from exc` — a two-part change vs. the single-part change for other sites.
- Helper-function indirection (the `_error()` pattern in `functions.py`) obscures whether chaining is actually preserved end-to-end, requiring tracing through the helper to confirm behavior.

## Key Technical Insights
1. Python's `raise NewException(...) from exc` preserves the original traceback as `__cause__`, which is critical for debuggability — without it, the root cause is silently discarded.
2. `raise SomeError(...) from None` is an intentional suppression pattern (used when the original exception is irrelevant to callers) and should not be treated as a missing-chain bug; distinguish it from accidental omission.
3. When a helper function accepts an exception argument and re-raises internally, chain validation must follow the call graph, not just the local `except` block.
4. `concurrent.futures.TimeoutError` handlers often lack `as exc` capture because the exception itself carries no useful message — but chaining still preserves stack context and should be added.
5. All database mutation `except` blocks must call `session.rollback()` before re-raising to prevent the session from being left in an inconsistent state for the next operation on the same session.

## Reusable Patterns
- **Standard DB mutation handler:**
  ```python
  except IntegrityError as exc:
      await session.rollback()
      raise ConflictError("...") from exc
  ```
- **Standard expression evaluation handler:**
  ```python
  except (TypeError, ValueError) as exc:
      raise EvaluationError("...") from exc
  ```
- **Timeout with chaining:**
  ```python
  except concurrent.futures.TimeoutError as exc:
      raise EvaluationError("...") from exc
  ```
- Grep pattern to audit missing chains: `except \w+ as exc:` blocks followed by `raise` without `from exc`.

## Files to Review for Similar Tasks
- `backend/app/services/expressions/evaluator.py` — multiple evaluated-expression error paths; verify all surface `EvaluationError` with chaining.
- `backend/app/services/expressions/functions.py` — helper `_error()` indirection; confirm helper preserves chain.
- `backend/app/services/question_service.py` — two `IntegrityError` sites (create and update paths) with rollback.
- `backend/app/services/answer_option_service.py` — single `IntegrityError` site with rollback.
- Any new service file that handles DB mutations should be reviewed against the standard DB mutation handler pattern above.

## Gotchas and Pitfalls
- Do not confuse `raise ... from None` (intentional suppression) with a missing `from exc` — the former is correct in cases where the internal exception would leak implementation details to callers.
- Line-number estimates in implementation plans drift as code evolves; always re-read the file before editing rather than jumping directly to the estimated line.
- Adding `from exc` to a `raise` inside a helper function called from an `except` block does NOT chain correctly — the chain must be established at the `raise` site within the `except` block itself, or the exception must be threaded through the helper.
- `session.rollback()` must be awaited (`await session.rollback()`) in async SQLAlchemy contexts; omitting `await` silently skips the rollback.
