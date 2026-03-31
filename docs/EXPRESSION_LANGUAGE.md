# Expression Language Reference

## Overview

The survey tool uses an expression language to control dynamic survey behavior at runtime. Expressions power three core capabilities:

- **Relevance (conditional display):** Control whether a question or group is shown to the respondent based on previous answers or respondent attributes.
- **Validation:** Enforce constraints on answers beyond simple type checks (e.g., "sum of allocations must equal 100").
- **Piping (string interpolation):** Insert previous answers or computed values into question titles, descriptions, and answer option labels.

Expressions are authored in the survey editor's logic panel and stored as plain strings in the survey definition JSON. They are evaluated server-side each time a respondent advances through the survey.

---

## Variable References

Variables reference respondent answers using curly-brace notation:

| Syntax | Description |
|---|---|
| `{Q1}` | The answer to question with code `Q1` |
| `{Q1_SQ001}` | The answer to sub-question `SQ001` within question `Q1` (matrix rows, ranking items) |
| `{Q1_SQ001_SQ002}` | A cell within a dual-scale matrix: row `SQ001`, column `SQ002` |
| `{Q1_other}` | The "other" free-text value for question `Q1` |
| `{Q1_comment}` | The comment field associated with question `Q1` |
| `{RESPONDENT.attribute}` | A respondent attribute (e.g., `{RESPONDENT.language}`, `{RESPONDENT.panel_id}`) |

### How question codes map to variables

Every question in the survey has a unique **question code** (e.g., `Q1`, `demographics_age`, `nps_score`). When a respondent answers a question, their response is stored under that code. Sub-questions (matrix rows, ranking slots, checkbox options) append their own codes with an underscore separator.

For multi-select (checkbox) questions, `{Q1}` resolves to an **array** of the selected option codes. For single-select questions, it resolves to the **string** code of the chosen option. For open-ended questions, it resolves to the **string** the respondent entered. For numeric questions, it resolves to a **number**.

---

## Data Types

| Type | Description | Example literals |
|---|---|---|
| **string** | UTF-8 text, delimited by double quotes | `"hello"`, `"Option A"` |
| **number** | Integer or floating-point | `42`, `3.14`, `-7` |
| **boolean** | Logical true/false | `true`, `false` |
| **null** | Absence of a value (unanswered question) | `null` |
| **array** | Ordered list of values (checkbox selections, ranking order) | `["A1", "A2", "A3"]` |

Type coercion rules:

- Comparing a number to a string that looks numeric will coerce the string to a number.
- `null` is only equal to `null`. It is not equal to `""`, `0`, or `false`.
- Boolean context: `null`, `""`, `0`, `false`, and empty arrays `[]` are falsy. Everything else is truthy.

---

## Operators

### Comparison Operators

| Operator | Description | Example |
|---|---|---|
| `==` | Equal to | `{Q1} == "A1"` |
| `!=` | Not equal to | `{Q1} != "A1"` |
| `>` | Greater than | `{Q2} > 18` |
| `<` | Less than | `{Q2} < 65` |
| `>=` | Greater than or equal to | `{Q3} >= 5` |
| `<=` | Less than or equal to | `{Q3} <= 10` |

Comparison operators work on numbers and strings. String comparisons use lexicographic (dictionary) order.

### Logical Operators

| Operator | Description | Example |
|---|---|---|
| `and` | Logical AND (both must be true) | `{Q1} == "A1" and {Q2} > 18` |
| `or` | Logical OR (either can be true) | `{Q1} == "A1" or {Q1} == "A2"` |
| `not` | Logical NOT (negation) | `not {Q1} == "A1"` |

Operator precedence (highest to lowest): `not`, `and`, `or`. Use parentheses to override:

```
({Q1} == "A1" or {Q1} == "A2") and {Q2} > 18
```

### String Operators

| Operator | Description | Example |
|---|---|---|
| `contains` | True if left operand contains right operand as a substring | `{Q5} contains "allergies"` |
| `starts_with` | True if left operand starts with right operand | `{Q5} starts_with "Yes"` |
| `ends_with` | True if left operand ends with right operand | `{Q5} ends_with "Inc."` |

String operators are **case-sensitive**. To perform case-insensitive checks, apply the expression to a known-case value or use `regex_match` with the `(?i)` flag.

### Membership Operator

| Operator | Description | Example |
|---|---|---|
| `in` | True if the left value exists in the right-hand set or array | `{Q1} in ["A1", "A2", "A3"]` |

The `in` operator works in two directions:

- **Value in set:** `{Q1} in ["A1", "A2"]` — true if the respondent chose `A1` or `A2`.
- **Value in multi-select:** `"A1" in {Q_checkbox}` — true if `A1` is among the selected options for a checkbox question.

---

## Built-in Functions

### `is_empty(var)`

Returns `true` if the variable is `null` or an empty string `""`. For arrays, returns `true` if the array has zero elements.

