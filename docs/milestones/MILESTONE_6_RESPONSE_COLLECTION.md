# Milestone 6: Response Collection

## Overview

This milestone implements the complete response collection pipeline: respondents can start a survey, submit answers, receive server-side validation, save partial responses for later, and complete the survey. Administrators can view individual responses, browse paginated response lists with filters, export response data as CSV or JSON, and view aggregated survey statistics.

The backend handles response lifecycle management (incomplete -> complete -> disqualified), per-question-type answer validation, relevance-aware validation (only validating visible questions), and response export with configurable column selection. The frontend delivers the public-facing survey response form with conditional display and piping, plus the admin-side response viewing and export interfaces.

This milestone transforms the platform from a survey creation tool into a full survey data collection and analysis system.

## Prerequisites

- Milestone 1 (Backend Foundation) must be complete -- core CRUD and auth.
- Milestone 4 (Question Types & Validation) must be complete -- all 18 question types with validation.
- Milestone 5 (Survey Logic & Expressions) must be complete -- relevance evaluation, skip logic, and piping.

## Success Criteria

- Respondents can start and complete a survey via the public response form.
- Server-side validation catches all invalid answers before saving.
- Relevance-aware validation only validates visible questions.
- Partial responses can be saved and resumed later.
- Response status transitions (incomplete -> complete, incomplete -> disqualified) work correctly.
- Admin can view individual responses and browse the response list with filters.
- CSV and JSON exports produce correct, downloadable files with configurable columns.
- Survey statistics endpoint returns accurate aggregations.
- All response flows are covered by automated tests.

## Architecture Notes

- **Response submission**: Two-phase process: (1) start a response (`POST /surveys/{id}/responses` with partial or no answers), (2) update/complete the response (`PATCH /surveys/{id}/responses/{id}` with answers and status).
- **Answer storage**: Each answer is stored in `response_answers` with `value` (TEXT for single values) or `values` (JSONB for multi-value/matrix). One row per question per response (unique constraint on response_id + question_id).
- **Relevance-aware validation**: Before validating answers, evaluate all relevance expressions to determine which questions are visible. Only visible required questions are enforced.
- **Export service**: Generates CSV or JSON files. CSV columns map to question codes. Supports column selection to include/exclude specific questions.

## Tasks

### Task 6.1: Response Model and Submission Endpoint
**Estimated Complexity:** Large
**Dependencies:** None

**Description:**
Create the `responses` table model in `app/models/response.py` with columns: `id` (UUID PK), `survey_id` (UUID FK -> surveys, CASCADE), `participant_id` (UUID FK -> participants, nullable), `status` (response_status ENUM, default 'incomplete'), `started_at` (TIMESTAMPTZ, default now()), `completed_at` (TIMESTAMPTZ nullable), `ip_address` (VARCHAR 45), `metadata` (JSONB, default {}). Create the `response_answers` table model in `app/models/response_answer.py` with: `id` (UUID PK), `response_id` (UUID FK -> responses, CASCADE), `question_id` (UUID FK -> questions, CASCADE), `value` (TEXT nullable), `values` (JSONB nullable), `created_at` (TIMESTAMPTZ).

Implement `POST /api/v1/surveys/{id}/responses` to start a new response. This endpoint is accessible without authentication (public surveys) or with a participant token. It creates a response record with `status: incomplete`, records the IP address and metadata, and optionally accepts initial answers. Generate the Alembic migration for both tables.

**Acceptance Criteria:**
- [ ] `POST /surveys/{id}/responses` creates a response with `status: incomplete` and returns the response ID
- [ ] Response can only be created for surveys with `status: active`
- [ ] IP address is captured from the request
- [ ] Metadata (user agent, referrer) is stored in the `metadata` JSONB
- [ ] Initial answers can be submitted in the creation request
- [ ] Each answer creates a `response_answers` row with the question_id, value, and/or values
- [ ] Unique constraint on `(response_id, question_id)` prevents duplicate answers
- [ ] Migration creates both `responses` and `response_answers` tables with proper indexes

