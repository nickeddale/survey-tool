---
date: "2026-04-01"
ticket_id: "ISS-023"
ticket_title: "1.10: Survey Status Transitions"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-01"
ticket_id: "ISS-023"
ticket_title: "1.10: Survey Status Transitions"
categories: ["state-machine", "fastapi", "async-sqlalchemy", "editability-guards"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/app/api/surveys.py
  - backend/app/services/survey_service.py
  - backend/app/services/question_group_service.py
  - backend/app/services/question_service.py
  - backend/app/services/answer_option_service.py
  - backend/app/api/question_groups.py
  - backend/app/api/questions.py
  - backend/app/api/answer_options.py
  - backend/tests/test_survey_transitions.py
---

# Lessons Learned: 1.10: Survey Status Transitions

## What Worked Well
- Existing stubs in `survey_service.py` (activate_survey, close_survey, archive_survey, check_survey_editable) gave a clear skeleton to fill in, reducing the risk of structural missteps.
- Centralizing editability enforcement in a single `check_survey_editable()` helper kept the child services (question_group, question, answer_option) clean — each just calls the helper at the top of create/update/delete operations.
- Using HTTP 422 consistently for all validation failures (not in draft, no questions, etc.) aligned with FastAPI conventions and the acceptance criteria without ambiguity.
- The import smoke-test pattern (`python -c "from app.services.survey_service import activate_survey, ..."`) caught broken imports before running the full test suite, saving time on obscure test errors.

## What Was Challenging
- Async SQLAlchemy's prohibition on implicit lazy-loading required a dedicated COUNT query to check for question existence in `activate_survey()`. Relationship traversal would raise `MissingGreenlet` errors silently during tests.
- Cross-service editability enforcement required touching five service files and three API files — the blast radius was wider than a typical single-service task, increasing the chance of missing a call site.
- Remembering to apply `check_survey_editable()` in delete operations as well as create/update — delete paths are easy to overlook when scanning for modification entry points.

## Key Technical Insights
1. **Never use relationship lazy-loading in async context for existence checks.** Use an explicit COUNT query: `select(func.count()).where(Question.survey_id == survey_id)`. Async SQLAlchemy raises `MissingGreenlet` for implicit lazy loads, and the error may not surface until test time.
2. **`check_survey_editable()` must raise `HTTPException(status_code=422, ...)`, not 400 or 403.** FastAPI uses 422 for unprocessable entity / validation failures; using a different code breaks acceptance criteria and misleads API consumers.
3. **State transitions are strictly one-way:** draft → active → closed → archived. Each transition endpoint must assert the exact precondition status, not just "not target status", to avoid skipping states (e.g., draft → closed directly).
4. **Activation requires at least one question (not just a question group).** Groups without questions are valid in the data model but insufficient for a live survey — the precondition must query the `questions` table directly.
5. **Import smoke-test before pytest:** `python -c "from app.services.survey_service import activate_survey, close_survey, archive_survey, check_survey_editable"` surfaces broken imports with clean tracebacks rather than letting them manifest as confusing fixture or collection errors.

## Reusable Patterns
- **Editability guard pattern:** In each child service (question_group, question, answer_option), resolve the parent survey_id and call `await check_survey_editable(survey_id, db)` as the first async operation in create/update/delete functions.
- **COUNT query for existence check:**
  ```python
  count = await db.scalar(select(func.count()).where(Question.survey_id == survey_id))
  if count == 0:
      raise HTTPException(status_code=422, detail="Survey must have at least one question")
  ```
- **Transition endpoint structure** (reuse for any state machine endpoint):
  ```python
  @router.post("/{survey_id}/activate", response_model=SurveyResponse)
  async def activate_survey_endpoint(survey_id: UUID, db: AsyncSession = Depends(get_db)):
      survey = await get_survey_or_404(survey_id, db)
      return await activate_survey(survey, db)
  ```
- **Pre-test import check:** Always run the smoke-test import before `pytest` when adding new service functions, especially across multiple files.

## Files to Review for Similar Tasks
- `backend/app/services/survey_service.py` — reference implementation of check_survey_editable, activate_survey, close_survey, archive_survey
- `backend/app/api/surveys.py` — transition endpoint structure and UUID parsing pattern
- `backend/app/services/question_service.py` — example of check_survey_editable integration in a child service
- `backend/tests/test_survey_transitions.py` — test patterns for state machine happy paths and precondition failures
- `backend/tests/conftest.py` — verify all async engine fixtures use `scope="function"`

## Gotchas and Pitfalls
- **Do not use `scope="session"` for async SQLAlchemy engine fixtures** — causes event loop mismatch errors with asyncpg under pytest-asyncio. All async fixtures must use `scope="function"`.
- **DATABASE_URL environment default is psycopg2 scheme** (`postgresql://`) — always override to `postgresql+asyncpg://` for every pytest invocation or the async engine fails silently.
- **Delete operations also need editability guards** — it is easy to add `check_survey_editable()` to create/update but forget delete, leaving a backdoor to mutate non-draft surveys.
- **Do not use passlib CryptContext** — it is incompatible with bcrypt >= 4.x installed in this environment. Use bcrypt directly (hashpw/checkpw/gensalt) if any auth code is touched.
- **Implicit lazy-loading in async SQLAlchemy will raise `MissingGreenlet`** — always use explicit eager loads (`selectinload`) or separate queries when traversing relationships in async service functions.
```
