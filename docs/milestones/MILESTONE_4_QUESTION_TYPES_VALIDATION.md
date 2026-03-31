# Milestone 4: Question Types & Validation

## Overview

This milestone implements the full suite of 18 question types with their type-specific validation, settings enforcement, and frontend rendering components. While the basic question CRUD was established in Milestone 1 and the builder UI in Milestone 3, this milestone ensures every question type is fully functional end-to-end: correct backend validation, proper settings schema enforcement, accurate frontend input components, and client-side validation.

The milestone also delivers the survey JSON export/import functionality with full fidelity (all question types, settings, subquestions, and answer options are preserved) and a comprehensive test suite that exercises all 18 question types with their edge cases.

By the end of this milestone, the platform supports the complete question type catalog documented in QUESTION_TYPES.md, including text inputs, single/multi-select choices, matrix grids, scalar inputs, ranking, image picker, file upload, computed expressions, and static HTML content blocks.

## Prerequisites

- Milestone 1 (Backend Foundation) must be complete -- question and answer option CRUD.
- Milestone 3 (Survey Builder UI) must be complete -- builder UI, question editor, and preview components.

## Success Criteria

- All 18 question types can be created, configured, and validated via the API.
- Type-specific settings are validated on save (e.g., matrix requires subquestions, radio requires answer_options).
- Backend validation engine correctly validates response answers per question type.
- Frontend input components render all 18 types with full interactivity.
- Client-side validation matches server-side rules (required, min/max, regex, type-specific).
- Survey export produces portable JSON; import recreates the survey identically.
- Test suite covers all question types with happy path and edge cases.

## Architecture Notes

- **Validation engine**: `app/services/question_service.py` contains a `validate_question_config(question)` function that dispatches to type-specific validators. This runs on question create/update to ensure the question is well-formed.
- **Answer validation**: `app/services/response_service.py` (in M6) will use per-type validators from a `validate_answer(question, answer)` function.
- **Frontend components**: Each question type has a corresponding React input component in `src/components/question-inputs/`. A registry maps `question_type` to the component.
- **Subquestions**: Matrix types use the `parent_id` self-referential relationship on the `questions` table. Subquestion codes follow the pattern `{parent_code}_SQ{NNN}`.

## Tasks

### Task 4.1: Backend -- Text Question Types (short_text, long_text, huge_text)
**Estimated Complexity:** Medium
**Dependencies:** None

**Description:**
Implement full backend support for the three text question types. Create type-specific settings validation in `app/services/question_service.py` that enforces the settings schema from QUESTION_TYPES.md: `short_text` (placeholder, max_length up to 255, input_type in [text, email, url, tel]), `long_text` (placeholder, max_length up to 5000, rows), `huge_text` (placeholder, max_length up to 50000, rows, rich_text boolean).

Implement answer validation logic: value must be a string, length must not exceed `max_length`, if `input_type` is `email` the value must match email format, if `input_type` is `url` the value must be a valid URL. For `is_required` questions, value must be non-empty.

**Acceptance Criteria:**
- [ ] Creating a `short_text` question validates settings against the schema (max_length <= 255, input_type valid)
- [ ] Creating a `long_text` question validates settings (max_length <= 5000, rows > 0)
- [ ] Creating a `huge_text` question validates settings (max_length <= 50000, rich_text boolean)
- [ ] Default settings are applied when not provided (per QUESTION_TYPES.md defaults)
- [ ] Answer validation: string type check, max_length enforcement, input_type-specific format validation
- [ ] Required validation: non-empty string required when `is_required` is true
- [ ] Invalid settings return 422 with descriptive error messages

**Technical Notes:**
- Settings validation: create a `validate_text_settings(question_type, settings)` function
- Email regex: standard RFC 5322 simplified pattern
- URL validation: use `urllib.parse` or a regex
- Files: `app/services/question_service.py`, possibly `app/services/validators/text_validators.py`

---

### Task 4.2: Backend -- Choice Question Types (radio, dropdown, checkbox)
**Estimated Complexity:** Medium
**Dependencies:** None

**Description:**
Implement full backend support for the three primary choice question types. Validate that radio, dropdown, and checkbox questions have at least one answer option. Enforce settings schemas: `radio` (has_other, other_text, randomize, columns 1-4), `dropdown` (placeholder, searchable, has_other, other_text), `checkbox` (min_choices, max_choices, has_other, other_text, randomize, columns, select_all, select_all_text).