**Technical Notes:**
- Indexes: `idx_responses_survey_id`, `idx_responses_survey_id_status`, `idx_response_answers_response_id`, `idx_response_answers_question_id`, unique index on `(response_id, question_id)`
- IP address: extract from request headers (X-Forwarded-For or client host)
- Public endpoint: no auth required, but validate survey exists and is active
- Files: `app/models/response.py`, `app/models/response_answer.py`, `app/schemas/response.py`, `app/api/responses.py`, `app/services/response_service.py`

---

### Task 6.2: Server-Side Answer Validation
**Estimated Complexity:** Large
**Dependencies:** Task 6.1

**Description:**
Implement comprehensive server-side answer validation in `app/services/response_service.py`. When answers are submitted, validate each answer against its question's type, settings, validation rules, and required flag. Use the validation engine from Milestone 4 (Task 4.6) to dispatch to type-specific validators.

Validation should be called on both initial submission and answer updates. Return detailed error responses listing all validation failures with question codes and error messages, not just the first failure. Support the `validation` JSONB rules (min, max, regex, custom_expression) in addition to type-specific rules.

**Acceptance Criteria:**
- [ ] Every submitted answer is validated against its question type
- [ ] Required questions without answers return validation errors
- [ ] Type-specific validation: text max_length, numeric min/max, choice valid options, etc.
- [ ] `validation` JSONB rules are enforced: min, max, regex, min_length, max_length
- [ ] All validation errors are collected and returned (not just the first one)
- [ ] Error response format: `{"detail": {"code": "VALIDATION_ERROR", "message": "...", "errors": [{...}]}}`
- [ ] Each error includes `question_code`, `field`, and `message`
- [ ] Valid answers are saved successfully

**Technical Notes:**
- Reuse `validate_answer(question, answer_data)` from M4 Task 4.6
- Collect all errors: `errors = []; for answer in answers: errors.extend(validate(question, answer))`
- Return 422 with all errors if any validation fails
- Files: `app/services/response_service.py`, `app/services/validators/`

---

### Task 6.3: Relevance-Aware Validation and Response Completion
**Estimated Complexity:** Medium
**Dependencies:** Task 6.2

**Description:**
Integrate the expression engine (Milestone 5) with answer validation. Before validating a response for completion, evaluate all relevance expressions to determine which questions are visible given the current answers. Only validate visible questions; hidden questions are skipped even if marked as required. This prevents respondents from being blocked by questions that were legitimately skipped via survey logic.

Implement the completion flow: `PATCH /api/v1/surveys/{id}/responses/{response_id}` with `status: "complete"`. On completion, run relevance-aware validation on all answers. If valid, set `status: complete` and `completed_at: now()`. If invalid, return validation errors and keep `status: incomplete`.

**Acceptance Criteria:**
- [ ] Completing a response evaluates all relevance expressions first
- [ ] Hidden questions are not validated (even if required)
- [ ] Visible required questions without answers block completion
- [ ] `PATCH /surveys/{id}/responses/{rid}` with `status: "complete"` triggers completion flow
- [ ] Successful completion sets `completed_at` timestamp
- [ ] Failed completion returns validation errors and keeps status as `incomplete`
- [ ] Answers for hidden questions are preserved (not deleted) but not validated
- [ ] The response's answers can be updated before completion

**Technical Notes:**
- Use `evaluate_relevance(survey, answers)` from M5 Task 5.6 to get visible question list
- Filter validation to only visible questions: `visible_questions = get_visible(survey, answers)`
- Allow multiple PATCH calls to update answers before final completion
- Files: `app/services/response_service.py`, `app/api/responses.py`

---

### Task 6.4: Response Status Management and Disqualification
**Estimated Complexity:** Medium
**Dependencies:** Task 6.3

**Description:**
Implement full response status lifecycle management. Responses start as `incomplete`, transition to `complete` on successful submission, or `disqualified` when a respondent is screened out by quota logic (M7) or explicit disqualification. Implement status transition rules: incomplete -> complete, incomplete -> disqualified, and prevent transitions from complete/disqualified back to incomplete.

