# API Reference

Base URL: `/api/v1`

---

## Authentication

All endpoints (except `POST /auth/register`, `POST /auth/login`, and `POST /auth/refresh`) require authentication via one of two strategies:

### Bearer Token (JWT)

Used by the web UI. Obtained via the login endpoint.

```
Authorization: Bearer <jwt>
```

### API Key

Used for programmatic access. Created via the API key management endpoints.

```
X-API-Key: <key>
```

Both strategies resolve to a user. All resources are scoped to the authenticated user.

API keys support granular scopes: `surveys:read`, `surveys:write`, `responses:read`, `responses:write`, `participants:read`, `participants:write`, `webhooks:read`, `webhooks:write`.

---

## Pagination

All list endpoints return paginated results in this format:

```json
{
  "items": [],
  "total": 100,
  "page": 1,
  "per_page": 20
}
```

Query parameters for pagination:

| Parameter  | Type | Default | Description              |
|------------|------|---------|--------------------------|
| `page`     | int  | 1       | Page number (1-indexed)  |
| `per_page` | int  | 20      | Items per page (max 100) |

---

## Error Format

All errors follow a standard structure:

```json
{
  "detail": {
    "code": "NOT_FOUND",
    "message": "Survey not found"
  }
}
```

### Common Error Codes

| HTTP Status | Code                | Description                          |
|-------------|---------------------|--------------------------------------|
| 400         | `VALIDATION_ERROR`  | Request body failed validation       |
| 401         | `UNAUTHORIZED`      | Missing or invalid credentials       |
| 403         | `FORBIDDEN`         | Insufficient permissions or scopes   |
| 404         | `NOT_FOUND`         | Resource does not exist              |
| 409         | `CONFLICT`          | Resource already exists or conflict  |
| 422         | `UNPROCESSABLE`     | Semantically invalid request         |
| 429         | `RATE_LIMITED`      | Too many requests                    |
| 500         | `INTERNAL_ERROR`    | Unexpected server error              |

---

## Auth

### POST /auth/register

Register a new user account.

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "securePassword123!",
  "name": "Jane Doe"
}
```

**Response** `201 Created`

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "user@example.com",
  "name": "Jane Doe",
  "is_active": true,
  "created_at": "2026-03-31T12:00:00Z"
}
```

**Errors**

| Status | Code       | Message                              |
|--------|------------|--------------------------------------|
| 409    | `CONFLICT` | A user with this email already exists |

---

### POST /auth/login

Authenticate and receive JWT tokens.

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "securePassword123!"
}
```

**Response** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Errors**

| Status | Code           | Message                      |
|--------|----------------|------------------------------|
| 401    | `UNAUTHORIZED` | Invalid email or password    |

---

### POST /auth/refresh

Refresh an expired access token.

**Request Body**

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** `200 OK`

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Errors**

| Status | Code           | Message                          |
|--------|----------------|----------------------------------|
| 401    | `UNAUTHORIZED` | Invalid or expired refresh token |

---

### POST /auth/logout

Invalidate the current refresh token.

**Request Body**

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** `204 No Content`

---

### GET /auth/me

Get the current authenticated user's profile.

**Response** `200 OK`

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "user@example.com",
  "name": "Jane Doe",
  "is_active": true,
  "created_at": "2026-03-31T12:00:00Z",
  "updated_at": "2026-03-31T12:00:00Z"
}
```

---

### PATCH /auth/me

Update the current user's profile.

**Request Body**

```json
{
  "name": "Jane Smith",
  "password": "newSecurePassword456!"
}
```

All fields are optional.

**Response** `200 OK`

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "user@example.com",
  "name": "Jane Smith",
  "is_active": true,
  "created_at": "2026-03-31T12:00:00Z",
  "updated_at": "2026-03-31T14:30:00Z"
}
```

---

### POST /auth/keys

Create a new API key. The full key is returned only once in the response.

**Request Body**

```json
{
  "name": "CI Pipeline Key",
  "scopes": ["surveys:read", "surveys:write", "responses:read"],
  "expires_at": "2027-03-31T00:00:00Z"
}
```

`expires_at` is optional. If omitted, the key does not expire.

**Response** `201 Created`

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "name": "CI Pipeline Key",
  "key": "svt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
  "key_prefix": "svt_a1b2",
  "scopes": ["surveys:read", "surveys:write", "responses:read"],
  "is_active": true,
  "expires_at": "2027-03-31T00:00:00Z",
  "created_at": "2026-03-31T12:00:00Z"
}
```

---

### GET /auth/keys

List all API keys for the current user. The full key value is never returned.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "CI Pipeline Key",
      "key_prefix": "svt_a1b2",
      "scopes": ["surveys:read", "surveys:write", "responses:read"],
      "is_active": true,
      "last_used_at": "2026-03-31T15:00:00Z",
      "expires_at": "2027-03-31T00:00:00Z",
      "created_at": "2026-03-31T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
```

---

### DELETE /auth/keys/{id}

Revoke an API key. This is irreversible.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message           |
|--------|-------------|-------------------|
| 404    | `NOT_FOUND` | API key not found |

---

## Surveys

### POST /surveys

Create a new survey.

**Request Body**

```json
{
  "title": "Customer Satisfaction Survey",
  "description": "Help us improve our products and services.",
  "welcome_message": "Thank you for participating in our survey.",
  "end_message": "Your response has been recorded. Thank you!",
  "default_language": "en",
  "settings": {
    "anonymous": true,
    "date_format": "YYYY-MM-DD",
    "show_progress_bar": true,
    "one_page_per_group": true
  }
}
```

Only `title` is required.

**Response** `201 Created`

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Customer Satisfaction Survey",
  "description": "Help us improve our products and services.",
  "status": "draft",
  "welcome_message": "Thank you for participating in our survey.",
  "end_message": "Your response has been recorded. Thank you!",
  "default_language": "en",
  "settings": {
    "anonymous": true,
    "date_format": "YYYY-MM-DD",
    "show_progress_bar": true,
    "one_page_per_group": true
  },
  "created_at": "2026-03-31T12:00:00Z",
  "updated_at": "2026-03-31T12:00:00Z"
}
```

