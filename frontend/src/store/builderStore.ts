/**
 * Builder store for the survey builder page.
 *
 * Holds the full nested survey structure (groups → questions → answer options)
 * and tracks the currently selected item for the property editor.
 * Provides undo/redo via snapshot stacks.
 * Uses immer middleware for safe nested state mutations.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  SurveyFullResponse,
  QuestionGroupResponse,
  QuestionResponse,
  AnswerOptionResponse,
} from '../types/survey'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectedItem =
  | { type: 'group'; id: string }
  | { type: 'question'; id: string }
  | null

export interface BuilderGroup extends Omit<QuestionGroupResponse, 'questions'> {
  questions: BuilderQuestion[]
}

export interface BuilderQuestion extends Omit<QuestionResponse, 'subquestions' | 'answer_options'> {
  answer_options: AnswerOptionResponse[]
  subquestions: BuilderQuestion[]
}

interface BuilderSnapshot {
  groups: BuilderGroup[]
}

interface BuilderState {
  // Survey metadata
  surveyId: string | null
  title: string
  status: string

  // Structure
  groups: BuilderGroup[]

  // UI state
  selectedItem: SelectedItem
  isLoading: boolean
  error: string | null

  // Undo/redo stacks
  undoStack: BuilderSnapshot[]
  redoStack: BuilderSnapshot[]
}

interface BuilderActions {
  // Load full survey from API response
  loadSurvey: (survey: SurveyFullResponse) => void

  // Group actions
  addGroup: (group: BuilderGroup) => void
  removeGroup: (groupId: string) => void
  updateGroup: (groupId: string, updates: Partial<Omit<BuilderGroup, 'id' | 'questions'>>) => void
  reorderGroups: (orderedIds: string[]) => void

  // Question actions
  addQuestion: (groupId: string, question: BuilderQuestion) => void
  removeQuestion: (groupId: string, questionId: string) => void
  updateQuestion: (
    groupId: string,
    questionId: string,
    updates: Partial<Omit<BuilderQuestion, 'id' | 'group_id' | 'answer_options' | 'subquestions'>>,
  ) => void
  moveQuestion: (fromGroupId: string, toGroupId: string, questionId: string) => void
  reorderQuestions: (groupId: string, orderedIds: string[]) => void

  // Answer option actions
  addOption: (groupId: string, questionId: string, option: AnswerOptionResponse) => void
  removeOption: (groupId: string, questionId: string, optionId: string) => void
  updateOption: (
    groupId: string,
    questionId: string,
    optionId: string,
    updates: Partial<Omit<AnswerOptionResponse, 'id' | 'question_id'>>,
  ) => void
  reorderOptions: (groupId: string, questionId: string, orderedIds: string[]) => void

  // UI actions
  setSelectedItem: (item: SelectedItem) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // Undo/redo
  undo: () => void
  redo: () => void

  // Reset
  reset: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapshot(groups: BuilderGroup[]): BuilderSnapshot {
  return { groups: JSON.parse(JSON.stringify(groups)) }
}

function pushUndo(state: BuilderState) {
  state.undoStack.push(snapshot(state.groups))
  // Cap undo stack at 50 entries
  if (state.undoStack.length > 50) {
    state.undoStack.shift()
  }
  state.redoStack = []
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: BuilderState = {
  surveyId: null,
  title: '',
  status: '',
  groups: [],
  selectedItem: null,
  isLoading: false,
  error: null,
  undoStack: [],
  redoStack: [],
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useBuilderStore = create<BuilderState & BuilderActions>()(
  immer((set) => ({
    ...initialState,

    loadSurvey: (survey: SurveyFullResponse) =>
      set((state) => {
        state.surveyId = survey.id
        state.title = survey.title
        state.status = survey.status
        // Build nested structure: groups with their questions
        state.groups = survey.groups.map((g) => ({
          ...g,
          questions: g.questions.map((q) => ({
            ...q,
            answer_options: q.answer_options,
            subquestions: q.subquestions as BuilderQuestion[],
          })),
        }))
        state.undoStack = []
        state.redoStack = []
        state.selectedItem = null
        state.error = null
      }),

    // -----------------------------------------------------------------------
    // Group actions
    // -----------------------------------------------------------------------

    addGroup: (group: BuilderGroup) =>
      set((state) => {
        pushUndo(state)
        state.groups.push(group)
      }),

    removeGroup: (groupId: string) =>
      set((state) => {
        pushUndo(state)
        const idx = state.groups.findIndex((g) => g.id === groupId)
        if (idx !== -1) {
          state.groups.splice(idx, 1)
        }
        if (state.selectedItem?.type === 'group' && state.selectedItem.id === groupId) {
          state.selectedItem = null
        }
      }),

    updateGroup: (groupId, updates) =>
      set((state) => {
        pushUndo(state)
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          Object.assign(group, updates)
        }
      }),

    reorderGroups: (orderedIds: string[]) =>
      set((state) => {
        pushUndo(state)
        const map = new Map(state.groups.map((g) => [g.id, g]))
        state.groups = orderedIds
          .filter((id) => map.has(id))
          .map((id) => map.get(id)!)
        // Keep any groups not in orderedIds at the end
        const extra = state.groups.filter((g) => !orderedIds.includes(g.id))
        state.groups = [...orderedIds.filter((id) => map.has(id)).map((id) => map.get(id)!), ...extra]
      }),

    // -----------------------------------------------------------------------
    // Question actions
    // -----------------------------------------------------------------------

    addQuestion: (groupId: string, question: BuilderQuestion) =>
      set((state) => {
        pushUndo(state)
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          group.questions.push(question)
        }
      }),

    removeQuestion: (groupId: string, questionId: string) =>
      set((state) => {
        pushUndo(state)
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          const idx = group.questions.findIndex((q) => q.id === questionId)
          if (idx !== -1) {
            group.questions.splice(idx, 1)
          }
        }
        if (state.selectedItem?.type === 'question' && state.selectedItem.id === questionId) {
          state.selectedItem = null
        }
      }),

    updateQuestion: (groupId, questionId, updates) =>
      set((state) => {
        pushUndo(state)
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          const question = group.questions.find((q) => q.id === questionId)
          if (question) {
            Object.assign(question, updates)
          }
        }
      }),

    moveQuestion: (fromGroupId: string, toGroupId: string, questionId: string) =>
      set((state) => {
        pushUndo(state)
        const fromGroup = state.groups.find((g) => g.id === fromGroupId)
        const toGroup = state.groups.find((g) => g.id === toGroupId)
        if (!fromGroup || !toGroup) return

        const idx = fromGroup.questions.findIndex((q) => q.id === questionId)
        if (idx === -1) return

        const [question] = fromGroup.questions.splice(idx, 1)
        question.group_id = toGroupId
        toGroup.questions.push(question)
      }),

    reorderQuestions: (groupId: string, orderedIds: string[]) =>
      set((state) => {
        pushUndo(state)
        const group = state.groups.find((g) => g.id === groupId)
        if (!group) return

        const map = new Map(group.questions.map((q) => [q.id, q]))
        const reordered = orderedIds.filter((id) => map.has(id)).map((id) => map.get(id)!)
        const extra = group.questions.filter((q) => !orderedIds.includes(q.id))
        group.questions = [...reordered, ...extra]
      }),

    // -----------------------------------------------------------------------
    // Answer option actions
    // -----------------------------------------------------------------------

    addOption: (groupId: string, questionId: string, option: AnswerOptionResponse) =>
      set((state) => {
        pushUndo(state)
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          const question = group.questions.find((q) => q.id === questionId)
          if (question) {
            question.answer_options.push(option)
          }
        }
      }),

    removeOption: (groupId: string, questionId: string, optionId: string) =>
      set((state) => {
        pushUndo(state)
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          const question = group.questions.find((q) => q.id === questionId)
          if (question) {
            const idx = question.answer_options.findIndex((o) => o.id === optionId)
            if (idx !== -1) {
              question.answer_options.splice(idx, 1)
            }
          }
        }
      }),

    updateOption: (groupId, questionId, optionId, updates) =>
      set((state) => {
        pushUndo(state)
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          const question = group.questions.find((q) => q.id === questionId)
          if (question) {
            const option = question.answer_options.find((o) => o.id === optionId)
            if (option) {
              Object.assign(option, updates)
            }
          }
        }
      }),

    reorderOptions: (groupId: string, questionId: string, orderedIds: string[]) =>
      set((state) => {
        pushUndo(state)
        const group = state.groups.find((g) => g.id === groupId)
        if (group) {
          const question = group.questions.find((q) => q.id === questionId)
          if (question) {
            const map = new Map(question.answer_options.map((o) => [o.id, o]))
            const reordered = orderedIds.filter((id) => map.has(id)).map((id) => map.get(id)!)
            const extra = question.answer_options.filter((o) => !orderedIds.includes(o.id))
            question.answer_options = [...reordered, ...extra]
          }
        }
      }),

    // -----------------------------------------------------------------------
    // UI actions
    // -----------------------------------------------------------------------

    setSelectedItem: (item: SelectedItem) =>
      set((state) => {
        state.selectedItem = item
      }),

    setLoading: (loading: boolean) =>
      set((state) => {
        state.isLoading = loading
      }),

    setError: (error: string | null) =>
      set((state) => {
        state.error = error
      }),

    // -----------------------------------------------------------------------
    // Undo / redo
    // -----------------------------------------------------------------------

    undo: () =>
      set((state) => {
        const prev = state.undoStack.pop()
        if (!prev) return
        state.redoStack.push(snapshot(state.groups))
        state.groups = prev.groups
      }),

    redo: () =>
      set((state) => {
        const next = state.redoStack.pop()
        if (!next) return
        state.undoStack.push(snapshot(state.groups))
        state.groups = next.groups
      }),

    // -----------------------------------------------------------------------
    // Reset
    // -----------------------------------------------------------------------

    reset: () =>
      set((state) => {
        Object.assign(state, initialState)
      }),
  })),
)

export default useBuilderStore
