---
date: "2026-04-11"
ticket_id: "ISS-217"
ticket_title: "API Key Scope Enforcement — Apply require_scope to write endpoints"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-11"
ticket_id: "ISS-217"
ticket_title: "API Key Scope Enforcement — Apply require_scope to write endpoints"
categories: ["security", "api", "authentication", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/api/surveys.py
  - backend/app/api/question_groups.py
  - backend/app/api/questions.py
  - backend/app/api/answer_options.py
  - backend/app/api/quotas.py
  - backend/app/api/assessments.py
  - backend/app/api/participants.py
  - backend/app/api/webhooks.py
  - backend/app/api/responses.py
  - backend/tests/test_surveys.py
  - backend/tests/test_responses.py
  - backend/tests/test_quotas.py
  - backend/tests/test_assessments.py
  - backend/tests/test_webhooks.py
---

# Lessons Learned: API Key Scope Enforcement — Apply require_scope to write endpoints

## What Worked Well
- The `require_scope` factory was already implemented and tested in `dependencies.py` — the remediation was purely mechanical: read each router, identify POST/PATCH/DELETE endpoints, add `Depends(require_scope('resource:write'))` to the signature
- A single reference pattern in `test_responses.py` (lines 2728–2830) provided a clear, replicable test scaffold for all other routers — no novel test infrastructure was needed
- JWT bypass behavior (scopes not enforced for JWT users) was already baked into `require_scope`, so no special casing was needed in tests for JWT auth paths
- Consistent `resource:write` naming convention (e.g., `surveys:write`, `quotas:write`) kept scope strings predictable and auditable

## What Was Challenging
- Manually auditing nine router files for every POST/PATCH/DELETE endpoint was tedious and error-prone without tooling — a missed endpoint could leave a security gap undetected
- The implementation plan warned about `from __future__ import annotations` + `request: Request` interactions, requiring a pre-flight audit of all router files even though this ticket only added `Depends()` (not `Request`)
- The 403 response shape had to be confirmed against `app/utils/errors.py` before writing assertions — assuming field names (e.g., `detail` vs `code` vs `message`) would have produced false-green or false-red tests

## Key Technical Insights
1. `require_scope` only enforces scopes when the caller authenticated via API key — JWT-authenticated requests pass unconditionally. Tests must cover both paths explicitly.
2. `from __future__ import annotations` in a router file is safe when only adding `Depends()` parameters, but becomes dangerous if `request: Request` is later added to the same file — document this at the point of change.
3. A post-implementation grep for POST/PATCH/DELETE endpoints lacking `require_scope` is the only reliable way to confirm complete coverage across nine files — manual reading alone is insufficient.
4. The Docker volume mount `./backend:/app` can shadow editable install artifacts (`.egg-info`). If `require_scope` imports fail inside the container with `ModuleNotFoundError`, verify the host-side install before rebuilding the image.
5. asyncpg requires `postgresql+asyncpg://` scheme in `DATABASE_URL` — the psycopg2-style `postgresql://` URL silently fails or errors at test time. Always pass `-e DATABASE_URL=postgresql+asyncpg://...` on every `docker run` test invocation.

## Reusable Patterns
- **Import smoke-test before running tests:** `python -c "from app.dependencies import require_scope; from app.api.surveys import router"` — surfaces broken imports with clean tracebacks before the full suite runs
- **Scope enforcement test scaffold (3–4 tests per router):**
  1. JWT auth succeeds on write endpoint (scope not required)
  2. API key with correct `resource:write` scope succeeds
  3. API key missing the required scope returns 403
  4. API key with empty/null scopes returns 403
- **Post-implementation audit grep:** `grep -rn "def (create|update|delete|patch|post)" backend/app/api/ | grep -v require_scope` to catch any endpoints missed during manual review
- **Confirm 403 shape before asserting:** Read `app/utils/errors.py` once and record the exact response envelope structure — do not assume `{"detail": "..."}` matches the actual `{"detail": {"code": "...", "message": "..."}}` envelope

## Files to Review for Similar Tasks
- `backend/app/dependencies.py` — `require_scope` factory and its JWT bypass logic
- `backend/tests/test_responses.py` (lines 2728–2830) — canonical scope enforcement test pattern with `_create_api_key` helper
- `backend/tests/conftest.py` — `_create_api_key` helper signature, fixture scopes (all must be `scope="function"` for async SQLAlchemy)
- `backend/app/utils/errors.py` — authoritative 403 response shape for test assertions

## Gotchas and Pitfalls
- **Never assume scope coverage is complete after reading files manually** — always follow up with a grep for mutation endpoints missing `require_scope` before closing the ticket
- **`from __future__ import annotations` is a latent hazard** — safe for this ticket's `Depends()` additions, but adding `request: Request` to the same file later will break Pydantic model resolution silently (400 errors, not import errors)
- **Session-scoped async fixtures cause event loop mismatch** — verify all test files in scope use `scope="function"` before adding new tests; asyncpg binds to the first event loop it sees
- **Docker volume mount masks `.egg-info`** — if imports fail inside the container after code changes, check host-side editable install state before rebuilding the image
- **Scope naming must be consistent** — `surveys:write` not `write_surveys`; confirm the convention against the existing `responses:read` pattern in `dependencies.py` before adding new scopes to avoid silent mismatches
- **`require_scope` is a no-op for JWT users** — do not write a test that uses JWT auth and expects a 403 on a scope-protected endpoint; it will always pass and give false confidence
```
