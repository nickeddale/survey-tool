---
date: "2026-04-07"
ticket_id: "ISS-161"
ticket_title: "Builder: Add Question dropdown causes navigation away from builder"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "performance", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-07"
ticket_id: "ISS-161"
ticket_title: "Builder: Add Question dropdown causes navigation away from builder"
categories: ["frontend", "radix-ui", "react", "testing", "bug-fix"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/src/components/survey-builder/BuilderToolbar.tsx
  - frontend/src/components/survey/GroupPanel.tsx
  - frontend/src/components/survey-builder/QuestionPalette.tsx
  - frontend/src/components/survey-builder/SortableGroupPanel.tsx
  - frontend/src/components/survey-builder/SurveyCanvas.tsx
  - frontend/src/components/survey-builder/__tests__/BuilderToolbar.test.tsx
  - frontend/src/components/survey-builder/__tests__/QuestionPalette.test.tsx
---

# Lessons Learned: Builder: Add Question dropdown causes navigation away from builder

## What Worked Well
- The implementation plan correctly identified the root cause (Radix UI asChild nesting conflict) before touching code
- Existing patterns from the DnD ticket (ISS-041) were directly reusable for dnd-kit mocking strategy
- Extracting `handleAddQuestion` as a testable unit (pure function or near-pure) made testing straightforward without mounting the full SurveyCanvas
- The fix was surgical: restructuring JSX nesting and adding `type='button'` without touching unrelated logic

## What Was Challenging
- The navigation bug was non-obvious — the symptom (navigation to dashboard) masked the true cause (Radix UI `asChild` double-nesting causing the trigger to render as an anchor or form submit element)
- GroupPanel and SortableGroupPanel already had dnd-kit hooks wired in from a prior ticket, requiring module-level mocks in every new test file touching those components
- Timer and act() hygiene across the new test files required discipline — both pitfalls were inherited from the DnD ticket's lessons

## Key Technical Insights
1. **Radix UI `asChild` double-nesting is silently destructive**: When a `TooltipTrigger asChild` wraps a `DropdownMenuTrigger asChild`, Radix merges props in unexpected ways, causing the rendered element to behave as a navigation link rather than a menu trigger. The fix is to never nest two `asChild` components — restructure so `DropdownMenuTrigger asChild` wraps the `Button` directly, and place `Tooltip` outside `DropdownMenu` or omit it from the trigger entirely.
2. **`type='button'` is mandatory on any `<Button>` inside or near a form context**: Without it, browsers default to `type='submit'`, which can trigger form submission or navigation depending on the surrounding DOM structure.
3. **dnd-kit hooks (`useSortable`, `useDroppable`) throw in JSDOM**: Any test rendering `GroupPanel`, `SortableGroupPanel`, or `SurveyCanvas` must mock `@dnd-kit/sortable` and `@dnd-kit/core` at module level or tests will fail with hook errors.
4. **Fake timer leakage silently kills MSW tests**: A `vi.useFakeTimers()` call not cleaned up with `vi.useRealTimers()` in `afterEach` causes all subsequent tests relying on MSW promise resolution to time out with no meaningful error.
5. **`act()` wrapping is required for all `userEvent` pointer interactions**: Missing `act()` wrappers produce warnings that contaminate downstream `renderHook` calls and can cause false failures.

## Reusable Patterns
- **dnd-kit module mock (copy-paste for any test touching GroupPanel/SortableGroupPanel/SurveyCanvas)**:
  ```ts
  vi.mock('@dnd-kit/sortable', () => ({
    useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: null, isDragging: false }),
    SortableContext: ({ children }: { children: React.ReactNode }) => children,
  }))
  vi.mock('@dnd-kit/core', () => ({
    DndContext: ({ children }: { children: React.ReactNode }) => children,
    closestCenter: vi.fn(),
    PointerSensor: vi.fn(),
    useSensor: vi.fn(),
    useSensors: vi.fn(() => []),
  }))
  ```
- **Navigation guard assertion in BuilderToolbar tests**: mock `useNavigate`, click the dropdown trigger, assert `navigate` was NOT called and the dropdown content is present in the DOM.
- **Timer hygiene template**:
  ```ts
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })
  ```
- **Handler extraction for testability**: Define `handleAddQuestion(groupId, questionType, service, dispatch)` as a standalone function (not a closure) so it can be unit-tested by calling it directly without rendering SurveyCanvas.

## Files to Review for Similar Tasks
- `frontend/src/components/survey-builder/BuilderToolbar.tsx` — Radix UI Tooltip + DropdownMenu composition pattern
- `frontend/src/components/survey-builder/SurveyCanvas.tsx` — `handleAddQuestion` handler and prop threading to child panels
- `frontend/src/components/survey-builder/SortableGroupPanel.tsx` — prop threading pattern for dnd-kit-wrapped panels
- `frontend/src/components/survey/GroupPanel.tsx` — `onAddQuestion` prop wiring and '+' button handler
- `frontend/src/components/survey-builder/__tests__/BuilderToolbar.test.tsx` — reference for Radix UI dropdown testing with mocked navigate and surveyService

## Gotchas and Pitfalls
- **Never nest two Radix UI `asChild` components** — the outer `asChild` will merge props onto the inner component's rendered element, producing undefined behavior including accidental navigation.
- **Always add `type='button'` to `<Button>` elements used as Radix UI trigger targets** — omitting it leaves the default as `type='submit'` which can cause form navigation.
- **All test files rendering GroupPanel, SortableGroupPanel, or SurveyCanvas require dnd-kit mocks** — there is no way around this without refactoring those components to inject dnd-kit as a dependency.
- **`vi.useFakeTimers()` must always be paired with `vi.useRealTimers()` in `afterEach`** — a leaked fake timer in one `describe` block will silently break MSW-dependent tests in all subsequent blocks in the same file.
- **Wrap every `userEvent` call in `act()`** — this is especially important for pointer/click simulations on Radix UI components that trigger internal state transitions.
- **The QuestionPalette had no `onClick` handlers before this ticket** — drag-to-add was listed as planned but unimplemented; the fix added `onAddQuestion` prop wiring, which is the canonical path for future question-type additions.
```
