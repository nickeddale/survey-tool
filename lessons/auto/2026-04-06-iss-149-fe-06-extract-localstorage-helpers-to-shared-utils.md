---
date: "2026-04-06"
ticket_id: "ISS-149"
ticket_title: "FE-06: Extract localStorage helpers to shared utils"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "security", "documentation"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-06"
ticket_id: "ISS-149"
ticket_title: "FE-06: Extract localStorage helpers to shared utils"
categories: ["refactoring", "shared-utils", "testing", "frontend"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/pages/SurveyResponsePage.tsx"
  - "frontend/src/utils/localStorage.ts"
  - "frontend/src/utils/index.ts"
  - "frontend/src/utils/__tests__/localStorage.test.ts"
---

# Lessons Learned: FE-06: Extract localStorage helpers to shared utils

## What Worked Well
- The four helpers (`localStorageKey`, `getStoredResponseId`, `storeResponseId`, `clearStoredResponseId`) had clean, self-contained signatures with no internal dependencies on React or component state, making extraction straightforward with zero call-site changes.
- The try/catch error-suppression pattern (return `null` for getters, silent catch for setters/clearers) was already present in the original helpers — extraction preserved it verbatim, no redesign needed.
- `vi.spyOn(Storage.prototype, 'getItem'/'setItem'/'removeItem')` worked cleanly in Vitest's jsdom environment without any extra setup, covering both normal paths and thrown-error paths.
- Placing `vi.restoreAllMocks()` in a top-level `afterEach` (rather than per-describe block) was sufficient to prevent spy leakage across all test cases in the file.
- The barrel export in `utils/index.ts` followed the established named-re-export pattern (`export { ... } from './localStorage'`), consistent with the existing `cn` export and the `jwt.ts` pattern from ISS-028.
- `SurveyResponsePage.tsx` import swap was a single-line change (`../utils/localStorage`) with no functional change — existing integration tests served as a zero-effort regression gate.

## What Was Challenging
- Nothing was technically challenging. The main risk was accidental signature drift during extraction, but because the functions were pure string/localStorage operations, copy-paste fidelity was easy to verify by reading both files.

## Key Technical Insights
1. **Extraction prerequisite check**: Before extracting helpers, confirm they have no hidden coupling to module-level state, React context, or component props. Pure functions with only primitive arguments are safe to lift without wrapping.
2. **`Storage.prototype` spying in Vitest/jsdom**: `vi.spyOn(Storage.prototype, 'getItem')` intercepts `localStorage.getItem` calls globally in the test environment. This is the idiomatic approach — do not import or mock `localStorage` as an object directly.
3. **`afterEach(vi.restoreAllMocks)` placement**: A single `afterEach` at the top of the file (outside all `describe` blocks) is sufficient and cleaner than repeating it per-describe. Spy restoration is unconditional and order-independent.
4. **Named barrel exports preserve tree-shaking**: Using `export { fn1, fn2 } from './module'` (not `export * from './module'` or `export default`) keeps bundle analysis tools able to track individual symbol usage across the app.
5. **Regression gate via existing tests**: When refactoring an import path, the existing page-level integration tests are a free regression signal — run them unmodified and a passing result confirms the swap was transparent.

## Reusable Patterns
- **localStorage utility module shape**: one key-builder (`localStorageKey`), one getter with null-fallback, one setter with silent catch, one clearer with silent catch — all wrapping the single storage primitive in try/catch.
- **Spy-based localStorage unit tests**: `vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(value)` for happy path; `.mockImplementation(() => { throw new Error() })` for error path; `vi.restoreAllMocks()` in `afterEach`.
- **Barrel re-export line**: `export { localStorageKey, getStoredResponseId, storeResponseId, clearStoredResponseId } from './localStorage'` — explicit named list, not star export.
- **Import path after extraction**: `import { localStorageKey, getStoredResponseId, storeResponseId, clearStoredResponseId } from '../utils/localStorage'` (direct path in the page file, not via barrel, to keep the import origin explicit).

## Files to Review for Similar Tasks
- `frontend/src/utils/localStorage.ts` — canonical shape for a domain-specific localStorage utility module.
- `frontend/src/utils/__tests__/localStorage.test.ts` — canonical Vitest test structure for Storage.prototype spy-based tests with proper afterEach cleanup.
- `frontend/src/utils/index.ts` — barrel export pattern to follow when adding new utilities.
- `frontend/src/utils/jwt.ts` — parallel example of a shared utility extracted from a service layer, same error-suppression style.

## Gotchas and Pitfalls
- **Do not use `export * from './localStorage'`** in the barrel — it prevents static analysis tools from detecting unused exports and makes the public API of `utils/index.ts` implicit.
- **Spy restoration is mandatory**: Forgetting `vi.restoreAllMocks()` in `afterEach` causes `Storage.prototype` method spies to persist into subsequent test files loaded in the same Vitest worker, producing silent false-positives in tests that read real localStorage state.
- **Key format is a contract**: The string `survey_response_${surveyId}` is stored in users' browsers. Renaming or reformatting this key during extraction is a silent breaking change — in-progress responses in existing sessions become unreachable.
- **Import from direct path, not barrel, inside the same `utils/` directory**: `localStorage.ts` itself should never import from `utils/index.ts` (circular), and sibling utility files should import from each other directly.
- **Do not add a `mockReturnValue` default on `Storage.prototype`**: Each test should set up exactly the spy behaviour it needs; a shared `beforeEach` default masks tests that forget to configure the spy and passes vacuously.
```