```
is_empty({Q4})
```

### `contains(var, value)`

Returns `true` if `var` contains `value`. For strings, checks substring inclusion. For arrays, checks element membership. Equivalent to the `contains` / `in` operators but available as a function for composability.

```
contains({Q5}, "peanut")
contains({Q_multi}, "OPT_3")
```

### `count(var)`

Returns the number of selected items for a multi-select (checkbox) or ranking question. Returns `0` if the variable is `null` or not an array.

```
count({Q_checkbox}) >= 3
```

### `sum(var1, var2, ...)`

Returns the sum of the provided numeric values. Non-numeric or null values are treated as `0`.

```
sum({Q10_SQ001}, {Q10_SQ002}, {Q10_SQ003}) == 100
```

### `min(var1, var2, ...)` / `max(var1, var2, ...)`

Returns the minimum or maximum of the provided numeric values. Null values are excluded from the calculation.

```
max({Q7_SQ001}, {Q7_SQ002}, {Q7_SQ003}) <= 10
min({Q7_SQ001}, {Q7_SQ002}, {Q7_SQ003}) >= 1
```

### `length(var)`

Returns the length of a string in characters. Returns `0` if the variable is `null`.

```
length({Q_comment}) <= 500
```

### `regex_match(var, pattern)`

Returns `true` if the variable matches the given regular expression pattern. Patterns follow PCRE syntax.

```
regex_match({Q_email}, "^[\\w.+-]+@[\\w-]+\\.[a-zA-Z]{2,}$")
regex_match({Q_phone}, "^\\+?[0-9\\s\\-()]{7,15}$")
```

---

## String Interpolation (Piping)

Piping lets you insert dynamic values into question titles, descriptions, and answer option labels. Use the same `{variable}` syntax inside any text field:

```
You selected "{Q1}" as your primary interest.
```

When the respondent reaches this question, the engine replaces `{Q1}` with the respondent's actual answer to question Q1. If Q1 was a single-select question and the respondent chose the option labeled "Machine Learning", the rendered text would be:

```
You selected "Machine Learning" as your primary interest.
```

### Piping rules

- If the referenced variable is `null` (question not yet answered or skipped), the placeholder is replaced with an empty string.
- For multi-select questions, piped values are joined with a comma and space: `"Option A, Option B, Option C"`.
- For numeric questions, the raw number is inserted: `"You entered 42"`.
- Piping is resolved at render time, so it always reflects the most recent answer even if the respondent navigated back and changed their response.
- To output a literal `{` or `}` in text, escape it with a backslash: `\{not a variable\}`.

---

## Usage Examples

### 1. Show a question if the previous answer equals a specific value

Show Q2 only if the respondent answered "Yes" to Q1.

**Relevance expression on Q2:**
```
{Q1} == "Yes"
```

### 2. Show a group only for certain demographics

Display the "Workplace Benefits" group only for respondents who are employed full-time or part-time.

**Relevance expression on the group:**
```
{Q_employment} in ["full_time", "part_time"]
```

### 3. Make a question required only if another question was answered

Q5 (details) is required only if Q4 (checkbox) has at least one selection.

**Required-if expression on Q5:**
```
not is_empty({Q4})
```

### 4. Complex AND/OR conditions

Show Q10 only for respondents aged 18-34 who either have a college degree or earn above a threshold.

**Relevance expression on Q10:**
```
{Q_age} >= 18 and {Q_age} <= 34 and ({Q_education} in ["bachelors", "masters", "doctorate"] or {Q_income} > 75000)
```

### 5. Matrix row visibility

In a product satisfaction matrix (Q15), show the row for "Mobile App" only if the respondent indicated they use the mobile app.

**Relevance expression on Q15_SQ003 (the Mobile App row):**
```
"mobile_app" in {Q12}
```

### 6. Piped text in a follow-up question

Ask a follow-up about the respondent's chosen brand.

**Question title for Q8:**
```
What do you like most about {Q7}?
```

If the respondent selected "Brand X" for Q7, they see: *What do you like most about Brand X?*

### 7. Calculated validation expression

Ensure that budget allocation percentages across three categories sum to exactly 100.

**Validation expression on Q20:**
```
sum({Q20_SQ001}, {Q20_SQ002}, {Q20_SQ003}) == 100
```

**Validation error message:**
```
Your allocations must total 100%. Currently they total {sum({Q20_SQ001}, {Q20_SQ002}, {Q20_SQ003})}%.
```

### 8. Quota condition

Route respondents to an end-of-survey screen if a quota for males aged 18-24 is full.

**Relevance expression on the quota-full redirect:**
```
{Q_gender} == "male" and {Q_age} >= 18 and {Q_age} <= 24
```

This expression is associated with a quota definition on the server; when the quota count is reached, respondents matching this condition are redirected.

