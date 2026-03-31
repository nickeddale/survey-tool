# Milestone 7: Advanced Features

## Overview

This milestone delivers the advanced capabilities that complete the survey platform: participant access control with token-based survey access, quota management for response limits, assessment scoring for quiz-style surveys, webhook integrations for real-time event notifications, multi-language support for internationalized surveys, and a comprehensive end-to-end integration test suite.

These features transform the platform from a basic survey tool into an enterprise-grade solution that supports controlled distribution (participant tokens), sample management (quotas), educational assessments (scoring), third-party integrations (webhooks), and global audiences (multi-language content).

By the end of this milestone, the survey tool is feature-complete as described in the project documentation, with every table in the database schema utilized, every endpoint in the API reference implemented, and every capability tested end-to-end.

## Prerequisites

- Milestones 1-6 must be complete -- all core functionality for survey creation, response collection, and the expression engine.

## Success Criteria

- Participant tokens control survey access and are validated on response submission.
- Quotas enforce response limits and trigger terminate/hide_question actions.
- Assessments score responses and display appropriate messages based on score ranges.
- Webhooks deliver events to configured URLs with HMAC-SHA256 signatures and retry logic.
- Multi-language support allows survey content in multiple languages.
- End-to-end tests cover the full user journey from registration to response export.
- All tables, endpoints, and features from the documentation are implemented and tested.

## Architecture Notes

- **Participant tokens**: Random unique tokens distributed to respondents. The token is passed as a query parameter or header when starting a response. Tokens can have usage limits, validity windows, and custom attributes.
- **Quotas**: Server-side enforcement during response completion. Quota conditions are expressions evaluated against response answers. When a quota is met, the configured action (terminate or hide_question) is applied.
- **Assessments**: Score calculation based on `answer_options.assessment_value`. Scores are summed per scope (total or per-group) and matched against assessment rules to produce messages.
- **Webhooks**: Async HTTP POST delivery with JSON payloads, HMAC-SHA256 signing using the webhook's secret, and exponential backoff retry (3 attempts). Events: response.started, response.completed, survey.activated, survey.closed, quota.reached.
- **Multi-language**: Translations stored in a `translations` JSONB column on surveys, groups, questions, and answer_options. Each translation is keyed by language code (e.g., `{"fr": {"title": "..."}}`).

## Tasks

### Task 7.1: Participant Model and CRUD Endpoints
**Estimated Complexity:** Medium
**Dependencies:** None

**Description:**
Create the `participants` table model in `app/models/participant.py` with columns: `id` (UUID PK), `survey_id` (UUID FK -> surveys, CASCADE), `token` (VARCHAR 255, UNIQUE), `email` (VARCHAR 255 nullable), `attributes` (JSONB, default {}), `uses_remaining` (INTEGER nullable -- null means unlimited), `valid_from` (TIMESTAMPTZ nullable), `valid_until` (TIMESTAMPTZ nullable), `completed` (BOOLEAN, default false), `created_at` (TIMESTAMPTZ).

Implement CRUD endpoints: `POST /api/v1/surveys/{survey_id}/participants` (create single or batch), `GET /api/v1/surveys/{survey_id}/participants` (list with pagination and filters), `GET /api/v1/surveys/{survey_id}/participants/{id}`, `PATCH /api/v1/surveys/{survey_id}/participants/{id}`, `DELETE /api/v1/surveys/{survey_id}/participants/{id}`. Generate tokens as random URL-safe strings (e.g., 32 characters). Generate the Alembic migration.

**Acceptance Criteria:**
- [ ] `POST /surveys/{id}/participants` creates a participant with a unique random token
- [ ] Batch creation: accept an array to create multiple participants at once
- [ ] `GET /surveys/{id}/participants` lists participants with pagination
- [ ] Filter by: `completed` (true/false), `email` (search), `valid` (currently valid tokens)
- [ ] `PATCH` updates email, attributes, uses_remaining, valid_from, valid_until
- [ ] `DELETE` removes a participant
- [ ] Token is returned only on creation (like API keys)
- [ ] Migration creates the `participants` table with unique index on `token`

