# Milestone 3: Survey Builder UI

## Overview

This milestone delivers the drag-and-drop survey builder -- the central feature of the web UI. The builder provides a three-panel layout: a question type palette on the left, the survey canvas in the center showing question groups and their questions, and a properties editor on the right for configuring the selected question or group.

Users can create question groups, add questions of any type, reorder groups and questions via drag-and-drop (powered by @dnd-kit), configure question properties and answer options, preview questions as respondents would see them, and preview the entire survey flow. The builder auto-saves changes and supports undo/redo for editing actions.

This milestone transforms the platform from a purely API-driven tool into a visual survey authoring environment, making it accessible to non-technical users who prefer a graphical interface over programmatic survey creation.

## Prerequisites

- Milestone 1 (Backend Foundation) must be complete -- all CRUD endpoints for surveys, groups, questions, and answer options.
- Milestone 2 (Frontend Foundation) must be complete -- auth, routing, layout, API client, and stores.

## Success Criteria

- User can open the survey builder and see the three-panel layout.
- Question groups can be created, renamed, reordered (drag-and-drop), and deleted.
- Questions can be added from the type palette, reordered within and between groups, and deleted.
- Selecting a question opens the property editor with type-specific settings.
- Answer options can be added, edited, reordered, and deleted for choice-type questions.
- Question preview renders each question type as the respondent would see it.
- Full survey preview mode walks through the survey page by page.
- Changes auto-save with a visible save indicator.
- Undo/redo reverts and replays builder actions.

## Architecture Notes

- **@dnd-kit**: Use `@dnd-kit/core` for the drag-and-drop framework and `@dnd-kit/sortable` for sortable lists. Groups and questions are separate sortable contexts. Questions support cross-container dragging (between groups).
- **State management**: The builder uses a dedicated Zustand store (or extends `surveyStore`) to hold the full survey structure in memory. Changes are tracked locally and synced to the backend via auto-save.
- **Auto-save**: Debounced PATCH/POST calls triggered on state changes. A save indicator shows "Saving...", "Saved", or "Error" status.
- **Undo/redo**: Maintain a history stack of state snapshots. Ctrl+Z/Cmd+Z for undo, Ctrl+Shift+Z/Cmd+Shift+Z for redo.

## Tasks

### Task 3.1: Survey Builder Page Layout and State Management
**Estimated Complexity:** Large
**Dependencies:** None (builds on M2 infrastructure)

**Description:**
Create `src/pages/SurveyBuilderPage.tsx` with the three-panel layout: a narrow left panel for the question type palette, a wide center panel for the survey canvas, and a right panel for the property editor. The page fetches the full survey structure on mount using `GET /api/v1/surveys/{id}?include=full` and loads it into a builder-specific Zustand store.

Create the builder store (`src/store/builderStore.ts`) that holds the complete survey structure: survey metadata, groups (with sort_order), questions (nested within groups, with sort_order), and answer options. The store provides actions for all builder operations: addGroup, removeGroup, updateGroup, reorderGroups, addQuestion, removeQuestion, updateQuestion, moveQuestion, reorderQuestions, addOption, removeOption, updateOption, reorderOptions, setSelectedItem, and undo/redo.

**Acceptance Criteria:**
- [ ] Builder page loads at route `/surveys/:id/builder`
- [ ] Three-panel layout renders with resizable or fixed-width panels
- [ ] Survey data is fetched and loaded into the builder store on mount
- [ ] Builder store holds the full nested survey structure
- [ ] Selected item (group or question) state is tracked for the property editor
- [ ] Builder shows the survey title and status in a top bar
- [ ] Non-draft surveys show a read-only indicator and disable editing

**Technical Notes:**
- Route: `/surveys/:id/builder`
- Builder store should be separate from the dashboard survey store to avoid conflicts
- Use `useParams()` to get the survey ID and fetch on mount
- Consider `immer` middleware for Zustand to simplify nested state updates
- Files: `src/pages/SurveyBuilderPage.tsx`, `src/store/builderStore.ts`

