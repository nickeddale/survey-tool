---
date: "2026-04-06"
ticket_id: "ISS-126"
ticket_title: "CQ-04: Decouple response_service from webhook_service"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "performance", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-126"
ticket_title: "CQ-04: Decouple response_service from webhook_service"
categories: ["architecture", "decoupling", "testing", "webhooks"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/event_dispatcher.py
  - backend/app/services/response_service.py
  - backend/app/services/survey_service.py
  - backend/app/services/quota_service.py
  - backend/tests/test_webhook_service.py
---

# Lessons Learned: CQ-04: Decouple response_service from webhook_service

## What Worked Well
- Introducing a thin `event_dispatcher.py` module as the single injection point kept the change surface small and localized
- Providing `set_dispatcher()`/`reset_dispatcher()` helpers made test injection explicit and avoided brittle `unittest.mock.patch` on a private variable
- Applying the same abstraction consistently across all three services (response, survey, quota) reduced future inconsistency and made the pattern easy to follow
- Patching `_dispatcher` at the call-site module level (before `asyncio.create_task` is scheduled) preserved existing event loop isolation in function-scoped test fixtures

## What Was Challenging
- Identifying all dispatch call sites across three services required careful reading before making changes — easy to miss one and leave a residual direct import
- Ensuring `event_dispatcher.py` remained free of module-level async references required explicit discipline; any accidental import of `async_session` or similar would silently bind to the first test event loop
- Verifying that no service used `dispatch_webhook_event` as a default argument value (evaluated at import time) required inspection of every function signature, not just top-level imports

## Key Technical Insights
1. The correct mock target after decoupling is `app.services.event_dispatcher._dispatcher` (or via the `set_dispatcher` helper) — patching at `app.services.webhook_service._deliver_webhook` or any point after `asyncio.create_task` is called has no effect on the scheduled task
2. Module-level variables in Python are evaluated once at import time; default function argument values share this property — both patterns bypass runtime injection and must be avoided in decoupled service designs
3. `event_dispatcher.py` must remain a pure synchronous callable abstraction with no module-level async references to avoid event loop binding issues in per-test function-scoped fixtures
4. An import smoke-test (`python -c "from app.services.event_dispatcher import get_dispatcher"`) is a cheap, fast way to surface circular imports before running the full test suite

## Reusable Patterns
- **Event dispatcher abstraction**: Define a `Protocol` or `Callable` type alias in a dedicated `event_dispatcher.py`; expose `get_dispatcher()`, `set_dispatcher(fn)`, and `reset_dispatcher()` helpers; default to the real webhook dispatcher; call `get_dispatcher()(event, survey_id, data)` at each dispatch site
- **Call-site replacement**: Replace top-level `from app.services.webhook_service import dispatch_webhook_event` with `from app.services.event_dispatcher import get_dispatcher` at the call site, never as a default argument
- **Test injection via helpers**: Use `set_dispatcher(mock_fn)` in test setup and `reset_dispatcher()` in teardown rather than patching private module variables directly
- **Import smoke-test before full suite**: Run `python -c "from app.services.event_dispatcher import get_dispatcher"` as a pre-flight check after creating a new module

## Files to Review for Similar Tasks
- `backend/app/services/event_dispatcher.py` — canonical example of the dispatcher abstraction and helper pattern
- `backend/app/services/response_service.py` — example of replacing a direct import with `get_dispatcher()` at the call site
- `backend/tests/test_webhook_service.py` — example of using `set_dispatcher`/`reset_dispatcher` for clean test injection
- `backend/app/services/survey_service.py` and `backend/app/services/quota_service.py` — examples of consistent application across multiple services

## Gotchas and Pitfalls
- **Never patch after `asyncio.create_task` is scheduled**: the background task captures the dispatcher reference at scheduling time; patching afterward has no effect
- **No module-level async references in `event_dispatcher.py`**: importing `async_session` or any async factory at module level binds it to the first event loop and breaks per-test isolation
- **Default argument trap**: `def foo(d=dispatch_webhook_event)` evaluates at import time and silently bypasses injection — always call `get_dispatcher()` inline inside the function body
- **Residual direct imports**: removing the top-level import is not enough if any alias or re-export remains; grep all three services for `dispatch_webhook_event` after the change
- **`__all__` cleanup**: if `dispatch_webhook_event` was previously listed in `__all__` of any service module, remove it to avoid misleading public API surface
```
