---
date: "2026-04-16"
ticket_id: "ISS-258"
ticket_title: "Matrix Dynamic: frontend/backend settings key name mismatch prevents settings from saving"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-16"
ticket_id: "ISS-258"
ticket_title: "Matrix Dynamic: frontend/backend settings key name mismatch prevents settings from saving"
categories: ["frontend", "type-safety", "api-contract", "bug-fix", "matrix-question"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/types/questionSettings.ts"
  - "frontend/src/components/question-inputs/MatrixDynamicInput.tsx"
  - "frontend/src/components/survey-builder/settings/MatrixSettingsForm.tsx"
  - "frontend/src/components/survey-builder/previews/MatrixPreview.tsx"
  - "frontend/src/components/question-inputs/__tests__/MatrixDynamicInput.test.tsx"
  - "frontend/src/components/survey-builder/__tests__/QuestionSettingsForm.test.tsx"
  - "frontend/src/components/survey-builder/__tests__/QuestionPreview.test.tsx"
---

# Lessons Learned: Matrix Dynamic: frontend/backend settings key name mismatch prevents settings from saving

## What Worked Well
- The implementation plan accurately identified all affected files upfront, making the rename mechanical and complete.
- Using `replace_all` in the Edit tool ensured no partial occurrences were missed within individual files.
- Running `npm run build` before `npm run test:run` surfaced TypeScript errors from missed renames with clear, actionable messages rather than cryptic runtime failures.
- Grepping for old key names (`row_count`, `min_row_count`, `max_row_count`) across `frontend/src` after each rename step caught stray references before tests ran.
- The fix was self-contained to the frontend — no backend changes were needed since backend keys were already correct.

## What Was Challenging
- The mismatch was silent at runtime: the backend accepted the payload without error, simply ignoring unknown keys, so no error surfaced to the user or developer.
- Tests using loose typing (`as any` casts) would not have caught the mismatch — only a full TypeScript build or an explicit network payload assertion would expose it.
- The root cause blocked two separate downstream tickets (ISS-254, ISS-256), meaning the symptom (constraints not enforced) appeared unrelated to the actual cause (settings never persisted).

## Key Technical Insights
1. Frontend/backend API contracts for settings objects are not enforced at the HTTP boundary — the backend silently drops unrecognized keys. This makes key name mismatches a class of bug that only surfaces as a behavioral regression, not an error.
2. TypeScript interfaces define compile-time shape but do not prevent runtime emission of old keys if objects were constructed before the type change or cast with `as any`. A TypeScript build passing is necessary but not sufficient — explicit negative assertions in tests are also needed.
3. When settings default to `null` because they never persist, fallback values in the component mask the bug: the UI appears functional (using hardcoded defaults) while the actual saved state is always empty.
4. Renaming interface keys in a TypeScript project is safe to do mechanically using `replace_all` followed by a Grep verification step — the compiler enforces correctness at every usage site.

## Reusable Patterns
- **Rename checklist**: When renaming interface keys, follow this sequence: (1) update the interface, (2) update the `getDefaultSettings` factory, (3) update all read sites in components, (4) update all write/emit sites, (5) update test fixtures, (6) Grep for old names, (7) `npm run build`, (8) `npm run test:run`.
- **Negative assertions in tests**: After renaming keys used in `onChange` or save payloads, add an explicit assertion that the old key name is absent from the emitted object. Field renaming in a fixture does not guarantee the old key is gone from serialized output.
- **Build before test**: Always run `npm run build` as the authoritative type check before running Vitest. TypeScript errors from renamed keys surface more clearly at build time than as Vitest runtime failures.
- **Grep verification step**: After each rename pass, run `Grep` for the old key names across `frontend/src` to catch any missed references in utility files, hooks, or mock handlers.
- **Backend-authoritative naming**: When frontend and backend key names diverge, prefer renaming the frontend to match the backend. Backend validation logic is already written against its own key names and changes there risk breaking persistence or validation silently.

## Files to Review for Similar Tasks
- `frontend/src/types/questionSettings.ts` — central interface definitions for all question settings; the single source of truth for key names used in the frontend.
- `frontend/src/components/question-inputs/MatrixDynamicInput.tsx` — reads settings keys at runtime; must stay in sync with the interface.
- `frontend/src/components/survey-builder/settings/MatrixSettingsForm.tsx` — emits `onChange` with settings keys; a mismatch here means settings are never correctly written.
- `backend/app/services/validators/matrix_validators.py` — defines which keys the backend actually reads; the authoritative source for correct key names.

## Gotchas and Pitfalls
- The backend silently ignores unrecognized keys in settings payloads — there is no 422 or warning. A mismatch will never produce an HTTP error, only a behavioral regression where settings appear to save but have no effect.
- If a component has hardcoded fallback values for settings fields, the mismatch is further masked: the UI renders correctly in default state, and the bug only surfaces when a user explicitly changes a setting and expects it to persist.
- Test fixtures that construct settings objects with old key names will pass TypeScript checks if the fixture uses a cast (`as MatrixDynamicSettings` after the type is updated will fail, but `as any` will not). Always avoid `as any` in test fixtures for settings objects.
- `vi.useFakeTimers()` in any test in the same suite will silently time out MSW-backed async tests if `vi.useRealTimers()` is not called in `afterEach`. If MSW-dependent tests start hanging after a timer-based test is added nearby, check for missing timer cleanup.
```
