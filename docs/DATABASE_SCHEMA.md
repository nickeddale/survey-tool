# Database Schema

## Overview

The survey tool uses PostgreSQL 16 with a relational schema designed around a multi-tenant survey platform. Each user owns surveys, which contain hierarchically organized question groups and questions. Responses are collected against surveys and store per-question answers. The schema supports access control via participant tokens, quota enforcement, scoring assessments, API key authentication, and webhook integrations.

All primary keys are UUIDs. Timestamps use `TIMESTAMP WITH TIME ZONE`. JSONB columns provide flexible storage for settings, validation rules, scopes, conditions, and multi-value answers.

---

## Entity Relationships

### Users & Auth
- A **user** has many **surveys** (one-to-many via `surveys.user_id`).
- A **user** has many **api_keys** (one-to-many via `api_keys.user_id`).
- A **user** has many **webhooks** (one-to-many via `webhooks.user_id`).

### Core Survey Structure
- A **survey** has many **question_groups** (one-to-many via `question_groups.survey_id`). Deleting a survey cascades to its groups.
- A **question_group** has many **questions** (one-to-many via `questions.group_id`). Deleting a group cascades to its questions.
- A **question** has many **answer_options** (one-to-many via `answer_options.question_id`). Deleting a question cascades to its options.
- A **question** may have many **subquestions** (self-referential one-to-many via `questions.parent_id`). Top-level questions have `parent_id = NULL`.

### Responses
- A **survey** has many **responses** (one-to-many via `responses.survey_id`).
- A **response** has many **response_answers** (one-to-many via `response_answers.response_id`). Deleting a response cascades to its answers.
- A **response_answer** references a **question** (many-to-one via `response_answers.question_id`).
- A **response** optionally references a **participant** (many-to-one via `responses.participant_id`, nullable).

### Access Control
- A **survey** has many **participants** (one-to-many via `participants.survey_id`).

### Logic & Quotas
- A **survey** has many **quotas** (one-to-many via `quotas.survey_id`).
- A **survey** has many **assessments** (one-to-many via `assessments.survey_id`).
- An **assessment** optionally references a **question_group** (many-to-one via `assessments.group_id`, nullable). Used when `scope = 'group'`.

### Integrations
- A **webhook** belongs to a **user** (many-to-one via `webhooks.user_id`).
- A **webhook** optionally belongs to a **survey** (many-to-one via `webhooks.survey_id`, nullable). When NULL, the webhook applies globally to all of the user's surveys.

---

## Table Definitions

### Users & Auth

#### `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `email` | `VARCHAR(255)` | `NOT NULL`, `UNIQUE` | Used for login |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | bcrypt hashed |
| `name` | `VARCHAR(255)` | `NOT NULL` | Display name |
| `is_active` | `BOOLEAN` | `NOT NULL`, `DEFAULT true` | Soft-disable account |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | Updated on every modification |

#### `api_keys`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `user_id` | `UUID` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | Owning user |
| `name` | `VARCHAR(255)` | `NOT NULL` | Descriptive label (e.g., "CI Pipeline") |
| `key_hash` | `VARCHAR(255)` | `NOT NULL` | SHA-256 hash of the full API key |
| `key_prefix` | `VARCHAR(8)` | `NOT NULL` | First 8 characters for identification in listings |
| `scopes` | `JSONB` | `NOT NULL`, `DEFAULT '[]'` | Array of permission strings, e.g., `["surveys:read", "surveys:write", "responses:read"]` |
| `is_active` | `BOOLEAN` | `NOT NULL`, `DEFAULT true` | Revoke by setting to false |
| `last_used_at` | `TIMESTAMPTZ` | | Updated on each authenticated request |
| `expires_at` | `TIMESTAMPTZ` | | NULL means the key never expires |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | |

---

### Core Survey