---

### GET /surveys

List surveys for the authenticated user.

**Query Parameters**

| Parameter  | Type   | Description                                       |
|------------|--------|---------------------------------------------------|
| `page`     | int    | Page number (default: 1)                          |
| `per_page` | int    | Items per page (default: 20, max: 100)            |
| `status`   | string | Filter by status: `draft`, `active`, `closed`, `archived` |
| `search`   | string | Search by title                                   |

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "title": "Customer Satisfaction Survey",
      "description": "Help us improve our products and services.",
      "status": "draft",
      "default_language": "en",
      "created_at": "2026-03-31T12:00:00Z",
      "updated_at": "2026-03-31T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
```

---

### GET /surveys/{id}

Get a single survey by ID.

**Query Parameters**

| Parameter | Type   | Description                                                       |
|-----------|--------|-------------------------------------------------------------------|
| `include` | string | Set to `full` to include question groups, questions, and options  |

**Response** `200 OK`

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Customer Satisfaction Survey",
  "description": "Help us improve our products and services.",
  "status": "draft",
  "welcome_message": "Thank you for participating in our survey.",
  "end_message": "Your response has been recorded. Thank you!",
  "default_language": "en",
  "settings": {
    "anonymous": true,
    "date_format": "YYYY-MM-DD",
    "show_progress_bar": true,
    "one_page_per_group": true
  },
  "created_at": "2026-03-31T12:00:00Z",
  "updated_at": "2026-03-31T12:00:00Z"
}
```

When `?include=full`, the response includes nested `groups` with `questions` and `answer_options`:

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "title": "Customer Satisfaction Survey",
  "status": "draft",
  "groups": [
    {
      "id": "d4e5f6a7-b8c9-0123-def0-234567890123",
      "title": "General Information",
      "sort_order": 1,
      "questions": [
        {
          "id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
          "code": "Q1",
          "question_type": "short_text",
          "title": "What is your name?",
          "is_required": true,
          "sort_order": 1,
          "answer_options": []
        }
      ]
    }
  ],
  "..."
}
```

**Errors**

| Status | Code        | Message          |
|--------|-------------|------------------|
| 404    | `NOT_FOUND` | Survey not found |

---

### PATCH /surveys/{id}

Update a survey. Only provided fields are updated.

**Request Body**

```json
{
  "title": "Updated Survey Title",
  "description": "Updated description.",
  "settings": {
    "anonymous": false
  }
}
```

**Response** `200 OK`

Returns the full updated survey object (same shape as GET /surveys/{id}).

**Errors**

| Status | Code        | Message                                     |
|--------|-------------|---------------------------------------------|
| 404    | `NOT_FOUND` | Survey not found                            |
| 422    | `UNPROCESSABLE` | Cannot modify a closed or archived survey |

---

### DELETE /surveys/{id}

Delete a survey and all associated data.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message          |
|--------|-------------|------------------|
| 404    | `NOT_FOUND` | Survey not found |

---

### POST /surveys/{id}/activate

Activate a draft survey, making it available for responses.

**Response** `200 OK`

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "status": "active",
  "..."
}
```

**Errors**

| Status | Code            | Message                            |
|--------|-----------------|------------------------------------|
| 404    | `NOT_FOUND`     | Survey not found                   |
| 422    | `UNPROCESSABLE` | Survey must be in draft status     |
| 422    | `UNPROCESSABLE` | Survey must have at least one question |

---

### POST /surveys/{id}/close

Close an active survey, preventing new responses.