**Technical Notes:**
- Token generation: `secrets.token_urlsafe(24)` produces a 32-character URL-safe string
- Batch creation: loop and create, returning array of participant objects with tokens
- Index: `idx_participants_token` (unique), `idx_participants_survey_id`
- Files: `app/models/participant.py`, `app/schemas/participant.py`, `app/api/participants.py`

---

### Task 7.2: Participant Token Validation During Response Submission
**Estimated Complexity:** Medium
**Dependencies:** Task 7.1

**Description:**
Integrate participant validation into the response submission flow. When a survey requires participant tokens (indicated by having participants configured), the `POST /surveys/{id}/responses` endpoint must accept a `token` parameter. The system validates: the token exists, belongs to this survey, is currently valid (within `valid_from`/`valid_until` window), has uses remaining (`uses_remaining > 0` or null for unlimited), and has not already completed the survey (`completed` is false).

On successful response start, decrement `uses_remaining` (if not null). On response completion, set `completed = true`. Link the response to the participant via `responses.participant_id`. Support `{RESPONDENT.attribute}` variable resolution from `participants.attributes` JSONB.

**Acceptance Criteria:**
- [ ] Surveys with participants require a valid token to start a response
- [ ] Invalid/expired/used tokens return 403 FORBIDDEN
- [ ] Token before `valid_from` returns 403
- [ ] Token after `valid_until` returns 403
- [ ] Token with `uses_remaining == 0` returns 403
- [ ] `uses_remaining` is decremented on response start
- [ ] `completed` is set to true on response completion
- [ ] Response is linked to participant via `participant_id`
- [ ] `{RESPONDENT.email}` and `{RESPONDENT.attribute}` resolve from participant data
- [ ] Surveys without participants allow anonymous responses

**Technical Notes:**
- Token passed as: `POST /surveys/{id}/responses` body `{"token": "..."}` or `?token=...` query param
- Validation order: exists -> belongs to survey -> valid_from/until -> uses_remaining -> completed
- Update participant atomically: use `UPDATE ... SET uses_remaining = uses_remaining - 1 WHERE uses_remaining > 0`
- Files: `app/services/response_service.py`, `app/api/responses.py`

---

### Task 7.3: Quota Model and CRUD Endpoints
**Estimated Complexity:** Medium
**Dependencies:** None

**Description:**
Create the `quotas` table model in `app/models/quota.py` with columns: `id` (UUID PK), `survey_id` (UUID FK -> surveys, CASCADE), `name` (VARCHAR 255), `limit` (INTEGER), `action` (quota_action ENUM: terminate, hide_question), `conditions` (JSONB, default []), `current_count` (INTEGER, default 0), `is_active` (BOOLEAN, default true).

Implement CRUD endpoints: `POST /api/v1/surveys/{survey_id}/quotas`, `GET /api/v1/surveys/{survey_id}/quotas`, `GET /api/v1/surveys/{survey_id}/quotas/{id}`, `PATCH /api/v1/surveys/{survey_id}/quotas/{id}`, `DELETE /api/v1/surveys/{survey_id}/quotas/{id}`. Conditions are arrays of `{"question_id": "uuid", "operator": "eq", "value": "A1"}` objects. Generate the Alembic migration.