Implement answer validation: for radio and dropdown, `value` must be a valid answer option code or "other" (if `has_other` enabled, with non-empty `other_value`). For checkbox, `values` must be an array of valid option codes, respecting `min_choices` and `max_choices` constraints.

**Acceptance Criteria:**
- [ ] Radio/dropdown/checkbox questions require at least one answer option on creation
- [ ] Settings are validated against their schemas (columns 1-4, min_choices <= max_choices, etc.)
- [ ] Answer validation: value must be a valid option code from `answer_options`
- [ ] "Other" selection requires non-empty `other_value` when `has_other` is true
- [ ] Checkbox validates `min_choices` and `max_choices` constraints
- [ ] Required validation: selection must be made when `is_required` is true
- [ ] Default settings are applied per QUESTION_TYPES.md

**Technical Notes:**
- Choice validation needs to query the question's answer_options to verify valid codes
- Checkbox `values` is stored in the JSONB `values` column of `response_answers`
- If `min_choices` > number of options, return validation error on question save
- Files: `app/services/question_service.py`, `app/services/validators/choice_validators.py`

---

### Task 4.3: Backend -- Matrix Question Types (matrix, matrix_dropdown, matrix_dynamic)
**Estimated Complexity:** Large
**Dependencies:** None

**Description:**
Implement full backend support for matrix question types. Matrix questions use subquestions (via `parent_id`) for rows and answer_options for columns. The `matrix` type has radio selection per row, `matrix_dropdown` has dropdown selection per row, and `matrix_dynamic` allows the respondent to add/remove rows.

Validate that matrix questions have subquestions (rows) and answer_options (columns). Enforce settings: `matrix` (alternate_rows, is_all_rows_required, randomize_rows), `matrix_dropdown` (alternate_rows, is_all_rows_required, randomize_rows, column_types JSONB), `matrix_dynamic` (min_rows, max_rows, add_row_text, remove_row_text, default_row_count).

Implement subquestion CRUD: `POST /api/v1/surveys/{survey_id}/questions/{question_id}/subquestions` to create subquestions with `parent_id` set. Subquestion codes follow `{parent_code}_SQ{NNN}`.

**Acceptance Criteria:**
- [ ] Matrix questions require at least one subquestion (row) and one answer_option (column)
- [ ] Subquestions are created with `parent_id` referencing the parent matrix question
- [ ] Subquestion codes auto-generate as `{parent_code}_SQ001`, `{parent_code}_SQ002`, etc.
- [ ] Settings are validated per type (matrix, matrix_dropdown, matrix_dynamic)
- [ ] `matrix_dynamic` enforces `min_rows` <= `max_rows` and `default_row_count` within range
- [ ] Answer validation: response must include values for each row, with valid column option codes
- [ ] `is_all_rows_required` enforces that every row has a selection
- [ ] `GET /surveys/{id}/questions/{qid}` includes nested `subquestions` array

**Technical Notes:**
- Response format for matrix: `{"value": {"SQ001": "A1", "SQ002": "A3"}}` -- map of subquestion code to option code
- matrix_dropdown columns can have different types; `column_types` JSONB specifies this
- matrix_dynamic response: `{"values": [{"col1": "val1", "col2": "val2"}, ...]}` -- array of row objects
- Files: `app/models/question.py` (parent_id relationship), `app/services/question_service.py`, `app/api/questions.py` (subquestion endpoints)

---

### Task 4.4: Backend -- Scalar Question Types (numeric, rating, boolean, date)
**Estimated Complexity:** Medium
**Dependencies:** None

**Description:**
Implement full backend support for scalar question types. Enforce settings schemas: `numeric` (min_value, max_value, step, prefix, suffix, placeholder), `rating` (min_rating default 1, max_rating default 5, step default 1, icon "star"/"heart"/"thumb"), `boolean` (label_true default "Yes", label_false default "No", display "toggle"/"radio"), `date` (min_date, max_date, date_format default "YYYY-MM-DD", include_time boolean).

Implement answer validation: `numeric` value must be a number within min/max range and divisible by step; `rating` value must be within the rating range; `boolean` value must be "true" or "false"; `date` value must be a valid date string matching the configured format and within the date range.