**Response** `200 OK`

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "status": "closed",
  "..."
}
```

**Errors**

| Status | Code            | Message                         |
|--------|-----------------|---------------------------------|
| 404    | `NOT_FOUND`     | Survey not found                |
| 422    | `UNPROCESSABLE` | Survey must be in active status |

---

### POST /surveys/{id}/clone

Create a deep copy of a survey including all groups, questions, and answer options.

**Request Body**

```json
{
  "title": "Customer Satisfaction Survey (Copy)"
}
```

`title` is optional. Defaults to the original title with " (Copy)" appended.

**Response** `201 Created`

Returns the full cloned survey object with a new ID and `draft` status.

---

### GET /surveys/{id}/export

Export the full survey definition as JSON.

**Response** `200 OK`

```json
{
  "title": "Customer Satisfaction Survey",
  "description": "Help us improve our products and services.",
  "default_language": "en",
  "settings": {},
  "welcome_message": "Thank you for participating in our survey.",
  "end_message": "Your response has been recorded. Thank you!",
  "groups": [
    {
      "title": "General Information",
      "sort_order": 1,
      "relevance": null,
      "questions": [
        {
          "code": "Q1",
          "question_type": "short_text",
          "title": "What is your name?",
          "is_required": true,
          "sort_order": 1,
          "relevance": null,
          "validation": null,
          "settings": null,
          "answer_options": [],
          "subquestions": []
        }
      ]
    }
  ]
}
```

**Errors**

| Status | Code        | Message          |
|--------|-------------|------------------|
| 404    | `NOT_FOUND` | Survey not found |

---

### POST /surveys/import

Import a survey from a JSON definition. Creates a new survey in `draft` status.

**Request Body**

The same structure returned by `GET /surveys/{id}/export`.

```json
{
  "title": "Imported Survey",
  "description": "Imported from JSON.",
  "groups": [
    {
      "title": "Group 1",
      "sort_order": 1,
      "questions": [
        {
          "code": "Q1",
          "question_type": "radio",
          "title": "How satisfied are you?",
          "is_required": true,
          "sort_order": 1,
          "answer_options": [
            { "code": "1", "title": "Very Satisfied", "sort_order": 1, "assessment_value": 5 },
            { "code": "2", "title": "Satisfied", "sort_order": 2, "assessment_value": 4 },
            { "code": "3", "title": "Neutral", "sort_order": 3, "assessment_value": 3 }
          ]
        }
      ]
    }
  ]
}
```

**Response** `201 Created`

Returns the full created survey object with generated IDs.

**Errors**

| Status | Code              | Message                          |
|--------|-------------------|----------------------------------|
| 400    | `VALIDATION_ERROR`| Invalid survey definition format |

---

### GET /surveys/{id}/statistics

Get aggregated response statistics for a survey.

**Response** `200 OK`

```json
{
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "total_responses": 150,
  "complete_responses": 120,
  "incomplete_responses": 25,
  "disqualified_responses": 5,
  "completion_rate": 0.8,
  "average_completion_time_seconds": 342,
  "questions": [
    {
      "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "code": "Q1",
      "title": "How satisfied are you?",
      "question_type": "radio",
      "response_count": 120,
      "summary": {
        "1": { "label": "Very Satisfied", "count": 45, "percentage": 0.375 },
        "2": { "label": "Satisfied", "count": 40, "percentage": 0.333 },
        "3": { "label": "Neutral", "count": 35, "percentage": 0.292 }
      }
    }
  ]
}
```

**Errors**

| Status | Code        | Message          |
|--------|-------------|------------------|
| 404    | `NOT_FOUND` | Survey not found |

---

## Question Groups

All question group endpoints are nested under a survey: `/api/v1/surveys/{survey_id}/groups`.

### POST /surveys/{survey_id}/groups

Create a new question group.

**Request Body**

```json
{
  "title": "Demographics",
  "description": "Basic demographic questions",
  "sort_order": 1,
  "relevance": null
}
```

Only `title` is required. `sort_order` defaults to appending at the end.

**Response** `201 Created`

```json
{
  "id": "d4e5f6a7-b8c9-0123-def0-234567890123",
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "title": "Demographics",
  "description": "Basic demographic questions",
  "sort_order": 1,
  "relevance": null,
  "created_at": "2026-03-31T12:00:00Z"
}
```

**Errors**

| Status | Code        | Message          |
|--------|-------------|------------------|
| 404    | `NOT_FOUND` | Survey not found |

---

### GET /surveys/{survey_id}/groups

List all question groups for a survey, ordered by `sort_order`.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "d4e5f6a7-b8c9-0123-def0-234567890123",
      "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "title": "Demographics",
      "description": "Basic demographic questions",
      "sort_order": 1,
      "relevance": null,
      "created_at": "2026-03-31T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
```

---

### GET /surveys/{survey_id}/groups/{id}

Get a question group with its questions.

**Response** `200 OK`

```json
{
  "id": "d4e5f6a7-b8c9-0123-def0-234567890123",
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "title": "Demographics",
  "description": "Basic demographic questions",
  "sort_order": 1,
  "relevance": null,
  "created_at": "2026-03-31T12:00:00Z",
  "questions": [
    {
      "id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "code": "Q1",
      "question_type": "short_text",
      "title": "What is your name?",
      "is_required": true,
      "sort_order": 1
    }
  ]
}
```

**Errors**

| Status | Code        | Message                 |
|--------|-------------|-------------------------|
| 404    | `NOT_FOUND` | Question group not found |

---

### PATCH /surveys/{survey_id}/groups/{id}

Update a question group.

**Request Body**

```json
{
  "title": "Updated Group Title",
  "description": "Updated description",
  "relevance": "{Q1} == 'yes'"
}
```

All fields are optional.

**Response** `200 OK`

Returns the full updated group object.

**Errors**

| Status | Code        | Message                 |
|--------|-------------|-------------------------|
| 404    | `NOT_FOUND` | Question group not found |

---

### DELETE /surveys/{survey_id}/groups/{id}

Delete a question group and all its questions.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message                 |
|--------|-------------|-------------------------|
| 404    | `NOT_FOUND` | Question group not found |

---

### PATCH /surveys/{survey_id}/groups/reorder

Reorder question groups within a survey.

**Request Body**

```json
{
  "order": [
    { "id": "d4e5f6a7-b8c9-0123-def0-234567890123", "sort_order": 1 },
    { "id": "f6a7b8c9-d0e1-2345-f012-456789012345", "sort_order": 2 }
  ]
}
```

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "d4e5f6a7-b8c9-0123-def0-234567890123",
      "title": "Demographics",
      "sort_order": 1
    },
    {
      "id": "f6a7b8c9-d0e1-2345-f012-456789012345",
      "title": "Feedback",
      "sort_order": 2
    }
  ]
}
```

**Errors**

| Status | Code              | Message                              |
|--------|-------------------|--------------------------------------|
| 400    | `VALIDATION_ERROR`| All group IDs must belong to the survey |

---

## Questions

All question endpoints are nested under a survey: `/api/v1/surveys/{survey_id}/questions`.

### POST /surveys/{survey_id}/questions

Create a new question.

**Request Body**

```json
{
  "group_id": "d4e5f6a7-b8c9-0123-def0-234567890123",
  "question_type": "radio",
  "code": "Q1",
  "title": "How satisfied are you with our service?",
  "description": "Please select the option that best describes your experience.",
  "is_required": true,
  "sort_order": 1,
  "relevance": null,
  "validation": {
    "min_selections": 1
  },
  "settings": {
    "other_option": true,
    "other_label": "Other (please specify)"
  }
}
```

Required fields: `group_id`, `question_type`, `title`. `code` is auto-generated if omitted.

**Response** `201 Created`

```json
{
  "id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
  "group_id": "d4e5f6a7-b8c9-0123-def0-234567890123",
  "parent_id": null,
  "question_type": "radio",
  "code": "Q1",
  "title": "How satisfied are you with our service?",
  "description": "Please select the option that best describes your experience.",
  "is_required": true,
  "sort_order": 1,
  "relevance": null,
  "validation": {
    "min_selections": 1
  },
  "settings": {
    "other_option": true,
    "other_label": "Other (please specify)"
  },
  "created_at": "2026-03-31T12:00:00Z"
}
```

**Errors**

| Status | Code              | Message                                 |
|--------|-------------------|-----------------------------------------|
| 404    | `NOT_FOUND`       | Survey not found                        |
| 404    | `NOT_FOUND`       | Question group not found                |
| 400    | `VALIDATION_ERROR`| Invalid question type                   |
| 409    | `CONFLICT`        | Question code already exists in survey  |

---

### GET /surveys/{survey_id}/questions

List all questions for a survey.

**Query Parameters**

| Parameter  | Type   | Description                          |
|------------|--------|--------------------------------------|
| `page`     | int    | Page number (default: 1)             |
| `per_page` | int    | Items per page (default: 20)         |
| `group_id` | UUID   | Filter questions by question group   |

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "group_id": "d4e5f6a7-b8c9-0123-def0-234567890123",
      "parent_id": null,
      "question_type": "radio",
      "code": "Q1",
      "title": "How satisfied are you with our service?",
      "is_required": true,
      "sort_order": 1,
      "created_at": "2026-03-31T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
```

