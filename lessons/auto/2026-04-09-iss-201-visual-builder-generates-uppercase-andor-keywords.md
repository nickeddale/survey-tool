---
date: "2026-04-09"
ticket_id: "ISS-201"
ticket_title: "Visual builder generates uppercase AND/OR keywords not recognized by parser"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-09"
ticket_id: "ISS-201"
ticket_title: "Visual builder generates uppercase AND/OR keywords not recognized by parser"
categories: ["frontend", "expression-engine", "serialization", "testing"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/survey-builder/logic/expressionUtils.ts"
  - "backend/app/services/expressions/lexer.py"
  - "frontend/src/components/survey-builder/__tests__/expressionUtils.test.ts"
  - "frontend/src/components/survey-builder/logic/__tests__/expressionUtils.test.ts"
---

# Lessons Learned: Visual builder generates uppercase AND/OR keywords not recognized by parser

## What Worked Well
- The root cause was immediately obvious from the bug description: a single `.toUpperCase()` call in the serialization layer produced output the backend lexer could not accept.
- The fix was minimal and targeted — changing `.toUpperCase()` to `.toLowerCase()` in two lines resolved the core issue without ripple effects.
- The backend lexer was already written defensively: `_scan_keyword_or_identifier` normalized the scanned word via `word.lower()` before all keyword lookups, making it naturally case-insensitive. No backend change was required.
- Frontend `parseExpression` used case-insensitive regex (`/ AND /i`, `/ OR /i`) for splitting, so round-trip parsing already tolerated mixed case — only the serialization direction was broken.
- Two separate test files covered `serializeGroup` and `serializeRootGroup` with explicit assertions that output must not contain `'AND'` or `'OR'` (uppercase), and positive assertions that output contains the lowercase forms.

## What Was Challenging
- Nothing was particularly challenging. The fix was a one-character string method swap. The main risk was verifying that no other code paths depended on uppercase output (e.g., MSW mock handlers, seed data, import tools), but a grep confirmed no uppercase keyword strings were present in the test suite.
- The implementation plan warned about existing MSW handler strings potentially containing uppercase keywords — this was worth verifying but turned out not to be an issue.

## Key Technical Insights
1. **Serializer is the canonical source of truth for case.** The frontend serialization layer (`expressionUtils.ts`) controls what the backend receives. Any case mismatch between serializer output and parser expectations is a contract violation that manifests only at runtime, not in isolated unit tests.
2. **Backend lexer normalization provides a safety net.** Using `word.lower()` at the single keyword lookup site (rather than duplicating uppercase variants in keyword tables) means the backend lexer is inherently case-insensitive and resilient to future case bugs from any code path.
3. **The frontend parser was already case-insensitive.** `parseExpression` used `/AND/i` regex, meaning it could round-trip uppercase expressions without error — this masked the underlying issue from frontend-only tests and deferred the failure to the backend parse boundary.
4. **Two-sided round-trip testing catches serialization bugs.** Having both `serialize → parse` and `parse → serialize` round-trip tests in the test suite ensures that output format changes in either direction are caught immediately.
5. **Negative assertions complement positive ones.** Tests asserting `.not.toContain('AND')` explicitly document the contract that uppercase is forbidden, not just that lowercase is present — useful for future maintainers changing serialization logic.

## Reusable Patterns
- **Single normalization point in the lexer:** Apply `word.lower()` once before all keyword table lookups rather than expanding tables with uppercase variants. This keeps keyword tables compact and the lexer inherently case-insensitive.
- **Explicit negative case assertions in serializer tests:** Always add `expect(output).not.toContain('AND')` / `.not.toContain('OR')` alongside the positive assertion. This makes the lowercase contract explicit and not accidental.
- **Cross-layer contract tests:** When a frontend serializer feeds a backend parser, add at least one integration-style test that confirms the serializer output is accepted by the parser (or passes through a validation endpoint). Pure unit tests of each side in isolation can miss case-mismatch contracts.
- **Grep for uppercase keywords in test fixtures before shipping:** When fixing a serialization case bug, grep test files and mock handlers for the old (incorrect) format before closing the ticket.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/logic/expressionUtils.ts` — all serializer functions; any `.toUpperCase()` or `.toLowerCase()` calls on logic keywords should be audited when adding new keywords.
- `backend/app/services/expressions/lexer.py` — `_scan_keyword_or_identifier()`; the `lower = word.lower()` line at L389 is the single normalization point. Any new keyword tables added here must use lowercase entries.
- `frontend/src/components/survey-builder/__tests__/expressionUtils.test.ts` — the comprehensive test suite covering all serializer/parser paths including round-trips.
- `frontend/src/components/survey-builder/logic/__tests__/expressionUtils.test.ts` — colocated test file with explicit uppercase-negative assertions.

## Gotchas and Pitfalls
- **Frontend parser masks serializer bugs.** Because `parseExpression` uses case-insensitive regex to split on AND/OR, serializing with uppercase keywords and immediately parsing them on the frontend appears to work correctly. The failure only surfaces when the expression is submitted to the backend. Do not rely on frontend parse success as proof that serializer output is correct.
- **MSW mock handlers can silently contain stale formats.** If any mock handler returns an expression string in the old (uppercase) format, frontend tests will pass against the stale mock while the real backend rejects the same value. Always grep mock handlers for hardcoded expression strings when changing serialization format.
- **`.toUpperCase()` on enum/union type values is a common pitfall.** The `logic` field is typed as `'and' | 'or'` — calling `.toUpperCase()` on it compiles without error (it returns `string`) but silently violates the downstream contract. Prefer `.toLowerCase()` for keyword normalization, or assert the value against a set of known-lowercase constants.
- **Two separate test files exist for `expressionUtils`.** One is colocated with the source (`logic/__tests__/`) and one lives in the parent `__tests__/` directory. Both must be kept in sync when adding or changing serializer behavior.
```