**Acceptance Criteria:**
- [ ] Numeric questions validate min_value <= max_value, step > 0
- [ ] Rating questions validate min_rating < max_rating, icon is valid
- [ ] Boolean questions validate display is "toggle" or "radio"
- [ ] Date questions validate date_format is supported, min_date <= max_date
- [ ] Answer validation: numeric within range, rating within range, boolean true/false, date valid format
- [ ] Default settings are applied per QUESTION_TYPES.md
- [ ] Required validation works for all scalar types

**Technical Notes:**
- Numeric step validation: `(value - min_value) % step == 0`
- Date parsing: use `datetime.strptime` with the configured format
- Boolean stored as string "true"/"false" in `response_answers.value`
- Files: `app/services/question_service.py`, `app/services/validators/scalar_validators.py`

---

### Task 4.5: Backend -- Special Question Types (ranking, image_picker, file_upload, expression, html)
**Estimated Complexity:** Large
**Dependencies:** None

**Description:**
Implement full backend support for the five special question types. `ranking` requires answer_options and validates that the response contains every option exactly once in an ordered array. `image_picker` extends choice types with image_url support and multi_select mode. `file_upload` validates allowed file types and max file size. `expression` is a computed value type (no user input, evaluated server-side). `html` is a static content block (no response expected).

Enforce settings: `ranking` (randomize_initial_order), `image_picker` (multi_select, min/max_choices, image_width/height, show_labels), `file_upload` (allowed_types, max_file_size_mb, max_files), `expression` (expression string, display_format), `html` (content HTML string).

**Acceptance Criteria:**
- [ ] Ranking validates response is a permutation of all option codes (every option exactly once)
- [ ] Image picker validates single or multi-select based on `multi_select` setting
- [ ] Image picker answer_options support `image_url` field
- [ ] File upload validates `allowed_types` (e.g., ["pdf", "jpg", "png"]) and `max_file_size_mb`
- [ ] Expression questions have no user input; they store a computed value
- [ ] HTML questions have no response; they are content-only display blocks
- [ ] Settings are validated per QUESTION_TYPES.md specifications
- [ ] `expression` and `html` types are not included in required validation

**Technical Notes:**
- Ranking response: `{"values": ["A2", "A1", "A3"]}` -- complete ordered array
- File upload: actual file handling deferred; this task validates the configuration and metadata
- Expression evaluation is implemented in Milestone 5
- HTML content is stored in `settings.content` and rendered as-is (sanitized) in the frontend
- Files: `app/services/question_service.py`, `app/services/validators/special_validators.py`

---

### Task 4.6: Backend -- Question Validation Engine
**Estimated Complexity:** Large
**Dependencies:** Tasks 4.1-4.5

**Description:**
Create a unified validation engine in `app/services/question_service.py` that validates question configurations on save and answer values on response submission. The engine dispatches to type-specific validators based on `question_type`.

For question config validation (on create/update): validate that required structural elements exist (options for choice types, subquestions for matrix types), validate settings against the type's schema, validate `validation` JSONB rules (min, max, regex, custom expressions). For answer validation (used in M6): validate the response value against the question type, settings, and validation rules.

Implement the validation JSONB schema support: `{"min": N, "max": N, "regex": "pattern", "min_length": N, "max_length": N, "custom_expression": "..."}`. These rules apply in addition to type-specific validation.

**Acceptance Criteria:**
- [ ] `validate_question_config(question)` is called on every question create/update
- [ ] Type-specific validators catch: missing options for choice types, missing subquestions for matrix types
- [ ] Settings JSONB is validated against the type's settings schema
- [ ] `validate_answer(question, answer)` validates a response value against all rules
- [ ] Validation JSONB rules are enforced: min, max, regex, min_length, max_length
- [ ] Custom validation expressions are syntactically validated (semantic evaluation in M5)
- [ ] Validation errors return 422 with specific, actionable error messages
- [ ] The engine is extensible (easy to add new question types)

**Technical Notes:**
- Use a registry pattern: `validators: Dict[str, Callable]` mapping question_type to validator function
- Each validator returns a list of `ValidationError` objects with field path and message
- Regex validation: compile with `re.compile(pattern)` and test with `re.match`
- Files: `app/services/question_service.py`, `app/services/validators/__init__.py`

---

### Task 4.7: Frontend -- Text Input Components
**Estimated Complexity:** Medium
**Dependencies:** None (builds on M3 preview infrastructure)