---

### Task 3.2: Question Group Panel (List, Add, Reorder, Delete)
**Estimated Complexity:** Medium
**Dependencies:** Task 3.1

**Description:**
Create `src/components/survey-builder/GroupPanel.tsx` that renders a question group as a collapsible panel in the survey canvas. Each group shows its title, a drag handle, an expand/collapse toggle, a count of questions, and action buttons (rename, delete). Groups are rendered in `sort_order` sequence.

Add an "Add Group" button at the bottom of the canvas that creates a new group via `POST /api/v1/surveys/{survey_id}/groups` and appends it to the builder store. Implement inline title editing (click title to edit, press Enter or blur to save). Implement delete with a confirmation dialog that warns about cascading question deletion.

**Acceptance Criteria:**
- [ ] Groups are rendered as collapsible panels ordered by `sort_order`
- [ ] Each group shows its title, question count, and drag handle
- [ ] "Add Group" button creates a new group and adds it to the canvas
- [ ] Group title is editable inline (click to edit, Enter to save)
- [ ] Delete button shows confirmation dialog mentioning question cascade
- [ ] Groups can be expanded/collapsed to show/hide their questions
- [ ] Empty groups show an "Add questions here" placeholder

**Technical Notes:**
- Use shadcn/ui Collapsible or Accordion for expand/collapse
- Inline editing: toggle between a `<span>` and an `<Input>` on click
- Delete calls `DELETE /api/v1/surveys/{survey_id}/groups/{id}` and removes from store
- Title save calls `PATCH /api/v1/surveys/{survey_id}/groups/{id}`
- Files: `src/components/survey-builder/GroupPanel.tsx`

---

### Task 3.3: Drag-and-Drop for Group Reordering
**Estimated Complexity:** Medium
**Dependencies:** Task 3.2

**Description:**
Install `@dnd-kit/core` and `@dnd-kit/sortable` and implement drag-and-drop reordering for question groups. Wrap the group list in a `DndContext` with a `SortableContext`. Each `GroupPanel` becomes a sortable item with a drag handle. When a group is dropped in a new position, update the `sort_order` values in the builder store and call `PATCH /api/v1/surveys/{survey_id}/groups/reorder` to persist the change.

Implement visual feedback during drag: a drag overlay showing a miniature version of the group being dragged, and a drop indicator showing where the group will land.

**Acceptance Criteria:**
- [ ] Groups can be reordered by dragging the drag handle
- [ ] Drag overlay shows a preview of the group being moved
- [ ] Drop indicator shows the insertion point
- [ ] After drop, sort_order values are updated in the store and synced to the backend
- [ ] Reorder API call uses `PATCH /surveys/{survey_id}/groups/reorder`
- [ ] Animation smoothly transitions groups to their new positions
- [ ] Keyboard accessibility: groups can be reordered with keyboard

**Technical Notes:**
- `@dnd-kit/sortable` provides `useSortable` hook for each group
- Use `DragOverlay` component for the drag preview
- `arrayMove` utility from `@dnd-kit/sortable` for reordering the array
- After reorder, map new array positions to `sort_order` values and call the reorder API
- Files: `src/pages/SurveyBuilderPage.tsx` (DndContext), `src/components/survey-builder/GroupPanel.tsx` (useSortable)

---

### Task 3.4: Question List Within Groups
**Estimated Complexity:** Medium
**Dependencies:** Task 3.2

**Description:**
Within each `GroupPanel`, render the list of questions as `QuestionCard` components. Create `src/components/survey-builder/QuestionCard.tsx` that displays a compact card for each question showing: drag handle, question code (e.g., "Q1"), question type icon/badge, title (truncated), required indicator, and action buttons (edit, duplicate, delete).

