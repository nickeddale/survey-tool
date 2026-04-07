---
date: "2026-04-07"
ticket_id: "ISS-164"
ticket_title: "resolve-flow endpoint requires auth — breaks public survey navigation"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-07"
ticket_id: "ISS-164"
ticket_title: "resolve-flow endpoint requires auth — breaks public survey navigation"
categories: ["authentication", "public-endpoints", "fastapi", "bug-fix"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/api/logic.py", "backend/tests/test_logic_resolve_flow.py"]
---

# Lessons Learned: resolve-flow endpoint requires auth — breaks public survey navigation

## What Worked Well
- The fix was a minimal, focused change: remove `current_user: User = Depends(get_current_user)` from one endpoint signature
- The established pattern of public survey endpoints (`GET /public`, `POST /responses`) provided a clear reference for how to omit auth correctly
- Pre-existing implementation notes flagged the `from __future__ import annotations` + `request: Request` footgun before it could cause a regression
- Import smoke-test (`python -c "from app.api.logic import router"`) provides fast feedback before running the full suite

## What Was Challenging
- The bug is silent from the backend's perspective — the endpoint returns 401 correctly, but the effect (redirect to `/login` mid-response, losing survey progress) is only visible in the frontend flow
- Determining whether `get_current_user` / `User` imports were safe to remove required reading the full `logic.py` file, not just the target function
- The test for the unauthenticated case previously asserted 403, which meant a green test suite was masking the bug in production; updating it to assert 200 with a valid body was necessary to make the test meaningful

## Key Technical Insights
1. FastAPI dependency injection via `Depends(get_current_user)` enforces auth at the function signature level — removing the parameter is sufficient to make an endpoint public; no middleware or decorator change is needed
2. When removing an import, always grep the entire file for all references before deleting — a removed import that is still used elsewhere causes a runtime `ImportError`, not a startup error
3. A test that only asserts a status code (e.g., `assert response.status_code == 200`) without validating the response body is a hollow green test — it passes even if the endpoint returns an empty or malformed body
4. Public survey endpoints follow a consistent pattern in this codebase: omit `current_user` from the signature entirely rather than making it optional; this is the canonical approach to confirm in `logic.py` before making the change
5. The `from __future__ import annotations` + `request: Request` combination in FastAPI files causes Pydantic `ForwardRef` resolution failures for locally-defined models — avoid adding `request: Request` to any endpoint in a file that has this import

## Reusable Patterns
- **Import smoke-test before running tests**: `python -c "from app.api.logic import router"` — surfaces broken imports faster than the full test suite
- **Grep before removing imports**: `grep -n "current_user\|get_current_user" backend/app/api/logic.py` — confirms zero remaining references before the import line is deleted
- **Assert response body shape, not just status**: for a newly-public endpoint test, verify the response JSON contains expected fields (e.g., `visible_questions`, `hidden_questions`) to confirm the endpoint is functional, not just reachable
- **Run scoped tests first, then full suite**: `-k test_logic_resolve_flow` gives fast feedback on the targeted change; full suite catches regressions across other endpoints

## Files to Review for Similar Tasks
- `backend/app/api/logic.py` — contains both authenticated and public survey endpoints; use existing public endpoints as the reference pattern
- `backend/app/api/surveys.py` — public survey endpoints (`GET /public`, `POST /responses`) demonstrate the established no-auth pattern
- `backend/app/dependencies.py` — defines `get_current_user`; understanding what it does (raises 401 if no valid token) clarifies why removing it is the correct fix
- `backend/tests/test_logic_resolve_flow.py` — the test that previously asserted 403 for unauthenticated requests; template for how to update auth-required tests to public-endpoint tests

## Gotchas and Pitfalls
- **Do NOT add `request: Request` to the endpoint signature** if `logic.py` has `from __future__ import annotations` — this causes Pydantic `ForwardRef` failures that manifest as 400 errors with body params misidentified as query params
- **Do NOT remove `get_current_user` import without grepping the full file** — other endpoints in `logic.py` may still reference it; a partial removal causes a runtime `ImportError`
- **The 401 interceptor in the frontend redirects to `/login`** — this means a missing-auth bug on a public endpoint is user-visible as a full page redirect with data loss, not just a failed API call; the severity is higher than a typical 401
- **Hollow green tests mask production bugs**: the original `test_unauthenticated_request_returns_403` was correct before the fix but would become a false green if naively changed to `assert response.status_code == 200` without also asserting body shape
- **`current_user` may appear in nested calls or conditionals** inside the handler body even if not in the top-level signature path — always scan the full function body after removing the parameter, not just the signature line
```
