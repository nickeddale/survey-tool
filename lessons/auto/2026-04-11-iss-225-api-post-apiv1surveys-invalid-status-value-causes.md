---
date: "2026-04-11"
ticket_id: "ISS-225"
ticket_title: "[API] POST /api/v1/surveys — Invalid status value causes 500 Internal Server Error"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```
---
date: "2026-04-11"
ticket_id: "ISS-225"
ticket_title: "[API] POST /api/v1/surveys — Invalid status value causes 500 Internal Server Error"
categories: ["validation", "pydantic", "error-handling"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/schemas/survey.py"
  - "backend/tests/test_surveys.py"
---

# Lessons Learned: [API] POST /api/v1/surveys — Invalid status value causes 500 Internal Server Error

## What Worked Well
- The fix was a minimal, targeted change: replacing `str` with a `Literal` type alias on a single field in `SurveyCreate`
- The `VALID_SURVEY_STATUSES = Literal["draft", "active", "closed", "archived"]` pattern already existed in other schemas (quota, assessment), making the correct approach immediately clear
- Pydantic's `Literal` type provides automatic 422 rejection of invalid enum values with no custom validator logic required
- The new test `test_create_survey_invalid_status_returns_422` fit cleanly into the existing test structure at `test_surveys.py:95`

## What Was Challenging
- The root cause was subtle: `SurveyUpdate.status` was intentionally left as `str | None` (to allow partial updates with service-layer validation), so care was needed to only tighten `SurveyCreate`, not both schemas
- Identifying that the invalid value was reaching the database layer (rather than being caught by Pydantic) required tracing the schema definition, not just reading the route handler

## Key Technical Insights
1. When a Pydantic schema field uses a plain `str` type for a value that maps to a database ENUM column, invalid values pass schema validation silently and cause a database-level error, which FastAPI surfaces as a 500 rather than a 422
2. `Literal["a", "b", "c"]` is sufficient to enforce enum membership in Pydantic v2 — no custom validator or `@field_validator` is needed
3. `SurveyUpdate.status` remains `str | None` by design: PATCH workflows validate status transitions in the service layer, not at the schema level, so these two schemas intentionally diverge in strictness

## Reusable Patterns
- Define a module-level type alias (`VALID_SURVEY_STATUSES = Literal[...]`) so the valid values are declared once and can be referenced in field definitions, docstrings, and error messages
- For CREATE schemas: always use `Literal` (or an `Enum`) for fields that map to database ENUM columns to guarantee 422 before any DB round-trip
- For UPDATE schemas: assess whether enum validation belongs in the schema or service layer based on whether the update involves transition logic

## Files to Review for Similar Tasks
- `backend/app/schemas/survey.py` — contains `VALID_SURVEY_STATUSES` and the `SurveyCreate`/`SurveyUpdate` divergence pattern
- `backend/app/schemas/quota.py` — reference implementation of `Literal` enum validation in a CREATE schema
- `backend/app/schemas/assessment.py` — second reference for the same pattern
- `backend/tests/test_surveys.py:95` — `test_create_survey_invalid_status_returns_422` as a template for similar invalid-enum tests

## Gotchas and Pitfalls
- Do not apply the `Literal` type to `SurveyUpdate.status` without understanding that status transitions may have business rules enforced at the service layer — tightening validation there could break legitimate PATCH flows
- The `VALID_SURVEY_STATUSES` alias must be imported via `Literal` from `typing`, not from SQLAlchemy or any ORM enum — keep schema validation independent of the database model layer
- A 500 caused by an unhandled DB ENUM violation can be mistaken for a server bug during triage; always check whether the invalid input should have been rejected at the schema boundary first
```
