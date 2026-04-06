---
date: "2026-04-06"
ticket_id: "ISS-117"
ticket_title: "SEC-03: Validate export format parameter"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "security", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-117"
ticket_title: "SEC-03: Validate export format parameter"
categories: ["security", "validation", "fastapi", "api"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/api/responses.py", "backend/tests/test_responses.py"]
---

# Lessons Learned: SEC-03: Validate export format parameter

## What Worked Well
- The `Literal` type hint pattern was already established in the same router (`sort_by`, `sort_order`), making the change consistent and easy to review
- Combining `Literal['csv', 'json']` with an explicit `HTTPException(status_code=400)` guard satisfied both OpenAPI schema correctness and the strict AC status code requirement
- Simplifying `format.lower() == 'json'` to `format == 'json'` after adding `Literal` removed dead code cleanly

## What Was Challenging
- FastAPI's built-in `Literal` validation returns **422 Unprocessable Entity**, not **400 Bad Request** — this mismatch with the ticket AC required an explicit guard rather than relying solely on FastAPI's type system
- The `.lower()` normalization call becomes dead code once `Literal` is in place (only lowercase `'csv'` or `'json'` can pass), but it must be identified and removed consciously to avoid confusion

## Key Technical Insights
1. **FastAPI + Literal = 422, not 400.** When a ticket AC explicitly specifies HTTP 400 for invalid query parameters, you cannot rely on `Literal` type validation alone — FastAPI returns 422. Add an explicit `if format not in ('csv', 'json'): raise HTTPException(status_code=400)` before any downstream logic.
2. **Literal still belongs in the signature.** Even when adding an explicit guard, keep `Literal['csv', 'json']` in the function signature for correct OpenAPI schema generation and documentation — the explicit check and the type hint serve complementary purposes.
3. **Dead code after Literal narrowing.** Any case-normalization (`.lower()`, `.upper()`) applied to a `Literal`-validated parameter is unreachable — FastAPI only passes values that already match the literal strings exactly. Remove these safely but deliberately.
4. **Test order matters.** Writing the negative test (`format=xml → 400`) first catches whether the guard is missing before verifying that existing CSV/JSON paths still work.

## Reusable Patterns
- **Dual-layer validation pattern:** `format: Literal['csv', 'json'] = Query(default='csv')` in the signature + `if format not in ('csv', 'json'): raise HTTPException(status_code=400, detail='Invalid format')` at the top of the handler. Use this whenever AC specifies a non-422 status code for invalid enum-like query params.
- **Simplify after narrowing:** After adding `Literal`, audit the function body for any normalization or fallback logic that is now unreachable and clean it up.
- **Negative test first:** For parameter validation tickets, write `test_export_invalid_format_returns_400` before touching existing tests — this immediately confirms the guard is in place.

## Files to Review for Similar Tasks
- `backend/app/api/responses.py` — export endpoint and established `Literal` usage for `sort_by`/`sort_order`
- `backend/tests/test_responses.py` — export test patterns (CSV, JSON, invalid format)

## Gotchas and Pitfalls
- **Do not assume Literal → 400.** This is the single biggest pitfall: FastAPI's Literal validation yields 422. If the AC says 400, an explicit HTTPException is non-negotiable.
- **Check for tests asserting old silent-fallback behavior.** Before the fix, unknown formats silently defaulted to CSV (200 response). If any existing test passed `?format=xml` and expected a 200, it must be updated to expect 400 — otherwise the test suite will have a false regression.
- **Mixed-case inputs are now rejected.** After adding `Literal['csv', 'json']`, values like `CSV`, `Json`, or `JSON` will fail validation. Confirm no client or internal caller passes mixed-case format strings before deploying.
```