**Description:**
Create interactive frontend input components for the three text question types. `ShortTextInput` renders a single-line input with placeholder and max_length counter. `LongTextInput` renders a textarea with configurable rows and character counter. `HugeTextInput` renders a large textarea or rich text editor (when `rich_text` is enabled in settings) with character counter.

These components are used both in the survey preview (M3) and in the actual response form (M6). They accept a `value`, `onChange`, `question`, and `errors` props. Client-side validation shows inline error messages for: required, max_length exceeded, email/url format (for short_text with input_type).

**Acceptance Criteria:**
- [ ] `ShortTextInput` renders a single-line input with the configured `input_type` (text/email/url/tel)
- [ ] `LongTextInput` renders a textarea with the configured number of `rows`
- [ ] `HugeTextInput` renders a textarea or rich text editor based on `rich_text` setting
- [ ] All text inputs show placeholder text from settings
- [ ] Character counter shows current/max characters (e.g., "42/255")
- [ ] Required fields show error when empty on blur or submit
- [ ] Email input_type validates email format client-side
- [ ] Components are fully accessible (labels, aria attributes, error announcements)

**Technical Notes:**
- Rich text editor: use a lightweight library like `react-quill` or `tiptap` for huge_text
- Character counter: `{value.length}/{settings.max_length}`
- For rich text, strip HTML tags before counting characters
- Files: `src/components/question-inputs/ShortTextInput.tsx`, `src/components/question-inputs/LongTextInput.tsx`, `src/components/question-inputs/HugeTextInput.tsx`

---

### Task 4.8: Frontend -- Choice Input Components
**Estimated Complexity:** Large
**Dependencies:** None

**Description:**
Create interactive frontend input components for choice question types. `RadioInput` renders radio buttons in the configured number of columns with optional "Other" free-text field. `DropdownInput` renders a select/combobox with optional search (when `searchable` is true) and "Other" option. `CheckboxInput` renders checkboxes with columns layout, optional "Select All", and "Other" field, enforcing min/max_choices.

All components accept answer_options and render them in order (or randomized if `randomize` is true). They handle the "Other" option by showing a text input when "Other" is selected. Client-side validation enforces required, min/max_choices.

**Acceptance Criteria:**
- [ ] `RadioInput` renders radio buttons in N columns with labels
- [ ] `DropdownInput` renders a select menu, optionally searchable
- [ ] `CheckboxInput` renders checkboxes with min/max_choices enforcement
- [ ] "Other" option appears with a free-text input when `has_other` is true
- [ ] Selecting "Other" requires filling in the text input
- [ ] `CheckboxInput` shows "Select All" checkbox when `select_all` is true
- [ ] Option randomization shuffles display order (with stable seed per session)
- [ ] Required validation: at least one selection required
- [ ] Error messages display inline below the component

**Technical Notes:**
- Use shadcn/ui RadioGroup, Select, Checkbox components as base
- Randomization: shuffle options using Fisher-Yates with a session-stable seed
- Columns layout: CSS grid with `grid-template-columns: repeat(N, 1fr)`
- Files: `src/components/question-inputs/RadioInput.tsx`, `src/components/question-inputs/DropdownInput.tsx`, `src/components/question-inputs/CheckboxInput.tsx`

---

### Task 4.9: Frontend -- Matrix Input Components
**Estimated Complexity:** Large
**Dependencies:** None

**Description:**
Create interactive frontend input components for matrix question types. `MatrixInput` renders a table grid with subquestions as rows and answer_options as column headers; each cell contains a radio button. `MatrixDropdownInput` renders a similar grid but with dropdown selects per cell. `MatrixDynamicInput` renders a grid where the respondent can add and remove rows, with configurable min/max_rows.

Each component handles the response format: matrix maps subquestion codes to selected option codes, matrix_dropdown maps subquestion codes to dropdown values, and matrix_dynamic produces an array of row objects. Implement `is_all_rows_required` validation and row randomization.

**Acceptance Criteria:**
- [ ] `MatrixInput` renders a radio grid with subquestion rows and option columns
- [ ] `MatrixDropdownInput` renders a dropdown grid
- [ ] `MatrixDynamicInput` renders an editable grid with "Add Row" and "Remove Row" buttons
- [ ] `MatrixDynamicInput` enforces `min_rows` and `max_rows` constraints
- [ ] `is_all_rows_required` shows errors for unanswered rows
- [ ] `alternate_rows` applies alternating row background colors
- [ ] `randomize_rows` shuffles subquestion order
- [ ] Response data structure matches the backend's expected format
- [ ] Components are responsive (horizontal scroll on narrow screens)

