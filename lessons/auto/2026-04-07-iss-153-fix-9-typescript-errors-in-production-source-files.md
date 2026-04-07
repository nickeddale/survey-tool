---
date: "2026-04-07"
ticket_id: "ISS-153"
ticket_title: "Fix 9 TypeScript errors in production source files"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-07"
ticket_id: "ISS-153"
ticket_title: "Fix 9 TypeScript errors in production source files"
categories: ["typescript", "frontend", "build", "refactoring"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/utils/validation.ts"
  - "frontend/src/types/index.ts"
  - "frontend/src/components/responses/SurveyForm.tsx"
  - "frontend/src/components/survey-builder/LogicEditor.tsx"
  - "frontend/src/components/survey-builder/QuestionEditor.tsx"
  - "frontend/tsconfig.json"
---

# Lessons Learned: Fix 9 TypeScript errors in production source files

## What Worked Well
- The implementation plan accurately scoped all 9 errors before touching any code — reading first, then fixing, prevented surprises
- Fixes were mechanical and low-risk: underscore-prefix for unused params, removing duplicate exports, tsconfig lib bump, null guards
- Each error type had a clear canonical fix with no ambiguity about the correct approach
- Grouping errors by type (unused params, duplicate exports, missing lib target, wrong property, null safety) made the work feel systematic

## What Was Challenging
- The `ValidateExpressionResult` type did not have a `valid` boolean — the correct idiom (`errors.length === 0`) required reading the type definition rather than guessing
- `replaceAll` requiring ES2021 is non-obvious; ES2020 lib is close but missing several string methods added in ES2021
- Duplicate exports in `src/types/index.ts` required understanding which module was canonical (auth) before safely removing the re-exports

## Key Technical Insights
1. **Unused parameter convention:** TypeScript's `noUnusedParameters` flag is satisfied by prefixing with `_` — rename `s` → `_s`, not by removing the parameter entirely (which would break the function signature)
2. **ES2021 lib target for `replaceAll`:** `String.prototype.replaceAll` was introduced in ES2021. Adding `"ES2021"` to `tsconfig.json`'s `lib` array (alongside ES2020, DOM, DOM.Iterable) enables the type without changing the compilation target
3. **Duplicate re-exports cause TS errors:** If a barrel file (`index.ts`) re-exports a type that is also exported by an imported module already included in the barrel, TypeScript reports a duplicate identifier error — the fix is to remove the redundant explicit re-export
4. **Null guards vs non-null assertions:** Prefer `if (!selectedGroup) return` or optional chaining over `selectedGroup!` — the null check is safer and communicates intent
5. **Read the actual type before assuming property names:** `ValidateExpressionResult.valid` did not exist; always check the interface definition rather than assuming a boolean flag is present

## Reusable Patterns
- For unused callback parameters: `(_param: Type)` prefix suppresses the error while preserving arity
- For `replaceAll` / other ES2021+ string methods: ensure `tsconfig.json` `lib` includes `"ES2021"` or the specific `"ES2021.String"` lib entry
- For barrel file duplicate exports: search `src/types/index.ts` for any name that also appears in a re-exported module's own exports — remove the duplicate from the barrel
- For `possibly null` errors: prefer early-return null guard over optional chaining when the null case means the whole render/function should bail

## Files to Review for Similar Tasks
- `frontend/tsconfig.json` — lib target controls which built-in type definitions are available; check here first for "method does not exist" errors on standard types
- `frontend/src/types/index.ts` — barrel file prone to accumulating duplicate exports as types migrate between modules
- `frontend/src/types/auth.ts` — canonical home for ApiKey* types
- Any component using `ExpressionDisplay` — the `value` prop is required; check all call sites when the interface changes

## Gotchas and Pitfalls
- Do not conflate TypeScript `target` and `lib` in tsconfig — `target` controls output syntax, `lib` controls which type definitions are included. `replaceAll` is a type issue (lib), not a transpilation issue (target)
- Removing a parameter entirely to fix "unused parameter" breaks callers passing positional args — always use the underscore prefix instead
- When fixing duplicate exports in a barrel, verify the remaining export path still resolves correctly for all importers — the type must still be reachable via the barrel after removal
- `ValidateExpressionResult` returning `errors: string[]` rather than `valid: boolean` is a deliberate API shape; do not add a `valid` computed property to the type — derive it at the call site
```