Add an "Add Question" button within each group that opens the question type picker. When a question type is selected, create the question via `POST /api/v1/surveys/{survey_id}/groups/{group_id}/questions` with the chosen type and a default title, then add it to the builder store. Implement delete with confirmation.

**Acceptance Criteria:**
- [ ] Questions are rendered as cards within their group, ordered by `sort_order`
- [ ] Each card shows code, type badge, title, required indicator, and drag handle
- [ ] "Add Question" button within each group opens the type picker
- [ ] New questions are created with a default title ("Untitled Question") and auto-generated code
- [ ] Delete button removes the question with confirmation
- [ ] Clicking a question card selects it and opens the property editor
- [ ] Selected question card has a visual highlight

**Technical Notes:**
- Question type icons: use distinct icons or colored badges for each type category (text, choice, matrix, scalar, special)
- Use `questionTypeIcons` map for consistent iconography
- Selection state: `builderStore.selectedQuestionId`
- Files: `src/components/survey-builder/QuestionCard.tsx`

---

### Task 3.5: Drag-and-Drop for Question Reordering (Within and Between Groups)
**Estimated Complexity:** Large
**Dependencies:** Task 3.3, Task 3.4

**Description:**
Implement drag-and-drop for questions using @dnd-kit. Questions should be sortable within their group and also draggable between groups. This requires nested sortable contexts: each group contains a `SortableContext` for its questions, and the drag system must handle cross-container movement.

When a question is moved within a group, update its `sort_order`. When a question is moved to a different group, update both its `group_id` and `sort_order`. Call the appropriate reorder/move API endpoints to persist changes. Implement visual feedback with drag overlay and drop indicators.

**Acceptance Criteria:**
- [ ] Questions can be reordered within a group via drag-and-drop
- [ ] Questions can be dragged from one group and dropped into another
- [ ] Drop indicators show valid drop zones within and between groups
- [ ] Drag overlay shows a preview of the question being moved
- [ ] sort_order values are updated correctly after reorder
- [ ] group_id is updated when a question moves between groups
- [ ] Changes are persisted to the backend via the reorder endpoint
- [ ] Empty groups accept dropped questions

**Technical Notes:**
- Use `@dnd-kit/core`'s `DndContext` with collision detection strategy (`closestCorners` or `rectIntersection`)
- Each group's question list is a separate droppable container
- On `onDragEnd`: determine source and destination containers, update store, call API
- Moving between groups: `PATCH /surveys/{id}/questions/{qid}` to update `group_id`, then reorder
- Files: `src/pages/SurveyBuilderPage.tsx`, `src/components/survey-builder/GroupPanel.tsx`, `src/components/survey-builder/QuestionCard.tsx`

---

### Task 3.6: Question Editor Panel (Properties Editor)
**Estimated Complexity:** Large
**Dependencies:** Task 3.4

**Description:**
Create `src/components/survey-builder/QuestionEditor.tsx` as the right-panel property editor. When a question is selected, this panel displays editable fields for: title (rich text or plain text), code (with auto-generation toggle), question type (type selector/dropdown), description/help text, is_required toggle, relevance expression (text input, expression builder comes in M5), and the validation JSONB editor.

The editor should update the builder store on every change (for auto-save) and call `PATCH /api/v1/surveys/{survey_id}/questions/{id}` to persist. When no question is selected, show a prompt to select a question or display survey-level settings.

**Acceptance Criteria:**
- [ ] Selecting a question populates the editor with its current properties
- [ ] Title field supports multi-line editing
- [ ] Question type can be changed via a dropdown (with warning about data loss for incompatible changes)
- [ ] Code field shows auto-generated code with option to customize
- [ ] Required toggle switches `is_required`
- [ ] Description/help text field is editable
- [ ] Changes update the builder store and trigger auto-save
- [ ] Deselecting shows "Select a question to edit" or survey settings
- [ ] Validation errors are shown inline

