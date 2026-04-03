---
date: "2026-04-03"
ticket_id: "ISS-057"
ticket_title: "4.1: Backend — Text Question Types (short_text, long_text, huge_text)"
categories: ["testing", "api", "ui", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-03"
ticket_id: "ISS-057"
ticket_title: "4.1: Backend — Text Question Types (short_text, long_text, huge_text)"
categories: ["backend", "validation", "question-types"]
outcome: "success"
complexity: "medium"
files_modified:
  - "backend/app/services/validators/text_validators.py"
  - "backend/app/services/validators/__init__.py"
  - "backend/app/models/question.py"
  - "backend/tests/test_question_types.py"
---
```

# Lessons Learned: 4.1: Backend — Text Question Types (short_text, long_text, huge_text)

## What Worked Well
- The existing validator architecture cleanly separated config (settings) validation from answer validation, making it straightforward to add new validators without touching unrelated code
- Shared helper functions (`_validate_text_value`, `_apply_text_validation_rules`) enabled consistent behavior across short_text, long_text, and huge_text without code duplication
- The dispatcher registry pattern in `validators/__init__.py` made registration of new validators a single-line change per type
- Default settings applied within config validators kept question_service.py clean and type-agnostic

## What Was Challenging
- Identifying which validators already existed versus which needed to be created required careful reading of `text_validators.py` before writing any code — the file had partial implementations that could easily be duplicated or conflated
- Email and URL format validation for `input_type`-specific short_text answers required integrating format checks into the existing answer validation flow without breaking the general string length path
- huge_text had no pre-existing answer validator, so it needed to be built and registered from scratch while remaining consistent with the existing short_text and long_text patterns

## Key Technical Insights
1. Config validators are responsible for both validation and default injection — if a settings field is missing, the validator should mutate the settings dict to apply the documented default, not just reject the missing field
2. Answer validators must access `question.settings` to retrieve type-specific constraints (e.g., `max_length`, `input_type`), so they need the full question object, not just the raw answer value
3. `input_type=email` and `input_type=url` validation only applies to short_text; long_text and huge_text do not have `input_type` settings, so format validation must be gated on question type
4. `is_required` enforcement belongs in the answer validator, not the config validator — a question can be configured with any settings, but whether an empty answer is acceptable is a submission-time concern
5. 422 responses with descriptive errors come from raising `QuestionValidationError` with a list of error strings; the service layer converts these to HTTP responses, so validators should never return HTTP objects directly

## Reusable Patterns
- Config validator signature: `validate_<type>_config(settings: dict) -> None` — mutates settings in place to apply defaults, raises `QuestionValidationError` with a list for invalid values
- Answer validator signature: `validate_<type>_answer(answer: Any, question: Question) -> None` — raises `QuestionValidationError` for invalid answers
- Dispatcher registration: `VALIDATOR_REGISTRY["<type>"] = (validate_<type>_config, validate_<type>_answer)` in `validators/__init__.py`
- Use a shared `_validate_text_value(value, max_length, field_name)` helper for any type that stores a plain string answer with a length constraint

## Files to Review for Similar Tasks
- `backend/app/services/validators/text_validators.py` — reference implementation for all three text types; use as template for new question-type validators
- `backend/app/services/validators/__init__.py` — dispatcher registry; shows how to register config + answer validator pairs
- `backend/app/services/question_service.py` — shows how validators are invoked and how `QuestionValidationError` maps to 422 responses
- `backend/tests/test_question_types.py` — covers settings boundary values, format validation, is_required enforcement, and default application; use as test template for new types
- `QUESTION_TYPES.md` — authoritative source for defaults and constraints per type; always read before implementing a new type

## Gotchas and Pitfalls
- Do not validate `input_type`-specific formats (email, URL) in the config validator — that is a settings validation concern only if the value of `input_type` itself is invalid (not in the allowed list)
- `rows` for long_text must be a positive integer (`> 0`), not just non-negative — a value of `0` is invalid and must be rejected with a descriptive error
- `rich_text` for huge_text must be a strict boolean — do not coerce truthy strings like `"true"` or `1`; reject non-boolean values with a 422
- `max_length` defaults differ significantly across types (255, 5000, 50000) — always reference `QUESTION_TYPES.md` rather than assuming symmetry
- If `max_length` is provided but `None`, treat it as if the field was omitted and apply the default rather than allowing an unbounded string
