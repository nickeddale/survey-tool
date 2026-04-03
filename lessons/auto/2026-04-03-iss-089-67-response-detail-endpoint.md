---
date: "2026-04-03"
ticket_id: "ISS-089"
ticket_title: "6.7: Response Detail Endpoint"
categories: ["fastapi", "sqlalchemy", "authentication", "schema-design", "testing"]
outcome: "success"
complexity: "medium"
files_modified: []
---

# Lessons Learned: 6.7: Response Detail Endpoint

## What Worked Well
- Using a `/detail` suffix for the authenticated endpoint cleanly coexists with the existing public `GET /{response_id}` endpoint without routing conflicts — no need for method overloading or versioning hacks.
- A single JOIN query (`Response JOIN Survey WHERE survey.user_id == user_id`) enforces ownership and retrieves the response atomically, avoiding two round-trips and making the 404-for-both-cases policy trivial to implement.
- Chained `selectinload` paths (`Response.answers → ResponseAnswer.question → Question.answer_options` and `Question.subquestions`) loaded all related data in one pass with no N+1 queries.
- Returning a plain `dict` from the service function rather than a Pydantic model instance kept the service layer free of schema imports at the module level (the `ResponseDetail` import was deferred inside the function to avoid circularity).
- Building `ResponseAnswerDetail` Pydantic objects inside the service loop and placing them directly in the returned dict made schema validation implicit and removed the need for `model_validate` at the router layer.
- The `metadata` field naming: the ORM model uses `metadata_` (to avoid SQLAlchemy collision), but `ResponseDetail` exposes it as `metadata` — the service explicitly maps `"metadata": response.metadata_` in the dict, which is cleaner than aliasing in the schema.

## What Was Challenging
- The ORM `metadata_` ↔ API `metadata` field name mismatch required explicit mapping in the service return dict; relying on `model_validate` from an ORM object would have silently dropped the field because the attribute names differ.
- Matrix subquestion label resolution required understanding that matrix answer rows belong to *child* questions (those with `parent_id != None`), not to the parent matrix question itself — the subquestion's own `title` is the label, not data stored on the answer row.
- The `values` field for multiple-choice answers (list type) vs. `value` (scalar) required a deliberate branch; storing both allows consumers to use whichever is appropriate without type-checking the raw value.
- The existing `_parse_response_id` helper was reused unchanged — needed to confirm it raises `NotFoundError` (mapping to 404) rather than a 422, since FastAPI's default UUID path parameter validation raises 422.

## Key Technical Insights
1. **Ownership-safe 404**: Always join `Response` to `Survey` with `Survey.user_id == user_id` in a single query. Never issue a separate survey lookup then a response lookup — two queries create a TOCTOU window and require additional conditional logic.
2. **Eager loading chain**: Use two `selectinload` paths on the same base relationship to load both `answer_options` and `subquestions` without conflicting with each other: `selectinload(Response.answers).selectinload(ResponseAnswer.question).selectinload(Question.answer_options)` and a parallel path for `Question.subquestions`.
3. **Field name mapping at service boundary**: When the ORM model renames a column (e.g., `metadata_`) to avoid SQLAlchemy reserved-name conflicts, the translation to the public API name must happen explicitly in the service return value — never assume `model_validate` from an ORM instance will remap it correctly.
4. **Subagent label detection**: A matrix answer row's `question.parent_id is not None` is the reliable signal that this question IS a subquestion — its `title` is used as the `subquestion_label`.
5. **Sensitive field verification**: Tests must explicitly assert that `ip_address` and `metadata` appear in the authenticated response body with correct values — Pydantic schema inclusion does not guarantee the values are non-null or correctly sourced.

## Reusable Patterns
- **`/detail` suffix endpoint pattern**: Add authenticated enriched-detail endpoints as `/{id}/detail` alongside existing public `/{id}` endpoints. FastAPI resolves the more-specific literal segment first, so `/detail` always wins over a wildcard `{response_id}` at the same depth.
- **Service returns dict, not ORM object**: For enriched endpoints that require cross-model joins and computed fields, have the service return a plain dict or list of Pydantic models rather than an ORM object. This decouples schema changes from ORM relationship definitions.
- **Single-query ownership enforcement**: `select(Response).join(Survey).where(Response.id == rid, Response.survey_id == sid, Survey.user_id == uid)` — one query, one NotFoundError, no ownership leakage via error code differentiation.
- **Choice type set**: Define `choice_types = {"single_choice", "dropdown", "image_picker"}` and `matrix_types = {"matrix", "matrix_single", ...}` as local sets in the service function for readable, extensible type dispatch.
- **`add_choice_question` test helper**: Returns `(question_id, opt1_code, opt2_code)` — this tuple pattern keeps test setup compact and makes the option code available for answer submission without a separate lookup.

## Files to Review for Similar Tasks
- `backend/app/api/responses.py` — routing pattern for coexisting public/authenticated endpoints at similar paths; `_parse_survey_id` / `_parse_response_id` UUID validation helpers.
- `backend/app/services/response_service.py:482-584` — `get_response_detail` for the complete pattern: single ownership-join query, chained selectinload, enrichment loop, dict return.
- `backend/app/schemas/response.py:112-136` — `ResponseAnswerDetail` and `ResponseDetail` for the enriched schema structure including optional fields for type-specific data.
- `backend/tests/test_responses.py:1505-1777` — ISS-089 test section for the `add_choice_question` helper and the full test suite covering auth, ownership, field presence, and type-specific enrichment.

## Gotchas and Pitfalls
- **`metadata_` vs `metadata`**: The ORM model uses `metadata_` to avoid the SQLAlchemy `MetaData` naming conflict. If you use `model_validate(orm_object)` with `from_attributes=True` on a schema that has a field named `metadata`, the ORM attribute `metadata_` will not match — the field will be `None`. Always map explicitly in the service dict.
- **`/detail` must be registered before `/{response_id}`**: In the router, the `/detail` literal route must appear before the parameterized `/{response_id}` route. If reversed, FastAPI matches `/detail` as the `response_id` parameter and routes to the wrong handler.
- **Matrix answers are on child questions**: The `response_answer.question` for a matrix answer is the *subquestion* (a `Question` with `parent_id != None`), not the parent matrix question. Do not attempt to load `question.parent.subquestions` — just use `question.title` directly.
- **`selectinload` vs `joinedload` for collections**: Use `selectinload` (not `joinedload`) when loading one-to-many collections (`answers`, `answer_options`, `subquestions`) to avoid row multiplication in the result set. `joinedload` on collections produces a Cartesian product that inflates row counts.
- **Test isolation via unique emails**: Each test that creates a user must use a unique email address. Reusing the same email across tests that run in the same DB session causes registration conflicts. The pattern `email="detail_choice@example.com"` with a descriptive prefix is the established convention in this test file.
- **`values` field for multi-select**: For `multiple_choice` questions where `raw_value` is already a list, populate both `value=raw_value` and `values=raw_value`. For all other types, `values=None`. Do not skip the `values` field — the schema declares it as `list[Any] | None = None` and consumers may depend on its presence.