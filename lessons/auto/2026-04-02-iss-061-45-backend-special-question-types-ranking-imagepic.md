---
date: "2026-04-02"
ticket_id: "ISS-061"
ticket_title: "4.5: Backend — Special Question Types (ranking, image_picker, file_upload, expression, html)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-061"
ticket_title: "4.5: Backend — Special Question Types (ranking, image_picker, file_upload, expression, html)"
categories: ["backend", "validation", "question-types", "python"]
outcome: "success"
complexity: "high"
files_modified:
  - "backend/app/models/question.py"
  - "backend/app/services/validators/special_validators.py"
  - "backend/app/services/validators/__init__.py"
  - "backend/app/services/question_service.py"
  - "backend/tests/test_special_validators.py"
---

# Lessons Learned: 4.5: Backend — Special Question Types (ranking, image_picker, file_upload, expression, html)

## What Worked Well
- Following the established validator pattern from choice, scalar, and matrix validators made the implementation path clear — no architectural decisions required, just execution.
- Reading `__init__.py` before writing any validators confirmed exactly how the dispatcher works and what a missing registration looks like (silent gap, no startup error), which prevented a hard-to-debug failure.
- Separating config validators from answer validators in the registry cleanly handled the expression/html exclusion — these types simply have no entry in `_ANSWER_VALIDATORS`, and the existing architecture handles the rest.
- Running an import smoke-test (`python -c "from app.services.validators.special_validators import *"`) before pytest surfaced any import errors as clean tracebacks rather than cryptic test failures.

## What Was Challenging
- The image_picker answer validator shares significant logic with choice types (multi_select, min/max_choices). Resisting the urge to copy-paste and instead checking `choice_validators.py` for reusable helpers first required discipline but avoided duplicate validation logic.
- Determining whether `question_service.py` needed changes for expression/html required-field exclusion required reading the full service before touching it — the existing architecture (no answer validator registered = required validation is a no-op) already handled this without any new branching.
- The volume mount (`./backend:/app`) can mask container build artifacts. If a newly created module fails to import inside the container despite correct code, verifying the editable install `.egg-info` exists on the host filesystem is the first debugging step.

## Key Technical Insights
1. The validator dispatcher in `__init__.py` does not raise an error for unregistered types — it silently skips them. This means a missing import or registration produces no startup warning; the only signal is that validation is never invoked for that type.
2. Adding all five new type strings to `VALID_QUESTION_TYPES` in `question.py` must happen before writing any validators. Missing entries cause the type to be rejected at the model layer, so validators are never reached and appear to not work.
3. For expression and html types, the correct exclusion mechanism is simply omitting them from `_ANSWER_VALIDATORS` — not adding conditional branching in `question_service.py`. The service's required-field check only fires when an answer validator exists.
4. Ranking answer validation requires exactly a permutation of all option codes: test separately for missing option, duplicate option, extra unknown option, and empty array — each is a distinct failure mode requiring its own error message.
5. For file_upload, the ticket explicitly defers actual file handling — the answer validator should be minimal (config/metadata only) or absent. Over-engineering here creates dead code and maintenance burden.

## Reusable Patterns
- **Import smoke-test before pytest:** `python -c "from app.services.validators.special_validators import *"` — catches broken imports as clean tracebacks.
- **Atomic registration edit:** Add all new types to both `_CONFIG_VALIDATORS` and `_ANSWER_VALIDATORS` in a single edit to `__init__.py` to avoid partial-registration states.
- **Read dispatcher before registering:** Always read `__init__.py` fully to confirm the exact key format, dict names, and import style before adding entries.
- **Integration registry assertion:** After registering validators, assert programmatically that all five new types appear in the config registry, and that only the expected subset appear in the answer registry. Run this before the full test suite.
- **Check for reusable helpers first:** Before implementing validation logic for a new type that resembles an existing type (e.g., image_picker ≈ choice), read the existing validator module to identify shared helpers.

## Files to Review for Similar Tasks
- `backend/app/services/validators/__init__.py` — dispatcher and registry; read first before any new validator work.
- `backend/app/services/validators/choice_validators.py` — reference for answer_options pattern and multi-select validation logic reusable by image_picker.
- `backend/app/services/validators/special_validators.py` — canonical reference for this ticket's implementation.
- `backend/app/models/question.py` — `VALID_QUESTION_TYPES` tuple; must be updated before validators are written.
- `backend/app/services/question_service.py` — understand how `is_required` is evaluated before assuming changes are needed.

## Gotchas and Pitfalls
- **Silent registration gap:** A missing import in `__init__.py` means the new validators are never registered and no error is raised at startup. The type silently passes through unvalidated. Always verify registration with an explicit assertion.
- **Type rejection before validators run:** If a type string is missing from `VALID_QUESTION_TYPES`, the model rejects it before the validator layer is reached. New types must be added to the model first.
- **Volume mount masking build artifacts:** The `./backend:/app` Docker volume mount can hide the container's editable install state. If imports fail inside the container but the code is correct, check for the `.egg-info` directory on the host.
- **expression/html and required validation:** Do not add special-case branching in `question_service.py` for these types unless you have confirmed the existing architecture does not already handle it. The no-answer-validator path is typically a no-op for required checks.
- **file_upload scope creep:** The ticket explicitly defers actual file handling. Keep the answer validator minimal. Adding file content inspection or MIME type sniffing is out of scope and should be deferred to M5.
- **Ranking boundary cases are distinct:** Each of the four failure modes (missing option, duplicate option, unknown option, empty array) produces a different root cause and should have a distinct test and error message — do not collapse them into a single generic "invalid ranking" error.
```
