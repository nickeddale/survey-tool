---
date: "2026-04-18"
ticket_id: "ISS-283"
ticket_title: "Matrix table rendering: answers stored on parent question not split into subquestion rows"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-18"
ticket_id: "ISS-283"
ticket_title: "Matrix table rendering: answers stored on parent question not split into subquestion rows"
categories: ["backend", "orm", "schema-enrichment", "matrix-questions", "frontend-rendering"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/response_query_service.py
  - backend/app/schemas/response.py
  - frontend/src/components/responses/ResponseDetail.tsx
  - backend/tests/test_responses.py
---

# Lessons Learned: Matrix table rendering: answers stored on parent question not split into subquestion rows

## What Worked Well
- The implementation plan correctly identified the root cause before any code was written: the enrichment logic in `_build_enriched_answer` gated on `parent_id is not None`, which silently skipped parent-stored matrix answers entirely.
- The "virtual entry expansion" approach (expanding a single parent dict answer into per-subquestion entries) preserved backward compatibility with the existing `_SQ`-regex grouping in `groupAnswers` on the frontend — no changes to the grouping logic were required.
- Scoping the Docker test run to `postgres` only (`docker compose up -d postgres`) avoided frontend stub failures that would have blocked the test run.
- Running an import smoke-test (`python -c "from app.services.response_query_service import ResponseQueryService"`) after modifying the service surfaced any broken imports cleanly before running the full pytest suite.

## What Was Challenging
- Understanding the dual storage formats for matrix answers (subquestion-split records vs. a single JSON dict on the parent) required careful reading of both the ORM model and the enrichment loop before the fix strategy became clear.
- Ensuring the eager-load chain in the query included `question.subquestions` and `question.subquestions.answer_options` for parent matrix questions was easy to overlook — missing this would have caused silent N+1 queries or `MissingGreenlet` errors at runtime.
- Pydantic field serialization needed explicit verification: a new field on `ResponseAnswerDetail` could be silently dropped if not included in the model's `model_fields` or if the schema excluded it unexpectedly.

## Key Technical Insights
1. When SQLAlchemy async sessions are in use, any relationship traversal inside a service method requires that relationship to be eagerly loaded in the originating query — lazy loading will raise `MissingGreenlet`. Always audit eager-load chains when adding new relationship accesses.
2. `_build_enriched_answer` was designed around the subquestion-split storage model. Parent-stored matrix answers represent a second, equally valid storage format that requires a separate expansion path, not a patch to the existing enrichment condition.
3. Expanding to virtual `ResponseAnswerDetail` objects with synthetic `question_code` values (e.g. `Q2_SQ001`) is the cleanest approach because it reuses all existing frontend grouping and rendering logic without adding a new data shape.
4. Pydantic's `model_validate` will silently drop fields not declared on the target schema. Adding a new field and assuming it will appear in serialized output without an explicit test assertion is a common source of hard-to-diagnose bugs.
5. The ISS-280 frontend fallback (flat text display) was masking a backend enrichment gap — always trace rendering failures to the API response payload first before patching the frontend display layer.

## Reusable Patterns
- **Expansion helper pattern**: When a single stored record must map to multiple output records, write a dedicated `_expand_*` helper that returns a list and call it in the main loop, replacing the single entry. Keep the helper pure and testable in isolation.
- **Import smoke-test before full test run**: `python -c "from app.services.<module> import <Class>"` — run this inside the Docker container after any service-layer change to catch broken imports with clean tracebacks.
- **Eager-load audit**: When adding relationship traversals in a service, trace back to the originating `select()` statement and add the corresponding `selectinload()` chain before writing any other code.
- **Explicit Pydantic field assertion in tests**: After adding a field to a schema, add a test that fetches the endpoint and asserts `response.json()["field_name"] is not None` (or checks the exact value) — do not rely on the schema definition alone.
- **Docker scope discipline**: Always `docker compose up -d postgres` only for backend test runs. Never start the full stack (`docker compose up`) in CI or scripted test contexts.

## Files to Review for Similar Tasks
- `backend/app/services/response_query_service.py` — `_build_enriched_answer` and the answer-enrichment loop; the selectinload chain in the main query method.
- `backend/app/schemas/response.py` — `ResponseAnswerDetail` field definitions; verify any new field is not inadvertently excluded by a parent schema.
- `frontend/src/components/responses/ResponseDetail.tsx` — `groupAnswers`, `MatrixAnswerGrid`, `MatrixSingleAnswerGrid`, `MatrixMultipleAnswerGrid`, `MatrixDropdownAnswerGrid`; understand the `_SQ` regex grouping assumption before changing answer shapes.
- `backend/tests/test_responses.py` — existing matrix answer test cases; use as reference for the fixture pattern when adding new matrix-format tests.

## Gotchas and Pitfalls
- **Do not check `parent_id is None` as a proxy for "this is a parent question answer"** without also checking whether the value is a dict — both conditions must hold to trigger parent-stored matrix expansion.
- **`./backend:/app` volume mount masks Docker build artifacts**: if the import smoke-test fails inside the container, verify that the `.egg-info` directory exists on the host filesystem; the bind mount can hide a missing install.
- **Do not use `passlib` with `bcrypt >= 4.x`** anywhere in new or modified service code — use `bcrypt` directly.
- **Frontend fallback text is not a signal that the frontend is broken** — if a `MatrixAnswerGrid` falls through to flat text, inspect the API response JSON first. The enrichment pipeline is the more likely failure point.
- **Subquestion codes in the dict keys** (e.g. `SQ001`) must match the subquestion `code` field in the ORM model exactly for the lookup to succeed. If codes are stored with different casing or prefixes, the expansion will silently produce entries with `null` labels.
```
