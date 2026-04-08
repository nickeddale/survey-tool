---
date: "2026-04-08"
ticket_id: "ISS-181"
ticket_title: "resolve-flow endpoint returns 400 for valid answer data"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-181"
ticket_title: "resolve-flow endpoint returns 400 for valid answer data"
categories: ["fastapi", "schema-mismatch", "pydantic", "frontend-backend-contract"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/api/logic.py
  - backend/tests/test_logic_resolve_flow.py
---

# Lessons Learned: resolve-flow endpoint returns 400 for valid answer data

## What Worked Well
- MEMORY.md contained the exact root cause pattern (`from __future__ import annotations` + `request: Request` + local Pydantic models = ForwardRef failures) before investigation began, enabling a targeted fix without trial-and-error
- The implementation plan flagged all three independent failure modes (field name mismatches, answer format mismatch, ForwardRef issue) upfront, preventing partial fixes
- Import smoke-test pattern (`python -c "from app.api.logic import router"`) recommended proactively to surface model resolution errors before running the full suite

## What Was Challenging
- The 400 error had three compounding causes that each independently could produce the symptom: (1) answer format mismatch (array vs dict), (2) field name mismatches (`current_question_id`/`from_question`, `next_question_id`/`next_question`), and (3) `from __future__ import annotations` causing Pydantic ForwardRef failures — distinguishing which was primary required reading both frontend and backend code
- The frontend `useFlowResolution` hook silently caught these errors, making the bug non-fatal and easy to miss in manual testing
- `from __future__ import annotations` issues only manifest when `request: Request` is added as an endpoint parameter — the ForwardRef was latent before that addition

## Key Technical Insights
1. **Frontend-backend contract drift**: When the frontend sends `answers` as `Array<{question_id, value}>` but the backend schema declares `answers: Dict[str, Any]`, FastAPI silently rejects the body with 422/400 — no error points directly at the shape mismatch. Always read both sides of the API contract before diagnosing validation errors.
2. **`from __future__ import annotations` is incompatible with locally-defined Pydantic models in FastAPI router files that also accept `request: Request`**: The import defers all annotation evaluation, turning local model references into unresolvable `ForwardRef` objects. Python 3.11+ handles `str | None`, `list[str]`, `X | Y` natively — this import is never needed in modern Python.
3. **`Body(...)` is not a valid workaround** for ForwardRef resolution issues in FastAPI — it triggers `PydanticUserError: TypeAdapter not fully defined` as a different crash.
4. **`frozenset(answers.items())` in `relevance.py:278`** will raise `unhashable type: list` if any answer value is a list (as `multiple_choice` answers are). Tests that submit `multiple_choice` answers and then trigger completion (which runs relevance evaluation) must avoid list values or bypass that path.
5. **Boolean answers must be strings**: the `boolean` question type requires `"true"` or `"false"` as strings, not Python `True`/`False` booleans, when constructing test payloads.

## Reusable Patterns
- **Import smoke-test before running tests**: `python -c "from app.api.logic import router"` inside Docker to catch ForwardRef/import errors as clean tracebacks rather than cryptic 400/422 test failures.
- **Remove `from __future__ import annotations`** from any FastAPI router file that (a) defines local Pydantic models AND (b) has `request: Request` as an endpoint parameter.
- **Read both frontend types and backend schemas** when diagnosing 400/422 errors — mismatches in field names or data shapes are common and not surfaced clearly by FastAPI error messages.
- **Schema conversion pattern**: accept the frontend-native format (array of `{question_id, value}` objects) in the Pydantic schema, then convert to the internal dict format inside the handler before passing to the expression engine.
- **Silent error hooks are a testing gap**: if the frontend silently catches errors, add explicit assertions in hook tests that the resolved value is non-null when a valid payload is sent.

## Files to Review for Similar Tasks
- `backend/app/api/logic.py` — `ResolveFlowRequest` schema and `resolve_flow` endpoint handler
- `backend/tests/test_logic_resolve_flow.py` — answer payload format and field name assertions
- `frontend/src/hooks/useFlowResolution.ts` — payload construction and silent error handling
- `frontend/src/types/survey.ts` — `ResolveFlowRequest` and `ResolveFlowResponse` interface definitions
- `backend/app/services/expressions/relevance.py:278` — `frozenset(answers.items())` limitation for list values

## Gotchas and Pitfalls
- **Do not use `Body(...)` to fix ForwardRef issues** — it causes `PydanticUserError: TypeAdapter not fully defined`, a different and harder-to-diagnose crash.
- **`from __future__ import annotations` + `request: Request` is a latent time bomb**: adding `request: Request` to any endpoint in a file with this import will immediately break all locally-defined Pydantic model resolution in that file.
- **Multiple choice answers as lists will crash relevance evaluation** via `frozenset()` — avoid in any test path that triggers survey completion.
- **Boolean answers as Python booleans will fail validation** — always send `"true"`/`"false"` strings.
- **Field name mismatches between frontend and backend are silent**: FastAPI will not tell you that `current_question_id` was expected but `from_question` was sent — it just returns 422 with a generic "field required" error, which looks identical to a schema format mismatch.
```