---

### GET /surveys/{survey_id}/questions/{id}

Get a question with its answer options and subquestions.

**Response** `200 OK`

```json
{
  "id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
  "group_id": "d4e5f6a7-b8c9-0123-def0-234567890123",
  "parent_id": null,
  "question_type": "radio",
  "code": "Q1",
  "title": "How satisfied are you with our service?",
  "description": "Please select the option that best describes your experience.",
  "is_required": true,
  "sort_order": 1,
  "relevance": null,
  "validation": {
    "min_selections": 1
  },
  "settings": {
    "other_option": true,
    "other_label": "Other (please specify)"
  },
  "created_at": "2026-03-31T12:00:00Z",
  "answer_options": [
    {
      "id": "f6a7b8c9-d0e1-2345-f012-456789012345",
      "code": "1",
      "title": "Very Satisfied",
      "sort_order": 1,
      "assessment_value": 5
    },
    {
      "id": "a7b8c9d0-e1f2-3456-0123-567890123456",
      "code": "2",
      "title": "Satisfied",
      "sort_order": 2,
      "assessment_value": 4
    }
  ],
  "subquestions": []
}
```

**Errors**

| Status | Code        | Message            |
|--------|-------------|--------------------|
| 404    | `NOT_FOUND` | Question not found |

---

### PATCH /surveys/{survey_id}/questions/{id}

Update a question.

**Request Body**

```json
{
  "title": "Updated question text?",
  "is_required": false,
  "relevance": "{Q0} == 'yes'",
  "validation": {
    "min_selections": 1,
    "max_selections": 3
  }
}
```

All fields are optional.

**Response** `200 OK`

Returns the full updated question object.

**Errors**

| Status | Code        | Message            |
|--------|-------------|--------------------|
| 404    | `NOT_FOUND` | Question not found |

---

### DELETE /surveys/{survey_id}/questions/{id}

Delete a question and all its answer options and subquestions.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message            |
|--------|-------------|--------------------|
| 404    | `NOT_FOUND` | Question not found |

---

### PATCH /surveys/{survey_id}/questions/reorder

Reorder questions within their group or move between groups.

**Request Body**

```json
{
  "order": [
    { "id": "e5f6a7b8-c9d0-1234-ef01-345678901234", "group_id": "d4e5f6a7-b8c9-0123-def0-234567890123", "sort_order": 1 },
    { "id": "b8c9d0e1-f2a3-4567-0123-678901234567", "group_id": "d4e5f6a7-b8c9-0123-def0-234567890123", "sort_order": 2 }
  ]
}
```

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "code": "Q1",
      "group_id": "d4e5f6a7-b8c9-0123-def0-234567890123",
      "sort_order": 1
    },
    {
      "id": "b8c9d0e1-f2a3-4567-0123-678901234567",
      "code": "Q2",
      "group_id": "d4e5f6a7-b8c9-0123-def0-234567890123",
      "sort_order": 2
    }
  ]
}
```

**Errors**

| Status | Code              | Message                                   |
|--------|-------------------|-------------------------------------------|
| 400    | `VALIDATION_ERROR`| All question IDs must belong to the survey |

---

## Answer Options

All answer option endpoints are nested under a question: `/api/v1/surveys/{survey_id}/questions/{question_id}/options`.

### POST /surveys/{survey_id}/questions/{question_id}/options

Create a new answer option.

**Request Body**

```json
{
  "code": "A1",
  "title": "Very Satisfied",
  "sort_order": 1,
  "assessment_value": 5
}
```

Required fields: `code`, `title`.

**Response** `201 Created`

```json
{
  "id": "f6a7b8c9-d0e1-2345-f012-456789012345",
  "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
  "code": "A1",
  "title": "Very Satisfied",
  "sort_order": 1,
  "assessment_value": 5
}
```

**Errors**

| Status | Code        | Message            |
|--------|-------------|--------------------|
| 404    | `NOT_FOUND` | Question not found |
| 409    | `CONFLICT`  | Option code already exists for this question |

---

### GET /surveys/{survey_id}/questions/{question_id}/options

List all answer options for a question, ordered by `sort_order`.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "f6a7b8c9-d0e1-2345-f012-456789012345",
      "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "code": "A1",
      "title": "Very Satisfied",
      "sort_order": 1,
      "assessment_value": 5
    },
    {
      "id": "a7b8c9d0-e1f2-3456-0123-567890123456",
      "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "code": "A2",
      "title": "Satisfied",
      "sort_order": 2,
      "assessment_value": 4
    }
  ],
  "total": 2,
  "page": 1,
  "per_page": 20
}
```