**Technical Notes:**
- Use HTML `<table>` for the grid layout with proper `<thead>`, `<tbody>`, `<th>`, `<td>`
- Matrix dynamic: maintain a local array of rows, map to/from the backend format
- Mobile: wrap table in a horizontally scrollable container
- Files: `src/components/question-inputs/MatrixInput.tsx`, `src/components/question-inputs/MatrixDropdownInput.tsx`, `src/components/question-inputs/MatrixDynamicInput.tsx`

---

### Task 4.10: Frontend -- Scalar Input Components
**Estimated Complexity:** Medium
**Dependencies:** None

**Description:**
Create interactive frontend input components for scalar question types. `NumericInput` renders a number input with optional prefix/suffix labels, min/max constraints, and step. `RatingInput` renders clickable icons (stars/hearts/thumbs) for the rating range. `BooleanInput` renders a toggle switch or radio buttons based on the `display` setting, with configurable true/false labels. `DateInput` renders a date picker with optional time selection, respecting min/max date constraints.

**Acceptance Criteria:**
- [ ] `NumericInput` renders a number input with prefix/suffix, min/max, and step
- [ ] `NumericInput` validates range and step constraints client-side
- [ ] `RatingInput` renders clickable icons (star/heart/thumb) for min to max rating
- [ ] `RatingInput` supports hover preview and click to select
- [ ] `BooleanInput` renders as toggle or radio based on `display` setting
- [ ] `BooleanInput` shows custom true/false labels
- [ ] `DateInput` renders a date picker with optional time
- [ ] `DateInput` enforces min_date and max_date constraints
- [ ] All components show required validation errors

**Technical Notes:**
- Numeric: use `<input type="number">` with `min`, `max`, `step` attributes
- Rating: map over range and render icons, handle hover state for preview
- Date picker: use a library like `react-day-picker` or shadcn/ui date picker
- Boolean toggle: shadcn/ui Switch component
- Files: `src/components/question-inputs/NumericInput.tsx`, `src/components/question-inputs/RatingInput.tsx`, `src/components/question-inputs/BooleanInput.tsx`, `src/components/question-inputs/DateInput.tsx`

---

### Task 4.11: Frontend -- Special Input Components
**Estimated Complexity:** Large
**Dependencies:** None

**Description:**
Create interactive frontend input components for special question types. `RankingInput` renders a drag-and-drop sortable list (using @dnd-kit) where the respondent orders all options from highest to lowest priority. `ImagePickerInput` renders a grid of images that can be selected (single or multi-select). `FileUploadInput` renders a file drop zone with type and size validation. `ExpressionDisplay` renders a computed/calculated value (read-only). `HtmlContent` renders static HTML content.

**Acceptance Criteria:**
- [ ] `RankingInput` renders all options as a sortable list with drag-and-drop
- [ ] `RankingInput` produces an ordered array of all option codes
- [ ] `ImagePickerInput` renders images in a grid with configurable width/height
- [ ] `ImagePickerInput` supports single and multi-select modes
- [ ] `FileUploadInput` renders a drop zone with click-to-upload and drag-to-upload
- [ ] `FileUploadInput` validates file types and size client-side
- [ ] `ExpressionDisplay` shows a computed value (read-only, no input)
- [ ] `HtmlContent` renders sanitized HTML content
- [ ] Ranking requires all items to be ranked (validation)

**Technical Notes:**
- Ranking: reuse @dnd-kit/sortable from M3; simpler single-list context
- Image picker: CSS grid layout, selection indicator (border/overlay), configurable dimensions
- File upload: use `<input type="file">` with drag events; display file preview after selection
- HTML sanitization: use `DOMPurify` to sanitize HTML content before rendering
- Expression display: will be populated by the expression engine (M5); show placeholder for now
- Files: `src/components/question-inputs/RankingInput.tsx`, `src/components/question-inputs/ImagePickerInput.tsx`, `src/components/question-inputs/FileUploadInput.tsx`, `src/components/question-inputs/ExpressionDisplay.tsx`, `src/components/question-inputs/HtmlContent.tsx`

---

### Task 4.12: Frontend -- Client-Side Validation Framework
**Estimated Complexity:** Medium
**Dependencies:** Tasks 4.7-4.11