Add a `PATCH /api/v1/surveys/{id}/responses/{id}/status` endpoint for admin status management (e.g., marking a response as disqualified manually). Track status change timestamps appropriately.

**Acceptance Criteria:**
- [ ] Response status transitions: incomplete -> complete, incomplete -> disqualified
- [ ] Cannot transition complete -> incomplete or disqualified -> incomplete
- [ ] `completed_at` is set when transitioning to complete
- [ ] Admin can manually disqualify a response via PATCH
- [ ] Disqualified responses are excluded from statistics by default
- [ ] Attempting an invalid transition returns 422 with descriptive error
- [ ] Status is included in all response list and detail endpoints

**Technical Notes:**
- Status transition validation: check current status before applying change
- Admin endpoint requires authentication (JWT or API key with `responses:write` scope)
- Disqualification will be triggered automatically by quotas in M7; prepare the interface now
- Files: `app/api/responses.py`, `app/services/response_service.py`

---

### Task 6.5: Partial Response Saving (Resume Later)
**Estimated Complexity:** Medium
**Dependencies:** Task 6.1

**Description:**
Implement the ability to save partial responses so respondents can return and complete the survey later. When a response is in `incomplete` status, answers can be updated via `PATCH /api/v1/surveys/{id}/responses/{id}` without triggering completion validation. The endpoint accepts partial answer sets (only the answers being updated) and merges them with existing answers.

Generate a resume token or use the response ID as a URL parameter for returning respondents. The frontend stores the response ID in localStorage (or provides a shareable resume link) so respondents can continue where they left off.

**Acceptance Criteria:**
- [ ] PATCH with partial answers updates existing answers and adds new ones
- [ ] Existing answers not included in the PATCH are preserved
- [ ] Partial save does not trigger completion validation
- [ ] Response remains in `incomplete` status during partial saves
- [ ] Resume endpoint: `GET /surveys/{id}/responses/{id}` returns current answers
- [ ] Multiple partial saves can be made before completion
- [ ] Conflict handling: concurrent updates to the same response

**Technical Notes:**
- Merge logic: for each answer in the PATCH, upsert into response_answers (update value if exists, insert if new)
- Use the unique constraint on `(response_id, question_id)` with `ON CONFLICT DO UPDATE`
- The frontend will store `response_id` in localStorage keyed by survey_id
- Files: `app/api/responses.py`, `app/services/response_service.py`

---

### Task 6.6: Response Listing and Filtering Endpoint
**Estimated Complexity:** Medium
**Dependencies:** Task 6.1

**Description:**
Implement `GET /api/v1/surveys/{id}/responses` to list responses for a survey with pagination, filtering, and sorting. Support filters: `status` (incomplete, complete, disqualified), `started_after` and `started_before` (date range), `completed_after` and `completed_before`. Support sorting by `started_at`, `completed_at`, or `status`.