---

### PATCH /surveys/{survey_id}/questions/{question_id}/options/{id}

Update an answer option.

**Request Body**

```json
{
  "title": "Extremely Satisfied",
  "assessment_value": 10
}
```

All fields are optional.

**Response** `200 OK`

Returns the full updated answer option object.

**Errors**

| Status | Code        | Message              |
|--------|-------------|----------------------|
| 404    | `NOT_FOUND` | Answer option not found |

---

### DELETE /surveys/{survey_id}/questions/{question_id}/options/{id}

Delete an answer option.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message              |
|--------|-------------|----------------------|
| 404    | `NOT_FOUND` | Answer option not found |

---

### PATCH /surveys/{survey_id}/questions/{question_id}/options/reorder

Reorder answer options within a question.

**Request Body**

```json
{
  "order": [
    { "id": "a7b8c9d0-e1f2-3456-0123-567890123456", "sort_order": 1 },
    { "id": "f6a7b8c9-d0e1-2345-f012-456789012345", "sort_order": 2 }
  ]
}
```

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "a7b8c9d0-e1f2-3456-0123-567890123456",
      "code": "A2",
      "title": "Satisfied",
      "sort_order": 1
    },
    {
      "id": "f6a7b8c9-d0e1-2345-f012-456789012345",
      "code": "A1",
      "title": "Very Satisfied",
      "sort_order": 2
    }
  ]
}
```

**Errors**

| Status | Code              | Message                                        |
|--------|-------------------|------------------------------------------------|
| 400    | `VALIDATION_ERROR`| All option IDs must belong to the question      |

---

## Responses

All response endpoints are nested under a survey: `/api/v1/surveys/{survey_id}/responses`.

### POST /surveys/{survey_id}/responses

Submit or start a new response to a survey.

**Request Body**

```json
{
  "participant_token": "abc123xyz",
  "answers": [
    {
      "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "value": "A1"
    },
    {
      "question_id": "b8c9d0e1-f2a3-4567-0123-678901234567",
      "values": ["A1", "A3"]
    }
  ],
  "status": "complete",
  "metadata": {
    "referrer": "https://example.com/invite"
  }
}
```

`participant_token` is required only if the survey uses participant access control. Set `status` to `"incomplete"` to save a partial response, or `"complete"` to finalize. If `status` is omitted, defaults to `"complete"`.

**Response** `201 Created`

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "participant_id": "11223344-5566-7788-99aa-bbccddeeff00",
  "status": "complete",
  "started_at": "2026-03-31T14:00:00Z",
  "completed_at": "2026-03-31T14:05:30Z",
  "ip_address": "192.168.1.100",
  "metadata": {
    "referrer": "https://example.com/invite"
  },
  "answers": [
    {
      "id": "aabbccdd-eeff-0011-2233-445566778899",
      "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "value": "A1",
      "values": null,
      "created_at": "2026-03-31T14:05:30Z"
    },
    {
      "id": "bbccddee-ff00-1122-3344-556677889900",
      "question_id": "b8c9d0e1-f2a3-4567-0123-678901234567",
      "value": null,
      "values": ["A1", "A3"],
      "created_at": "2026-03-31T14:05:30Z"
    }
  ]
}
```

**Errors**

| Status | Code              | Message                                    |
|--------|-------------------|--------------------------------------------|
| 404    | `NOT_FOUND`       | Survey not found                           |
| 422    | `UNPROCESSABLE`   | Survey is not active                       |
| 422    | `UNPROCESSABLE`   | Required question Q1 is missing an answer  |
| 400    | `VALIDATION_ERROR`| Invalid answer for question Q1             |
| 401    | `UNAUTHORIZED`    | Invalid participant token                  |
| 409    | `CONFLICT`        | Participant has already completed this survey |

---

### GET /surveys/{survey_id}/responses

List all responses for a survey.

**Query Parameters**

| Parameter  | Type   | Description                                              |
|------------|--------|----------------------------------------------------------|
| `page`     | int    | Page number (default: 1)                                 |
| `per_page` | int    | Items per page (default: 20)                             |
| `status`   | string | Filter by status: `incomplete`, `complete`, `disqualified` |

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "participant_id": "11223344-5566-7788-99aa-bbccddeeff00",
      "status": "complete",
      "started_at": "2026-03-31T14:00:00Z",
      "completed_at": "2026-03-31T14:05:30Z",
      "ip_address": "192.168.1.100",
      "metadata": {}
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
```

---

### GET /surveys/{survey_id}/responses/{id}

Get a single response with all answers.

**Response** `200 OK`

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "participant_id": "11223344-5566-7788-99aa-bbccddeeff00",
  "status": "complete",
  "started_at": "2026-03-31T14:00:00Z",
  "completed_at": "2026-03-31T14:05:30Z",
  "ip_address": "192.168.1.100",
  "metadata": {
    "user_agent": "Mozilla/5.0",
    "referrer": "https://example.com/invite"
  },
  "answers": [
    {
      "id": "aabbccdd-eeff-0011-2233-445566778899",
      "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "value": "A1",
      "values": null,
      "created_at": "2026-03-31T14:05:30Z"
    }
  ]
}
```

**Errors**

| Status | Code        | Message            |
|--------|-------------|--------------------|
| 404    | `NOT_FOUND` | Response not found |

---

### PATCH /surveys/{survey_id}/responses/{id}

Update an in-progress (incomplete) response with additional answers.

**Request Body**

```json
{
  "answers": [
    {
      "question_id": "c9d0e1f2-a3b4-5678-0123-789012345678",
      "value": "Some text answer"
    }
  ],
  "status": "complete"
}
```

**Response** `200 OK`

Returns the full updated response object with all answers.

**Errors**

