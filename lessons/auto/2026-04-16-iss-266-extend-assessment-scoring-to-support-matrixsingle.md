---
date: "2026-04-16"
ticket_id: "ISS-266"
ticket_title: "Extend assessment scoring to support matrix_single and matrix_multiple answers"
categories: ["testing", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-266"
ticket_title: "Extend assessment scoring to support matrix_single and matrix_multiple answers"
categories: ["backend", "assessment-scoring", "matrix-questions", "refactoring"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/assessment_service.py"
  - "backend/tests/test_assessments.py"
---

# Lessons Learned: Extend assessment scoring to support matrix_single and matrix_multiple answers

## What Worked Well
- The implementation plan's step-by-step breakdown (explore → implement → test) kept scope clear and prevented scope creep
- Reading the full `compute_score()` function before editing caught all secondary references to `answer_code_map` — the warning in the plan about missing secondary references was accurate and valuable
- Defining private helper functions (`_extract_matrix_single_codes`, `_extract_matrix_multiple_codes`) above `compute_score()` kept the main function readable and the helpers independently testable
- Following the existing test naming convention (`test_<action>_<condition>_<expected>`) made new tests consistent with the test suite without discussion

## What Was Challenging
- Refactoring `answer_code_map` to `answer_code_entries` (a structural rename touching both unpacking and scoring loops) required careful reading of the full function — any partial read risks leaving a stale reference
- Building `subquestion_id_map` required understanding UUID type consistency: keys must be Python `UUID` objects, not strings, to avoid silent `KeyError` misses at lookup time
- The `subquestion_id_map` is keyed by parent question UUID; mixing model field access patterns (`question.parent_id` vs `question.id`) at build vs. query time is an easy source of subtle bugs

## Key Technical Insights
1. When changing a data structure that is used in multiple loops (answer unpacking + score accumulation), always read the entire function first and grep for all references to the old name before renaming — a partial rename produces no syntax error but wrong runtime behavior.
2. `subquestion_id_map` shape is `dict[UUID, dict[str, UUID]]` (parent_id → {sq_code → sq_id}); the inner lookup key is the subquestion's `code` field (a string), not its `id` — confusing these produces silent zeroes in scoring.
3. `matrix_multiple` rows hold lists of selected option codes per subquestion; `matrix_single` rows hold a single string per subquestion — the helpers must handle these different value types explicitly rather than with a unified unpack.
4. `subquestion_score_map` accumulation must happen inside the same scoring loop that accumulates `total_score`/`question_score_map` — adding it as a separate pass would double-query the answer options.
5. The `subquestion` scope `elif` branch must guard on `assessment.subquestion_id is not None` before the `.get()` call to avoid a `TypeError` when the field is `None` for non-subquestion-scoped rules.

## Reusable Patterns
- **Matrix answer unpacking pattern**: iterate `val.items()` where key is subquestion code and value is `str` (single) or `list[str]` (multiple); look up `subquestion_id_map[parent_id][sq_code]` for each row; yield `(option_code, sq_id)` tuples.
- **Import smoke-test before Docker test run**: `python -c 'from app.services.assessment_service import compute_score'` — surfaces broken imports as clean tracebacks rather than cryptic pytest collection errors.
- **Tuple-based answer entries**: replacing `dict[UUID, list[str]]` with `dict[UUID, list[tuple[str, UUID | None]]]` is a clean pattern for associating optional metadata (subquestion id) with answer codes without a separate parallel dict.
- **Reading model files before writing queries**: always open `question.py` and `answer_option.py` to confirm field names (`parent_id`, `code`, `question_type`, `assessment_value`) — do not rely on ticket descriptions or memory.

## Files to Review for Similar Tasks
- `backend/app/services/assessment_service.py` — full `compute_score()` function; understand data flow from answer loading to scope-based filtering before any edit
- `backend/app/models/question.py` — confirms `parent_id`, `code`, `question_type` field names used in subquestion queries
- `backend/app/models/answer_option.py` — confirms `code` and `assessment_value` field names used in score lookups
- `backend/tests/test_assessments.py` — existing fixtures and helper patterns to follow when adding new scoring tests

## Gotchas and Pitfalls
- **Silent KeyError from UUID/str mismatch**: `subquestion_id_map` keys are Python `UUID` objects; if subquestion records are loaded with `str` IDs (e.g., from raw SQL), the lookup silently returns `None` and scores become 0 with no error.
- **Stale reference after rename**: renaming `answer_code_map` to `answer_code_entries` without grepping the full file will leave one loop using the old name — Python will raise `NameError` only at runtime when that branch is hit, not at import time.
- **Missing import for helper functions**: if helpers are defined in the same file, no import is needed, but if ever extracted to a module, a missing import surfaces only as a `NameError` at runtime on the first matrix answer, not at definition time.
- **`asyncio_mode = "auto"` already set**: do not add `@pytest.mark.asyncio` decorators to new tests — it is redundant and can mask fixture scoping issues in some pytest-asyncio versions.
- **Function-scoped fixtures only**: never use session-scoped async engine or session fixtures with asyncpg under pytest-asyncio — event loop mismatch errors result that are hard to diagnose.
- **`postgresql+asyncpg://` scheme required**: the Docker test `DATABASE_URL` must use this scheme explicitly; a bare `postgresql://` will silently use psycopg2 and fail with an async engine.
```