**Acceptance Criteria:**
- [ ] `POST /surveys/{id}/quotas` creates a quota with name, limit, action, and conditions
- [ ] Conditions JSONB validates structure: each condition has question_id, operator, value
- [ ] Supported operators: `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `in`, `contains`
- [ ] `GET /surveys/{id}/quotas` lists quotas with current_count
- [ ] `PATCH` updates name, limit, action, conditions, is_active
- [ ] `DELETE` removes a quota
- [ ] `current_count` reflects the number of matching complete responses
- [ ] Migration creates the `quotas` table with index on survey_id

**Technical Notes:**
- Conditions reference question_id (UUID) -- validate that the question exists in the survey
- Action enum: `terminate` (end survey for respondent), `hide_question` (hide a specific question)
- `current_count` is a cached value updated on response completion; can be recalculated
- Files: `app/models/quota.py`, `app/schemas/quota.py`, `app/api/quotas.py`

---

### Task 7.4: Quota Enforcement During Response Submission
**Estimated Complexity:** Large
**Dependencies:** Task 7.3

**Description:**
Integrate quota enforcement into the response completion flow. When a response is being completed, evaluate all active quotas for the survey. For each quota, check if the response's answers match the quota's conditions. If the conditions match and `current_count >= limit`, apply the quota action: `terminate` disqualifies the response (sets status to `disqualified`), `hide_question` is applied during flow resolution.

Implement atomic current_count updates to prevent race conditions: use `UPDATE quotas SET current_count = current_count + 1 WHERE id = :id AND current_count < limit` and check the affected row count. If the update succeeds, the response counts toward the quota. If it fails (quota already met), apply the action.

**Acceptance Criteria:**
- [ ] On response completion, all active quotas are evaluated
- [ ] Quota conditions are checked against the response's answers
- [ ] When quota limit is reached and response matches, `terminate` action disqualifies the response
- [ ] When quota limit is reached, `hide_question` action integrates with relevance evaluation
- [ ] `current_count` is atomically incremented for matching responses
- [ ] Race condition prevention: atomic update with row count check
- [ ] Quota check happens before final response save
- [ ] `quota.reached` event is triggered when a quota hits its limit (for webhooks)
- [ ] Inactive quotas are skipped

**Technical Notes:**
- Evaluate conditions: for each condition in quota.conditions, check if response_answer for question_id matches the operator/value
- Use expression engine for complex quota conditions (operator map: eq -> ==, gt -> >, etc.)
- Atomic update: `UPDATE quotas SET current_count = current_count + 1 WHERE id = :id AND current_count < limit RETURNING current_count`
- Files: `app/services/quota_service.py`, `app/services/response_service.py`

---

### Task 7.5: Assessment Model, Scoring Engine, and CRUD Endpoints
**Estimated Complexity:** Large
**Dependencies:** None

**Description:**
Create the `assessments` table model in `app/models/assessment.py` with columns: `id` (UUID PK), `survey_id` (UUID FK -> surveys, CASCADE), `name` (VARCHAR 255), `scope` (assessment_scope ENUM: total, group), `group_id` (UUID FK -> question_groups, nullable -- required when scope is 'group'), `min_score` (DECIMAL), `max_score` (DECIMAL), `message` (TEXT).

Implement CRUD endpoints: `POST /api/v1/surveys/{survey_id}/assessments`, `GET /api/v1/surveys/{survey_id}/assessments`, `PATCH /api/v1/surveys/{survey_id}/assessments/{id}`, `DELETE /api/v1/surveys/{survey_id}/assessments/{id}`. Implement the scoring engine that calculates a respondent's score by summing `answer_options.assessment_value` for selected options, then matches the score against assessment rules to return appropriate messages.

Add a `GET /api/v1/surveys/{id}/responses/{rid}/assessment` endpoint that returns the score and matching assessment messages for a completed response.

**Acceptance Criteria:**
- [ ] `POST /surveys/{id}/assessments` creates an assessment rule with scope, score range, and message
- [ ] `scope: "group"` requires a valid `group_id`; `scope: "total"` requires `group_id` to be null
- [ ] `min_score` must be <= `max_score`
- [ ] Scoring engine sums `assessment_value` from selected answer_options
- [ ] Score is calculated per scope: total (all questions) or group (questions in group)
- [ ] Assessment rules are matched by score range: `min_score <= score <= max_score`
- [ ] `GET /surveys/{id}/responses/{rid}/assessment` returns score and matching messages
- [ ] Multiple assessment rules can match (overlapping ranges)
- [ ] Migration creates the `assessments` table

**Technical Notes:**
- Score calculation: for each response_answer, look up the answer_option's assessment_value and sum
- For choice questions: answer_option is identified by matching `value` to `answer_options.code`
- For matrix questions: sum assessment_values across all subquestion selections
- Group scope: only sum questions whose group_id matches the assessment's group_id
- Files: `app/models/assessment.py`, `app/schemas/assessment.py`, `app/api/assessments.py`, `app/services/assessment_service.py`

---

### Task 7.6: Webhook Model and CRUD Endpoints
**Estimated Complexity:** Medium
**Dependencies:** None

**Description:**
Create the `webhooks` table model in `app/models/webhook.py` with columns: `id` (UUID PK), `user_id` (UUID FK -> users, CASCADE), `survey_id` (UUID FK -> surveys, CASCADE, nullable -- null for global webhooks), `url` (VARCHAR 2048), `events` (JSONB, default []), `secret` (VARCHAR 255), `is_active` (BOOLEAN, default true), `created_at` (TIMESTAMPTZ).

Implement CRUD endpoints: `POST /api/v1/webhooks`, `GET /api/v1/webhooks` (list user's webhooks), `GET /api/v1/webhooks/{id}`, `PATCH /api/v1/webhooks/{id}`, `DELETE /api/v1/webhooks/{id}`. Validate that `url` is a valid HTTPS URL (allow HTTP in development). Validate that `events` contains only recognized event names. Auto-generate `secret` if not provided. Generate the Alembic migration.

**Acceptance Criteria:**
- [ ] `POST /webhooks` creates a webhook with url, events, and optional survey_id
- [ ] Valid events: `response.started`, `response.completed`, `survey.activated`, `survey.closed`, `quota.reached`
- [ ] `url` must be a valid URL (HTTPS in production)
- [ ] `secret` is auto-generated if not provided (32-character random string)
- [ ] `survey_id: null` creates a global webhook for all user's surveys
- [ ] `GET /webhooks` lists the user's webhooks
- [ ] `PATCH` updates url, events, survey_id, is_active
- [ ] `DELETE` removes a webhook
- [ ] Migration creates the `webhooks` table with indexes

**Technical Notes:**
- Secret generation: `secrets.token_hex(16)` for a 32-character hex string
- URL validation: use `pydantic.HttpUrl` or `urllib.parse.urlparse`
- Events stored as JSONB array of strings
- Index: `idx_webhooks_user_id`, `idx_webhooks_survey_id`
- Files: `app/models/webhook.py`, `app/schemas/webhook.py`, `app/api/webhooks.py`

---

### Task 7.7: Webhook Event Dispatching
**Estimated Complexity:** Large
**Dependencies:** Task 7.6

**Description:**
Implement the webhook event dispatching system in `app/services/webhook_service.py`. When a triggering event occurs (response started, response completed, survey activated, survey closed, quota reached), find all active webhooks for the user/survey that subscribe to that event, and dispatch HTTP POST requests to each webhook's URL.

The dispatch payload includes: event name, timestamp, survey ID, and event-specific data (response data for response events, quota data for quota events). Use `httpx.AsyncClient` for async HTTP delivery. Dispatch should be fire-and-forget (non-blocking to the main request) using `asyncio.create_task` or a background task queue.

**Acceptance Criteria:**
- [ ] `response.started` event fires when a response is created
- [ ] `response.completed` event fires when a response is completed
- [ ] `survey.activated` event fires when a survey is activated
- [ ] `survey.closed` event fires when a survey is closed
- [ ] `quota.reached` event fires when a quota hits its limit
- [ ] Webhooks with matching survey_id receive events for that survey
- [ ] Global webhooks (survey_id is null) receive events for all user's surveys
- [ ] Inactive webhooks are skipped
- [ ] Dispatch is non-blocking (does not slow down the triggering request)

**Technical Notes:**
- Event payload: `{"event": "response.completed", "timestamp": "...", "survey_id": "...", "data": {...}}`
- Find matching webhooks: `SELECT * FROM webhooks WHERE (survey_id = :sid OR survey_id IS NULL) AND user_id = :uid AND is_active = true AND events @> :event_name`
- Fire-and-forget: `asyncio.create_task(dispatch_webhook(webhook, payload))`
- Integrate event triggers at the appropriate points in existing services
- Files: `app/services/webhook_service.py`, `app/services/response_service.py`, `app/services/survey_service.py`, `app/services/quota_service.py`

---

### Task 7.8: Webhook HMAC-SHA256 Signing and Retry Logic
**Estimated Complexity:** Medium
**Dependencies:** Task 7.7

**Description:**
Implement HMAC-SHA256 payload signing for webhook deliveries. Each webhook has a `secret` used to sign the JSON payload. The signature is sent in the `X-Webhook-Signature` header as a hex digest. This allows webhook receivers to verify the authenticity of the payload.

Implement retry logic with exponential backoff. If a webhook delivery fails (non-2xx response or connection error), retry up to 3 times with delays of 10s, 60s, and 300s. Log delivery attempts and outcomes. Optionally track delivery history for debugging (not required for MVP, but prepare the interface).

**Acceptance Criteria:**
- [ ] Webhook payload is signed with HMAC-SHA256 using the webhook's `secret`
- [ ] Signature is sent in the `X-Webhook-Signature` header
- [ ] Receiver can verify: `hmac.compare_digest(expected, hmac.new(secret, payload, sha256).hexdigest())`
- [ ] Failed deliveries are retried up to 3 times
- [ ] Retry delays use exponential backoff: 10s, 60s, 300s
- [ ] Connection timeouts (5s) and read timeouts (10s) are enforced
- [ ] Delivery outcomes are logged (success, failure, timeout)
- [ ] Retries stop after 3 failed attempts

**Technical Notes:**
- Signing: `hmac.new(webhook.secret.encode(), json_payload.encode(), hashlib.sha256).hexdigest()`
- Headers: `X-Webhook-Signature: sha256={hex_digest}`, `Content-Type: application/json`, `User-Agent: SurveyTool/1.0`
- Retry: `asyncio.sleep(delay)` between attempts; use `try/except httpx.HTTPError`
- Consider a simple in-memory delivery log or database table for tracking (optional)
- Files: `app/services/webhook_service.py`

---

### Task 7.9: Frontend -- Participant Management UI
**Estimated Complexity:** Medium
**Dependencies:** Task 7.1

**Description:**
Create a participant management interface within the survey settings/detail page. Display a table of participants with columns: email, token (masked), uses remaining, valid from, valid until, completed status, and actions (edit, delete). Include an "Add Participant" button that opens a form for creating single participants and a "Bulk Import" feature that accepts a CSV of email addresses and attributes.

Show participant tokens only once (on creation) with a copy-to-clipboard button. For existing participants, show a masked version. Include a "Generate Survey Links" feature that creates individual survey URLs with embedded tokens.

**Acceptance Criteria:**
- [ ] Participant table shows all participants for a survey
- [ ] "Add Participant" form: email (optional), attributes (key-value pairs), validity period
- [ ] Token shown only on creation with copy-to-clipboard
- [ ] Bulk import: upload CSV with email and optional attributes columns
- [ ] Edit participant: update email, attributes, validity, uses_remaining
- [ ] Delete with confirmation
- [ ] "Generate Links" creates URLs: `/s/{surveyId}?token={token}`
- [ ] Filter by: completed, valid, email search
- [ ] Pagination for large participant lists

**Technical Notes:**
- Route: `/surveys/:id/participants` (tab within survey detail)
- CSV import: parse client-side with PapaParse or similar, then batch create via API
- Survey link format: `{baseUrl}/s/{surveyId}?token={participantToken}`
- Files: `src/pages/ParticipantsPage.tsx`, `src/components/participants/ParticipantTable.tsx`

---

### Task 7.10: Frontend -- Quota Management UI
**Estimated Complexity:** Medium
**Dependencies:** Task 7.3

**Description:**
Create a quota management interface within the survey settings. Display existing quotas in a list/table showing: name, limit, current count, progress bar (current/limit), action type, and status (active/inactive). Include a "Create Quota" button that opens a form for defining a new quota.

The quota creation/edit form includes: name, limit (number), action (dropdown: terminate or hide_question), and a conditions builder. The conditions builder lets the user add conditions with: question selector, operator selector, and value input (similar to the relevance expression builder but simpler, using the structured JSONB format).

**Acceptance Criteria:**
- [ ] Quota list shows all quotas with name, limit, current_count, progress bar
- [ ] Progress bar fills based on current_count / limit ratio
- [ ] "Create Quota" form: name, limit, action dropdown, conditions builder
- [ ] Conditions builder: add condition row with question, operator, value
- [ ] Operator options: equals, not equals, greater than, less than, in, contains
- [ ] Value input adapts to question type (option dropdown for choice, number for numeric)
- [ ] Edit quota: pre-fills form with existing values
- [ ] Toggle active/inactive status
- [ ] Delete with confirmation
- [ ] Display quota action description (e.g., "Terminates survey when limit reached")

**Technical Notes:**
- Route: `/surveys/:id/quotas` (tab within survey detail)
- Conditions JSONB: `[{"question_id": "uuid", "operator": "eq", "value": "A1"}]`
- Use similar condition-builder pattern as the relevance expression builder (simplified version)
- Files: `src/pages/QuotasPage.tsx`, `src/components/quotas/QuotaForm.tsx`

---

### Task 7.11: Frontend -- Assessment Configuration UI
**Estimated Complexity:** Medium
**Dependencies:** Task 7.5

**Description:**
Create an assessment configuration interface within the survey settings. Display existing assessments in a table showing: name, scope (total/group), score range (min-max), and message preview. Include a "Create Assessment" button for adding new scoring rules.

The assessment form includes: name, scope selector (total or group), group selector (appears when scope is "group"), min_score (number), max_score (number), and message (text/rich text). Show a helper that displays the possible score range based on the survey's answer option assessment values.

**Acceptance Criteria:**
- [ ] Assessment list shows all rules with name, scope, score range, message preview
- [ ] "Create Assessment" form: name, scope, group (if scope=group), min_score, max_score, message
- [ ] Scope selector toggles group selector visibility
- [ ] Group selector shows question groups for the survey
- [ ] Score range helper: shows "Possible score range: 0 - {max_possible}" based on assessment_values
- [ ] Edit assessment: pre-fills form
- [ ] Delete with confirmation
- [ ] Validation: min_score <= max_score, group required for scope=group

**Technical Notes:**
- Route: `/surveys/:id/assessments` (tab within survey detail)
- Max possible score: sum of max(assessment_value) across all questions in scope
- Scope=total: sum all questions; scope=group: sum questions in the selected group
- Files: `src/pages/AssessmentsPage.tsx`, `src/components/assessments/AssessmentForm.tsx`

---

### Task 7.12: Frontend -- Webhook Management UI
**Estimated Complexity:** Medium
**Dependencies:** Task 7.6

**Description:**
Create a webhook management interface in the user settings page. Display webhooks in a table: URL (truncated), events (badge list), survey scope (global or specific survey name), status (active/inactive), and actions. Include a "Create Webhook" button.

The webhook form includes: URL input, event checkboxes (response.started, response.completed, survey.activated, survey.closed, quota.reached), survey selector (optional -- "All surveys" or pick a specific one), and a test button. The test button sends a test event to the URL and shows the response status.

**Acceptance Criteria:**
- [ ] Webhook list shows all user's webhooks with URL, events, scope, and status
- [ ] "Create Webhook" form: URL, event checkboxes, survey selector, secret display
- [ ] Event checkboxes for all 5 event types with descriptions
- [ ] Survey selector: "All surveys" (global) or pick from user's surveys
- [ ] Secret shown on creation with copy-to-clipboard (masked afterwards)
- [ ] "Test Webhook" button sends a test payload and shows success/failure
- [ ] Edit webhook: update URL, events, survey scope, active status
- [ ] Delete with confirmation
- [ ] Toggle active/inactive status

**Technical Notes:**
- Route: `/settings/webhooks` (within the settings page)
- Test webhook: `POST /webhooks/{id}/test` endpoint (or construct client-side test)
- Secret display: show `wh_****...****` for existing webhooks
- Event descriptions: "response.completed: Fires when a respondent completes a survey"
- Files: `src/pages/SettingsPage.tsx` (webhooks tab), `src/components/webhooks/WebhookForm.tsx`

---

### Task 7.13: Multi-Language Support
**Estimated Complexity:** Large
**Dependencies:** None

**Description:**
Add multi-language support for survey content. Add a `translations` JSONB column to `surveys`, `question_groups`, `questions`, and `answer_options` tables via migration. The translations column stores language-keyed objects: `{"fr": {"title": "Titre en francais"}, "es": {"title": "Titulo en espanol"}}`.

Implement backend logic: when a response is started with a language parameter (e.g., `?lang=fr`), the survey structure is returned with translated content. If a translation is missing for a field, fall back to the default language. Add a language switcher to the public response form. Add a translation editor in the survey builder.

**Acceptance Criteria:**
- [ ] Migration adds `translations` JSONB column to surveys, question_groups, questions, answer_options
- [ ] `GET /surveys/{id}?lang=fr` returns translated content where available
- [ ] Missing translations fall back to the `default_language` content
- [ ] Response form accepts `?lang=` parameter and renders in that language
- [ ] Language switcher in the response form allows changing language mid-survey
- [ ] Survey builder includes a translation editor panel
- [ ] Translation editor shows source language and target language side-by-side
- [ ] Export/import includes translations
- [ ] `survey.default_language` serves as the fallback language

**Technical Notes:**
- Translation resolution: `get_translated_field(obj, field, lang)` checks `translations[lang][field]`, falls back to `obj[field]`
- Apply translation in the serialization layer (schemas) to keep models clean
- Builder UI: add a "Translations" tab in the question editor showing translatable fields per language
- Supported translatable fields: title, description for all entities; welcome_message, end_message for surveys
- Files: `app/models/*.py` (add translations column), migration, `app/services/translation_service.py`, `src/components/survey-builder/TranslationEditor.tsx`

---

### Task 7.14: End-to-End Integration Test Suite
**Estimated Complexity:** Large
**Dependencies:** Tasks 7.1-7.13

**Description:**
Write a comprehensive end-to-end integration test suite that exercises the complete platform. The suite simulates the full user journey: register a user, create a survey via the API, add question groups with questions of various types, configure logic (relevance expressions), set up participants and quotas, activate the survey, submit responses (both valid and invalid), verify quota enforcement, check assessment scoring, verify webhook delivery, export responses, and view statistics.

Test both JWT auth and API key auth paths. Test the public response form flow. Test edge cases: concurrent response submissions, quota race conditions, expired tokens, complex branching logic, and export of surveys with all 18 question types.

**Acceptance Criteria:**
- [ ] Full journey test: register -> create survey -> add questions -> activate -> submit responses -> export
- [ ] Auth test: both JWT and API key authentication paths work end-to-end
- [ ] Question types: survey with all 18 types is created, responded to, and exported correctly
- [ ] Logic test: survey with relevance expressions correctly shows/hides questions during response
- [ ] Participant test: token-based access works, invalid tokens are rejected
- [ ] Quota test: quota limits are enforced, terminate action disqualifies responses
- [ ] Assessment test: scores are calculated correctly, messages are returned
- [ ] Webhook test: events are dispatched and received (using a mock server)
- [ ] Export test: CSV and JSON exports contain correct data
- [ ] Statistics test: aggregations are accurate
- [ ] Concurrent submissions: multiple responses don't corrupt quota counts
- [ ] All tests pass with `pytest -q`

**Technical Notes:**
- Use httpx.AsyncClient for API calls
- For webhook testing: start a local HTTP server in the test process to receive webhook deliveries
- For concurrent tests: use `asyncio.gather` to submit multiple responses simultaneously
- Create comprehensive fixtures: a "full survey" with all 18 question types, logic, quotas, assessments
- Files: `tests/test_e2e.py`, `tests/test_quotas.py`, `tests/test_assessments.py`, `tests/test_webhooks.py`
