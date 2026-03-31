# Milestone 5: Survey Logic & Expressions

## Overview

This milestone implements the expression language that powers dynamic survey behavior: conditional display (relevance), skip logic, custom validation expressions, and answer piping (string interpolation). The expression engine is a sandboxed, server-side evaluator that parses and executes expressions written in the custom syntax documented in EXPRESSION_LANGUAGE.md.

The engine supports variable references (`{Q1}`, `{Q1_SQ001}`, `{RESPONDENT.attribute}`), comparison and logical operators, string operators, membership testing, and built-in functions (`is_empty`, `contains`, `count`, `sum`, `min`, `max`, `length`, `regex_match`). Expressions are authored in the survey builder's logic panel and evaluated at runtime during response collection.

By the end of this milestone, survey authors can create sophisticated branching logic, show/hide questions based on previous answers, pipe dynamic values into question text, and validate answers with custom expressions -- all through a visual builder UI backed by a robust server-side engine.

## Prerequisites

- Milestone 1 (Backend Foundation) must be complete -- questions, groups, and relevance fields.
- Milestone 3 (Survey Builder UI) must be complete -- question editor and builder infrastructure.
- Milestone 4 (Question Types) should be substantially complete -- question type validation.

## Success Criteria

- Expression lexer/parser correctly tokenizes and parses all documented syntax.
- Expression evaluator correctly evaluates expressions against a set of answers.
- Variable references resolve to question answers by code, including subquestions and "other" values.
- All operators (comparison, logical, string, membership) produce correct results.
- All built-in functions (is_empty, contains, count, sum, min, max, length, regex_match) work correctly.
- `POST /surveys/{id}/logic/validate-expression` validates expressions and reports errors.
- `POST /surveys/{id}/logic/resolve-flow` resolves visible/hidden questions given answers.
- String interpolation (piping) replaces `{variable}` references in question text.
- Frontend logic editor provides a visual interface for building relevance expressions.
- Expression test suite covers all operators, functions, and edge cases.

## Architecture Notes

- **Three-phase pipeline**: Expressions go through lexing (tokenization), parsing (AST generation), and evaluation.
- **Sandboxed execution**: No arbitrary code execution. Only documented operators, functions, and variable references. 100ms timeout per evaluation. 4096 character limit on expressions.
- **Variable resolution**: The evaluator receives a `context` dict mapping question codes to answer values. It resolves `{Q1}` by looking up `context["Q1"]`, `{Q1_SQ001}` by looking up `context["Q1_SQ001"]`, and `{RESPONDENT.attr}` from participant attributes.
- **Type coercion**: String-to-number coercion for comparisons, falsy values (null, "", 0, false, []) for boolean context.
- **Server-side only**: Expressions are never evaluated client-side. The frontend sends answers to the `resolve-flow` endpoint and receives visibility/piping results.

## Tasks

### Task 5.1: Expression Language Lexer/Tokenizer
**Estimated Complexity:** Medium
**Dependencies:** None

**Description:**
Create the expression lexer in `app/services/expression_engine.py` (or `app/services/expressions/lexer.py`). The lexer converts an expression string into a sequence of tokens. Token types include: VARIABLE (`{Q1}`), STRING (`"hello"`), NUMBER (`42`, `3.14`), BOOLEAN (`true`, `false`), NULL (`null`), OPERATOR (`==`, `!=`, `>`, `<`, `>=`, `<=`), LOGICAL (`and`, `or`, `not`), STRING_OP (`contains`, `starts_with`, `ends_with`), MEMBERSHIP (`in`), FUNCTION (`is_empty`, `contains`, `count`, `sum`, `min`, `max`, `length`, `regex_match`), LPAREN, RPAREN, LBRACKET, RBRACKET, COMMA.

The lexer should track position (start/end) for each token to support error reporting with position information. Handle escape sequences in strings (`\"`, `\\`). Handle escaped braces in piping contexts (`\{`, `\}`).

