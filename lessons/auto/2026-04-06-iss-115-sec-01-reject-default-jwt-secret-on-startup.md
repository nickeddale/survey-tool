---
date: "2026-04-06"
ticket_id: "ISS-115"
ticket_title: "SEC-01: Reject default JWT secret on startup"
categories: ["testing", "database", "ui", "bug-fix", "feature", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-115"
ticket_title: "SEC-01: Reject default JWT secret on startup"
categories: ["security", "configuration", "pydantic", "testing"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/config.py", "backend/tests/conftest.py", "backend/tests/test_config.py"]
---

# Lessons Learned: SEC-01: Reject default JWT secret on startup

## What Worked Well
- Using `@model_validator(mode='after')` cleanly handled the cross-field validation between `jwt_secret` and `environment` in a single pass
- Setting `os.environ['ENVIRONMENT'] = 'test'` at the top of `conftest.py` (before any app imports) prevented the production guard from blocking the test suite
- Instantiating `Settings` directly with constructor kwargs in `test_config.py` kept tests hermetic and independent of `.env` files
- Running `python -c "from app.config import settings"` as a smoke-test after each config edit surfaced validator errors quickly with clean tracebacks

## What Was Challenging
- The critical constraint that `ENVIRONMENT` must be set in the environment **before** the `Settings` singleton is instantiated — module-level singletons mean import order in `conftest.py` is not obvious and easy to get wrong
- The temptation to use `@field_validator('jwt_secret', mode='after')` is strong but wrong: a single-field validator cannot access sibling fields like `environment`

## Key Technical Insights
1. `@field_validator` on a single field only receives that field's value — it cannot read other fields. Cross-field validation in pydantic-settings v2 requires `@model_validator(mode='after')`, which has access to all fields via `self`.
2. pydantic-settings v2 uses `model_config = SettingsConfigDict(...)` — the v1 `class Config` inner class is not supported and will silently fail or error.
3. Module-level `Settings` singletons are instantiated at first import. Any env var that the validator depends on (like `ENVIRONMENT`) must already be set in the process environment before the first `from app.config import settings` statement executes.
4. Default should be `environment='production'` (fail-safe): unknown or unset environments enforce the strict check rather than bypassing it.

## Reusable Patterns
- **Cross-field config validation**: Always use `@model_validator(mode='after')` when the validation logic references more than one settings field.
- **Test environment guard**: Add `os.environ['ENVIRONMENT'] = 'test'` as the very first lines of `conftest.py`, before any app-level imports, whenever a settings validator gates on environment.
- **Hermetic config tests**: Instantiate `Settings(field_a=..., field_b=...)` directly with kwargs (and `_env_file=None` if needed) so test assertions are not affected by the developer's local `.env` file.
- **Import smoke-test**: After editing `config.py`, run `python -c "from app.config import settings"` to catch syntax and validator errors before the full test suite.

## Files to Review for Similar Tasks
- `backend/app/config.py` — Settings class, SettingsConfigDict usage, model_validator pattern
- `backend/tests/conftest.py` — env var ordering before app imports
- `backend/tests/test_config.py` — hermetic Settings instantiation pattern for unit-testing validators

## Gotchas and Pitfalls
- **Wrong decorator**: Using `@field_validator('jwt_secret', mode='after')` instead of `@model_validator(mode='after')` will silently fail to access `self.environment`, making the guard always pass or always fail depending on the fallback.
- **Import order bug**: If `conftest.py` imports anything from `app` before setting `os.environ['ENVIRONMENT'] = 'test'`, the Settings singleton instantiates with the default environment (`'production'`), triggering the ValueError and breaking the entire test suite.
- **`.env` file bleed**: Without explicit `_env_file=None` or direct kwargs in `test_config.py`, tests may pick up the developer's local `.env` values, causing intermittent failures across environments.
- **Fail-open default is a security bug**: Defaulting `environment` to `'development'` or `None` would bypass the production check silently. Always default to `'production'` so the guard is enforced unless explicitly overridden.
```