#### `surveys`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `user_id` | `UUID` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | Survey owner |
| `title` | `VARCHAR(255)` | `NOT NULL` | Survey title |
| `description` | `TEXT` | | Optional longer description |
| `status` | `survey_status` | `NOT NULL`, `DEFAULT 'draft'` | See ENUM: `survey_status` |
| `welcome_message` | `TEXT` | | Shown before the first question |
| `end_message` | `TEXT` | | Shown after survey completion |
| `default_language` | `VARCHAR(10)` | `NOT NULL`, `DEFAULT 'en'` | ISO 639-1 language code |
| `settings` | `JSONB` | `NOT NULL`, `DEFAULT '{}'` | Format preferences, anonymity flag, date format, etc. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | |

#### `question_groups`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `survey_id` | `UUID` | `NOT NULL`, `REFERENCES surveys(id) ON DELETE CASCADE` | Parent survey |
| `title` | `VARCHAR(255)` | `NOT NULL` | Group heading |
| `description` | `TEXT` | | Optional group description |
| `sort_order` | `INTEGER` | `NOT NULL`, `DEFAULT 0` | Display order within the survey |
| `relevance` | `TEXT` | | Expression for conditional display (see Expression Language docs) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | |

#### `questions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `group_id` | `UUID` | `NOT NULL`, `REFERENCES question_groups(id) ON DELETE CASCADE` | Parent group |
| `parent_id` | `UUID` | `REFERENCES questions(id) ON DELETE CASCADE` | NULL for top-level questions; set for subquestions (matrix rows, etc.) |
| `question_type` | `VARCHAR(50)` | `NOT NULL` | One of the `question_type` ENUM values (stored as string) |
| `code` | `VARCHAR(50)` | `NOT NULL` | Short identifier (e.g., "Q1", "Q2_SQ001"). Unique within a survey. |
| `title` | `TEXT` | `NOT NULL` | The question text displayed to respondents |
| `description` | `TEXT` | | Help text / additional instructions |
| `is_required` | `BOOLEAN` | `NOT NULL`, `DEFAULT false` | Whether an answer is mandatory |
| `sort_order` | `INTEGER` | `NOT NULL`, `DEFAULT 0` | Display order within the group |
| `relevance` | `TEXT` | | Expression for conditional display |
| `validation` | `JSONB` | `NOT NULL`, `DEFAULT '{}'` | Validation rules: `{"min": 0, "max": 100, "regex": "^[0-9]+$"}` |
| `settings` | `JSONB` | `NOT NULL`, `DEFAULT '{}'` | Type-specific settings (e.g., `{"rows": 5}` for huge_text) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | |

#### `answer_options`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `question_id` | `UUID` | `NOT NULL`, `REFERENCES questions(id) ON DELETE CASCADE` | Parent question |
| `code` | `VARCHAR(50)` | `NOT NULL` | Value stored in response answers (e.g., "A1", "A2") |
| `title` | `TEXT` | `NOT NULL` | Display text shown to respondents |
| `sort_order` | `INTEGER` | `NOT NULL`, `DEFAULT 0` | Display order within the question |
| `assessment_value` | `INTEGER` | `DEFAULT 0` | Score value used for assessment calculations |

---

### Responses

