---
date: "2026-04-02"
ticket_id: "ISS-048"
ticket_title: "3.12: Undo/Redo Support"
categories: ["testing", "api", "ui", "bug-fix", "feature", "performance", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-048"
ticket_title: "3.12: Undo/Redo Support"
categories: ["state-management", "keyboard-shortcuts", "ui-toolbar", "autosave"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/store/builderStore.ts"
  - "frontend/src/pages/SurveyBuilderPage.tsx"
  - "frontend/src/store/__tests__/builderStore.test.ts"
  - "frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx"
---

# Lessons Learned: 3.12: Undo/Redo Support

## What Worked Well
- The undo/redo state infrastructure (undoStack, redoStack, pushUndo helper, snapshot deep-copy) was already in place in builderStore.ts, meaning the ticket was primarily a UI and wiring task rather than core algorithm work.
- Using `JSON.parse(JSON.stringify(...))` as the snapshot strategy is simple, reliable, and avoids reference aliasing issues with Immer-managed state. No third-party undo library was needed.
- The `pushUndo` helper being called at the top of every mutating action (addGroup, removeGroup, updateGroup, reorderGroups, addQuestion, etc.) ensures every meaningful change is captured consistently without action-by-action bookkeeping.
- Capping the undo stack at 50 entries with a `shift()` on overflow is straightforward and sufficient for the use case.
- The `undoRedoPendingRef` ref pattern cleanly bridges the gap between the store's synchronous `saveStatus = 'saving'` signal and the component's autosave side-effect without requiring extra store state.
- Keyboard shortcut guard against INPUT/TEXTAREA/contenteditable targets prevents undo from firing while the user is typing in the property editor.
- Disabling undo/redo buttons for read-only (non-draft) surveys by gating the entire toolbar section behind `!readOnly` was the right approach — no orphaned buttons.

## What Was Challenging
- Autosave integration after undo/redo required a two-part coordination: the store sets `saveStatus = 'saving'` as a signal, and the component watches for that in a `useEffect` gated by `undoRedoPendingRef.current`. This indirect coupling works but is not immediately obvious — a future reader must trace the ref to understand the flow.
- The redo action in builderStore.ts pushes the current state onto `undoStack` before restoring the next state (`state.undoStack.push(snapshot(state.groups))`). This is correct but subtle: it means redo is also undoable, which is the expected behaviour but easy to miss during code review.
- The `redoStack.length` and `undoStack.length` are referenced inside the `useEffect` dependency array for the keyboard shortcut listener. Because these are primitive values derived from array length, they update correctly, but including the arrays themselves would cause unnecessary re-subscriptions.

## Key Technical Insights
1. **Snapshot scope matters**: Only `groups` is snapshotted (not `selectedItem`, `saveStatus`, etc.), which is intentional. UI-only state should not be restored by undo — restoring `selectedItem` would be confusing if the previously selected item no longer exists after undo.
2. **`pushUndo` clears `redoStack`**: This is the standard contract — any new action after an undo discards the redo history. The `pushUndo` helper enforces this in one place, ensuring no action accidentally preserves a stale redo stack.
3. **Autosave signal via status field**: Rather than calling an autosave function directly from the store (which would create a dependency on async service code), the store sets `saveStatus = 'saving'` as a declarative signal. The component's existing autosave `useEffect` reacts to this, keeping the store free of side effects.
4. **`useRef` for cross-render coordination**: `undoRedoPendingRef` is a ref (not state) because its value does not need to trigger a re-render — it only needs to be readable by the autosave effect. Using state here would cause an extra render cycle.
5. **`fireEvent.keyDown(window, ...)` vs `fireEvent.keyDown(element, ...)`**: Keyboard shortcut tests must dispatch to `window` to simulate the global listener. Dispatching to a specific element tests the guard logic (input suppression), not the shortcut itself.

## Reusable Patterns
- **Pending-ref + status signal pattern** for triggering side effects after store actions without introducing async code into the store: set a status field in the store action, set a ref flag in the caller, and check both in a `useEffect`.
- **`pushUndo` helper called at top of every mutating action**: Centralises snapshot creation and redo-stack clearing. Any new builder action should follow this same pattern.
- **Gating keyboard shortcuts by `readOnly`**: Return early from the `useEffect` when `readOnly` is true so the listener is never attached, rather than attaching it and checking `readOnly` inside the handler.
- **`data-testid` on toolbar buttons** with ARIA `aria-label` containing the keyboard shortcut hint (`"Undo (Ctrl+Z)"`) doubles as tooltip text and accessible label — no separate tooltip component needed.
- **Input-target guard for global keyboard shortcuts**: Check `target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable` before acting on any global `keydown` listener to avoid interfering with form fields.

## Files to Review for Similar Tasks
- `frontend/src/store/builderStore.ts` — snapshot, pushUndo, undo, redo implementations; 50-entry cap; saving signal pattern.
- `frontend/src/pages/SurveyBuilderPage.tsx` — `undoRedoPendingRef`, keyboard shortcut `useEffect`, autosave `useEffect`, toolbar button gating with `!readOnly`.
- `frontend/src/store/__tests__/builderStore.test.ts` — full undo/redo unit test coverage including autosave signal, empty stack no-ops, and 50-entry cap.
- `frontend/src/pages/__tests__/SurveyBuilderPage.test.tsx` — toolbar button render/disable tests, keyboard shortcut integration tests, input-suppression test.

## Gotchas and Pitfalls
- **Do not snapshot the entire store state**: Restoring `saveStatus`, `selectedItem`, or `isLoading` via undo would produce confusing, incorrect behaviour. Snapshot only the user-facing survey structure (`groups`).
- **The redo action is itself undoable**: `redo()` pushes the current state onto `undoStack` before applying the redo snapshot. This is correct but means the undo stack grows on both undo and redo operations — keep this in mind when reasoning about stack depth.
- **`undoStack.length` in the keyboard shortcut `useEffect` deps**: The shortcut handler checks `undoStack.length > 0` before calling `undo()` to avoid setting `saveStatus = 'saving'` unnecessarily (the store guards against empty-stack calls, but the ref flag would still be set, leading to a spurious `setSaveStatus('saved')` call).
- **Autosave effect ordering**: The autosave `useEffect` (`saveStatus === 'saving' && undoRedoPendingRef.current`) must run after the store has updated. If the dependency array omits `saveStatus`, the effect will not fire. Confirm `saveStatus` is in the deps array when modifying this code.
- **Read-only surveys**: Undo/redo buttons and keyboard shortcuts are suppressed entirely for non-draft surveys. Any future toolbar additions should follow the same `!readOnly` gating pattern to stay consistent.
```