### 9. Show a question based on the number of selections

Show a ranking question only if the respondent selected 3 or more items in a previous checkbox question.

**Relevance expression on Q14:**
```
count({Q13}) >= 3
```

### 10. Regex validation on a text field

Validate that the respondent entered a properly formatted US ZIP code.

**Validation expression on Q_zip:**
```
regex_match({Q_zip}, "^[0-9]{5}(-[0-9]{4})?$")
```

### 11. Nested piping with conditional suffix

Build a dynamic sentence using piping and handle singular/plural phrasing.

**Question description for Q_summary:**
```
You selected {count({Q_features})} feature(s). Your top choice was {Q_features_1}.
```

### 12. Skip logic with negation

Skip the smoking-related question group if the respondent said they have never smoked.

**Relevance expression on the smoking group:**
```
not ({Q_smoking} == "never")
```

---

## Expression Validation API

### `POST /api/v1/surveys/{id}/logic/validate-expression`

Validates an expression for syntactic and semantic correctness against a specific survey's schema. Use this before saving logic rules to catch errors early.

**Request body:**

```json
{
  "expression": "{Q1} == \"Yes\" and count({Q3}) >= 2",
  "context": "relevance"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `expression` | string | Yes | The expression string to validate. |
| `context` | string | No | The usage context: `"relevance"`, `"validation"`, or `"piping"`. Defaults to `"relevance"`. Affects which features are permitted (e.g., piping context allows inline text). |

**Success response (200):**

```json
{
  "valid": true,
  "parsed_variables": ["Q1", "Q3"],
  "warnings": []
}
```

**Failure response (200):**

```json
{
  "valid": false,
  "errors": [
    {
      "message": "Unknown variable reference: Q99",
      "position": { "start": 0, "end": 4 },
      "code": "UNKNOWN_VARIABLE"
    }
  ],
  "warnings": [
    {
      "message": "Variable Q3 is defined after this question in the survey flow; relevance may not evaluate as expected.",
      "code": "FORWARD_REFERENCE"
    }
  ]
}
```

**Error codes:**

| Code | Description |
|---|---|
| `SYNTAX_ERROR` | The expression could not be parsed. |
| `UNKNOWN_VARIABLE` | A referenced variable does not exist in the survey. |
| `TYPE_MISMATCH` | An operator or function is applied to an incompatible type (e.g., `count()` on a text question). |
| `FORWARD_REFERENCE` | A variable references a question that appears later in the survey flow (returned as a warning, not an error). |
| `UNSUPPORTED_FUNCTION` | A function name is not recognized. |

---

## Flow Resolution API

### `POST /api/v1/surveys/{id}/logic/resolve-flow`

Evaluates all relevance conditions in a survey given a set of answers, returning the resolved flow: which questions and groups are visible, which are hidden, and any piped text replacements.

**Request body:**

```json
{
  "answers": {
    "Q1": "Yes",
    "Q2": 25,
    "Q3": ["A1", "A3"],
    "Q_gender": "female"
  },
  "from_question": "Q4",
  "direction": "forward"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `answers` | object | Yes | A map of question codes to current respondent answers. |
| `from_question` | string | No | The question code to resolve flow from. Defaults to the beginning of the survey. |
| `direction` | string | No | `"forward"` (default) or `"backward"`. Determines which direction to resolve the next visible question. |

**Response (200):**

```json
{
  "next_question": "Q5",
  "visible_questions": ["Q5", "Q6", "Q8"],
  "hidden_questions": ["Q7"],
  "visible_groups": ["G2"],
  "hidden_groups": ["G3"],
  "piped_texts": {
    "Q5_title": "You said \"Yes\" to Q1. Tell us more.",
    "Q6_description": "Based on your 3 selections..."
  },
  "validation_results": {
    "Q2": { "valid": true },
    "Q3": { "valid": true }
  }
}
```

This endpoint is used by the survey runner to determine the next screen to display and by the survey editor to preview logic behavior.

---

## Security

All expressions are evaluated **server-side** in a sandboxed execution environment. The sandbox enforces the following constraints:

- **No arbitrary code execution.** The expression parser recognizes only the operators, functions, and variable references documented above. Any input that does not conform to the grammar is rejected at parse time.
- **No file system or network access.** Expressions cannot read files, make HTTP requests, or interact with system resources.
- **No access to internal application state.** Expressions can only reference respondent answers and the built-in functions listed in this document. They cannot access database connections, environment variables, or server configuration.
- **Execution time limits.** Each expression evaluation is subject to a timeout (default: 100ms). Expressions that exceed this limit are terminated and treated as a failing condition.
- **Input size limits.** Expression strings are limited to 4,096 characters. Variable values are truncated to 10,000 characters before evaluation.

These constraints ensure that user-authored expressions cannot compromise the security or stability of the survey platform, even if a malicious expression is submitted through the API.