#### `responses`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `survey_id` | `UUID` | `NOT NULL`, `REFERENCES surveys(id) ON DELETE CASCADE` | The survey being responded to |
| `participant_id` | `UUID` | `REFERENCES participants(id) ON DELETE SET NULL` | NULL for anonymous or open-access surveys |
| `status` | `response_status` | `NOT NULL`, `DEFAULT 'incomplete'` | See ENUM: `response_status` |
| `started_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | When the respondent began |
| `completed_at` | `TIMESTAMPTZ` | | Set when status transitions to `complete` |
| `ip_address` | `VARCHAR(45)` | | Supports both IPv4 and IPv6 |
| `metadata` | `JSONB` | `NOT NULL`, `DEFAULT '{}'` | User agent, referrer, custom tracking data |

#### `response_answers`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `response_id` | `UUID` | `NOT NULL`, `REFERENCES responses(id) ON DELETE CASCADE` | Parent response |
| `question_id` | `UUID` | `NOT NULL`, `REFERENCES questions(id) ON DELETE CASCADE` | The question being answered |
| `value` | `TEXT` | | Single-value answer (text, numeric, radio selection, etc.) |
| `values` | `JSONB` | | Multi-value answer for checkboxes, rankings, matrix responses |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | |

---

### Access Control

#### `participants`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `survey_id` | `UUID` | `NOT NULL`, `REFERENCES surveys(id) ON DELETE CASCADE` | The survey this token grants access to |
| `token` | `VARCHAR(255)` | `NOT NULL`, `UNIQUE` | Unique access token distributed to the participant |
| `email` | `VARCHAR(255)` | | Optional contact email |
| `attributes` | `JSONB` | `NOT NULL`, `DEFAULT '{}'` | Custom attributes for segmentation and pre-fill |
| `uses_remaining` | `INTEGER` | | NULL means unlimited uses |
| `valid_from` | `TIMESTAMPTZ` | | Token is not valid before this time |
| `valid_until` | `TIMESTAMPTZ` | | Token expires after this time |
| `completed` | `BOOLEAN` | `NOT NULL`, `DEFAULT false` | Set to true after a complete response is submitted |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | |

---

### Logic & Quotas

#### `quotas`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `survey_id` | `UUID` | `NOT NULL`, `REFERENCES surveys(id) ON DELETE CASCADE` | Parent survey |
| `name` | `VARCHAR(255)` | `NOT NULL` | Descriptive name (e.g., "Max 100 females aged 18-24") |
| `limit` | `INTEGER` | `NOT NULL` | Maximum number of responses matching the conditions |
| `action` | `quota_action` | `NOT NULL` | See ENUM: `quota_action` |
| `conditions` | `JSONB` | `NOT NULL`, `DEFAULT '[]'` | Array of condition objects: `[{"question_id": "uuid", "operator": "eq", "value": "A1"}]` |
| `current_count` | `INTEGER` | `NOT NULL`, `DEFAULT 0` | Cached count of matching responses; updated on response submission |
| `is_active` | `BOOLEAN` | `NOT NULL`, `DEFAULT true` | Disable without deleting |

#### `assessments`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `survey_id` | `UUID` | `NOT NULL`, `REFERENCES surveys(id) ON DELETE CASCADE` | Parent survey |
| `name` | `VARCHAR(255)` | `NOT NULL` | Assessment rule name |
| `scope` | `assessment_scope` | `NOT NULL` | See ENUM: `assessment_scope` |
| `group_id` | `UUID` | `REFERENCES question_groups(id) ON DELETE CASCADE` | Required when `scope = 'group'`; NULL when `scope = 'total'` |
| `min_score` | `DECIMAL` | `NOT NULL` | Lower bound of the score range (inclusive) |
| `max_score` | `DECIMAL` | `NOT NULL` | Upper bound of the score range (inclusive) |
| `message` | `TEXT` | `NOT NULL` | Message displayed when the respondent's score falls within the range |

---

### Integrations

#### `webhooks`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | |
| `user_id` | `UUID` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | Owning user |
| `survey_id` | `UUID` | `REFERENCES surveys(id) ON DELETE CASCADE` | NULL for global webhooks that fire on all of the user's surveys |
| `url` | `VARCHAR(2048)` | `NOT NULL` | Destination URL for event delivery |
| `events` | `JSONB` | `NOT NULL`, `DEFAULT '[]'` | Array of event names: `["response.completed", "survey.activated", "survey.closed", "response.started", "quota.reached"]` |
| `secret` | `VARCHAR(255)` | `NOT NULL` | Shared secret for HMAC-SHA256 payload signing |
| `is_active` | `BOOLEAN` | `NOT NULL`, `DEFAULT true` | Disable without deleting |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL`, `DEFAULT now()` | |

---

## ENUM Type Definitions

### `survey_status`

| Value | Description |
|---|---|
| `draft` | Survey is being designed; not accepting responses |
| `active` | Survey is live and accepting responses |
| `closed` | Survey is no longer accepting responses; data preserved |
| `archived` | Survey is hidden from default listings; data preserved |

### `response_status`

| Value | Description |
|---|---|
| `incomplete` | Response has been started but not yet submitted |
| `complete` | Response has been fully submitted |
| `disqualified` | Respondent was screened out by quota or logic |