| Status | Code            | Message                                   |
|--------|-----------------|-------------------------------------------|
| 404    | `NOT_FOUND`     | Response not found                        |
| 422    | `UNPROCESSABLE` | Cannot modify a completed response        |
| 400    | `VALIDATION_ERROR`| Invalid answer for question Q3           |

---

### DELETE /surveys/{survey_id}/responses/{id}

Delete a response and all its answers.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message            |
|--------|-------------|--------------------|
| 404    | `NOT_FOUND` | Response not found |

---

### GET /surveys/{survey_id}/responses/export

Export all responses for a survey.

**Query Parameters**

| Parameter | Type   | Description                           |
|-----------|--------|---------------------------------------|
| `format`  | string | Export format: `json` or `csv` (default: `json`) |
| `status`  | string | Filter by status: `incomplete`, `complete`, `disqualified` |

**Response** `200 OK`

For `format=json`:

```json
[
  {
    "response_id": "01234567-89ab-cdef-0123-456789abcdef",
    "status": "complete",
    "started_at": "2026-03-31T14:00:00Z",
    "completed_at": "2026-03-31T14:05:30Z",
    "Q1": "A1",
    "Q2": ["A1", "A3"],
    "Q3": "Some text answer"
  }
]
```

For `format=csv`, returns `Content-Type: text/csv` with question codes as column headers:

```
response_id,status,started_at,completed_at,Q1,Q2,Q3
01234567-89ab-cdef-0123-456789abcdef,complete,2026-03-31T14:00:00Z,2026-03-31T14:05:30Z,A1,"A1;A3",Some text answer
```

**Errors**

| Status | Code        | Message          |
|--------|-------------|------------------|
| 404    | `NOT_FOUND` | Survey not found |

---

## Participants

All participant endpoints are nested under a survey: `/api/v1/surveys/{survey_id}/participants`.

### POST /surveys/{survey_id}/participants

Create one or more participants. Supports bulk creation.

**Request Body (single)**

```json
{
  "email": "participant@example.com",
  "attributes": {
    "department": "Engineering",
    "role": "Senior"
  },
  "uses_remaining": 1,
  "valid_from": "2026-04-01T00:00:00Z",
  "valid_until": "2026-04-30T23:59:59Z"
}
```

**Request Body (bulk)**

```json
{
  "participants": [
    {
      "email": "alice@example.com",
      "attributes": { "department": "Engineering" }
    },
    {
      "email": "bob@example.com",
      "attributes": { "department": "Marketing" }
    }
  ]
}
```

**Response** `201 Created`

```json
{
  "items": [
    {
      "id": "11223344-5566-7788-99aa-bbccddeeff00",
      "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "token": "ptkn_x1y2z3a4b5c6d7e8f9g0",
      "email": "alice@example.com",
      "attributes": { "department": "Engineering" },
      "uses_remaining": null,
      "valid_from": null,
      "valid_until": null,
      "completed": false,
      "created_at": "2026-03-31T12:00:00Z"
    },
    {
      "id": "22334455-6677-8899-aabb-ccddeeff0011",
      "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "token": "ptkn_h1i2j3k4l5m6n7o8p9q0",
      "email": "bob@example.com",
      "attributes": { "department": "Marketing" },
      "uses_remaining": null,
      "valid_from": null,
      "valid_until": null,
      "completed": false,
      "created_at": "2026-03-31T12:00:00Z"
    }
  ],
  "total": 2,
  "page": 1,
  "per_page": 20
}
```

The `token` field is generated automatically and used by participants to access the survey.

**Errors**

| Status | Code        | Message          |
|--------|-------------|------------------|
| 404    | `NOT_FOUND` | Survey not found |
| 409    | `CONFLICT`  | Participant with this email already exists for the survey |

---

### GET /surveys/{survey_id}/participants

List participants for a survey.

**Query Parameters**

| Parameter   | Type   | Description                                  |
|-------------|--------|----------------------------------------------|
| `page`      | int    | Page number (default: 1)                     |
| `per_page`  | int    | Items per page (default: 20)                 |
| `completed` | bool   | Filter by completion status                  |
| `search`    | string | Search by email                              |

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "11223344-5566-7788-99aa-bbccddeeff00",
      "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "token": "ptkn_x1y2z3a4b5c6d7e8f9g0",
      "email": "alice@example.com",
      "attributes": { "department": "Engineering" },
      "uses_remaining": null,
      "valid_from": null,
      "valid_until": null,
      "completed": false,
      "created_at": "2026-03-31T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
```

---

### GET /surveys/{survey_id}/participants/{id}

Get a single participant.

**Response** `200 OK`

```json
{
  "id": "11223344-5566-7788-99aa-bbccddeeff00",
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "token": "ptkn_x1y2z3a4b5c6d7e8f9g0",
  "email": "alice@example.com",
  "attributes": { "department": "Engineering" },
  "uses_remaining": null,
  "valid_from": null,
  "valid_until": null,
  "completed": false,
  "created_at": "2026-03-31T12:00:00Z"
}
```

**Errors**

| Status | Code        | Message              |
|--------|-------------|----------------------|
| 404    | `NOT_FOUND` | Participant not found |

---

### PATCH /surveys/{survey_id}/participants/{id}

Update a participant.

**Request Body**

```json
{
  "email": "newemail@example.com",
  "attributes": { "department": "Sales" },
  "uses_remaining": 3,
  "valid_until": "2026-06-30T23:59:59Z"
}
```

All fields are optional.

**Response** `200 OK`

Returns the full updated participant object.

**Errors**

| Status | Code        | Message              |
|--------|-------------|----------------------|
| 404    | `NOT_FOUND` | Participant not found |

---

### DELETE /surveys/{survey_id}/participants/{id}

Delete a participant.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message              |
|--------|-------------|----------------------|
| 404    | `NOT_FOUND` | Participant not found |

---

## Quotas

All quota endpoints are nested under a survey: `/api/v1/surveys/{survey_id}/quotas`.

### POST /surveys/{survey_id}/quotas

Create a quota rule.

**Request Body**

```json
{
  "name": "Max Female Respondents",
  "limit": 50,
  "action": "terminate",
  "conditions": [
    {
      "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "operator": "==",
      "value": "female"
    }
  ],
  "is_active": true
}
```

Required fields: `name`, `limit`, `action`, `conditions`.

**Response** `201 Created`

```json
{
  "id": "99887766-5544-3322-1100-ffeeddccbbaa",
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "name": "Max Female Respondents",
  "limit": 50,
  "action": "terminate",
  "conditions": [
    {
      "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "operator": "==",
      "value": "female"
    }
  ],
  "current_count": 0,
  "is_active": true
}
```

**Errors**

| Status | Code              | Message                          |
|--------|-------------------|----------------------------------|
| 404    | `NOT_FOUND`       | Survey not found                 |
| 400    | `VALIDATION_ERROR`| Invalid condition: question not found |

---

### GET /surveys/{survey_id}/quotas

List all quotas for a survey.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "99887766-5544-3322-1100-ffeeddccbbaa",
      "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "name": "Max Female Respondents",
      "limit": 50,
      "action": "terminate",
      "conditions": [
        {
          "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
          "operator": "==",
          "value": "female"
        }
      ],
      "current_count": 23,
      "is_active": true
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
```