**Technical Notes:**
- Debounce PATCH calls (500ms) to avoid excessive API requests while typing
- Question type change should warn if switching between incompatible types (e.g., text to radio loses text settings)
- Use controlled form components bound to the builder store's selected question
- Files: `src/components/survey-builder/QuestionEditor.tsx`

---

### Task 3.7: Answer Option Editor
**Estimated Complexity:** Medium
**Dependencies:** Task 3.6

**Description:**
Create `src/components/survey-builder/AnswerOptionsEditor.tsx` that appears in the question editor panel for choice-type questions (radio, dropdown, checkbox, ranking, image_picker). It displays the list of answer options as an editable, sortable list. Each option shows: drag handle, title (editable inline), code, assessment value, and a delete button.

Add an "Add Option" button that creates a new option with auto-generated code and a default title. Support drag-and-drop reordering of options using @dnd-kit/sortable. Options are saved via `POST`, `PATCH`, and `DELETE` on the answer options endpoints.

**Acceptance Criteria:**
- [ ] Answer options editor appears for radio, dropdown, checkbox, ranking, and image_picker questions
- [ ] Options are displayed as an editable sortable list
- [ ] "Add Option" creates a new option with auto-generated code (A1, A2, ...) and default title
- [ ] Option titles are editable inline
- [ ] Options can be reordered via drag-and-drop
- [ ] Delete button removes an option (with confirmation if there are responses)
- [ ] Assessment value is editable per option
- [ ] Changes are auto-saved to the backend
- [ ] Editor is hidden for question types that don't use options (text, numeric, etc.)

**Technical Notes:**
- Show/hide based on `question_type` -- only choice types and matrix column definitions use options
- Reorder calls `PATCH /surveys/{id}/questions/{qid}/options/reorder`
- For image_picker, include an image URL field for each option
- Files: `src/components/survey-builder/AnswerOptionsEditor.tsx`

---

### Task 3.8: Question Type-Specific Settings Forms
**Estimated Complexity:** Large
**Dependencies:** Task 3.6

**Description:**
Create type-specific settings sub-forms that render within the question editor based on the selected question's type. Each form maps to the `settings` JSONB column documented in QUESTION_TYPES.md.

Implement settings forms for each type category:
- **Text types** (short_text, long_text, huge_text): placeholder, max_length, input_type/rows, rich_text toggle
- **Choice types** (radio, dropdown, checkbox): has_other, other_text, randomize, columns, min/max_choices, searchable, select_all
- **Matrix types** (matrix, matrix_dropdown, matrix_dynamic): alternate_rows, is_all_rows_required, randomize_rows, column_types, min/max_rows
- **Scalar types** (numeric, rating, boolean, date): min/max value, step, star_count, label_true/false, date format
- **Special types** (ranking, image_picker, file_upload, expression, html): type-specific settings per QUESTION_TYPES.md

**Acceptance Criteria:**
- [ ] Each of the 18 question types has a corresponding settings form
- [ ] Settings forms render the correct fields for the selected type
- [ ] Settings are read from and written to the `settings` JSONB field
- [ ] Changing question type switches the settings form and preserves compatible settings
- [ ] Default values are populated for new questions (matching QUESTION_TYPES.md defaults)
- [ ] Settings changes trigger auto-save
- [ ] Forms use appropriate input types (toggles for booleans, number inputs for integers, etc.)

**Technical Notes:**
- Create a `QuestionSettingsForm` component that dispatches to type-specific sub-components
- Use a `switch` on `question_type` to render the right form
- Reference QUESTION_TYPES.md for exact settings per type and their defaults
- Files: `src/components/survey-builder/settings/TextSettings.tsx`, `src/components/survey-builder/settings/ChoiceSettings.tsx`, `src/components/survey-builder/settings/MatrixSettings.tsx`, `src/components/survey-builder/settings/ScalarSettings.tsx`, `src/components/survey-builder/settings/SpecialSettings.tsx`

---

