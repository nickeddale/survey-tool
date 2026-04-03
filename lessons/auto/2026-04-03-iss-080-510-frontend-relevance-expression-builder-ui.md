---
date: "2026-04-03"
ticket_id: "ISS-080"
ticket_title: "5.10: Frontend — Relevance Expression Builder UI"
categories: ["frontend", "react", "expression-builder", "survey-builder", "ui-components"]
outcome: "success"
complexity: "high"
files_modified: []
---

# Lessons Learned: 5.10: Frontend — Relevance Expression Builder UI

## What Worked Well
- Hierarchical component composition (`ConditionRowEditor`, `ValueInput`, `ConditionGroupEditor`) kept the complex builder modular and testable
- Dual-mode (visual/raw) toggle with a graceful fallback to raw mode on unparseable expressions gave users flexibility without requiring a perfect parser
- Defining operator maps per question type as constants made the contextual operator logic declarative and easy to extend
- The debounce layering was clean: 600ms in LogicEditor for validation feedback, 500ms in QuestionEditor for persistence — fast UI, fewer API calls
- Optimistic store updates (`updateQuestion` before PATCH completes) kept the UI snappy
- Empty-expression short-circuit (no validation call) was a pragmatic UX improvement that avoided spurious error states while editing

## What Was Challenging
- Building a bidirectional serializer/parser is inherently fragile; deciding where to draw the line (no parentheses support in visual mode) required explicit product tradeoff thinking
- Handling operator resets when a user switches the referenced question required validating the current operator against the new question type and falling back gracefully
- Testing async interactions involving both debounced validation and debounced persistence required careful use of `act()`, `waitFor()`, and real timers (`vi.useRealTimers()`) to avoid flaky results
- The mix of `userEvent` (semantic) and `fireEvent.change` (direct) in tests reflects real friction: semantic events don't always play well with debounced controlled inputs

## Key Technical Insights
1. When nesting UI state (group → conditions → rows), use a `depth` prop to enforce visual and logical limits rather than relying on runtime guards; this keeps recursive renderers predictable
2. Bidirectional expression serialization is best treated as two separate pure functions with a well-defined subset of supported syntax — anything outside that subset routes to raw mode, not an error state
3. Two debounce timers at different layers (validation vs. persistence) serve different UX goals and should not be collapsed into one; validation feedback should be faster than network writes
4. The MSW mock for `validate-expression` intentionally only checks non-empty strings — real semantic validation belongs to the backend; the mock's job is to confirm the HTTP contract, not business logic
5. Filtering previous questions by `sort_order` rather than position in the array is correct and future-proof since sort order can be reordered independently of array index

## Reusable Patterns
- **Debounced API validation with cleanup**: `useRef` timer + `clearTimeout` in cleanup function — ready to copy for any real-time validation scenario
- **Contextual operator map**: `Record<QuestionType, OperatorType[]>` lookup table — reusable pattern for any type-sensitive form field
- **Graceful parse fallback**: attempt parse → on failure, set mode to 'raw' and preserve the raw string — applicable to any visual-to-text round-trip editor
- **Optimistic store + debounced PATCH**: update Zustand immediately, schedule network write separately — established pattern in this codebase, follow it for all question property changes
- **Depth-limited recursive renderer**: pass `depth` prop through recursive component tree to cap nesting — cleaner than a global context or imperative guard

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/LogicEditor.tsx` — reference implementation for visual expression builders and dual-mode editors
- `frontend/src/components/survey-builder/QuestionEditor.tsx` — canonical example of the optimistic-store + debounced-PATCH pattern for question properties
- `frontend/src/services/surveyService.ts` — shows the standard shape for wrapping `apiClient` calls with typed payloads and responses
- `frontend/src/mocks/handlers.ts` — shows how to add MSW handlers for new endpoints; validate-expression handler is a minimal, correct example
- `frontend/src/components/survey-builder/__tests__/QuestionEditor.test.tsx` — shows how to test debounced + async store interactions with `act`, `waitFor`, and `vi.useRealTimers`

## Gotchas and Pitfalls
- Parentheses in an expression string must force raw mode — the visual parser does not support them; failing to gate on this causes silent data corruption when round-tripping
- `vi.useRealTimers()` must be called in `afterEach`, not just once — fake timers can leak across tests and cause intermittent failures in debounce-heavy test suites
- When switching the referenced question in a condition row, always reset the operator to the first valid one for the new question type; leaving a stale operator produces invalid serialized expressions
- The `validateExpression` mock always returns `valid: true` for non-empty strings — tests that verify error/warning display must override the handler with `server.use()` for that specific test
- LogicEditor receives `previousQuestions` as a flat array from QuestionEditor (flattened from groups); the filtering by `sort_order` happens inside LogicEditor, not at the call site — don't pre-filter before passing in