---

### PATCH /surveys/{survey_id}/quotas/{id}

Update a quota.

**Request Body**

```json
{
  "limit": 100,
  "is_active": false
}
```

All fields are optional.

**Response** `200 OK`

Returns the full updated quota object.

**Errors**

| Status | Code        | Message         |
|--------|-------------|-----------------|
| 404    | `NOT_FOUND` | Quota not found |

---

### DELETE /surveys/{survey_id}/quotas/{id}

Delete a quota.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message         |
|--------|-------------|-----------------|
| 404    | `NOT_FOUND` | Quota not found |

---

## Assessments

All assessment endpoints are nested under a survey: `/api/v1/surveys/{survey_id}/assessments`.

### POST /surveys/{survey_id}/assessments

Create an assessment rule. Assessment rules use `assessment_value` fields on answer options to calculate scores.

**Request Body**

```json
{
  "name": "Satisfaction Score - High",
  "scope": "total",
  "group_id": null,
  "min_score": 80,
  "max_score": 100,
  "message": "Thank you! Your satisfaction level is excellent."
}
```

Required fields: `name`, `scope`, `min_score`, `max_score`, `message`.

When `scope` is `"group"`, `group_id` must be provided to scope scoring to a specific question group. When `scope` is `"total"`, scoring covers all questions in the survey.

**Response** `201 Created`

```json
{
  "id": "aabb1122-3344-5566-7788-99aabbccddee",
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "name": "Satisfaction Score - High",
  "scope": "total",
  "group_id": null,
  "min_score": 80,
  "max_score": 100,
  "message": "Thank you! Your satisfaction level is excellent."
}
```

**Errors**

| Status | Code              | Message                                      |
|--------|-------------------|----------------------------------------------|
| 404    | `NOT_FOUND`       | Survey not found                             |
| 400    | `VALIDATION_ERROR`| group_id is required when scope is "group"   |
| 404    | `NOT_FOUND`       | Question group not found                     |

---

### GET /surveys/{survey_id}/assessments

