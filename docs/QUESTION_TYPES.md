# Question Types Reference

This document describes all question types supported by the survey tool. Each entry covers the type identifier, purpose, required fields, configurable settings, validation rules, response format, and an API example.

---

## Table of Contents

- [Text Types](#text-types)
  - [short_text](#short_text)
  - [long_text](#long_text)
  - [huge_text](#huge_text)
  - [email](#email)
  - [phone](#phone)
  - [url](#url)
- [Choice Types](#choice-types)
  - [single_choice](#single_choice)
  - [dropdown](#dropdown)
  - [multiple_choice](#multiple_choice)
  - [ranking](#ranking)
  - [image_picker](#image_picker)
- [Matrix Types](#matrix-types)
  - [matrix](#matrix)
  - [matrix_single](#matrix_single)
  - [matrix_multiple](#matrix_multiple)
  - [matrix_dropdown](#matrix_dropdown)
  - [matrix_dynamic](#matrix_dynamic)
- [Scalar Types](#scalar-types)
  - [numeric](#numeric)
  - [number](#number)
  - [rating](#rating)
  - [scale](#scale)
  - [boolean](#boolean)
  - [yes_no](#yes_no)
  - [date](#date)
  - [time](#time)
  - [datetime](#datetime)
- [Special Types](#special-types)
  - [file_upload](#file_upload)
  - [expression](#expression)
  - [html](#html)
- [Subquestions](#subquestions)

---

## Text Types

### short_text

**Type identifier:** `short_text`

**Description:** A single-line text input for brief responses such as names, email addresses, or short answers.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `short_text` |

**Settings (JSONB):**

```json
{
  "placeholder": null,
  "max_length": 255,
  "input_type": "text"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `placeholder` | string or null | `null` | Placeholder text shown in the empty input |
| `max_length` | integer | `255` | Maximum number of characters allowed |
| `input_type` | string | `"text"` | HTML input type. Options: `text`, `email`, `url`, `tel` |

**Validation rules:**

- Value must be a string.
- Length must not exceed `max_length`.
- If `input_type` is `email`, the value must match a valid email format.
- If `input_type` is `url`, the value must be a valid URL.
- If the question is marked `is_required`, the value must be non-empty.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "Jane Doe"
}
```

**API example:**

```json
{
  "title": "What is your name?",
  "question_type": "short_text",
  "is_required": true,
  "settings": {
    "placeholder": "Enter your full name",
    "max_length": 100,
    "input_type": "text"
  }
}
```

---

### long_text

**Type identifier:** `long_text`

**Description:** A multi-line text area for paragraph-length responses such as feedback or comments.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `long_text` |

**Settings (JSONB):**

```json
{
  "placeholder": null,
  "max_length": 5000,
  "rows": 4
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `placeholder` | string or null | `null` | Placeholder text shown in the empty textarea |
| `max_length` | integer | `5000` | Maximum number of characters allowed |
| `rows` | integer | `4` | Number of visible text rows in the textarea |

**Validation rules:**

- Value must be a string.
- Length must not exceed `max_length`.
- If the question is marked `is_required`, the value must be non-empty.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "I found the onboarding process straightforward..."
}
```

**API example:**

```json
{
  "title": "Please describe your experience with the onboarding process.",
  "question_type": "long_text",
  "is_required": false,
  "settings": {
    "placeholder": "Share your thoughts...",
    "max_length": 5000,
    "rows": 6
  }
}
```

---

### huge_text

**Type identifier:** `huge_text`

**Description:** An extended text area for very long-form responses such as essays, detailed descriptions, or multi-paragraph narratives. Supports rich text editing.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `huge_text` |

**Settings (JSONB):**

```json
{
  "placeholder": null,
  "max_length": 50000,
  "rows": 10,
  "rich_text": false
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `placeholder` | string or null | `null` | Placeholder text shown in the empty textarea |
| `max_length` | integer | `50000` | Maximum number of characters allowed |
| `rows` | integer | `10` | Number of visible text rows in the textarea |
| `rich_text` | boolean | `false` | Whether to enable a rich text editor (bold, italic, lists, etc.) |

**Validation rules:**

- Value must be a string.
- Length must not exceed `max_length` (character count excludes HTML tags when `rich_text` is enabled).
- If the question is marked `is_required`, the value must be non-empty.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "In my experience with the platform over the past year..."
}
```

**API example:**

```json
{
  "title": "Write a detailed summary of your project outcomes.",
  "question_type": "huge_text",
  "is_required": true,
  "settings": {
    "max_length": 50000,
    "rows": 12,
    "rich_text": true
  }
}
```

---

### email

**Type identifier:** `email`

**Description:** A text input that validates the value as an email address. Must contain `@` with non-empty local and domain parts, and the domain must contain a dot.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `email` |

**Settings (JSONB):**

No type-specific settings. Uses the standard `validation` JSONB for optional `min_length`, `max_length`, and `regex` rules.

**Validation rules:**

- Value must be a string.
- Value must be a valid email address (contains `@`, non-empty local and domain parts, domain contains `.`).
- Optional `min_length`, `max_length`, and `regex` from `validation` JSONB are applied if set.
- If the question is marked `is_required`, the value must be non-empty.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "user@example.com"
}
```

**API example:**

```json
{
  "title": "What is your email address?",
  "question_type": "email",
  "is_required": true
}
```

---

### phone

**Type identifier:** `phone`

**Description:** A text input that validates the value as a phone number. Accepts digits, spaces, hyphens, dots, parentheses, and an optional leading `+`.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `phone` |

**Settings (JSONB):**

No type-specific settings. Uses the standard `validation` JSONB for optional `min_length`, `max_length`, and `regex` rules.

**Validation rules:**

- Value must be a string.
- Value must match the phone number pattern: optional leading `+`, followed by at least 3 characters consisting of digits, spaces, hyphens, dots, and parentheses.
- Optional `min_length`, `max_length`, and `regex` from `validation` JSONB are applied if set.
- If the question is marked `is_required`, the value must be non-empty.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "+1 (555) 123-4567"
}
```

**API example:**

```json
{
  "title": "What is your phone number?",
  "question_type": "phone",
  "is_required": false
}
```

---

### url

**Type identifier:** `url`

**Description:** A text input that validates the value as a URL. Requires `http://` or `https://` prefix.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `url` |

**Settings (JSONB):**

No type-specific settings. Uses the standard `validation` JSONB for optional `min_length`, `max_length`, and `regex` rules.

**Validation rules:**

- Value must be a string.
- Value must start with `http://` or `https://` followed by additional characters.
- Optional `min_length`, `max_length`, and `regex` from `validation` JSONB are applied if set.
- If the question is marked `is_required`, the value must be non-empty.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "https://example.com"
}
```

**API example:**

```json
{
  "title": "What is your website?",
  "question_type": "url",
  "is_required": false
}
```

---

## Choice Types

### single_choice

**Type identifier:** `single_choice`

**Description:** A single-select question rendered as radio buttons. The respondent picks exactly one option from the list.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `single_choice` |
| `answer_options` | array | List of options to choose from |

**Settings (JSONB):**

```json
{
  "has_other": false,
  "other_text": "Other",
  "randomize": false,
  "columns": 1
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `has_other` | boolean | `false` | Whether to show an "Other" option with a free-text input |
| `other_text` | string | `"Other"` | Label for the other option |
| `randomize` | boolean | `false` | Whether to randomize the display order of options |
| `columns` | integer | `1` | Number of columns for layout (1, 2, 3, or 4) |

**Validation rules:**

- Value must be a valid option code from the question's answer options, or the string `"other"` if `has_other` is enabled.
- If `has_other` is enabled and the respondent selects "other", the `other_value` field must be a non-empty string.
- If the question is marked `is_required`, a selection must be made.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "opt_search_engine"
}
```

With "other" selected:

```json
{
  "question_id": "uuid",
  "value": "other",
  "other_value": "My custom answer"
}
```

**API example:**

```json
{
  "title": "How did you hear about us?",
  "question_type": "single_choice",
  "is_required": true,
  "answer_options": [
    { "text": "Search engine", "position": 1 },
    { "text": "Social media", "position": 2 },
    { "text": "Friend or colleague", "position": 3 },
    { "text": "Advertisement", "position": 4 }
  ],
  "settings": {
    "has_other": true,
    "other_text": "Other (please specify)",
    "randomize": false,
    "columns": 1
  }
}
```

---

### dropdown

**Type identifier:** `dropdown`

**Description:** A single-select question rendered as a dropdown/select menu. Best for long lists of options where radio buttons would take up too much space.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `dropdown` |
| `answer_options` | array | List of options to choose from |

**Settings (JSONB):**

```json
{
  "placeholder": "Select an option",
  "searchable": false,
  "has_other": false,
  "other_text": "Other"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `placeholder` | string | `"Select an option"` | Text shown when no option is selected |
| `searchable` | boolean | `false` | Whether the dropdown supports type-ahead search |
| `has_other` | boolean | `false` | Whether to include an "Other" option with a free-text input |
| `other_text` | string | `"Other"` | Label for the other option |

**Validation rules:**

- Value must be a valid option code from the question's answer options, or `"other"` if `has_other` is enabled.
- If `has_other` is enabled and the respondent selects "other", the `other_value` field must be a non-empty string.
- If the question is marked `is_required`, a selection must be made.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "opt_united_states"
}
```

**API example:**

```json
{
  "title": "Select your country",
  "question_type": "dropdown",
  "is_required": true,
  "answer_options": [
    { "text": "United States", "position": 1 },
    { "text": "United Kingdom", "position": 2 },
    { "text": "Canada", "position": 3 },
    { "text": "Australia", "position": 4 }
  ],
  "settings": {
    "placeholder": "Choose a country",
    "searchable": true
  }
}
```

---

### multiple_choice

**Type identifier:** `multiple_choice`

**Description:** A multi-select question rendered as checkboxes. The respondent can pick one or more options.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `multiple_choice` |
| `answer_options` | array | List of options to choose from |

**Settings (JSONB):**

```json
{
  "min_choices": null,
  "max_choices": null,
  "has_other": false,
  "other_text": "Other",
  "randomize": false,
  "columns": 1,
  "select_all": false,
  "select_all_text": "Select all"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `min_choices` | integer or null | `null` | Minimum number of selections required (null = no minimum) |
| `max_choices` | integer or null | `null` | Maximum number of selections allowed (null = no maximum) |
| `has_other` | boolean | `false` | Whether to show an "Other" option with a free-text input |
| `other_text` | string | `"Other"` | Label for the other option |
| `randomize` | boolean | `false` | Whether to randomize the display order of options |
| `columns` | integer | `1` | Number of columns for layout (1, 2, 3, or 4) |
| `select_all` | boolean | `false` | Whether to show a "Select all" convenience checkbox |
| `select_all_text` | string | `"Select all"` | Label for the select-all checkbox |

**Validation rules:**

- `values` must be an array of valid option codes.
- If `min_choices` is set, the number of selections must be >= `min_choices`.
- If `max_choices` is set, the number of selections must be <= `max_choices`.
- If `has_other` is enabled and `"other"` is included in `values`, the `other_value` field must be a non-empty string.
- If the question is marked `is_required`, at least one selection must be made.

**Response format:**

```json
{
  "question_id": "uuid",
  "values": ["opt_dashboard", "opt_api_access"]
}
```

With "other" selected:

```json
{
  "question_id": "uuid",
  "values": ["opt_dashboard", "other"],
  "other_value": "My custom answer"
}
```

**API example:**

```json
{
  "title": "Which features do you use? (Select all that apply)",
  "question_type": "multiple_choice",
  "is_required": true,
  "answer_options": [
    { "text": "Dashboard", "position": 1 },
    { "text": "Reports", "position": 2 },
    { "text": "API access", "position": 3 },
    { "text": "Integrations", "position": 4 }
  ],
  "settings": {
    "min_choices": 1,
    "max_choices": null,
    "has_other": true,
    "other_text": "Other feature",
    "columns": 2
  }
}
```

---

### ranking

**Type identifier:** `ranking`

**Description:** A drag-and-drop ranking question where the respondent orders options by preference or priority.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `ranking` |
| `answer_options` | array | List of options to rank |

**Settings (JSONB):**

```json
{
  "randomize_initial_order": true
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `randomize_initial_order` | boolean | `true` | Whether the initial display order is randomized to reduce order bias |

**Validation rules:**

- `values` must be an array containing every option code exactly once (complete ranking required).
- No duplicate entries are allowed.
- The length of `values` must equal the number of answer options.
- If the question is marked `is_required`, the respondent must submit a ranking.

**Response format:**

The `values` array is ordered from highest priority (index 0) to lowest priority.

```json
{
  "question_id": "uuid",
  "values": ["opt_price", "opt_performance", "opt_ease_of_use"]
}
```

**API example:**

```json
{
  "title": "Rank these features by importance to you",
  "question_type": "ranking",
  "is_required": true,
  "answer_options": [
    { "text": "Performance", "position": 1 },
    { "text": "Ease of use", "position": 2 },
    { "text": "Price", "position": 3 },
    { "text": "Support", "position": 4 }
  ],
  "settings": {
    "randomize_initial_order": true
  }
}
```

---

### image_picker

**Type identifier:** `image_picker`

**Description:** A visual selection question where the respondent picks one or more images. Useful for design preferences, brand recognition, or visual comparisons.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `image_picker` |
| `answer_options` | array | List of options, each with an `image_url` field |

**Settings (JSONB):**

```json
{
  "multi_select": false,
  "min_choices": null,
  "max_choices": null,
  "image_width": 200,
  "image_height": 150,
  "show_labels": true
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `multi_select` | boolean | `false` | Whether multiple images can be selected |
| `min_choices` | integer or null | `null` | Minimum selections (only applies when `multi_select` is true) |
| `max_choices` | integer or null | `null` | Maximum selections (only applies when `multi_select` is true) |
| `image_width` | integer | `200` | Display width in pixels for each image |
| `image_height` | integer | `150` | Display height in pixels for each image |
| `show_labels` | boolean | `true` | Whether to show text labels below images |

**Validation rules:**

- When `multi_select` is false, `value` must be a single valid option code.
- When `multi_select` is true, `values` must be an array of valid option codes, subject to `min_choices` and `max_choices` constraints.
- If the question is marked `is_required`, at least one selection must be made.

**Response format:**

Single select:

```json
{
  "question_id": "uuid",
  "value": "opt_design_a"
}
```

Multi select:

```json
{
  "question_id": "uuid",
  "values": ["opt_design_a", "opt_design_c"]
}
```

**API example:**

```json
{
  "title": "Which logo design do you prefer?",
  "question_type": "image_picker",
  "is_required": true,
  "answer_options": [
    { "text": "Design A", "image_url": "https://cdn.example.com/logo-a.png", "position": 1 },
    { "text": "Design B", "image_url": "https://cdn.example.com/logo-b.png", "position": 2 },
    { "text": "Design C", "image_url": "https://cdn.example.com/logo-c.png", "position": 3 }
  ],
  "settings": {
    "multi_select": false,
    "image_width": 250,
    "image_height": 200,
    "show_labels": true
  }
}
```

---

## Matrix Types

### matrix

**Type identifier:** `matrix`

**Description:** A grid question with rows (subquestions) and columns (answer options). Each row is answered independently using a single-select radio per row. Commonly used for Likert scales applied to multiple items.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `matrix` |
| `answer_options` | array | Column headers (e.g., "Strongly Agree", "Agree", ...) |
| `subquestions` | array | Row labels, created as child questions with `parent_id` set |

**Settings (JSONB):**

```json
{
  "alternate_rows": true,
  "is_all_rows_required": false,
  "randomize_rows": false
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `alternate_rows` | boolean | `true` | Whether to alternate row background colors for readability |
| `is_all_rows_required` | boolean | `false` | Whether every row must be answered (overrides per-row `is_required`) |
| `randomize_rows` | boolean | `false` | Whether to randomize the row order |

**Validation rules:**

- Each row answer must be a valid option code from the column definitions.
- If `is_all_rows_required` is true, every row must have a selection.
- If the question is marked `is_required`, at least one row must be answered.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": {
    "SQ001": "A3",
    "SQ002": "A2",
    "SQ003": "A4"
  }
}
```

**API example:**

```json
{
  "title": "Rate the following aspects of our service",
  "question_type": "matrix",
  "is_required": true,
  "answer_options": [
    { "text": "Very poor", "position": 1 },
    { "text": "Poor", "position": 2 },
    { "text": "Average", "position": 3 },
    { "text": "Good", "position": 4 },
    { "text": "Excellent", "position": 5 }
  ],
  "subquestions": [
    { "title": "Response time", "position": 1 },
    { "title": "Friendliness", "position": 2 },
    { "title": "Knowledge", "position": 3 }
  ],
  "settings": {
    "alternate_rows": true,
    "is_all_rows_required": true
  }
}
```

---

### matrix_single

**Type identifier:** `matrix_single`

**Description:** A matrix question where each row allows a single selection from the column options. Functionally equivalent to `matrix` but explicitly named for clarity. Recognized as a matrix type for subquestion support.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `matrix_single` |
| `answer_options` | array | Column headers |
| `subquestions` | array | Row labels, created as child questions with `parent_id` set |

**Settings (JSONB):**

Same as `matrix`:

```json
{
  "alternate_rows": true,
  "is_all_rows_required": false,
  "randomize_rows": false
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `alternate_rows` | boolean | `true` | Whether to alternate row background colors for readability |
| `is_all_rows_required` | boolean | `false` | Whether every row must be answered |
| `randomize_rows` | boolean | `false` | Whether to randomize the row order |

**Validation rules:**

- Each row answer must be a valid option code from the column definitions.
- If `is_all_rows_required` is true, every row must have a selection.
- If the question is marked `is_required`, at least one row must be answered.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": {
    "SQ001": "A1",
    "SQ002": "A3"
  }
}
```

**API example:**

```json
{
  "title": "Evaluate each area",
  "question_type": "matrix_single",
  "is_required": true,
  "answer_options": [
    { "text": "Poor", "position": 1 },
    { "text": "Fair", "position": 2 },
    { "text": "Good", "position": 3 }
  ],
  "subquestions": [
    { "title": "Quality", "position": 1 },
    { "title": "Speed", "position": 2 }
  ],
  "settings": {
    "is_all_rows_required": true
  }
}
```

---

### matrix_multiple

**Type identifier:** `matrix_multiple`

**Description:** A matrix question where each row allows multiple selections from the column options. Recognized as a matrix type for subquestion support.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `matrix_multiple` |
| `answer_options` | array | Column headers |
| `subquestions` | array | Row labels, created as child questions with `parent_id` set |

**Settings (JSONB):**

Same as `matrix`:

```json
{
  "alternate_rows": true,
  "is_all_rows_required": false,
  "randomize_rows": false
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `alternate_rows` | boolean | `true` | Whether to alternate row background colors for readability |
| `is_all_rows_required` | boolean | `false` | Whether every row must be answered |
| `randomize_rows` | boolean | `false` | Whether to randomize the row order |

**Validation rules:**

- Each row answer must consist of valid option codes from the column definitions.
- If `is_all_rows_required` is true, every row must have at least one selection.
- If the question is marked `is_required`, at least one row must be answered.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": {
    "SQ001": ["A1", "A3"],
    "SQ002": ["A2"]
  }
}
```

**API example:**

```json
{
  "title": "Select all that apply for each category",
  "question_type": "matrix_multiple",
  "is_required": true,
  "answer_options": [
    { "text": "Option A", "position": 1 },
    { "text": "Option B", "position": 2 },
    { "text": "Option C", "position": 3 }
  ],
  "subquestions": [
    { "title": "Category 1", "position": 1 },
    { "title": "Category 2", "position": 2 }
  ],
  "settings": {
    "is_all_rows_required": true
  }
}
```

---

### matrix_dropdown

**Type identifier:** `matrix_dropdown`

**Description:** An advanced matrix where each cell can be a different input type (dropdown, text, checkbox, etc.). Used when rows need to be evaluated across multiple independent dimensions.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `matrix_dropdown` |
| `columns` | array | Column definitions with `name`, `title`, and `cell_type` |
| `subquestions` | array | Row labels, created as child questions with `parent_id` set |

**Settings (JSONB):**

```json
{
  "alternate_rows": true,
  "is_all_rows_required": false,
  "randomize_rows": false,
  "cell_type": "dropdown"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `alternate_rows` | boolean | `true` | Whether to alternate row background colors |
| `is_all_rows_required` | boolean | `false` | Whether every row must be fully answered |
| `randomize_rows` | boolean | `false` | Whether to randomize the row order |
| `cell_type` | string | `"dropdown"` | Default cell type if not specified per column. Options: `dropdown`, `text`, `checkbox`, `radio` |

**Validation rules:**

- Each cell value must match the constraints of its column's `cell_type`.
- Dropdown cells must reference valid option codes from that column's options.
- If `is_all_rows_required` is true, every cell in every row must be filled.
- If the question is marked `is_required`, at least one row must have data.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": {
    "SQ001": {
      "quality": "A2",
      "comments": "Good overall"
    },
    "SQ002": {
      "quality": "A1",
      "comments": "Needs improvement"
    }
  }
}
```

**API example:**

```json
{
  "title": "Evaluate each vendor",
  "question_type": "matrix_dropdown",
  "is_required": true,
  "columns": [
    {
      "name": "quality",
      "title": "Quality",
      "cell_type": "dropdown",
      "answer_options": [
        { "text": "Low", "position": 1 },
        { "text": "Medium", "position": 2 },
        { "text": "High", "position": 3 }
      ]
    },
    {
      "name": "comments",
      "title": "Comments",
      "cell_type": "text"
    }
  ],
  "subquestions": [
    { "title": "Vendor A", "position": 1 },
    { "title": "Vendor B", "position": 2 }
  ],
  "settings": {
    "is_all_rows_required": true
  }
}
```

---

### matrix_dynamic

**Type identifier:** `matrix_dynamic`

**Description:** A dynamic matrix where the respondent can add and remove rows. Useful for open-ended tabular data collection, such as listing team members, line items, or repeated entries.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `matrix_dynamic` |
| `columns` | array | Column definitions with `name`, `title`, and `cell_type` |

**Settings (JSONB):**

```json
{
  "row_count": 1,
  "min_row_count": 0,
  "max_row_count": null,
  "add_row_text": "Add row",
  "remove_row_text": "Remove",
  "cell_type": "text"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `row_count` | integer | `1` | Initial number of visible rows |
| `min_row_count` | integer | `0` | Minimum number of rows the respondent must keep |
| `max_row_count` | integer or null | `null` | Maximum number of rows allowed (null = unlimited) |
| `add_row_text` | string | `"Add row"` | Label for the add-row button |
| `remove_row_text` | string | `"Remove"` | Label for the remove-row button |
| `cell_type` | string | `"text"` | Default cell type. Options: `dropdown`, `text`, `checkbox`, `radio` |

**Validation rules:**

- The number of rows must be >= `min_row_count` and <= `max_row_count` (if set).
- Each cell value must match the constraints of its column's `cell_type`.
- If the question is marked `is_required`, at least one row with data must be present.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": [
    {
      "name": "Alice",
      "role": "A1"
    },
    {
      "name": "Bob",
      "role": "A2"
    }
  ]
}
```

**API example:**

```json
{
  "title": "List your team members",
  "question_type": "matrix_dynamic",
  "is_required": true,
  "columns": [
    {
      "name": "name",
      "title": "Full Name",
      "cell_type": "text"
    },
    {
      "name": "role",
      "title": "Role",
      "cell_type": "dropdown",
      "answer_options": [
        { "text": "Developer", "position": 1 },
        { "text": "Designer", "position": 2 },
        { "text": "Manager", "position": 3 }
      ]
    }
  ],
  "settings": {
    "row_count": 2,
    "min_row_count": 1,
    "max_row_count": 10,
    "add_row_text": "Add team member"
  }
}
```

---

## Scalar Types

### numeric

**Type identifier:** `numeric`

**Description:** A number input field for collecting integer or decimal values. Supports step validation.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `numeric` |

**Settings (JSONB):**

```json
{
  "min_value": null,
  "max_value": null,
  "step": null,
  "placeholder": null,
  "prefix": null,
  "suffix": null
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `min_value` | number or null | `null` | Minimum allowed value (null = no minimum) |
| `max_value` | number or null | `null` | Maximum allowed value (null = no maximum) |
| `step` | number or null | `null` | Step increment (must be > 0). Value must satisfy `(value - min_value) % step == 0` |
| `placeholder` | string or null | `null` | Placeholder text for the input |
| `prefix` | string or null | `null` | Text displayed before the input (e.g., "$") |
| `suffix` | string or null | `null` | Text displayed after the input (e.g., "kg") |

**Validation rules:**

- Value must be a valid number.
- If `min_value` is set, the value must be >= `min_value`.
- If `max_value` is set, the value must be <= `max_value`.
- If `step` is set, the value must be divisible by `step` relative to `min_value` (or 0 if no min).
- If the question is marked `is_required`, a value must be provided.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": 42
}
```

**API example:**

```json
{
  "title": "What is your annual budget?",
  "question_type": "numeric",
  "is_required": true,
  "settings": {
    "min_value": 0,
    "max_value": 10000000,
    "step": 0.01,
    "prefix": "$",
    "placeholder": "Enter amount"
  }
}
```

---

### number

**Type identifier:** `number`

**Description:** A simple numeric input for collecting integer or decimal values. Similar to `numeric` but uses the `validation` JSONB for min/max constraints, falling back to `settings.min_value`/`settings.max_value`.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `number` |

**Settings (JSONB):**

Optional settings `min_value` and `max_value` serve as fallback defaults when `validation.min` and `validation.max` are not set.

**Validation rules:**

- Value must be a number (integer or float; booleans are rejected).
- If `validation.min` (or fallback `settings.min_value`) is set, the value must be >= that minimum.
- If `validation.max` (or fallback `settings.max_value`) is set, the value must be <= that maximum.
- If the question is marked `is_required`, a value must be provided.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": 7.5
}
```

**API example:**

```json
{
  "title": "How many hours do you work per week?",
  "question_type": "number",
  "is_required": true,
  "validation": {
    "min": 0,
    "max": 168
  }
}
```

---

### rating

**Type identifier:** `rating`

**Description:** A rating scale, typically displayed as stars, hearts, or other icons. The respondent selects a value on a discrete scale.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `rating` |

**Settings (JSONB):**

```json
{
  "min_rating": 1,
  "max_rating": 5,
  "step": 1,
  "icon": "star"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `min_rating` | integer | `1` | Minimum rating value |
| `max_rating` | integer | `5` | Maximum rating value |
| `step` | integer | `1` | Increment between values (must be > 0) |
| `icon` | string | `"star"` | Icon type to display. Options: `star`, `heart`, `thumb` |

**Validation rules:**

- Value must be an integer between `min_rating` and `max_rating` (inclusive).
- If the question is marked `is_required`, a rating must be provided.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": 4
}
```

**API example:**

```json
{
  "title": "How would you rate your overall experience?",
  "question_type": "rating",
  "is_required": true,
  "settings": {
    "min_rating": 1,
    "max_rating": 5,
    "step": 1,
    "icon": "star"
  }
}
```

---

### scale

**Type identifier:** `scale`

**Description:** A numeric scale input, similar to rating but accepts both integers and decimals. Uses `validation` JSONB for min/max constraints, falling back to `settings.min_value`/`settings.max_value`.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `scale` |

**Settings (JSONB):**

Optional settings `min_value` and `max_value` serve as fallback defaults when `validation.min` and `validation.max` are not set.

**Validation rules:**

- Value must be a number (integer or float; booleans are rejected).
- If `validation.min` (or fallback `settings.min_value`) is set, the value must be >= that minimum.
- If `validation.max` (or fallback `settings.max_value`) is set, the value must be <= that maximum.
- If the question is marked `is_required`, a value must be provided.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": 7
}
```

**API example:**

```json
{
  "title": "On a scale of 1 to 10, how likely are you to recommend us?",
  "question_type": "scale",
  "is_required": true,
  "settings": {
    "min_value": 1,
    "max_value": 10
  }
}
```

---

### boolean

**Type identifier:** `boolean`

**Description:** A yes/no or true/false toggle question. Rendered as a switch, toggle, or pair of radio buttons.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `boolean` |

**Settings (JSONB):**

```json
{
  "label_true": "Yes",
  "label_false": "No",
  "display": "toggle"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `label_true` | string | `"Yes"` | Display label for the true/affirmative option |
| `label_false` | string | `"No"` | Display label for the false/negative option |
| `display` | string | `"toggle"` | Render style. Options: `toggle`, `radio` |

**Validation rules:**

- Value must be the string `"true"` or `"false"`.
- If the question is marked `is_required`, the respondent must make an explicit selection.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "true"
}
```

**API example:**

```json
{
  "title": "Do you agree to the terms and conditions?",
  "question_type": "boolean",
  "is_required": true,
  "settings": {
    "label_true": "I agree",
    "label_false": "I do not agree",
    "display": "radio"
  }
}
```

---

### yes_no

**Type identifier:** `yes_no`

**Description:** A simple yes/no question. The respondent selects either "yes" or "no".

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `yes_no` |

**Settings (JSONB):**

No type-specific settings.

**Validation rules:**

- Value must be the string `"yes"` or `"no"`.
- If the question is marked `is_required`, a selection must be made.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "yes"
}
```

**API example:**

```json
{
  "title": "Have you used our product before?",
  "question_type": "yes_no",
  "is_required": true
}
```

---

### date

**Type identifier:** `date`

**Description:** A date picker input for collecting calendar dates, with optional time selection.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `date` |

**Settings (JSONB):**

```json
{
  "min_date": null,
  "max_date": null,
  "include_time": false,
  "date_format": "YYYY-MM-DD",
  "placeholder": null
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `min_date` | string (ISO 8601) or null | `null` | Earliest selectable date |
| `max_date` | string (ISO 8601) or null | `null` | Latest selectable date |
| `include_time` | boolean | `false` | Whether to also collect a time component |
| `date_format` | string | `"YYYY-MM-DD"` | Display format for the date |
| `placeholder` | string or null | `null` | Placeholder text for the input |

**Validation rules:**

- Value must be a valid ISO 8601 date string (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss` if `include_time` is true).
- If `min_date` is set, the value must be on or after `min_date`.
- If `max_date` is set, the value must be on or before `max_date`.
- If the question is marked `is_required`, a date must be provided.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "2026-03-31"
}
```

With time:

```json
{
  "question_id": "uuid",
  "value": "2026-03-31T14:30:00"
}
```

**API example:**

```json
{
  "title": "When is your preferred start date?",
  "question_type": "date",
  "is_required": true,
  "settings": {
    "min_date": "2026-04-01",
    "max_date": "2026-12-31",
    "include_time": false,
    "date_format": "YYYY-MM-DD"
  }
}
```

---

### time

**Type identifier:** `time`

**Description:** A time input for collecting a time of day. Accepts `HH:MM` or `HH:MM:SS` format.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `time` |

**Settings (JSONB):**

No type-specific settings.

**Validation rules:**

- Value must be a string.
- Value must be a valid time in `HH:MM` or `HH:MM:SS` format.
- If the question is marked `is_required`, a value must be provided.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "14:30"
}
```

Or with seconds:

```json
{
  "question_id": "uuid",
  "value": "14:30:00"
}
```

**API example:**

```json
{
  "title": "What time do you usually start work?",
  "question_type": "time",
  "is_required": false
}
```

---

### datetime

**Type identifier:** `datetime`

**Description:** A combined date and time input. Accepts ISO-8601-like datetime strings in multiple formats.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `datetime` |

**Settings (JSONB):**

No type-specific settings. Uses the `validation` JSONB for optional `min` and `max` datetime constraints.

**Validation rules:**

- Value must be a string.
- Value must be a parseable ISO-8601-like datetime. Accepted formats: `YYYY-MM-DDTHH:MM:SS`, `YYYY-MM-DDTHH:MM`, `YYYY-MM-DD HH:MM:SS`, `YYYY-MM-DD HH:MM`, `YYYY-MM-DD`.
- If `validation.min` is set, the datetime must be on or after that minimum.
- If `validation.max` is set, the datetime must be on or before that maximum.
- If the question is marked `is_required`, a value must be provided.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "2026-04-12T09:30:00"
}
```

**API example:**

```json
{
  "title": "When is the event?",
  "question_type": "datetime",
  "is_required": true,
  "validation": {
    "min": "2026-01-01T00:00:00",
    "max": "2026-12-31T23:59:59"
  }
}
```

---

## Special Types

### file_upload

**Type identifier:** `file_upload`

**Description:** A file upload input that allows the respondent to attach one or more files. Files are stored and referenced by URL in the response.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `file_upload` |

**Settings (JSONB):**

```json
{
  "max_size_mb": 10,
  "allowed_types": ["image/*", "application/pdf"],
  "max_files": 1
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `max_size_mb` | integer | `10` | Maximum file size in megabytes per file |
| `allowed_types` | array of strings | `["image/*", "application/pdf"]` | Accepted MIME types. Supports wildcards (e.g., `image/*`) |
| `max_files` | integer | `1` | Maximum number of files that can be uploaded |

**Validation rules:**

- Each file must not exceed `max_size_mb` in size.
- Each file's MIME type must match at least one entry in `allowed_types`.
- The number of uploaded files must not exceed `max_files`.
- If the question is marked `is_required`, at least one file must be uploaded.

**Response format:**

Single file:

```json
{
  "question_id": "uuid",
  "value": {
    "file_name": "report.pdf",
    "file_url": "https://storage.example.com/uploads/abc123/report.pdf",
    "file_size": 245760,
    "content_type": "application/pdf"
  }
}
```

Multiple files:

```json
{
  "question_id": "uuid",
  "values": [
    {
      "file_name": "photo1.jpg",
      "file_url": "https://storage.example.com/uploads/abc123/photo1.jpg",
      "file_size": 102400,
      "content_type": "image/jpeg"
    },
    {
      "file_name": "photo2.png",
      "file_url": "https://storage.example.com/uploads/abc123/photo2.png",
      "file_size": 204800,
      "content_type": "image/png"
    }
  ]
}
```

**API example:**

```json
{
  "title": "Upload your resume",
  "question_type": "file_upload",
  "is_required": true,
  "settings": {
    "max_size_mb": 5,
    "allowed_types": ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    "max_files": 1
  }
}
```

---

### expression

**Type identifier:** `expression`

**Description:** A computed/calculated field that displays a value derived from other question responses. The respondent does not interact with this question directly. Useful for showing running totals, computed scores, or conditional text.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The label displayed alongside the computed value |
| `question_type` | string | Must be `expression` |

**Settings (JSONB):**

```json
{
  "expression": "",
  "display_format": "text",
  "currency": null,
  "decimal_places": 0
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `expression` | string | `""` | The formula or expression to evaluate. Supports references to other questions by name (e.g., `{q1} + {q2}`) |
| `display_format` | string | `"text"` | How to format the result. Options: `text`, `number`, `currency`, `percent` |
| `currency` | string or null | `null` | Currency code (e.g., `"USD"`) when `display_format` is `currency` |
| `decimal_places` | integer | `0` | Number of decimal places for numeric display formats |

**Validation rules:**

- No validation is performed on expressions since respondents do not provide input.
- The expression itself is validated at survey creation time to ensure referenced questions exist.

**Response format:**

Expression questions do not produce entries in `response_answers`. Their computed values are transient and displayed in real time.

**API example:**

```json
{
  "title": "Total Score",
  "question_type": "expression",
  "settings": {
    "expression": "{quality_rating} + {service_rating} + {value_rating}",
    "display_format": "number",
    "decimal_places": 0
  }
}
```

---

### html

**Type identifier:** `html`

**Description:** A non-interactive content block for displaying static HTML content within the survey. Used for instructions, headings, images, embedded media, or informational sections between questions.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | An internal label for the content block (may or may not be displayed) |
| `question_type` | string | Must be `html` |

**Settings (JSONB):**

```json
{
  "html_content": ""
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `html_content` | string | `""` | The HTML content to render. Sanitized on save to prevent XSS |

**Validation rules:**

- No validation is performed since respondents do not provide input.
- The `html_content` is sanitized on save to remove potentially dangerous tags and attributes (e.g., `<script>`, `onclick`).

**Response format:**

HTML questions do not produce entries in `response_answers`. They are display-only.

**API example:**

```json
{
  "title": "Instructions",
  "question_type": "html",
  "settings": {
    "html_content": "<div><h3>Section 2: Product Feedback</h3><p>Please answer the following questions about your recent purchase. All fields marked with <strong>*</strong> are required.</p></div>"
  }
}
```

---

## Subquestions

Subquestions are used by matrix types (`matrix`, `matrix_single`, `matrix_multiple`, `matrix_dropdown`, `matrix_dynamic`) to define the rows of the grid. They are stored as regular question records with a `parent_id` that references the parent matrix question.

### Parent-child relationship

```
matrix_question (id: "abc-123")
  |
  +-- subquestion_1 (id: "sub-001", parent_id: "abc-123", position: 1)
  +-- subquestion_2 (id: "sub-002", parent_id: "abc-123", position: 2)
  +-- subquestion_3 (id: "sub-003", parent_id: "abc-123", position: 3)
```

### Key rules

- **`parent_id`**: A foreign key on the question record that points to the parent matrix question's `id`. Top-level questions have `parent_id = null`.
- **`position`**: Determines the display order of rows within the matrix. Positions are scoped to the parent question.
- **`title`**: The row label displayed in the matrix (e.g., "Response time", "Friendliness").
- **`question_type`**: Subquestions inherit the parent's type context. They do not have an independent `question_type`.
- **No standalone rendering**: Subquestions are never rendered outside the context of their parent matrix. They do not appear as independent questions in the survey.
- **Cascade delete**: Deleting a parent matrix question also deletes all its subquestions.
- **Response keys**: In the response `value` object, subquestion codes serve as keys mapping to the respondent's answer for each row.

### Creating subquestions

When creating a matrix question via the API, subquestions are passed inline in the `subquestions` array. The server creates the child question records automatically with the correct `parent_id`.

```json
{
  "title": "Rate our departments",
  "question_type": "matrix",
  "answer_options": [
    { "text": "Poor", "position": 1 },
    { "text": "Fair", "position": 2 },
    { "text": "Good", "position": 3 },
    { "text": "Excellent", "position": 4 }
  ],
  "subquestions": [
    { "title": "Sales", "position": 1 },
    { "title": "Support", "position": 2 },
    { "title": "Engineering", "position": 3 }
  ]
}
```

### Querying subquestions

To fetch subquestions for a given matrix question:

```
GET /api/v1/surveys/{survey_id}/questions?parent_id={matrix_question_id}
```

Alternatively, fetching a matrix question with `?include=subquestions` returns the subquestions nested in the response.