### Task 3.9: Question Preview Component
**Estimated Complexity:** Large
**Dependencies:** Task 3.8

**Description:**
Create `src/components/survey-builder/QuestionPreview.tsx` that renders a question as the respondent would see it, directly within the builder canvas. This replaces the compact `QuestionCard` view when a user clicks "Preview" or toggles preview mode. Each question type must have a visual preview: text inputs, radio buttons, checkboxes, dropdowns, matrix grids, rating stars, date pickers, etc.

The preview should be non-interactive in the builder (display-only, no actual input handling) but visually accurate. It uses the question's settings (e.g., number of columns for radio buttons, placeholder text, etc.) to render a realistic preview.

**Acceptance Criteria:**
- [ ] Each of the 18 question types has a visual preview rendering
- [ ] Preview uses the question's title, description, answer options, and settings
- [ ] Text types show input/textarea with placeholder
- [ ] Choice types show radio buttons/checkboxes/dropdown with option labels
- [ ] Matrix types show a grid with rows (subquestions) and columns (options)
- [ ] Scalar types show numeric input, rating stars, boolean toggle, or date picker
- [ ] Special types show appropriate previews (ranking list, image grid, file upload zone, HTML content)
- [ ] Preview respects settings (columns layout, "other" option, randomization note)
- [ ] Required indicator (*) is shown for required questions

**Technical Notes:**
- Create a registry: `questionPreviewMap: Record<QuestionType, React.FC<QuestionPreviewProps>>`
- Preview components are display-only -- use `disabled` or `pointer-events-none` to prevent interaction
- For matrix types, render a basic HTML table with radio/dropdown inputs
- Files: `src/components/survey-builder/QuestionPreview.tsx`, `src/components/survey-builder/previews/` (type-specific preview components)

---

### Task 3.10: Survey Preview Mode
**Estimated Complexity:** Medium
**Dependencies:** Task 3.9

**Description:**
Create `src/pages/SurveyPreviewPage.tsx` (or a full-screen overlay within the builder) that renders the complete survey as a respondent would experience it. Display the welcome message, then render each question group as a page (if `one_page_per_group` is enabled in settings) or all questions on a single page. Include Next/Previous navigation between groups, a progress bar, and the end message on the final screen.

The preview should be interactive -- users can fill in answers to see how the form behaves (validation messages, conditional display in M5). A banner at the top indicates "Preview Mode" with a button to return to the builder.

**Acceptance Criteria:**
- [ ] Preview mode shows the survey as a respondent would see it
- [ ] Welcome message is displayed on the first screen
- [ ] Questions are grouped by question group with group titles
- [ ] If `one_page_per_group` is true, show one group per page with Next/Previous
- [ ] Progress bar shows completion progress
- [ ] End message is displayed after the last group
- [ ] "Preview Mode" banner with "Return to Builder" button
- [ ] Questions render using the same preview components from Task 3.9
- [ ] Preview is interactive (can type answers, select options)

**Technical Notes:**
- Route: `/surveys/:id/preview` or a modal overlay from the builder
- Reuse question preview components from Task 3.9 but make them interactive (remove disabled state)
- Survey settings `one_page_per_group` controls pagination behavior
- Progress: current group index / total groups
- Files: `src/pages/SurveyPreviewPage.tsx`

---

### Task 3.11: Autosave and Save Indicator
**Estimated Complexity:** Medium
**Dependencies:** Task 3.6

**Description:**
Implement an autosave system for the survey builder. When any change is made in the builder store (question edited, option added, group reordered, etc.), debounce the change and automatically sync it to the backend via the appropriate PATCH/POST/DELETE endpoint. Display a save indicator in the builder toolbar showing the current save status: "Saving..." (spinner), "All changes saved" (check mark), or "Save failed" (error with retry button).

Track dirty state for each entity (survey, groups, questions, options) and only sync what has changed. Handle concurrent saves gracefully (queue or debounce overlapping requests).

