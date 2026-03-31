# Question Types Reference

This document describes all 18 question types supported by the survey tool. Each entry covers the type identifier, purpose, required fields, configurable settings, validation rules, response format, and an API example.

---

## Table of Contents

- [Text Types](#text-types)
  - [short_text](#short_text)
  - [long_text](#long_text)
  - [huge_text](#huge_text)
- [Choice Types](#choice-types)
  - [radio](#radio)
  - [dropdown](#dropdown)
  - [checkbox](#checkbox)
  - [ranking](#ranking)
  - [image_picker](#image_picker)
- [Matrix Types](#matrix-types)
  - [matrix](#matrix)
  - [matrix_dropdown](#matrix_dropdown)
  - [matrix_dynamic](#matrix_dynamic)
- [Scalar Types](#scalar-types)
  - [numeric](#numeric)
  - [rating](#rating)
  - [boolean](#boolean)
  - [date](#date)
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

## Choice Types

### radio

**Type identifier:** `radio`

**Description:** A single-select question rendered as radio buttons. The respondent picks exactly one option from the list.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `radio` |
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

- Value must be a valid `answer_option_id` from the question's answer options, or the string `"other"` if `has_other` is enabled.
- If `has_other` is enabled and the respondent selects "other", the `other_value` field must be a non-empty string.
- If the question is marked `is_required`, a selection must be made.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "answer_option_id"
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
  "question_type": "radio",
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

- Value must be a valid `answer_option_id` from the question's answer options, or `"other"` if `has_other` is enabled.
- If `has_other` is enabled and the respondent selects "other", the `other_value` field must be a non-empty string.
- If the question is marked `is_required`, a selection must be made.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": "answer_option_id"
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

### checkbox

**Type identifier:** `checkbox`

**Description:** A multi-select question rendered as checkboxes. The respondent can pick one or more options.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `checkbox` |
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

- `values` must be an array of valid `answer_option_id` entries.
- If `min_choices` is set, the number of selections must be >= `min_choices`.
- If `max_choices` is set, the number of selections must be <= `max_choices`.
- If `has_other` is enabled and `"other"` is included in `values`, the `other_value` field must be a non-empty string.
- If the question is marked `is_required`, at least one selection must be made.

**Response format:**

```json
{
  "question_id": "uuid",
  "values": ["answer_option_id_1", "answer_option_id_3"]
}
```

With "other" selected:

```json
{
  "question_id": "uuid",
  "values": ["answer_option_id_1", "other"],
  "other_value": "My custom answer"
}
```

**API example:**

```json
{
  "title": "Which features do you use? (Select all that apply)",
  "question_type": "checkbox",
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

- `values` must be an array containing every `answer_option_id` exactly once (complete ranking required).
- No duplicate entries are allowed.
- The length of `values` must equal the number of answer options.
- If the question is marked `is_required`, the respondent must submit a ranking.

**Response format:**

The `values` array is ordered from highest priority (index 0) to lowest priority.

```json
{
  "question_id": "uuid",
  "values": ["answer_option_id_2", "answer_option_id_1", "answer_option_id_3"]
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

- When `multi_select` is false, `value` must be a single valid `answer_option_id`.
- When `multi_select` is true, `values` must be an array of valid `answer_option_id` entries, subject to `min_choices` and `max_choices` constraints.
- If the question is marked `is_required`, at least one selection must be made.

**Response format:**

Single select:

```json
{
  "question_id": "uuid",
  "value": "answer_option_id"
}
```

Multi select:

```json
{
  "question_id": "uuid",
  "values": ["answer_option_id_1", "answer_option_id_3"]
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

- Each row answer must be a valid `answer_option_id` from the column definitions.
- If `is_all_rows_required` is true, every row must have a selection.
- If the question is marked `is_required`, at least one row must be answered.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": {
    "subquestion_id_1": "answer_option_id_3",
    "subquestion_id_2": "answer_option_id_2",
    "subquestion_id_3": "answer_option_id_4"
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
- Dropdown cells must reference valid `answer_option_id` values from that column's options.
- If `is_all_rows_required` is true, every cell in every row must be filled.
- If the question is marked `is_required`, at least one row must have data.

**Response format:**

```json
{
  "question_id": "uuid",
  "value": {
    "subquestion_id_1": {
      "column_1": "answer_option_id",
      "column_2": "Free text value"
    },
    "subquestion_id_2": {
      "column_1": "answer_option_id",
      "column_2": "Another value"
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
      "role": "answer_option_id"
    },
    {
      "name": "Bob",
      "role": "answer_option_id"
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

**Description:** A number input field for collecting integer or decimal values.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `numeric` |

**Settings (JSONB):**

```json
{
  "min": null,
  "max": null,
  "decimal_places": 0,
  "placeholder": null,
  "prefix": null,
  "suffix": null
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `min` | number or null | `null` | Minimum allowed value (null = no minimum) |
| `max` | number or null | `null` | Maximum allowed value (null = no maximum) |
| `decimal_places` | integer | `0` | Number of decimal places (0 = integers only) |
| `placeholder` | string or null | `null` | Placeholder text for the input |
| `prefix` | string or null | `null` | Text displayed before the input (e.g., "$") |
| `suffix` | string or null | `null` | Text displayed after the input (e.g., "kg") |

**Validation rules:**

- Value must be a valid number.
- If `min` is set, the value must be >= `min`.
- If `max` is set, the value must be <= `max`.
- The value must not have more decimal places than `decimal_places`.
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
    "min": 0,
    "max": 10000000,
    "decimal_places": 2,
    "prefix": "$",
    "placeholder": "Enter amount"
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
  "min": 1,
  "max": 5,
  "step": 1,
  "icon": "star"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `min` | integer | `1` | Minimum rating value |
| `max` | integer | `5` | Maximum rating value |
| `step` | integer | `1` | Increment between values |
| `icon` | string | `"star"` | Icon type to display. Options: `star`, `heart`, `thumb`, `smiley` |

**Validation rules:**

- Value must be a number between `min` and `max` (inclusive).
- Value must be aligned to `step` increments starting from `min` (i.e., `(value - min) % step === 0`).
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
    "min": 1,
    "max": 5,
    "step": 1,
    "icon": "star"
  }
}
```

---

### boolean

**Type identifier:** `boolean`

**Description:** A yes/no or true/false toggle question. Rendered as a switch, toggle, or pair of buttons.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | The question text displayed to the respondent |
| `question_type` | string | Must be `boolean` |

**Settings (JSONB):**

```json
{
  "true_label": "Yes",
  "false_label": "No",
  "default_value": null,
  "render_as": "toggle"
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `true_label` | string | `"Yes"` | Display label for the true/affirmative option |
| `false_label` | string | `"No"` | Display label for the false/negative option |
| `default_value` | boolean or null | `null` | Pre-selected value (null = no default) |
| `render_as` | string | `"toggle"` | Render style. Options: `toggle`, `radio`, `checkbox` |

**Validation rules:**

- Value must be a boolean (`true` or `false`).
- If the question is marked `is_required`, the respondent must make an explicit selection (the default value does not count unless confirmed).

**Response format:**

```json
{
  "question_id": "uuid",
  "value": true
}
```

**API example:**

```json
{
  "title": "Do you agree to the terms and conditions?",
  "question_type": "boolean",
  "is_required": true,
  "settings": {
    "true_label": "I agree",
    "false_label": "I do not agree",
    "render_as": "radio"
  }
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

Subquestions are used by matrix types (`matrix`, `matrix_dropdown`, `matrix_dynamic`) to define the rows of the grid. They are stored as regular question records with a `parent_id` that references the parent matrix question.

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
- **Response keys**: In the response `value` object, subquestion IDs serve as keys mapping to the respondent's answer for each row.

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