List all assessment rules for a survey.

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "aabb1122-3344-5566-7788-99aabbccddee",
      "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "name": "Satisfaction Score - High",
      "scope": "total",
      "group_id": null,
      "min_score": 80,
      "max_score": 100,
      "message": "Thank you! Your satisfaction level is excellent."
    },
    {
      "id": "bbcc2233-4455-6677-8899-aabbccddeeff",
      "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "name": "Satisfaction Score - Low",
      "scope": "total",
      "group_id": null,
      "min_score": 0,
      "max_score": 40,
      "message": "We're sorry to hear that. We'll work to improve."
    }
  ],
  "total": 2,
  "page": 1,
  "per_page": 20
}
```

---

### PATCH /surveys/{survey_id}/assessments/{id}

Update an assessment rule.

**Request Body**

```json
{
  "min_score": 75,
  "message": "Updated message for high satisfaction."
}
```

All fields are optional.

**Response** `200 OK`

Returns the full updated assessment object.

**Errors**

| Status | Code        | Message              |
|--------|-------------|----------------------|
| 404    | `NOT_FOUND` | Assessment not found |

---

### DELETE /surveys/{survey_id}/assessments/{id}

Delete an assessment rule.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message              |
|--------|-------------|----------------------|
| 404    | `NOT_FOUND` | Assessment not found |

---

## Webhooks

Webhook endpoints are at the top level: `/api/v1/webhooks`. Webhooks can be global (all surveys) or scoped to a specific survey.

### Supported Events

| Event                  | Description                              |
|------------------------|------------------------------------------|
| `response.started`    | A new response has been started          |
| `response.completed`  | A response has been completed            |
| `survey.activated`    | A survey has been activated              |
| `survey.closed`       | A survey has been closed                 |
| `quota.reached`       | A quota limit has been reached           |

### Webhook Payload

All webhook deliveries include an HMAC-SHA256 signature in the `X-Webhook-Signature` header, computed using the webhook's `secret`.

```json
{
  "event": "response.completed",
  "timestamp": "2026-03-31T14:05:30Z",
  "data": {
    "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "response_id": "01234567-89ab-cdef-0123-456789abcdef",
    "status": "complete"
  }
}
```

---

### POST /webhooks

Register a new webhook.

**Request Body**

```json
{
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "url": "https://example.com/webhook/survey-responses",
  "events": ["response.completed", "survey.closed"],
  "secret": "whsec_my_secret_key_123",
  "is_active": true
}
```

Required fields: `url`, `events`, `secret`. `survey_id` is optional; omit it for a global webhook that fires for all surveys.

**Response** `201 Created`

```json
{
  "id": "dd112233-4455-6677-8899-aabbccddeeff",
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "url": "https://example.com/webhook/survey-responses",
  "events": ["response.completed", "survey.closed"],
  "is_active": true,
  "created_at": "2026-03-31T12:00:00Z"
}
```

The `secret` is never returned in responses after creation.

**Errors**

| Status | Code              | Message                    |
|--------|-------------------|----------------------------|
| 400    | `VALIDATION_ERROR`| Invalid URL format         |
| 400    | `VALIDATION_ERROR`| Invalid event type         |

---

### GET /webhooks

List all webhooks for the authenticated user.

**Query Parameters**

| Parameter   | Type | Description                            |
|-------------|------|----------------------------------------|
| `page`      | int  | Page number (default: 1)               |
| `per_page`  | int  | Items per page (default: 20)           |
| `survey_id` | UUID | Filter by survey                       |

**Response** `200 OK`

```json
{
  "items": [
    {
      "id": "dd112233-4455-6677-8899-aabbccddeeff",
      "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "survey_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "url": "https://example.com/webhook/survey-responses",
      "events": ["response.completed", "survey.closed"],
      "is_active": true,
      "created_at": "2026-03-31T12:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20
}
```

---

### PATCH /webhooks/{id}

Update a webhook.

**Request Body**

```json
{
  "url": "https://example.com/webhook/v2/responses",
  "events": ["response.completed", "response.started", "survey.closed"],
  "is_active": false
}
```

All fields are optional.

**Response** `200 OK`

Returns the full updated webhook object.

**Errors**

| Status | Code        | Message           |
|--------|-------------|-------------------|
| 404    | `NOT_FOUND` | Webhook not found |

---

### DELETE /webhooks/{id}

Delete a webhook.

**Response** `204 No Content`

**Errors**

| Status | Code        | Message           |
|--------|-------------|-------------------|
| 404    | `NOT_FOUND` | Webhook not found |

---

### POST /webhooks/{id}/test

Send a test event to the webhook URL. Delivers a sample payload for the first event in the webhook's `events` list.

**Response** `200 OK`

```json
{
  "success": true,
  "status_code": 200,
  "response_time_ms": 142,
  "event": "response.completed"
}
```

**Errors**

| Status | Code            | Message                               |
|--------|-----------------|---------------------------------------|
| 404    | `NOT_FOUND`     | Webhook not found                     |
| 422    | `UNPROCESSABLE` | Webhook delivery failed: connection refused |

---

## Survey Logic

Survey logic endpoints are nested under a survey: `/api/v1/surveys/{survey_id}/logic`.

### Expression Syntax

Expressions are used in the `relevance` field on questions and question groups to control conditional display. They reference question answers using `{CODE}` syntax.

**Operators**: `==`, `!=`, `>`, `<`, `>=`, `<=`, `and`, `or`, `not`

**Functions**: `is_empty()`, `contains()`, `count()`, `sum()`

**Examples**:
- `{Q1} == 'yes'` — Show if Q1 equals "yes"
- `{Q2} > 18 and {Q2} < 65` — Show if Q2 is between 18 and 65
- `not is_empty({Q3})` — Show if Q3 has a value
- `contains({Q4}, 'A1')` — Show if multi-select Q4 includes option A1

---

### POST /surveys/{survey_id}/logic/validate-expression

Validate an expression for syntax and reference correctness.

**Request Body**

```json
{
  "expression": "{Q1} == 'yes' and {Q2} > 18"
}
```

**Response** `200 OK` (valid expression)

```json
{
  "valid": true,
  "expression": "{Q1} == 'yes' and {Q2} > 18",
  "referenced_questions": ["Q1", "Q2"],
  "errors": []
}
```

**Response** `200 OK` (invalid expression)

```json
{
  "valid": false,
  "expression": "{Q1} == 'yes' and and {Q2} > 18",
  "referenced_questions": [],
  "errors": [
    {
      "position": 21,
      "message": "Unexpected token 'and'"
    }
  ]
}
```

**Response** `200 OK` (unknown reference)

```json
{
  "valid": false,
  "expression": "{Q99} == 'yes'",
  "referenced_questions": ["Q99"],
  "errors": [
    {
      "position": 0,
      "message": "Unknown question code: Q99"
    }
  ]
}
```

**Errors**

| Status | Code        | Message          |
|--------|-------------|------------------|
| 404    | `NOT_FOUND` | Survey not found |

---

### POST /surveys/{survey_id}/logic/resolve-flow

Given a set of answers, resolve which questions and groups should be visible based on relevance expressions.

**Request Body**

```json
{
  "answers": {
    "Q1": "yes",
    "Q2": 25,
    "Q3": ["A1", "A3"]
  }
}
```

**Response** `200 OK`

```json
{
  "visible_groups": [
    {
      "group_id": "d4e5f6a7-b8c9-0123-def0-234567890123",
      "title": "Demographics",
      "visible": true
    },
    {
      "group_id": "f6a7b8c9-d0e1-2345-f012-456789012345",
      "title": "Follow-up Questions",
      "visible": true
    }
  ],
  "visible_questions": [
    {
      "question_id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
      "code": "Q1",
      "visible": true
    },
    {
      "question_id": "b8c9d0e1-f2a3-4567-0123-678901234567",
      "code": "Q2",
      "visible": true
    },
    {
      "question_id": "c9d0e1f2-a3b4-5678-0123-789012345678",
      "code": "Q4",
      "visible": false,
      "reason": "Relevance expression evaluated to false: {Q1} == 'no'"
    }
  ]
}
```

**Errors**

| Status | Code              | Message                             |
|--------|-------------------|-------------------------------------|
| 404    | `NOT_FOUND`       | Survey not found                    |
| 400    | `VALIDATION_ERROR`| Unknown question code in answers: Q99 |
