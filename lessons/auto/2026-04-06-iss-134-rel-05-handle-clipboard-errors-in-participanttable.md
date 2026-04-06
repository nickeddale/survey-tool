---
date: "2026-04-06"
ticket_id: "ISS-134"
ticket_title: "REL-05: Handle clipboard errors in ParticipantTable"
categories: ["testing", "database", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-134"
ticket_title: "REL-05: Handle clipboard errors in ParticipantTable"
categories: ["frontend", "error-handling", "accessibility", "clipboard"]
outcome: "success"
complexity: "low"
files_modified:
  - "frontend/src/components/participants/ParticipantTable.tsx"
  - "frontend/src/pages/ParticipantsPage.tsx"
  - "frontend/src/components/participants/__tests__/ParticipantTable.test.tsx"
  - "frontend/src/pages/__tests__/ParticipantsPage.test.tsx"
---

# Lessons Learned: REL-05: Handle clipboard errors in ParticipantTable

## What Worked Well
- The existing `SaveIndicator` error pattern (`text-destructive` + `AlertCircle` icon + `aria-live`) provided a clear, in-codebase precedent to follow, removing guesswork about styling and accessibility conventions
- Scoping error state locally with `useState` per component kept changes self-contained and avoided prop-drilling or global state changes
- Auto-clearing the error after 3 seconds with `setTimeout` (mirroring the success state reset pattern) produced a clean UX without extra teardown complexity

## What Was Challenging
- Identifying whether the clipboard rejection path lived in `CopyButton` inside `ParticipantTable.tsx` or in `handleCopyLink` inside `ParticipantsPage.tsx` required reading both files before deciding where to apply changes
- The `.catch(() => {})` silent-swallow pattern is easy to miss during review since it is syntactically minimal; searching for it explicitly (e.g., `.catch(() => {})`) is necessary

## Key Technical Insights
1. `navigator.clipboard.writeText` returns a Promise that can reject (e.g., permissions denied, insecure context); any call site using `.catch(() => {})` silently drops these failures and must be audited
2. Inline `role="alert"` with `aria-live="assertive"` is the correct pattern for transient, user-triggered error messages — it announces to screen readers without requiring focus movement
3. Converting an event handler to `async`/`await` to catch clipboard errors is cleaner than chaining `.catch()` and makes error-state assignment straightforward
4. Auto-clearing error state via `setTimeout` requires cleanup (`clearTimeout`) in a `useEffect` return or equivalent to avoid setting state on an unmounted component

## Reusable Patterns
- **Clipboard error state pattern**: `const [copyError, setCopyError] = useState(false)` → `async` handler → `try { await navigator.clipboard.writeText(...) } catch { setCopyError(true); setTimeout(() => setCopyError(false), 3000) }` → conditional render of `<span role="alert" aria-live="assertive" className="text-destructive">...</span>`
- **Inline transient error UI**: `AlertCircle` icon + `text-destructive` class + `role="alert"` is the established in-codebase pattern for non-modal, inline errors (see `SaveIndicator`)
- **Test pattern for clipboard failure**: `Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) }, writable: true })` → render component → click copy trigger → assert error element appears in DOM

## Files to Review for Similar Tasks
- `frontend/src/components/participants/ParticipantTable.tsx` — `CopyButton` component and `handleCopyLink` for the implemented pattern
- `frontend/src/pages/ParticipantsPage.tsx` — secondary clipboard call site
- Any component containing `.catch(() => {})` on a `navigator.clipboard` call is a candidate for the same treatment

## Gotchas and Pitfalls
- Searching only `ParticipantTable.tsx` is insufficient — clipboard calls may also exist in the parent page component; always grep for `navigator.clipboard` across the feature's file set
- `navigator.clipboard` is `undefined` in non-HTTPS contexts and in jsdom without explicit mocking; tests must define it on `navigator` before rendering
- Do not rely on the copy success state (e.g., showing a checkmark) to infer that no error occurred — the error state must be tracked independently
- `setTimeout` inside an event handler without cleanup can call `setState` after unmount; prefer tracking the timeout ref and clearing it in a `useEffect` cleanup
```
