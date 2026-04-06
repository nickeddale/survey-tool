---
date: "2026-04-06"
ticket_id: "ISS-127"
ticket_title: "CQ-05: Add precise type hints in validators"
categories: ["testing", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-127"
ticket_title: "CQ-05: Add precise type hints in validators"
categories: ["type-hints", "mypy", "code-quality", "validators"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/services/validators/__init__.py"
  - "backend/app/services/validators/choice_validators.py"
  - "backend/app/services/validators/scalar_validators.py"
  - "backend/app/services/validators/text_validators.py"
  - "backend/app/services/validators/matrix_validators.py"
  - "backend/app/services/validators/misc_validators.py"
  - "backend/app/services/validators/special_validators.py"
  - "backend/app/services/validators/validation_rules.py"
---

# Lessons Learned: CQ-05: Add precise type hints in validators

## What Worked Well
- The systematic file-by-file approach (catalog bare annotations first, then replace) prevented missed spots and made the changeset reviewable in isolation.
- Using `dict[str, Any]` as the standard type for JSONB-backed blobs (settings, answers, answer_options) was consistent with the rest of the codebase and required no new model abstractions.
- `list[QuestionValidationError]` for error accumulator parameters was self-documenting and immediately caught any misuse of the list at call sites.
- Typing the validator registries as `dict[str, Callable[..., None]]` preserved flexibility for heterogeneous validator signatures while still satisfying mypy strict mode.

## What Was Challenging
- Determining the correct element type for each bare `list` required tracing data flow back to the ORM layer rather than just reading the validators in isolation.
- The `question` parameter presented a tension between using the concrete ORM model (introducing a cross-layer import) and a structural `Protocol`; using the ORM model directly was simpler but tightened coupling.
- Ensuring `Any` was imported from `typing` in every file that needed it without accidentally importing it in files that did not need it required per-file discipline.

## Key Technical Insights
1. JSONB columns in SQLAlchemy surface as `dict[str, Any]` at the Python boundary — bare `dict` in any function that receives settings or answer payloads should always be replaced with `dict[str, Any]`, never a narrower type, because the schema is user-controlled.
2. Validator registries keyed by question-type string are best typed as `dict[str, Callable[..., None]]` rather than attempting a union of every concrete validator signature — strict mypy accepts this and runtime behaviour is unchanged.
3. `mypy --strict` flags missing return types as well as bare containers, so adding precise generics alone is not sufficient; every function also needs an explicit `-> None` or concrete return annotation.
4. `list[dict[str, Any]]` is the correct type for `answer_options` and `subquestions` fields that originate from JSONB arrays — do not attempt to model these as dataclasses unless the schema is stable and validated upstream.

## Reusable Patterns
- Bare `dict` in a validator signature → `dict[str, Any]` (JSONB blobs) or `dict[str, QuestionValidationError]` (structured error maps).
- Bare `list` accumulating errors → `list[QuestionValidationError]`.
- Bare `list` holding option/subquestion rows → `list[dict[str, Any]]`.
- Registry pattern: `_VALIDATORS: dict[str, Callable[..., None]] = {}`.
- When adding `Any` imports, use `from typing import Any` and keep it alongside other `typing` imports at the top of the file.

## Files to Review for Similar Tasks
- `backend/app/services/validators/__init__.py` — registry definitions and dispatch logic; the pattern here is the template for all other validator modules.
- `backend/app/services/validators/validation_rules.py` — most complex set of bare annotations; good reference for how `list[QuestionValidationError]` threads through nested helpers.
- `backend/app/services/validators/matrix_validators.py` — example of needing both `list[dict[str, Any]]` (subquestions/options) and `list[QuestionValidationError]` (errors) in the same function.

## Gotchas and Pitfalls
- Do not replace bare `dict` with `dict[str, str]` even if current data looks string-valued — JSONB blobs can contain nested structures and mypy will surface false positives downstream.
- Adding `from typing import Any` to a file that previously had no `typing` import can trigger an "unused import" warning in linters if `Any` is only used in annotations that mypy infers; verify each import is actually referenced.
- mypy `--strict` enables `--disallow-any-generics`, which means a bare `Callable` (without parameter types) is also flagged — use `Callable[..., None]` (with `...` for unspecified args) for registry values to satisfy this without over-specifying.
- Type annotations are not validated at runtime in Python; passing a wrongly-typed value to a newly-annotated function will not raise at runtime, so existing tests remain the only regression safety net — do not reduce test coverage as part of a typing cleanup.
```
