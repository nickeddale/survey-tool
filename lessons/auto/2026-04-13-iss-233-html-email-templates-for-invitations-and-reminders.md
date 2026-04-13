---
date: "2026-04-13"
ticket_id: "ISS-233"
ticket_title: "HTML email templates for invitations and reminders"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-13"
ticket_id: "ISS-233"
ticket_title: "HTML email templates for invitations and reminders"
categories: ["email", "jinja2", "templates", "fastapi"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/pyproject.toml
  - backend/app/templates/email/base.html
  - backend/app/templates/email/invitation.html
  - backend/app/templates/email/reminder.html
  - backend/app/services/template_service.py
  - backend/app/services/email_invitation_service.py
  - backend/app/schemas/email_invitation.py
  - backend/tests/test_template_service.py
---

# Lessons Learned: HTML email templates for invitations and reminders

## What Worked Well
- Jinja2 template inheritance (`{% extends %}`) cleanly separated shared layout (base.html) from per-template content, reducing duplication across invitation and reminder templates.
- Inline CSS approach ensured broad email client compatibility without requiring any external tooling.
- Isolating template rendering into a dedicated `template_service.py` kept `email_invitation_service.py` clean and testable — template tests needed no DB or SMTP infrastructure.
- Using `| default('there', true)` (with the boolean `true` argument) correctly handled `None` values for `recipient_name`, not just Jinja2 `Undefined` — the `true` flag is required when the variable may be explicitly `None`.

## What Was Challenging
- Jinja2's default behavior silently renders missing variables as empty strings, which produces broken emails with no traceback. This required explicit configuration of the `undefined` class on the `Environment` to surface missing required variables as errors.
- Child templates must extend base using a path relative to the loader root (e.g., `{% extends "email/base.html" %}`), not just `"base.html"` — mismatching the loader root path causes a silent load failure.
- Circular import risk between `template_service.py` (importing `app.config`) and `email_invitation_service.py` (importing both `app.config` and `template_service`) required verification before wiring together.

## Key Technical Insights
1. Always configure `Jinja2Environment` with `undefined=jinja2.StrictUndefined` (or `jinja2.Undefined`) so missing required template variables raise immediately rather than rendering as empty strings.
2. The `| default('fallback')` filter only applies when a variable is `Undefined`; use `| default('fallback', true)` to also catch `None`.
3. Template paths passed to `{% extends %}` and `{% include %}` are always relative to the `FileSystemLoader` root, not to the child template's directory.
4. Template rendering tests require no DB or SMTP — pure Jinja2 unit tests run on the host Python without Docker, making them fast and simple.
5. Always import `Settings` from `app.config` (the singleton) rather than reading `os.environ` directly in service modules — keeps configuration centralised and testable.
6. Run an import smoke-test (`python -c 'from app.services.template_service import render_template, html_to_text'`) immediately after creating a new service module to surface broken imports as clean tracebacks before pytest collection.

## Reusable Patterns
- **Template service structure**: `render_template(template_name, **context) -> str` + `html_to_text(html) -> str` as the public interface; cache compiled environments at module level.
- **Jinja2 Environment setup**: `FileSystemLoader` pointing to `app/templates/`, `autoescape=True`, `undefined=StrictUndefined`, `trim_blocks=True`, `lstrip_blocks=True`.
- **Optional variable fallback**: declare `recipient_name | default('there', true)` in the template; assert the rendered output contains `'there'` in the test that passes `recipient_name=None`.
- **Plain text fallback**: strip HTML tags with a simple regex or `html.parser`-based helper in `template_service.py`; no external library required.
- **Test isolation**: template rendering tests use no fixtures — instantiate `Environment` directly or call `render_template` with a patched loader; no `session` or `client` fixture needed.

## Files to Review for Similar Tasks
- `backend/app/services/template_service.py` — reference implementation for Jinja2 environment setup and plain text generation.
- `backend/app/templates/email/base.html` — reference for responsive inline-CSS email layout and unsubscribe placeholder pattern.
- `backend/tests/test_template_service.py` — reference for no-DB template unit tests and optional-variable fallback assertions.
- `backend/app/services/email_invitation_service.py` — reference for how a service delegates to `template_service` and passes settings-derived values as template variables.

## Gotchas and Pitfalls
- **`| default('x')` does not catch `None`** — always use `| default('x', true)` when a variable may be `None` rather than absent.
- **Silent empty strings**: Jinja2's default `Undefined` silently renders missing variables as `""`. A broken `survey_link` will produce a valid-looking email with a blank link and no error. Use `StrictUndefined` in production, `DebugUndefined` in tests if you need to inspect which vars are missing.
- **Loader root mismatch**: `{% extends "base.html" %}` will fail if the loader root is `app/templates/` and the base is at `app/templates/email/base.html`. The correct path is `{% extends "email/base.html" %}`.
- **Circular imports**: `template_service` importing `app.config` and `email_invitation_service` importing both creates a potential cycle through `__init__.py` re-exports — verify with the import smoke-test before running the full test suite.
- **Inline CSS is mandatory**: external stylesheets and `<style>` blocks are stripped by many email clients (especially Outlook). All styling must be in `style=""` attributes.
- **Do not use passlib `CryptContext`**: bcrypt >= 4.x breaks it at runtime. If credential hashing is needed anywhere in tests, use `bcrypt` directly.
```