Return summary information for each response: id, status, started_at, completed_at, participant info (if applicable), and ip_address. Do not include full answer data in the list view (that's the detail endpoint). This endpoint requires authentication with `responses:read` scope.

**Acceptance Criteria:**
- [ ] `GET /surveys/{id}/responses` returns paginated response list
- [ ] Filter by `status`: `?status=complete` returns only complete responses
- [ ] Filter by date range: `?started_after=2026-01-01&started_before=2026-12-31`
- [ ] Sorting: `?sort_by=completed_at&sort_order=desc`
- [ ] Each response includes: id, status, started_at, completed_at, ip_address, participant_id
- [ ] Pagination follows standard format (items, total, page, per_page)
- [ ] Requires authentication with `responses:read` scope
- [ ] Returns 404 if survey not found or not owned by user

**Technical Notes:**
- Build query dynamically based on filter parameters
- Date filters: `WHERE started_at >= :started_after AND started_at <= :started_before`
- Default sort: `started_at DESC` (most recent first)
- Index: `idx_responses_survey_id_status` used for status filtering
- Files: `app/api/responses.py`, `app/services/response_service.py`

---

### Task 6.7: Response Detail Endpoint
**Estimated Complexity:** Small
**Dependencies:** Task 6.1

**Description:**
Implement `GET /api/v1/surveys/{id}/responses/{response_id}` to retrieve a single response with all its answers. The response includes the response metadata (status, timestamps, participant, IP) and a full list of answer objects, each containing the question_id, question code, question title, question type, and the answer value/values.

Optionally join question data to provide context: for each answer, include the question's code, title, type, and for choice questions, the selected option's title (not just the code).

**Acceptance Criteria:**
- [ ] `GET /surveys/{id}/responses/{rid}` returns full response with all answers
- [ ] Each answer includes: question_id, question_code, question_title, question_type, value, values
- [ ] For choice questions, include the selected option's title
- [ ] Response metadata: id, status, started_at, completed_at, ip_address, metadata, participant_id
- [ ] Returns 404 if response not found
- [ ] Requires authentication with `responses:read` scope
- [ ] Matrix question answers include subquestion labels

**Technical Notes:**
- Join response_answers with questions to get code, title, type
- For choice answers, join with answer_options to get option titles
- For matrix answers, join with subquestions to get row labels
- Files: `app/api/responses.py`, `app/schemas/response.py`

---

### Task 6.8: Response Export Endpoint (CSV and JSON)
**Estimated Complexity:** Large
**Dependencies:** Task 6.7

**Description:**
Implement `GET /api/v1/surveys/{id}/responses/export` to export response data. Support two formats: CSV and JSON, selected via the `format` query parameter (default: CSV). Support column selection via the `columns` parameter (comma-separated question codes) to include/exclude specific questions. Support status filtering to export only complete responses.

CSV format: one row per response, columns are response metadata (id, status, started_at, completed_at) followed by one column per question (using question code as header). JSON format: array of response objects with nested answers. The response should set appropriate Content-Type and Content-Disposition headers for file download.

**Acceptance Criteria:**
- [ ] `GET /surveys/{id}/responses/export?format=csv` returns CSV file download
- [ ] `GET /surveys/{id}/responses/export?format=json` returns JSON file download
- [ ] CSV headers: response_id, status, started_at, completed_at, {Q1_code}, {Q2_code}, ...
- [ ] Column selection: `?columns=Q1,Q2,Q5` includes only those questions
- [ ] Status filter: `?status=complete` exports only complete responses
- [ ] Multi-value answers (checkbox, ranking) are serialized as comma-separated in CSV
- [ ] Matrix answers are flattened: one column per subquestion (e.g., Q5_SQ001, Q5_SQ002)
- [ ] Content-Type: `text/csv` or `application/json`
- [ ] Content-Disposition: `attachment; filename="survey_{id}_responses.csv"`
- [ ] Requires authentication with `responses:read` scope

**Technical Notes:**
- Use Python's `csv` module with `io.StringIO` for CSV generation
- Stream large exports to avoid memory issues (for very large response sets)
- Matrix flattening: for matrix question Q5 with subquestions SQ001, SQ002, create columns Q5_SQ001, Q5_SQ002
- Files: `app/services/export_service.py`, `app/api/responses.py`

---

### Task 6.9: Survey Statistics Endpoint
**Estimated Complexity:** Medium
**Dependencies:** Task 6.1

**Description:**
Implement `GET /api/v1/surveys/{id}/statistics` to return aggregated response statistics. Calculate: total_responses, complete_responses, incomplete_responses, disqualified_responses, completion_rate, and average_completion_time_seconds. For each question, calculate: response_count and a summary appropriate to the question type (option distribution for choice types, average/min/max for numeric types, response count for text types).

The summary format varies by question type: choice questions get a count and percentage per option, numeric questions get mean/median/min/max, rating questions get average rating and distribution, text questions get response count only.

**Acceptance Criteria:**
- [ ] Returns total_responses, complete_responses, incomplete_responses, disqualified_responses
- [ ] completion_rate = complete_responses / total_responses (or 0 if no responses)
- [ ] average_completion_time_seconds calculated from started_at to completed_at for complete responses
- [ ] Per-question summaries for each question in the survey
- [ ] Choice questions: count and percentage per option
- [ ] Numeric questions: mean, median, min, max
- [ ] Rating questions: average rating and distribution per value
- [ ] Text questions: response count
- [ ] Response format matches API_REFERENCE.md `GET /surveys/{id}/statistics` spec
- [ ] Requires authentication

**Technical Notes:**
- Use SQL aggregations for efficiency: `COUNT`, `AVG`, `GROUP BY`
- For choice distribution: count response_answers grouped by value for each question
- For numeric: aggregate value column (cast to numeric) for numeric-type questions
- Completion time: `AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))` for complete responses
- Files: `app/services/response_service.py`, `app/api/surveys.py` (or `app/api/responses.py`)

---

### Task 6.10: Frontend -- Public Survey Response Form
**Estimated Complexity:** Large
**Dependencies:** Tasks 6.1-6.5

**Description:**
Create the public-facing survey response form that respondents use to complete a survey. This is accessible at a public URL (e.g., `/s/{survey_id}`) without authentication. The form fetches the survey structure, renders questions using the input components from Milestone 4, handles navigation between groups (if `one_page_per_group`), and submits answers to the response API.

The form flow: show welcome message -> render questions (page by page or all at once) -> validate on navigation/submit -> show end message. Support resume: if a response ID is found in localStorage, load the existing partial response and resume.

**Acceptance Criteria:**
- [ ] Public survey URL renders the survey without requiring authentication
- [ ] Welcome message is displayed on the first screen
- [ ] Questions render using the correct input components per type
- [ ] Navigation: Next/Previous buttons for page-per-group mode
- [ ] Client-side validation runs on page navigation and final submit
- [ ] Submit creates/completes a response via the API
- [ ] End message is displayed after successful submission
- [ ] Resume: checks localStorage for existing response and pre-fills answers
- [ ] Inactive/closed surveys show "Survey is not available" message
- [ ] Progress bar shows completion progress
- [ ] Form is fully responsive and mobile-friendly

**Technical Notes:**
- Route: `/s/:surveyId` (public, no ProtectedRoute wrapper)
- Fetch survey: `GET /api/v1/surveys/{id}?include=full`
- Start response: `POST /api/v1/surveys/{id}/responses`
- Save partial: `PATCH /api/v1/surveys/{id}/responses/{rid}` with current answers
- Complete: PATCH with `status: "complete"`
- Store response ID: `localStorage.setItem(`response_${surveyId}`, responseId)`
- Files: `src/pages/SurveyResponsePage.tsx`, `src/components/responses/SurveyForm.tsx`

---

### Task 6.11: Frontend -- Conditional Display and Piping in Response Form
**Estimated Complexity:** Medium
**Dependencies:** Task 6.10

**Description:**
Integrate the expression engine's resolve-flow endpoint with the response form. When the respondent navigates between pages or changes an answer that affects relevance, call `POST /api/v1/surveys/{id}/logic/resolve-flow` with the current answers to determine which questions are visible and get piped text values.

Hidden questions are removed from the rendered form. Piped text replaces variable references in question titles and descriptions. When an answer changes, debounce a resolve-flow call and update the visible questions. Handle the loading state gracefully (don't flash questions in/out).

**Acceptance Criteria:**
- [ ] Questions with false relevance are hidden from the form
- [ ] Groups with false relevance are hidden entirely
- [ ] Piped text ({Q1} references) is replaced with actual answer values in titles and descriptions
- [ ] Changing an answer triggers re-evaluation of relevance
- [ ] Re-evaluation is debounced (300ms) to avoid excessive API calls
- [ ] Hidden-then-shown questions retain their previous answers
- [ ] Smooth transitions: no flash of hidden/shown questions
- [ ] Skip logic navigates to the correct next visible question/group

**Technical Notes:**
- Call `POST /surveys/{id}/logic/resolve-flow` with current answers on: page load, answer change, navigation
- Use the `visible_questions` and `hidden_questions` arrays to filter rendered questions
- Use `piped_texts` to replace text in question titles: `piped_texts["Q5_title"]`
- Debounce: only call resolve-flow when the user pauses typing or changes a selection
- Files: `src/pages/SurveyResponsePage.tsx`, `src/hooks/useFlowResolution.ts`

---

### Task 6.12: Frontend -- Response List and Detail Pages (Admin View)
**Estimated Complexity:** Medium
**Dependencies:** Task 6.6, Task 6.7

**Description:**
Create `src/pages/ResponsesPage.tsx` for the admin response list view. Display responses in a table with columns: ID (truncated), status badge, started date, completed date, and view/delete actions. Include filters: status dropdown, date range picker, and pagination controls. Clicking a response navigates to the detail view.

Create `src/components/responses/ResponseDetail.tsx` that displays a single response with all answers. Show the response metadata at the top, then each question with its answer, organized by question group. For choice questions, show the selected option label. For matrix questions, show the grid with selections highlighted.

**Acceptance Criteria:**
- [ ] Response list table shows all responses with status badges
- [ ] Status filter dropdown filters by incomplete/complete/disqualified
- [ ] Date range filters (started after/before) narrow results
- [ ] Pagination controls for navigating large response sets
- [ ] Clicking a response opens the detail view
- [ ] Detail view shows response metadata and all answers
- [ ] Answers are displayed using read-only versions of input components
- [ ] Choice answers show the option label (not just the code)
- [ ] Matrix answers show a filled-in grid
- [ ] Delete response with confirmation dialog

**Technical Notes:**
- Use shadcn/ui Table with sorting, DataTable pattern
- Route: `/surveys/:id/responses` for list, `/surveys/:id/responses/:rid` for detail
- Fetch list: `GET /api/v1/surveys/{id}/responses`
- Fetch detail: `GET /api/v1/surveys/{id}/responses/{rid}`
- Files: `src/pages/ResponsesPage.tsx`, `src/components/responses/ResponseTable.tsx`, `src/components/responses/ResponseDetail.tsx`

---

### Task 6.13: Frontend -- Response Export UI and Statistics Dashboard
**Estimated Complexity:** Medium
**Dependencies:** Task 6.8, Task 6.9

**Description:**
Create `src/components/responses/ExportDialog.tsx` that provides a UI for exporting responses. The dialog lets the user choose: format (CSV or JSON), status filter (all, complete only), and column selection (checkboxes for each question to include/exclude). Clicking "Export" triggers the download via the export API endpoint.

Enhance the survey detail page or responses page with a statistics summary. Display: total responses, complete count, completion rate, average completion time, and per-question summaries. For choice questions, show bar charts or percentage bars. For numeric questions, show mean/min/max. Use the `GET /surveys/{id}/statistics` endpoint.

**Acceptance Criteria:**
- [ ] Export dialog offers CSV and JSON format selection
- [ ] Status filter: "All responses" or "Complete only"
- [ ] Column selection: checkboxes for each question, "Select All" / "Deselect All"
- [ ] Export button triggers file download with correct filename
- [ ] Statistics dashboard shows response totals and completion rate
- [ ] Per-question statistics with appropriate visualizations
- [ ] Choice questions: horizontal bar chart or percentage bar per option
- [ ] Numeric questions: mean, min, max display
- [ ] Average completion time displayed in human-readable format
- [ ] Loading states for statistics and export

**Technical Notes:**
- Export: construct URL with query params and trigger download: `window.location.href = exportUrl`
- Or use Axios with `responseType: 'blob'` and create a download link
- Statistics visualization: use simple CSS bars or a lightweight chart library
- Completion time: format seconds as "X min Y sec"
- Files: `src/components/responses/ExportDialog.tsx`, `src/components/responses/StatisticsDashboard.tsx`