**Acceptance Criteria:**
- [ ] Changes in the builder auto-save after a 500ms debounce
- [ ] Save indicator shows "Saving...", "All changes saved", or "Save failed" states
- [ ] Only changed entities are synced (not the entire survey structure)
- [ ] Failed saves show a retry button
- [ ] Multiple rapid changes are batched into a single save
- [ ] Save indicator is visible in the builder toolbar
- [ ] Navigating away from the builder with unsaved changes shows a confirmation prompt

**Technical Notes:**
- Track dirty state in the builder store: `dirtyEntities: Set<string>` (entity type + ID)
- Use `useEffect` with a debounce to trigger save when dirty state changes
- Handle `beforeunload` event to warn about unsaved changes
- Consider using React Router's `useBlocker` for navigation warnings
- Files: `src/store/builderStore.ts` (dirty tracking), `src/components/survey-builder/SaveIndicator.tsx`

---

### Task 3.12: Undo/Redo Support
**Estimated Complexity:** Medium
**Dependencies:** Task 3.1

**Description:**
Implement undo/redo functionality for the survey builder. Maintain a history stack of builder state snapshots. Each meaningful action (add/remove/update group, add/remove/update question, reorder, etc.) pushes a snapshot onto the history stack. Undo pops the previous state and applies it; redo re-applies the next state.

Bind keyboard shortcuts: Ctrl+Z / Cmd+Z for undo, Ctrl+Shift+Z / Cmd+Shift+Z for redo. Add undo/redo buttons in the builder toolbar. Limit history to a reasonable depth (e.g., 50 states) to prevent memory issues.

**Acceptance Criteria:**
- [ ] Ctrl+Z / Cmd+Z undoes the last builder action
- [ ] Ctrl+Shift+Z / Cmd+Shift+Z redoes the last undone action
- [ ] Undo/redo buttons in the toolbar reflect available history
- [ ] History stack stores up to 50 state snapshots
- [ ] Undo restores the previous state and triggers auto-save
- [ ] Making a new change after undo clears the redo stack
- [ ] Undo/redo works for all builder actions (add, edit, delete, reorder)

**Technical Notes:**
- Zustand middleware approach: create a `temporal` middleware that tracks state history
- Alternative: use `zundo` library which provides undo/redo for Zustand out of the box
- Store only the diff or a serialized snapshot of the survey structure (not the entire store)
- After undo/redo, trigger auto-save to sync the restored state to the backend
- Files: `src/store/builderStore.ts` (history middleware)

---

### Task 3.13: Builder Toolbar
**Estimated Complexity:** Small
**Dependencies:** Task 3.11, Task 3.12

**Description:**
Create the builder toolbar component that sits at the top of the survey builder page. It contains: the survey title (editable), the save indicator, undo/redo buttons, an "Add Group" button, an "Add Question" dropdown (quick-add to the last group), a "Preview" button (navigates to preview mode), a "Save" button (manual save), and an "Activate" button (for draft surveys) or status indicator.

The toolbar should be sticky (stays visible when scrolling the canvas) and responsive (collapses action buttons into a dropdown menu on smaller screens).

**Acceptance Criteria:**
- [ ] Toolbar is sticky at the top of the builder
- [ ] Survey title is editable inline in the toolbar
- [ ] Save indicator shows current save state
- [ ] Undo/redo buttons are present and reflect history availability (disabled when empty)
- [ ] "Add Group" button creates a new group
- [ ] "Preview" button opens survey preview mode
- [ ] "Activate" button activates the survey (shown only for draft surveys)
- [ ] Toolbar is responsive and collapses gracefully on small screens

**Technical Notes:**
- Use shadcn/ui Button, DropdownMenu, Tooltip components
- Activate should call `POST /surveys/{id}/activate` with confirmation dialog
- After activation, redirect to the survey detail page (builder becomes read-only for active surveys)
- Files: `src/components/survey-builder/BuilderToolbar.tsx`