**Acceptance Criteria:**
- [ ] Lexer tokenizes all documented syntax elements correctly
- [ ] Variable references `{Q1}`, `{Q1_SQ001}`, `{Q1_other}`, `{RESPONDENT.attr}` produce VARIABLE tokens
- [ ] String literals with escape sequences are handled
- [ ] Numbers (integer and float, positive and negative) are tokenized
- [ ] All operators and keywords are recognized
- [ ] Position tracking (start, end) is accurate for every token
- [ ] Invalid characters produce a SYNTAX_ERROR with position
- [ ] Expression length limit (4096 characters) is enforced

**Technical Notes:**
- Implement as a generator or list-returning function: `tokenize(expression: str) -> list[Token]`
- Token dataclass: `Token(type: TokenType, value: Any, start: int, end: int)`
- Handle whitespace (skip), comments (none in spec), and EOF
- Files: `app/services/expressions/lexer.py`

---

### Task 5.2: Expression Language Parser (AST Generation)
**Estimated Complexity:** Large
**Dependencies:** Task 5.1

**Description:**
Create the expression parser that converts a token sequence into an Abstract Syntax Tree (AST). Implement a recursive descent parser or Pratt parser that handles operator precedence: `not` (highest) > comparisons (`==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `starts_with`, `ends_with`, `in`) > `and` > `or` (lowest). Parentheses override precedence.

AST node types: `BinaryOp(op, left, right)`, `UnaryOp(op, operand)`, `Variable(name)`, `Literal(value)`, `FunctionCall(name, args)`, `ArrayLiteral(elements)`. The parser should produce clear syntax error messages with position information when the expression is malformed.

**Acceptance Criteria:**
- [ ] Parser produces correct AST for all documented expression patterns
- [ ] Operator precedence is correct: `not` > comparisons > `and` > `or`
- [ ] Parentheses override precedence correctly
- [ ] Function calls with arguments parse correctly: `count({Q1})`, `sum({Q1}, {Q2})`
- [ ] Array literals parse correctly: `["A1", "A2"]`
- [ ] Nested expressions parse correctly: `({Q1} == "A1" or {Q1} == "A2") and {Q2} > 18`
- [ ] Syntax errors include position and descriptive message
- [ ] All EXPRESSION_LANGUAGE.md examples parse successfully

**Technical Notes:**
- Recommended: Pratt parser for clean precedence handling
- Define precedence levels: OR=1, AND=2, NOT=3, COMPARISON=4, STRING_OP=4, IN=4
- Parser entry: `parse(tokens: list[Token]) -> ASTNode`
- Each AST node should have `start` and `end` positions for error reporting
- Files: `app/services/expressions/parser.py`, `app/services/expressions/ast_nodes.py`

---

### Task 5.3: Expression Evaluator
**Estimated Complexity:** Large
**Dependencies:** Task 5.2

**Description:**
Create the expression evaluator that walks the AST and computes a result given a context of variable values. The evaluator handles: variable resolution (lookup in context dict), literal values, binary operations (comparison, logical, string, membership), unary operations (not), function calls (dispatch to built-in implementations), and type coercion (string-to-number for comparisons, falsy values for boolean context).

Implement all built-in functions: `is_empty(var)`, `contains(var, value)`, `count(var)`, `sum(var1, var2, ...)`, `min(var1, var2, ...)`, `max(var1, var2, ...)`, `length(var)`, `regex_match(var, pattern)`. Implement execution timeout (100ms default) and input size limits (10,000 character value truncation).

**Acceptance Criteria:**
- [ ] Variables resolve correctly from the context dict
- [ ] Comparison operators (==, !=, >, <, >=, <=) work for numbers and strings
- [ ] Logical operators (and, or, not) work with short-circuit evaluation
- [ ] String operators (contains, starts_with, ends_with) are case-sensitive
- [ ] `in` operator works for value-in-array and value-in-multi-select
- [ ] All 8 built-in functions produce correct results
- [ ] Type coercion: string "42" compared to number 42 returns equal
- [ ] Null handling: null == null is true, null != anything_else is true
- [ ] Falsy values: null, "", 0, false, [] evaluate to false in boolean context
- [ ] Timeout terminates long-running evaluations
- [ ] Unknown variables resolve to null (not error)

**Technical Notes:**
- Evaluate via recursive AST walker: `evaluate(node: ASTNode, context: dict) -> Any`
- Built-in function registry: `builtins: Dict[str, Callable]`
- Timeout: use `signal.alarm` on Unix or `threading.Timer` with 100ms limit
- `regex_match`: use `re.search(pattern, value)` with PCRE-like syntax
- Files: `app/services/expressions/evaluator.py`, `app/services/expressions/functions.py`

---

### Task 5.4: Expression Validation Endpoint
**Estimated Complexity:** Medium
**Dependencies:** Task 5.3

**Description:**
Implement `POST /api/v1/surveys/{id}/logic/validate-expression` as documented in EXPRESSION_LANGUAGE.md. This endpoint validates an expression string against a specific survey's schema. It checks: syntactic correctness (can the expression be parsed?), semantic correctness (do all referenced variables exist as question codes in the survey?), type compatibility (is `count()` applied to a multi-select question?), and forward references (does the expression reference a question that appears later in the survey flow?).

Return `parsed_variables` (list of referenced question codes), `errors` (list of error objects with message, position, and code), and `warnings` (e.g., forward references). Support the `context` field to differentiate between `relevance`, `validation`, and `piping` usage.

**Acceptance Criteria:**
- [ ] Valid expressions return `{"valid": true, "parsed_variables": [...], "warnings": []}`
- [ ] Syntax errors return `{"valid": false, "errors": [{"message": "...", "position": {...}, "code": "SYNTAX_ERROR"}]}`
- [ ] Unknown variables return error with code `UNKNOWN_VARIABLE`
- [ ] Type mismatches (e.g., `count()` on a text question) return `TYPE_MISMATCH`
- [ ] Forward references return warnings with code `FORWARD_REFERENCE`
- [ ] Unsupported functions return `UNSUPPORTED_FUNCTION`
- [ ] `parsed_variables` lists all referenced question codes
- [ ] The `context` field affects validation (piping allows inline text, etc.)

**Technical Notes:**
- Extract variables from AST: walk all Variable nodes and collect names
- Check variables against survey's question codes: query questions by survey_id
- Determine question order for forward reference detection: use group sort_order + question sort_order
- Endpoint: `POST /api/v1/surveys/{id}/logic/validate-expression`
- Files: `app/api/surveys.py` (or `app/api/logic.py`), `app/services/expression_engine.py`

---

### Task 5.5: Variable Resolution System
**Estimated Complexity:** Medium
**Dependencies:** Task 5.3

**Description:**
Implement the variable resolution layer that maps expression variable references to actual response data. The resolver handles all variable syntaxes: `{Q1}` (direct question answer), `{Q1_SQ001}` (subquestion answer within a matrix), `{Q1_other}` (the "other" free-text value), `{Q1_comment}` (comment field), and `{RESPONDENT.attribute}` (participant attributes from the `participants.attributes` JSONB).

The resolver converts between the response storage format (response_answers with question_id and value/values) and the expression context format (flat dict mapping question codes to values). For multi-select questions, the value is an array. For numeric questions, the value is a number. For single-select, the value is a string.

**Acceptance Criteria:**
- [ ] `{Q1}` resolves to the response value for the question with code "Q1"
- [ ] `{Q1_SQ001}` resolves to the subquestion value within a matrix response
- [ ] `{Q1_other}` resolves to the "other" text value for choice questions
- [ ] `{RESPONDENT.email}` resolves to the participant's email attribute
- [ ] `{RESPONDENT.custom_attr}` resolves from `participants.attributes` JSONB
- [ ] Multi-select (checkbox) values resolve to arrays
- [ ] Numeric values resolve to numbers (not strings)
- [ ] Unanswered questions resolve to null
- [ ] Boolean question values resolve to boolean true/false

**Technical Notes:**
- Build context from response_answers: `context = build_expression_context(survey, response, participant)`
- Map question codes to answers by joining response_answers with questions on question_id
- For subquestions, flatten matrix responses: `{parent_code}_{sub_code}` -> value
- Files: `app/services/expressions/resolver.py`

---

### Task 5.6: Conditional Display / Relevance Expressions
**Estimated Complexity:** Medium
**Dependencies:** Task 5.3, Task 5.5

**Description:**
Implement the relevance evaluation system. Both questions and question groups have a `relevance` TEXT column that stores an expression. When evaluating the survey flow, each question and group's relevance expression is evaluated against the current response context. If the expression evaluates to a falsy value, the question/group is hidden from the respondent.

Create a `evaluate_relevance(survey, answers)` function that returns which questions and groups are visible/hidden. Questions in hidden groups are always hidden regardless of their own relevance. A question with no relevance expression (null) is always visible. This function is used both for response validation (only validate visible questions) and for the resolve-flow endpoint.

**Acceptance Criteria:**
- [ ] Questions with relevance expressions are shown/hidden based on evaluation result
- [ ] Groups with relevance expressions are shown/hidden based on evaluation result
- [ ] Questions in hidden groups are always hidden
- [ ] Questions/groups with null relevance are always visible
- [ ] Complex expressions with AND/OR/NOT evaluate correctly
- [ ] Function-based relevance (e.g., `count({Q1}) >= 3`) evaluates correctly
- [ ] Relevance is re-evaluated when answers change
- [ ] Circular references are detected and reported as errors

**Technical Notes:**
- Evaluate in order: first groups (by sort_order), then questions within visible groups
- Cache evaluation results for referenced variables to avoid redundant lookups
- Circular reference detection: track evaluation stack and detect cycles
- Files: `app/services/expressions/relevance.py`, `app/services/expression_engine.py`

---

### Task 5.7: Skip Logic Implementation
**Estimated Complexity:** Medium
**Dependencies:** Task 5.6

**Description:**
Build on the relevance system to implement skip logic -- determining the next visible question when navigating forward or backward through a survey. Given the current answers and the respondent's position, calculate which question or group to show next by evaluating relevance expressions along the survey flow.

Integrate with the survey structure: questions are ordered by group sort_order then question sort_order. When navigating forward, find the next question whose relevance evaluates to true (and whose group is also relevant). When navigating backward, find the previous visible question. Handle edge cases: all remaining questions hidden (go to end), first question hidden (find the first visible one).

**Acceptance Criteria:**
- [ ] Forward navigation skips questions with false relevance
- [ ] Forward navigation skips entire groups with false relevance
- [ ] Backward navigation returns to the previous visible question
- [ ] When all remaining questions are hidden, navigation goes to the survey end
- [ ] When the first question is hidden, the survey starts at the first visible question
- [ ] Skip logic respects the question ordering (group sort_order, question sort_order)
- [ ] Navigation correctly handles the `one_page_per_group` setting
- [ ] Skip calculations are deterministic for the same answer set

**Technical Notes:**
- Build a flat ordered list of (group, question) pairs sorted by group.sort_order, question.sort_order
- Filter by relevance evaluation results from Task 5.6
- For `one_page_per_group`: navigate by group, not by individual question
- Files: `app/services/expressions/flow.py`

---

### Task 5.8: Answer Piping / String Interpolation
**Estimated Complexity:** Medium
**Dependencies:** Task 5.5

**Description:**
Implement string interpolation (piping) that replaces `{variable}` references in question titles, descriptions, and answer option labels with actual answer values. When a question title contains `You selected "{Q1}" as your interest.`, and the respondent answered "Machine Learning" to Q1, the rendered text becomes `You selected "Machine Learning" as your interest.`

Handle all variable types: single values inserted as strings, multi-select values joined with ", ", numeric values as raw numbers, null values replaced with empty string. Support escaped braces (`\{` and `\}` render as literal `{` and `}`). Support nested function calls in piping: `{count({Q_features})}`.

**Acceptance Criteria:**
- [ ] `{Q1}` in text is replaced with the answer to Q1
- [ ] Multi-select answers are joined with ", " (e.g., "Option A, Option B")
- [ ] Numeric answers are inserted as numbers
- [ ] Null/unanswered variables are replaced with empty string
- [ ] Escaped braces `\{` and `\}` render as literal `{` and `}`
- [ ] Function calls in piping work: `{count({Q_features})}`
- [ ] Piping works in question titles, descriptions, and answer option labels
- [ ] Invalid variable references are replaced with empty string (no error)

**Technical Notes:**
- Regex to find piping references: `(?<!\\)\{([^}]+)\}` (exclude escaped braces)
- For each match, evaluate as a mini-expression and replace with the string result
- Apply piping to: `questions.title`, `questions.description`, `answer_options.title`
- Files: `app/services/expressions/piping.py`

---

### Task 5.9: Flow Resolution Endpoint
**Estimated Complexity:** Medium
**Dependencies:** Tasks 5.6, 5.7, 5.8

**Description:**
Implement `POST /api/v1/surveys/{id}/logic/resolve-flow` as documented in EXPRESSION_LANGUAGE.md. This endpoint accepts current answers, an optional starting question, and a direction (forward/backward). It evaluates all relevance conditions, resolves skip logic, applies piping, and returns the complete flow state: next_question, visible_questions, hidden_questions, visible_groups, hidden_groups, piped_texts, and validation_results.

This endpoint is the primary integration point between the expression engine and the survey response UI. The frontend calls it whenever the respondent navigates to determine what to show next.

**Acceptance Criteria:**
- [ ] Endpoint accepts `answers`, optional `from_question`, and optional `direction`
- [ ] Returns `next_question` -- the next visible question code
- [ ] Returns `visible_questions` and `hidden_questions` -- arrays of question codes
- [ ] Returns `visible_groups` and `hidden_groups` -- arrays of group IDs
- [ ] Returns `piped_texts` -- map of field identifiers to piped text values
- [ ] Returns `validation_results` -- validation status for answered questions
- [ ] `direction: "forward"` navigates to the next visible question
- [ ] `direction: "backward"` navigates to the previous visible question
- [ ] Defaults to the beginning of the survey when `from_question` is omitted

**Technical Notes:**
- Compose: build context -> evaluate relevance -> resolve flow -> apply piping
- Performance: evaluate all relevance in a single pass, not per-request
- Response format matches EXPRESSION_LANGUAGE.md `POST /logic/resolve-flow` spec
- Files: `app/api/surveys.py` (or `app/api/logic.py`), `app/services/expression_engine.py`

---

### Task 5.10: Frontend -- Relevance Expression Builder UI
**Estimated Complexity:** Large
**Dependencies:** None (builds on M3 LogicEditor stub)

**Description:**
Create `src/components/survey-builder/LogicEditor.tsx` as a visual condition builder for authoring relevance expressions. The UI provides a guided interface: "Show this question IF" followed by a condition builder with rows. Each row has: a question selector (dropdown of previous questions), an operator selector (equals, not equals, greater than, contains, in, etc.), and a value input (text input, option selector for choice questions, or number input).

Support AND/OR grouping: rows within a group are combined with AND or OR. Support nested groups for complex conditions. Below the visual builder, show the raw expression preview. Users can toggle between the visual builder and a raw expression text editor for advanced use.

**Acceptance Criteria:**
- [ ] Condition builder shows "Show this question IF" with add-row button
- [ ] Each row has question selector, operator selector, and value input
- [ ] Question selector shows only questions that appear before the current question in the survey flow
- [ ] Operator options are contextual to the question type (numeric: >, <; choice: ==, in; text: contains)
- [ ] Value input adapts to the question type (option dropdown for choice, number input for numeric)
- [ ] AND/OR grouping is supported with visual nesting
- [ ] Raw expression preview updates in real-time as conditions are built
- [ ] Toggle between visual builder and raw expression editor
- [ ] Expression is saved to the question's `relevance` field
- [ ] Empty conditions clear the `relevance` field (null = always visible)

**Technical Notes:**
- Query previous questions: filter questions by sort_order < current question's sort_order
- Operator map per type: `numeric` -> ==, !=, >, <, >=, <=; `radio/dropdown` -> ==, !=, in; `checkbox` -> contains; `text` -> ==, !=, contains, starts_with, ends_with
- Generate expression string from the visual builder state
- Parse expression string into builder state for editing existing expressions
- Files: `src/components/survey-builder/LogicEditor.tsx`

---

### Task 5.11: Frontend -- Expression Validation and Preview
**Estimated Complexity:** Medium
**Dependencies:** Task 5.4, Task 5.10

**Description:**
Integrate the expression validation API with the frontend logic editor. When the user modifies a relevance expression (either via the visual builder or raw text editor), call `POST /api/v1/surveys/{id}/logic/validate-expression` to check the expression. Display validation results: green check for valid, red errors with position highlighting, and yellow warnings (e.g., forward references).

Also implement expression preview: the user can enter sample answer values for referenced questions and see whether the expression evaluates to true or false. This helps users test their logic before activating the survey.

**Acceptance Criteria:**
- [ ] Expressions are validated on change (debounced, 500ms)
- [ ] Valid expressions show a green check icon
- [ ] Invalid expressions show red error messages with the error code and position
- [ ] Warnings (forward references) show yellow warnings
- [ ] Referenced variables are listed below the editor
- [ ] "Test Expression" mode lets the user enter sample values and see true/false result
- [ ] Validation errors highlight the problematic part of the expression
- [ ] Loading state shown during API validation call

**Technical Notes:**
- Call `POST /surveys/{id}/logic/validate-expression` with debouncing
- Map error positions to character highlights in the raw expression editor
- Test mode: call `POST /surveys/{id}/logic/resolve-flow` with test answers
- Use conditional colors: valid=green border, error=red border, warning=yellow border
- Files: `src/components/survey-builder/LogicEditor.tsx`, `src/components/survey-builder/ExpressionPreview.tsx`

---

### Task 5.12: Expression Language Test Suite
**Estimated Complexity:** Large
**Dependencies:** Tasks 5.1-5.9

**Description:**
Write a comprehensive test suite for the expression language covering lexer, parser, evaluator, relevance, skip logic, and piping. Test all operators, functions, type coercion rules, and edge cases documented in EXPRESSION_LANGUAGE.md. Include the 12 usage examples from the docs as integration tests.

Test categories: lexer token output for various inputs, parser AST structure for complex expressions, evaluator results for all operators and functions, variable resolution with different question types, relevance evaluation with nested conditions, skip logic navigation through surveys with complex branching, piping with various value types, error handling (unknown variables, syntax errors, timeouts), and security (injection attempts, oversized expressions).

**Acceptance Criteria:**
- [ ] Lexer tests: all token types, edge cases (empty strings, special characters, escaped quotes)
- [ ] Parser tests: operator precedence, parentheses, nested expressions, all function calls
- [ ] Evaluator tests: all 6 comparison operators with numbers and strings
- [ ] Evaluator tests: all 3 logical operators with short-circuit evaluation
- [ ] Evaluator tests: all 3 string operators (case-sensitive)
- [ ] Evaluator tests: `in` operator with arrays and multi-select values
- [ ] Function tests: all 8 functions with valid and edge-case inputs
- [ ] Type coercion tests: string/number comparison, falsy values
- [ ] Null handling tests: null comparisons, null in functions
- [ ] All 12 EXPRESSION_LANGUAGE.md examples pass as integration tests
- [ ] Security tests: expression length limit, timeout enforcement, injection resistance
- [ ] Error tests: SYNTAX_ERROR, UNKNOWN_VARIABLE, TYPE_MISMATCH, UNSUPPORTED_FUNCTION

**Technical Notes:**
- Use pytest parametrize extensively for testing operators and functions across many inputs
- Create a helper: `evaluate_expression(expr: str, context: dict) -> Any` for concise test assertions
- Test the full pipeline: `tokenize -> parse -> evaluate` as well as individual components
- Files: `tests/test_expressions.py`, `tests/test_logic.py`
