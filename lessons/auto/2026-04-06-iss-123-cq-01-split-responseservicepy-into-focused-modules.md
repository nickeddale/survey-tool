---
date: "2026-04-06"
ticket_id: "ISS-123"
ticket_title: "CQ-01: Split response_service.py into focused modules"
categories: ["refactoring", "module-splitting", "backward-compatibility", "webhook-testing"]
outcome: "success"
complexity: "medium"
files_modified: []
---

# Lessons Learned: CQ-01: Split response_service.py into focused modules

## What Worked Well
- Pre-reading test files to enumerate all mock patch strings before designing the re-export shim prevented any test breakage — all 7 `patch("app.services.response_service.dispatch_webhook_event", ...)` calls in `test_webhooks_e2e.py` and `test_webhook_service.py` continued to work without modification
- Keeping `create_response` and `complete_response` — the two webhook-dispatching functions — directly in `response_service.py` (not just re-exported) was the key architectural decision: `dispatch_webhook_event` remains a live name in the module's namespace, making it patchable at the expected path
- Extracting the core completion logic into `response_submit_service._complete_response_core` (a private function with no webhook call) and having the public `complete_response` in `response_service.py` wrap it cleanly separated concerns while preserving the mock-patchable call-site
- The dependency graph was designed as a strict DAG (`response_service` → `response_submit_service` → `response_crud_service`) with no circular imports, verified before writing any code

## What Was Challenging
- The webhook mock patch constraint forced a non-obvious re-export design: rather than being a pure shim, `response_service.py` retained the two webhook-dispatching functions as full implementations, making it part re-export shim and part implementation file
- `response_query_service.py` landed exactly at 400 lines — the acceptance criterion boundary — requiring careful scope decisions about which helpers belonged there vs. being inlined
- Understanding that a simple `from .response_submit_service import complete_response` re-export would have silently broken webhook mocks (the mock would patch a name in `response_service` that never gets called, while the real `dispatch_webhook_event` in `response_submit_service` fires unpatched) required careful reasoning before writing code

## Key Technical Insights
1. **Mock patch path = call-site module, not import source**: Python mocks patch names in a specific module's namespace. If `dispatch_webhook_event` is called inside `response_submit_service.py`, mocking `app.services.response_service.dispatch_webhook_event` does nothing — you must mock the module where the call actually executes. The solution here was to keep the call in `response_service.py` itself.
2. **Re-export shims can be partial**: A backward-compat shim doesn't have to be empty — it can retain functions that have architectural reasons to stay (e.g., webhook dispatch ownership). Pure pass-through re-exports work only when the re-exported functions have no call-site-sensitive test dependencies.
3. **Private core functions enable testable layering**: Extracting `_complete_response_core` as a private function that returns a result without side effects (no webhook dispatch) makes the core logic independently testable while delegating the side-effectful wrapper to the public API layer.
4. **DAG dependency design prevents circular imports**: The three-layer import chain (`response_service` imports from both `response_submit_service` and `response_crud_service`; `response_submit_service` imports from `response_crud_service`; `response_crud_service` imports from neither) must be sketched before writing any `import` statements, not discovered by running into errors.
5. **`__all__` in the shim ensures `dispatch_webhook_event` is exported**: Including `dispatch_webhook_event` in `__all__` documents the intent that this name is part of the public surface of `response_service`, preventing future refactors from accidentally removing the import.

## Reusable Patterns
- **Grep mock paths before splitting**: Always run `grep -rn 'patch.*<module_name>' backend/tests/` before designing the split to enumerate every name that must survive in the original module's namespace.
- **Keep webhook dispatchers at the outermost public layer**: Functions that call `dispatch_webhook_event` should live at the API-facing service layer, not in inner helper modules, so that test mocks can always patch a single predictable location.
- **Import smoke-tests per file**: After creating each new module, run `python -c 'from app.services.<new_module> import <fn>'` before running the full test suite to surface `ImportError` as clear tracebacks rather than confusing pytest collection failures.
- **Private `_core` functions for side-effect isolation**: When a public function has both business logic and side effects (webhooks, emails, events), extract the logic into a private `_core` function and keep side-effect dispatch in the public wrapper. This enables the core to be re-used by other callers and simplifies unit testing.
- **Explicit imports in `__all__` for shim modules**: Use `from .submodule import fn1, fn2` (not wildcard) in re-export shims so every name is explicitly present in `__dict__` and is individually mock-patchable.

## Files to Review for Similar Tasks
- `backend/app/services/response_service.py` — example of a partial re-export shim that retains webhook-dispatching functions as full implementations
- `backend/app/services/response_submit_service.py` — example of a `_core` private function pattern separating logic from side effects
- `backend/tests/test_webhooks_e2e.py` — canonical example of mock patch paths targeting `app.services.response_service.dispatch_webhook_event`
- `backend/tests/test_webhook_service.py` — additional mock patch path examples for the same target

## Gotchas and Pitfalls
- **Silent mock bypass**: If you move a `dispatch_webhook_event` call to a submodule and only re-export the function name in `response_service.py`, existing `patch("app.services.response_service.dispatch_webhook_event")` mocks will appear to work (no error) but will not intercept actual webhook calls — the mock patches a name in a module that is never the call-site. Tests may still pass if they don't assert on the mock's call count, masking the regression entirely.
- **400-line boundary is exact**: `response_query_service.py` hit exactly 400 lines. If future functions are added to that module without also moving something out, the AC is violated. Consider 380 lines as a practical working limit to preserve headroom.
- **`response_service.py` is not a pure shim**: It retains `create_response` and `complete_response` as full implementations, not re-exports. Future maintainers must understand that this is intentional and that moving these functions to submodules requires updating all mock patch strings in tests first.
- **`_validate_answers` is imported across module boundaries**: `response_submit_service.py` imports `_validate_answers` from `response_crud_service.py`. The leading underscore signals it is private by convention, but it is part of the inter-module interface within this package. Document this at the function level to prevent it from being removed during future refactors of `response_crud_service.py`.