### `question_type`

Stored as `VARCHAR(50)` on the `questions` table. Valid values:

| Value | Category | Description |
|---|---|---|
| `short_text` | Text | Single-line text input |
| `long_text` | Text | Multi-line textarea |
| `huge_text` | Text | Large textarea with configurable rows |
| `radio` | Choice | Single-select radio buttons |
| `dropdown` | Choice | Single-select dropdown menu |
| `checkbox` | Choice | Multi-select checkboxes |
| `ranking` | Choice | Drag-to-rank ordering of options |
| `image_picker` | Choice | Select from image-based options |
| `matrix` | Matrix/Array | Grid with radio buttons per row |
| `matrix_dropdown` | Matrix/Array | Grid with dropdowns per row |
| `matrix_dynamic` | Matrix/Array | Dynamic row grid (respondent adds rows) |
| `numeric` | Scalar | Numeric input with optional min/max |
| `rating` | Scalar | Star or scale rating |
| `boolean` | Scalar | Yes/No toggle |
| `date` | Scalar | Date picker |
| `file_upload` | Special | File attachment |
| `expression` | Special | Computed value (not user-editable) |
| `html` | Special | Static HTML content block (not a question) |

### `quota_action`

| Value | Description |
|---|---|
| `terminate` | End the survey for the respondent when the quota is met |
| `hide_question` | Hide the associated question when the quota is met |

### `assessment_scope`

| Value | Description |
|---|---|
| `total` | Assessment applies to the total score across the entire survey |
| `group` | Assessment applies to the score within a specific question group |

---

## Index Recommendations

### Primary Access Patterns

```sql
-- Users: lookup by email for login
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- API keys: lookup by prefix for key identification, filter active
CREATE INDEX idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX idx_api_keys_key_prefix ON api_keys (key_prefix);

-- Surveys: list by owner, filter by status
CREATE INDEX idx_surveys_user_id ON surveys (user_id);
CREATE INDEX idx_surveys_user_id_status ON surveys (user_id, status);

-- Question groups: list by survey, ordered
CREATE INDEX idx_question_groups_survey_id_sort ON question_groups (survey_id, sort_order);

-- Questions: list by group, ordered; lookup by parent for subquestions
CREATE INDEX idx_questions_group_id_sort ON questions (group_id, sort_order);
CREATE INDEX idx_questions_parent_id ON questions (parent_id) WHERE parent_id IS NOT NULL;

-- Answer options: list by question, ordered
CREATE INDEX idx_answer_options_question_id_sort ON answer_options (question_id, sort_order);
```

### Response Collection & Reporting

```sql
-- Responses: list by survey, filter by status, order by date
CREATE INDEX idx_responses_survey_id ON responses (survey_id);
CREATE INDEX idx_responses_survey_id_status ON responses (survey_id, status);
CREATE INDEX idx_responses_participant_id ON responses (participant_id) WHERE participant_id IS NOT NULL;

-- Response answers: lookup by response; lookup by question for aggregation
CREATE INDEX idx_response_answers_response_id ON response_answers (response_id);
CREATE INDEX idx_response_answers_question_id ON response_answers (question_id);
CREATE UNIQUE INDEX idx_response_answers_response_question ON response_answers (response_id, question_id);
```

### Access Control & Quotas

```sql
-- Participants: token lookup for survey access
CREATE UNIQUE INDEX idx_participants_token ON participants (token);
CREATE INDEX idx_participants_survey_id ON participants (survey_id);

-- Quotas: list by survey
CREATE INDEX idx_quotas_survey_id ON quotas (survey_id);

-- Assessments: list by survey; filter by group
CREATE INDEX idx_assessments_survey_id ON assessments (survey_id);
CREATE INDEX idx_assessments_group_id ON assessments (group_id) WHERE group_id IS NOT NULL;
```

### Integrations

```sql
-- Webhooks: list by user; list by survey for event dispatch
CREATE INDEX idx_webhooks_user_id ON webhooks (user_id);
CREATE INDEX idx_webhooks_survey_id ON webhooks (survey_id) WHERE survey_id IS NOT NULL;
```
