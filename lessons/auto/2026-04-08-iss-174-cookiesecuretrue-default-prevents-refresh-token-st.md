---
date: "2026-04-08"
ticket_id: "ISS-174"
ticket_title: "cookie_secure=True default prevents refresh token storage in HTTP local dev"
categories: ["testing", "api", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-08"
ticket_id: "ISS-174"
ticket_title: "cookie_secure=True default prevents refresh token storage in HTTP local dev"
categories: ["configuration", "authentication", "pydantic-settings", "cookies", "local-dev"]
outcome: "success"
complexity: "low"
files_modified: ["backend/app/config.py", "backend/.env.example"]
---

# Lessons Learned: cookie_secure=True default prevents refresh token storage in HTTP local dev

## What Worked Well
- The existing `model_validator(mode='after')` pattern in `config.py` for JWT_SECRET provided a clear, consistent template to mirror for the new cookie_secure logic
- pydantic-settings v2's `model_fields_set` provided a clean way to distinguish explicitly-set env vars from defaults, enabling the "explicit override wins" behavior without reading `os.environ` directly in application code
- `conftest.py` already set `COOKIE_SECURE=false` via `os.environ` before app imports, so the new validator did not conflict with existing test infrastructure

## What Was Challenging
- Reasoning about pydantic-settings singleton construction timing: the Settings instance is created at module import time, so any `os.environ` mutations in test setup must happen before any app module is imported — otherwise the singleton sees stale values and the new validator never fires
- Understanding when `model_fields_set` includes env-var-sourced fields: pydantic-settings v2 only includes a field in `model_fields_set` if its env var was present at construction time, not if the field received a default value — this distinction is critical for the "was COOKIE_SECURE explicitly set?" check
- Empty string edge case: if `COOKIE_SECURE` is set to an empty string, pydantic-settings may coerce it to `False` or raise a validation error rather than treating it as "not set" — behavior depends on the field type annotation

## Key Technical Insights
1. **pydantic-settings singleton timing**: The `Settings()` instance in `config.py` is constructed at module import. `conftest.py` must set all relevant `os.environ` overrides before importing any `app.*` module, or the singleton will be frozen with the wrong values for every test in the session.
2. **`model_fields_set` reflects env var presence at construction**: A field populated from an env var that was present at instantiation time will appear in `model_fields_set`; a field that fell back to its default will not. This is the correct mechanism to check whether `COOKIE_SECURE` was explicitly provided.
3. **`model_validator(mode='after')` is the pydantic v2 pattern**: The v1 `@validator` / `@root_validator` syntax is incompatible with pydantic v2 and will silently fail or raise at startup — always use `model_validator(mode='after')` when cross-field logic is needed.
4. **Silent cookie rejection**: Browsers silently discard `Set-Cookie` headers with `Secure` flag over plain HTTP — no error is surfaced to the client or server logs, making this class of misconfiguration particularly hard to diagnose without knowing to check the cookie flags.
5. **Never read `os.environ` directly in application modules**: The Settings validator is the correct place to apply environment-aware defaults; application code should always consume the Settings singleton.

## Reusable Patterns
- **Environment-aware field default via model_validator**:
  ```python
  @model_validator(mode='after')
  def apply_environment_defaults(self) -> 'Settings':
      if self.environment in ('development', 'test'):
          if 'cookie_secure' not in self.model_fields_set:
              self.cookie_secure = False
      return self
  ```
- **Explicit env var override takes precedence**: check `'field_name' not in self.model_fields_set` before auto-setting — this pattern generalises to any field that should have environment-aware defaults while still being overridable.
- **`.env.example` as documentation**: document `ENVIRONMENT` (development/test/production) and `COOKIE_SECURE` with inline comments explaining the interaction so developers know why local HTTP may fail without the right env config.

## Files to Review for Similar Tasks
- `backend/app/config.py` — Settings class, existing `model_validator` for JWT_SECRET, field definitions for `environment` and `cookie_secure`
- `backend/tests/conftest.py` — how `os.environ` is set before app imports; pattern for ensuring the Settings singleton sees test overrides
- `backend/.env.example` — canonical reference for all supported environment variables and their expected values

## Gotchas and Pitfalls
- **Singleton cached before env override**: If any `app.*` module is imported (even transitively) before `conftest.py` sets `os.environ`, the Settings singleton is already built and the validator has already run — subsequent env mutations are invisible to it.
- **Empty string `COOKIE_SECURE`**: Setting `COOKIE_SECURE=` (empty string) in the environment has undefined/implementation-dependent behavior in pydantic-settings bool coercion — document that only `true`/`false` are valid values.
- **`model_fields_set` only populated at construction**: Do not rely on `model_fields_set` after patching attributes post-construction (e.g., `settings.cookie_secure = True` in a test) — the set reflects the state at instantiation, not mutations.
- **HTTP-only local dev is the common case**: Developers running `docker compose up` locally are always on HTTP; `cookie_secure=True` as a universal default silently breaks refresh token flow for every new contributor until they discover the env var override.
- **pydantic v1 syntax incompatibility**: `@validator` and `@root_validator` decorators from pydantic v1 will not raise an obvious error in all cases when used in a v2 project — prefer `@model_validator(mode='after')` consistently to avoid subtle startup failures.
```