**Description:**
Create a unified client-side validation framework that runs the same validation rules as the backend. Implement `validateAnswer(question: Question, answer: AnswerValue): ValidationResult` that checks: required fields, type-specific constraints (per Tasks 4.7-4.11), min/max/regex from the `validation` JSONB, and min/max_choices for multi-select types.

Create a `ValidationErrors` component that displays errors below question inputs. Implement validation timing: validate on blur (for individual fields) and on submit (for all visible questions). Create a `useValidation` hook that manages validation state for a set of questions.

**Acceptance Criteria:**
- [ ] `validateAnswer` covers all 18 question types
- [ ] Required validation for all applicable types
- [ ] Min/max/regex validation from the `validation` JSONB
- [ ] Type-specific validation matches backend rules
- [ ] `ValidationErrors` component displays error messages below inputs
- [ ] Validation runs on blur and on form submit
- [ ] `useValidation` hook provides `errors`, `validateField`, `validateAll`, `clearErrors`
- [ ] Error messages are clear and actionable

**Technical Notes:**
- Mirror backend validation logic exactly to avoid submit-time surprises
- Return `{ valid: boolean, errors: { field: string, message: string }[] }`
- Validation JSONB rules: `min`, `max`, `regex`, `min_length`, `max_length`
- Files: `src/utils/validation.ts`, `src/components/common/ValidationErrors.tsx`, `src/hooks/useValidation.ts`

---

### Task 4.13: Survey JSON Export/Import (Full Structure)
**Estimated Complexity:** Medium
**Dependencies:** Tasks 4.1-4.5

**Description:**
Ensure the backend export/import endpoints handle all 18 question types with full fidelity. The export at `GET /api/v1/surveys/{id}/export` must include: survey metadata, groups with relevance expressions, questions with all settings/validation/relevance, answer options with assessment values, and subquestions (for matrix types). The import at `POST /api/v1/surveys/import` must recreate the entire structure from this JSON.

Test round-trip fidelity: export a survey with all 18 question types, import it, export the import, and verify the two exports are structurally identical.

**Acceptance Criteria:**
- [ ] Export includes all question types with their settings, validation, and relevance
- [ ] Export includes subquestions for matrix types
- [ ] Export includes answer options with codes, titles, sort_order, and assessment_value
- [ ] Import creates a complete survey with all nested entities and new UUIDs
- [ ] Import validates the JSON structure and rejects malformed input
- [ ] Round-trip export -> import -> export produces identical structures
- [ ] Export uses codes (not UUIDs) for portability between instances
- [ ] Import auto-generates codes if not provided

**Technical Notes:**
- Export format defined in API_REFERENCE.md under `GET /surveys/{id}/export`
- Import should use a database transaction -- all-or-nothing creation
- Test: create a survey fixture with all 18 types, export, import, compare
- Files: `app/services/export_service.py`, `app/api/surveys.py`

---

### Task 4.14: Question Type Test Suite
**Estimated Complexity:** Large
**Dependencies:** Tasks 4.1-4.6, Task 4.13

**Description:**
Write a comprehensive test suite in `tests/test_questions.py` (or `tests/test_question_types.py`) that exercises all 18 question types. For each type, test: creation with valid settings, creation with invalid settings (expect 422), settings defaults, answer validation with valid values, answer validation with invalid values, required validation, and round-trip export/import.

Include edge cases: empty strings vs null, boundary values for min/max, regex patterns with special characters, matrix with zero subquestions, checkbox with min_choices > option count, numeric with step validation, rating at boundary values, and file upload with disallowed types.

**Acceptance Criteria:**
- [ ] Every question type has at least 5 test cases (valid creation, invalid settings, valid answer, invalid answer, required check)
- [ ] Matrix types test subquestion creation and validation
- [ ] Choice types test "other" option handling
- [ ] Numeric tests boundary values (min, max, step)
- [ ] Regex validation tests pattern matching
- [ ] Export/import round-trip test covers all 18 types
- [ ] Edge cases: null vs empty, boundary values, type coercion
- [ ] All tests pass with `pytest -q`

**Technical Notes:**
- Use parametrize for testing similar patterns across multiple types
- Create a fixture that generates a survey with one question of each type
- Test the `validate_question_config` and `validate_answer` functions directly (unit tests) and via API (integration tests)
- Files: `tests/test_question_types.py`
