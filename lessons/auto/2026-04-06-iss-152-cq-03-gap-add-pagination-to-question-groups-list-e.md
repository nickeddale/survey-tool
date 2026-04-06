---
date: "2026-04-06"
ticket_id: "ISS-152"
ticket_title: "CQ-03 gap: Add pagination to question groups list endpoint"
categories: ["testing", "api", "database", "feature", "performance", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-06"
ticket_id: "ISS-152"
ticket_title: "CQ-03 gap: Add pagination to question groups list endpoint"
categories: ["pagination", "api", "schema", "fastapi", "gap-fix"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/schemas/question_group.py"
  - "backend/app/api/question_groups.py"
  - "backend/tests/test_question_groups.py"
---

# Lessons Learned: CQ-03 gap: Add pagination to question groups list endpoint

## What Worked Well
- Reading the analogous questions list endpoint before implementing confirmed the exact pattern to copy verbatim — same `PaginationParams` attribute names (`offset`, `per_page`, `page`), same import paths, same response shape
- In-memory slicing (`groups[pagination.offset:pagination.offset + pagination.per_page]`) is appropriate for question groups because group counts per survey are small and bounded; `len(all_groups)` for total is correct here
- `QuestionGroupListResponse` schema followed the established pattern (`items`, `total`, `page`, `per_page`) exactly, keeping API surface consistent across all list endpoints
- Existing tests were already updated to use `response.json()["items"]` rather than direct list indexing, confirming the response shape change was anticipated and handled cleanly
- New pagination-specific tests covered all edge cases: empty list, default page/per_page values, explicit per_page, second page with remainder, and out-of-range page returning empty items

## What Was Challenging
- The plan warned about breaking changes to existing tests that used `response.json()[0]` — in practice the tests were already written against the paginated shape, suggesting they were updated as part of this ticket rather than pre-existing. This made the "breakage" a non-issue but required careful reading of the test file to confirm.
- Confirming import paths (`PaginationParams` from `app.utils.pagination`, `pagination_params` from `app.dependencies`) required reading both the dependency definitions and the analogous questions endpoint — the two symbols come from different modules.

## Key Technical Insights
1. **In-memory pagination is acceptable when data is bounded by a parent resource**: Question groups only exist in the context of a survey, so the total set fetched is always survey-scoped. `len(all_groups)` for `total` is correct and avoids a separate COUNT query.
2. **Response shape is a breaking change**: Changing from a raw list `[{...}]` to a paginated envelope `{"items": [...], "total": N, "page": N, "per_page": N}` breaks any consumer (tests, frontend, clients) that indexes directly into the response array. Update all callers atomically.
3. **Import split between `app.utils.pagination` and `app.dependencies`**: `PaginationParams` (the dataclass/NamedTuple type) lives in `app.utils.pagination`; `pagination_params` (the FastAPI dependency function) lives in `app.dependencies`. Both are needed and must be imported separately.
4. **`list_all` does not need `@limiter.limit`**: The GET list endpoint intentionally omits the rate limiter decorator (unlike mutating endpoints), consistent with the pattern on other read-only list endpoints in the codebase.

## Reusable Patterns
- **Paginated list endpoint pattern**:
  ```python
  async def list_all(
      survey_id: str,
      pagination: PaginationParams = Depends(pagination_params),
      current_user: User = Depends(get_current_user),
      session: AsyncSession = Depends(get_db),
  ) -> XListResponse:
      items = await list_service(session, survey_id=..., user_id=...)
      if items is None:
          raise NotFoundError("...")
      total = len(items)
      page_items = items[pagination.offset:pagination.offset + pagination.per_page]
      return XListResponse(
          items=[XResponse.model_validate(i) for i in page_items],
          total=total,
          page=pagination.page,
          per_page=pagination.per_page,
      )
  ```
- **Paginated list schema pattern**:
  ```python
  class XListResponse(BaseModel):
      items: list[XResponse]
      total: int
      page: int
      per_page: int
  ```
- **Pagination test coverage checklist**: empty list (default shape), ordered results accessed via `["items"]`, `per_page` limiting, second page with remainder, out-of-range page returning `[]` with correct `total`.

## Files to Review for Similar Tasks
- `backend/app/api/questions.py` — canonical in-memory pagination pattern for a sub-resource list endpoint
- `backend/app/dependencies.py` — source of `pagination_params` dependency function
- `backend/app/utils/pagination.py` — source of `PaginationParams` type and attribute names (`offset`, `per_page`, `page`)
- `backend/app/schemas/question_group.py` — `QuestionGroupListResponse` as a reference schema for list envelope pattern
- `backend/tests/test_question_groups.py` — reference for pagination edge case test coverage

## Gotchas and Pitfalls
- **Direct list indexing breaks after wrapping in envelope**: Any test or client code using `response.json()[0]` will get a `TypeError` or `KeyError` after this change. Search for all usages of the endpoint response before shipping.
- **`PaginationParams` and `pagination_params` are different symbols from different modules** — importing only one will cause a `NameError` at runtime.
- **`len(all_groups)` for total is only safe when the full result set is fetched first**: If the service layer ever adds its own LIMIT/OFFSET (e.g., for performance), `total` would be wrong. Verify the service fetches all rows before slicing in the router.
- **Do not add `@limiter.limit` to read-only GET list endpoints** unless there is a specific security requirement — the existing pattern in this codebase applies rate limiting only to mutating endpoints.
- **`from __future__ import annotations` interaction**: This file does not use `from __future__ import annotations`, which is intentional. Adding it to files with `@limiter.limit` + `request: Request` causes Pydantic ForwardRef resolution failures (see MEMORY.md). Keep it absent.
```
