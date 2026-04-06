---
date: "2026-04-06"
ticket_id: "ISS-124"
ticket_title: "CQ-02: Split export_service.py into CSV/JSON exporters"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-124"
ticket_title: "CQ-02: Split export_service.py into CSV/JSON exporters"
categories: ["refactoring", "code-quality", "module-splitting"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/services/export_service.py
  - backend/app/services/exporters/__init__.py
  - backend/app/services/exporters/survey_export_service.py
  - backend/app/services/exporters/response_export_service.py
  - backend/app/services/exporters/csv_exporter.py
  - backend/app/services/exporters/json_exporter.py
---

# Lessons Learned: CQ-02: Split export_service.py into CSV/JSON exporters

## What Worked Well
- Following the ISS-123 shim pattern exactly meant no changes were needed in call-site files (`api/surveys.py`, `api/responses.py`) — all 30+ existing tests passed without modification
- Splitting along format boundaries (CSV vs JSON) produced naturally cohesive modules with single responsibilities
- Extracting the shared query layer (`response_export_service.py`) before the format-specific exporters prevented code duplication between `csv_exporter.py` and `json_exporter.py`
- Explicit `__all__` in the shim with named imports made the re-export surface visible and auditable at a glance

## What Was Challenging
- The original 833-line file interleaved survey CRUD logic (clone/import/export) with response export logic, requiring careful reading before splitting to avoid misassigning helper functions
- Private helpers (`_import_question`, `_export_option`, etc.) needed to follow their public callers into the correct submodule rather than being split arbitrarily by line number
- Ensuring `services/exporters/__init__.py` re-exported every public symbol without gaps required cross-checking against the original file's implicit public surface

## Key Technical Insights
1. Run an import smoke-test (`python -c 'from app.services.export_service import clone_survey, generate_csv_stream, build_json_export'`) before the full test suite — broken re-exports produce clean tracebacks here but cryptic pytest collection errors later
2. `wc -l` each new file immediately after writing, not in a final batch; catching a 400-line violation early avoids rework after the shim is already wired
3. Never use `import *` in the shim layer — symbols added to submodules later are silently dropped and only fail at call sites, not at import time
4. Private helpers belong in the same module as the public function that calls them, not grouped by name prefix or proximity in the original file
5. Circular imports between submodules are easy to introduce accidentally when shared constants exist — a quick grep for cross-submodule references before running tests catches this early

## Reusable Patterns
- **Thin shim pattern**: keep the original module path as a re-export shim with explicit `__all__` and named imports; call sites require zero changes
- **Shared query layer**: extract the common data-access function into a neutral submodule (`response_export_service.py`) that format-specific modules depend on, never the reverse
- **Pre/post import smoke-test**: baseline the import before the split, then re-verify after wiring the shim, to confirm no symbols were lost
- **Immediate line-count check**: run `wc -l` on each file as it is written, treating 400 lines as a hard gate rather than a post-hoc review criterion

## Files to Review for Similar Tasks
- `backend/app/services/export_service.py` — canonical example of a thin re-export shim with explicit `__all__`
- `backend/app/services/exporters/__init__.py` — shows how to aggregate public symbols from multiple submodules
- `backend/app/services/exporters/response_export_service.py` — shared query layer pattern for format-agnostic data access
- `backend/app/services/response_service.py` — ISS-123 predecessor; same shim pattern applied to response service

## Gotchas and Pitfalls
- **Silent symbol loss**: `import *` in the shim will not re-export symbols that are not in the submodule's `__all__` or that are added later — always use explicit named imports
- **pytest collection errors mask the real problem**: if the shim has a broken import, pytest reports a collection error on unrelated test files, not a clean `ImportError` — smoke-test imports first
- **Private helpers tied to public callers**: splitting by line range without tracing call graphs will leave private helpers in the wrong submodule, causing `NameError` at runtime rather than import time
- **`__init__.py` gaps**: forgetting to add a newly split symbol to `services/exporters/__init__.py` means `from app.services.exporters import <symbol>` silently fails for any future caller that imports from the package directly rather than through the shim
```
