---
date: "2026-04-07"
ticket_id: "ISS-155"
ticket_title: "Fix validation util type mismatch (39 TS errors)"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-07"
ticket_id: "ISS-155"
ticket_title: "Fix validation util type mismatch (39 TS errors)"
categories: ["typescript", "type-safety", "frontend", "refactoring"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/utils/validation.ts", "frontend/src/utils/__tests__/validation.test.ts", "frontend/src/types/questionSettings.ts", "frontend/src/store/builderStore.ts", "frontend/src/types/index.ts"]
---

# Lessons Learned: Fix validation util type mismatch (39 TS errors)

## What Worked Well
- The implementation plan correctly identified the root cause: `question.settings` typed as `Record<string, unknown>` was incompatible with specific settings interfaces lacking index signatures
- Using a plain union type (`NumericSettings | DateSettings | FileUploadSettings | ...`) for `QuestionSettings` resolved assignability without requiring index signature additions to each member interface
- Prefixing unused params in `validateRadio`/`validateDropdown` with `_` suppressed TS6133 errors without altering call signatures
- Running `npm run build` before changes to capture the baseline error list made it straightforward to verify the fix was complete and non-regressive

## What Was Challenging
- The 2 TS6133 unused param errors appeared to be symptoms of a broader refactor rather than standalone issues — required careful inspection to confirm the functions were still live code before choosing `_` prefix over deletion
- Auditing all callers of `question.settings` after narrowing the type required a broad codebase search (not just the listed affected files) to catch any dynamic key access patterns that would break silently at runtime

## Key Technical Insights
1. TypeScript interfaces without an index signature are not assignable to `Record<string, unknown>` even if all their properties are compatible — the fix is to use the specific union type on the accepting side, not to add `[key: string]: unknown` to every interface (which would weaken type safety)
2. A plain union type (`A | B | C`) satisfies assignability from any of its members without requiring an intersection or index signature on any member
3. TS6133 unused param errors in validator functions are often a signal that the function signature drifted during refactoring — check whether the param was intentionally removed from the implementation or accidentally left in the signature
4. When narrowing a shared type like `question.settings`, dynamic key access patterns (`settings[someVar]`, `settings as Record<string, unknown>`) are the highest-risk callsites — they will not produce TS errors but can break at runtime

## Reusable Patterns
- **Union over index signature**: Prefer `type QuestionSettings = NumericSettings | DateSettings | FileUploadSettings` over adding `[key: string]: unknown` to each interface — preserves type safety at member level
- **Baseline diff workflow**: Run `npm run build` before any changes, save output, then diff after fix to confirm exactly the targeted errors are gone and no new ones introduced
- **`_` prefix for unused params**: Use `_settings` instead of removing the param to suppress TS6133 without breaking positional call sites
- **Broad usage audit after type narrowing**: After changing a shared settings type, grep for `.settings`, `settings[`, and `as Record<string` across the entire frontend to catch silent breakage
- **Test count sanity check**: After `npm run build` succeeds, run `npm run test:run` and verify test count matches expectations (56 validation tests) to confirm no tests were silently dropped

## Files to Review for Similar Tasks
- `frontend/src/types/questionSettings.ts` — defines the `QuestionSettings` union and all member interfaces; the canonical reference for settings types
- `frontend/src/utils/validation.ts` — internal validator function signatures must match the union type used in `question.settings`
- `frontend/src/store/builderStore.ts` — defines `BuilderQuestion`; `settings` field type here cascades to all test and component callsites
- `frontend/src/types/index.ts` — may re-export or augment types that affect assignability across the codebase

## Gotchas and Pitfalls
- Adding `[key: string]: unknown` to settings interfaces to satisfy `Record<string, unknown>` is tempting but wrong — it allows arbitrary key access and defeats the purpose of having typed settings
- Removing unused params (rather than prefixing with `_`) can silently break callers that pass arguments positionally, even if the value is unused inside the function
- Changing `question.settings` to a narrower union type without auditing all callsites can leave `as Record<string, unknown>` casts in place that suppress TS errors but cause runtime failures when the cast is later removed
- The TS2322 errors in test files are often caused by the test helper (`makeQuestion`) using a broad type for `settings` — fixing the production type alone may not resolve test errors if the helper has its own loose typing
```
