/**
 * Unit tests for builderStore.
 *
 * Tests call store actions directly and assert getState() — no component rendering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useBuilderStore } from '../builderStore'
import type { BuilderGroup, BuilderQuestion } from '../builderStore'
import type { AnswerOptionResponse } from '../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGroup = (id: string, sortOrder = 1): BuilderGroup => ({
  id,
  survey_id: 'survey-1',
  title: `Group ${id}`,
  description: null,
  sort_order: sortOrder,
  relevance: null,
  created_at: '2024-01-01T00:00:00Z',
  questions: [],
})

const mockQuestion = (id: string, groupId: string, sortOrder = 1): BuilderQuestion => ({
  id,
  group_id: groupId,
  parent_id: null,
  question_type: 'text',
  code: id.toUpperCase(),
  title: `Question ${id}`,
  description: null,
  is_required: false,
  sort_order: sortOrder,
  relevance: null,
  validation: null,
  settings: null,
  created_at: '2024-01-01T00:00:00Z',
  answer_options: [],
  subquestions: [],
})

const mockOption = (id: string, questionId: string, sortOrder = 1): AnswerOptionResponse => ({
  id,
  question_id: questionId,
  code: id.toUpperCase(),
  title: `Option ${id}`,
  sort_order: sortOrder,
  assessment_value: sortOrder,
  created_at: '2024-01-01T00:00:00Z',
})

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useBuilderStore.getState().reset()
})

afterEach(() => {
  useBuilderStore.getState().reset()
})

// ---------------------------------------------------------------------------
// loadSurvey
// ---------------------------------------------------------------------------

describe('loadSurvey', () => {
  it('populates survey metadata and groups', () => {
    const survey = {
      id: 'survey-1',
      user_id: 'user-1',
      title: 'Test Survey',
      description: null,
      status: 'draft',
      welcome_message: null,
      end_message: null,
      default_language: 'en',
      settings: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      groups: [
        {
          id: 'g1',
          survey_id: 'survey-1',
          title: 'Group One',
          description: null,
          sort_order: 1,
          relevance: null,
          created_at: '2024-01-01T00:00:00Z',
          questions: [
            {
              id: 'q1',
              group_id: 'g1',
              parent_id: null,
              question_type: 'text',
              code: 'Q1',
              title: 'Question One',
              description: null,
              is_required: true,
              sort_order: 1,
              relevance: null,
              validation: null,
              settings: null,
              created_at: '2024-01-01T00:00:00Z',
              subquestions: [],
              answer_options: [],
            },
          ],
        },
      ],
      questions: [],
      options: [],
    }

    useBuilderStore.getState().loadSurvey(survey)
    const state = useBuilderStore.getState()

    expect(state.surveyId).toBe('survey-1')
    expect(state.title).toBe('Test Survey')
    expect(state.status).toBe('draft')
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0].id).toBe('g1')
    expect(state.groups[0].questions).toHaveLength(1)
    expect(state.groups[0].questions[0].id).toBe('q1')
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(0)
    expect(state.selectedItem).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Group actions
// ---------------------------------------------------------------------------

describe('addGroup', () => {
  it('appends a new group', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    const { groups } = useBuilderStore.getState()
    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe('g1')
  })

  it('pushes to undoStack', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    expect(useBuilderStore.getState().undoStack).toHaveLength(1)
  })
})

describe('removeGroup', () => {
  it('removes an existing group', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addGroup(mockGroup('g2'))
    useBuilderStore.getState().removeGroup('g1')
    const { groups } = useBuilderStore.getState()
    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe('g2')
  })

  it('clears selectedItem when removed group was selected', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().setSelectedItem({ type: 'group', id: 'g1' })
    useBuilderStore.getState().removeGroup('g1')
    expect(useBuilderStore.getState().selectedItem).toBeNull()
  })

  it('does not fail when groupId does not exist', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    expect(() => useBuilderStore.getState().removeGroup('nonexistent')).not.toThrow()
    expect(useBuilderStore.getState().groups).toHaveLength(1)
  })
})

describe('updateGroup', () => {
  it('updates group title', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().updateGroup('g1', { title: 'Updated Title' })
    expect(useBuilderStore.getState().groups[0].title).toBe('Updated Title')
  })
})

describe('reorderGroups', () => {
  it('reorders groups by given id array', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1', 1))
    useBuilderStore.getState().addGroup(mockGroup('g2', 2))
    useBuilderStore.getState().addGroup(mockGroup('g3', 3))
    useBuilderStore.getState().reorderGroups(['g3', 'g1', 'g2'])
    const ids = useBuilderStore.getState().groups.map((g) => g.id)
    expect(ids).toEqual(['g3', 'g1', 'g2'])
  })
})

// ---------------------------------------------------------------------------
// Question actions
// ---------------------------------------------------------------------------

describe('addQuestion', () => {
  it('adds question to the correct group', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addGroup(mockGroup('g2'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    const { groups } = useBuilderStore.getState()
    expect(groups[0].questions).toHaveLength(1)
    expect(groups[1].questions).toHaveLength(0)
  })
})

describe('removeQuestion', () => {
  it('removes question from its group', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q2', 'g1'))
    useBuilderStore.getState().removeQuestion('g1', 'q1')
    const { groups } = useBuilderStore.getState()
    expect(groups[0].questions).toHaveLength(1)
    expect(groups[0].questions[0].id).toBe('q2')
  })

  it('clears selectedItem when removed question was selected', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: 'q1' })
    useBuilderStore.getState().removeQuestion('g1', 'q1')
    expect(useBuilderStore.getState().selectedItem).toBeNull()
  })
})

describe('updateQuestion', () => {
  it('updates question title', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    useBuilderStore.getState().updateQuestion('g1', 'q1', { title: 'New Title' })
    expect(useBuilderStore.getState().groups[0].questions[0].title).toBe('New Title')
  })

  it('updates is_required flag', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    useBuilderStore.getState().updateQuestion('g1', 'q1', { is_required: true })
    expect(useBuilderStore.getState().groups[0].questions[0].is_required).toBe(true)
  })
})

describe('moveQuestion', () => {
  it('moves question from one group to another', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addGroup(mockGroup('g2'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    useBuilderStore.getState().moveQuestion('g1', 'g2', 'q1')
    const { groups } = useBuilderStore.getState()
    expect(groups[0].questions).toHaveLength(0)
    expect(groups[1].questions).toHaveLength(1)
    expect(groups[1].questions[0].group_id).toBe('g2')
  })
})

describe('reorderQuestions', () => {
  it('reorders questions within a group', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1', 1))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q2', 'g1', 2))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q3', 'g1', 3))
    useBuilderStore.getState().reorderQuestions('g1', ['q3', 'q1', 'q2'])
    const ids = useBuilderStore.getState().groups[0].questions.map((q) => q.id)
    expect(ids).toEqual(['q3', 'q1', 'q2'])
  })
})

// ---------------------------------------------------------------------------
// Answer option actions
// ---------------------------------------------------------------------------

describe('addOption', () => {
  it('adds option to the correct question', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    useBuilderStore.getState().addOption('g1', 'q1', mockOption('o1', 'q1'))
    const opts = useBuilderStore.getState().groups[0].questions[0].answer_options
    expect(opts).toHaveLength(1)
    expect(opts[0].id).toBe('o1')
  })
})

describe('removeOption', () => {
  it('removes option from its question', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    useBuilderStore.getState().addOption('g1', 'q1', mockOption('o1', 'q1'))
    useBuilderStore.getState().addOption('g1', 'q1', mockOption('o2', 'q1'))
    useBuilderStore.getState().removeOption('g1', 'q1', 'o1')
    const opts = useBuilderStore.getState().groups[0].questions[0].answer_options
    expect(opts).toHaveLength(1)
    expect(opts[0].id).toBe('o2')
  })
})

describe('updateOption', () => {
  it('updates option title', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    useBuilderStore.getState().addOption('g1', 'q1', mockOption('o1', 'q1'))
    useBuilderStore.getState().updateOption('g1', 'q1', 'o1', { title: 'Updated Option' })
    const opt = useBuilderStore.getState().groups[0].questions[0].answer_options[0]
    expect(opt.title).toBe('Updated Option')
  })
})

describe('reorderOptions', () => {
  it('reorders options within a question', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addQuestion('g1', mockQuestion('q1', 'g1'))
    useBuilderStore.getState().addOption('g1', 'q1', mockOption('o1', 'q1', 1))
    useBuilderStore.getState().addOption('g1', 'q1', mockOption('o2', 'q1', 2))
    useBuilderStore.getState().addOption('g1', 'q1', mockOption('o3', 'q1', 3))
    useBuilderStore.getState().reorderOptions('g1', 'q1', ['o3', 'o1', 'o2'])
    const ids = useBuilderStore.getState().groups[0].questions[0].answer_options.map((o) => o.id)
    expect(ids).toEqual(['o3', 'o1', 'o2'])
  })
})

// ---------------------------------------------------------------------------
// setSelectedItem
// ---------------------------------------------------------------------------

describe('setSelectedItem', () => {
  it('sets selected item to a group', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'group', id: 'g1' })
    expect(useBuilderStore.getState().selectedItem).toEqual({ type: 'group', id: 'g1' })
  })

  it('sets selected item to a question', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'question', id: 'q1' })
    expect(useBuilderStore.getState().selectedItem).toEqual({ type: 'question', id: 'q1' })
  })

  it('clears selected item when set to null', () => {
    useBuilderStore.getState().setSelectedItem({ type: 'group', id: 'g1' })
    useBuilderStore.getState().setSelectedItem(null)
    expect(useBuilderStore.getState().selectedItem).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

describe('undo / redo', () => {
  it('undo restores previous state', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addGroup(mockGroup('g2'))
    expect(useBuilderStore.getState().groups).toHaveLength(2)

    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().groups).toHaveLength(1)
    expect(useBuilderStore.getState().groups[0].id).toBe('g1')
  })

  it('redo re-applies undone action', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addGroup(mockGroup('g2'))
    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().groups).toHaveLength(1)

    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().groups).toHaveLength(2)
  })

  it('redo stack clears after new action', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addGroup(mockGroup('g2'))
    useBuilderStore.getState().undo()
    useBuilderStore.getState().addGroup(mockGroup('g3'))
    expect(useBuilderStore.getState().redoStack).toHaveLength(0)
  })

  it('undo does nothing when stack is empty', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    expect(() => {
      useBuilderStore.getState().undo()
      useBuilderStore.getState().undo() // second undo — nothing to undo
    }).not.toThrow()
    expect(useBuilderStore.getState().groups).toHaveLength(0)
  })

  it('redo does nothing when stack is empty', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    expect(() => {
      useBuilderStore.getState().redo() // nothing to redo
    }).not.toThrow()
    expect(useBuilderStore.getState().groups).toHaveLength(1)
  })

  it('undo/redo multiple levels', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addGroup(mockGroup('g2'))
    useBuilderStore.getState().addGroup(mockGroup('g3'))

    useBuilderStore.getState().undo()
    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().groups).toHaveLength(1)

    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().groups).toHaveLength(2)

    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().groups).toHaveLength(3)
  })

  it('undo sets saveStatus to saving to trigger auto-save', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addGroup(mockGroup('g2'))
    // Clear saving status set by addGroup actions
    useBuilderStore.getState().setSaveStatus('idle')

    useBuilderStore.getState().undo()
    expect(useBuilderStore.getState().saveStatus).toBe('saving')
  })

  it('redo sets saveStatus to saving to trigger auto-save', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().addGroup(mockGroup('g2'))
    useBuilderStore.getState().undo()
    // Clear saving status set by undo
    useBuilderStore.getState().setSaveStatus('idle')

    useBuilderStore.getState().redo()
    expect(useBuilderStore.getState().saveStatus).toBe('saving')
  })

  it('undo does not set saveStatus when stack is empty', () => {
    useBuilderStore.getState().setSaveStatus('idle')
    useBuilderStore.getState().undo() // nothing to undo
    expect(useBuilderStore.getState().saveStatus).toBe('idle')
  })

  it('redo does not set saveStatus when stack is empty', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().setSaveStatus('idle')
    useBuilderStore.getState().redo() // nothing to redo
    expect(useBuilderStore.getState().saveStatus).toBe('idle')
  })

  it('caps undo stack at 50 entries', () => {
    // Add 55 groups — undo stack should never exceed 50
    for (let i = 0; i < 55; i++) {
      useBuilderStore.getState().addGroup(mockGroup(`g${i}`))
    }
    expect(useBuilderStore.getState().undoStack.length).toBeLessThanOrEqual(50)
  })
})

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

describe('reset', () => {
  it('resets state to initial values', () => {
    useBuilderStore.getState().addGroup(mockGroup('g1'))
    useBuilderStore.getState().setSelectedItem({ type: 'group', id: 'g1' })
    useBuilderStore.getState().reset()
    const state = useBuilderStore.getState()
    expect(state.surveyId).toBeNull()
    expect(state.groups).toHaveLength(0)
    expect(state.selectedItem).toBeNull()
    expect(state.undoStack).toHaveLength(0)
    expect(state.redoStack).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Save status actions
// ---------------------------------------------------------------------------

describe('setSaveStatus', () => {
  it('sets saveStatus to saving', () => {
    useBuilderStore.getState().setSaveStatus('saving')
    expect(useBuilderStore.getState().saveStatus).toBe('saving')
  })

  it('sets saveStatus to saved and updates lastSavedAt', () => {
    const before = new Date()
    useBuilderStore.getState().setSaveStatus('saved')
    const state = useBuilderStore.getState()
    expect(state.saveStatus).toBe('saved')
    expect(state.lastSavedAt).not.toBeNull()
    expect(state.lastSavedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('sets saveStatus to error with error message', () => {
    useBuilderStore.getState().setSaveStatus('error', 'Network timeout')
    const state = useBuilderStore.getState()
    expect(state.saveStatus).toBe('error')
    expect(state.saveError).toBe('Network timeout')
  })

  it('sets saveStatus to error with null error when not provided', () => {
    useBuilderStore.getState().setSaveStatus('error')
    const state = useBuilderStore.getState()
    expect(state.saveStatus).toBe('error')
    expect(state.saveError).toBeNull()
  })

  it('sets saveStatus to idle', () => {
    useBuilderStore.getState().setSaveStatus('saving')
    useBuilderStore.getState().setSaveStatus('idle')
    expect(useBuilderStore.getState().saveStatus).toBe('idle')
  })

  it('clears saveError when transitioning to saving', () => {
    useBuilderStore.getState().setSaveStatus('error', 'Something went wrong')
    useBuilderStore.getState().setSaveStatus('saving')
    expect(useBuilderStore.getState().saveError).toBeNull()
  })

  it('does not update lastSavedAt when status is not saved', () => {
    useBuilderStore.getState().setSaveStatus('saving')
    expect(useBuilderStore.getState().lastSavedAt).toBeNull()
  })
})

describe('setLastSavedAt', () => {
  it('updates lastSavedAt with given date', () => {
    const date = new Date('2024-01-01T12:00:00Z')
    useBuilderStore.getState().setLastSavedAt(date)
    expect(useBuilderStore.getState().lastSavedAt).toEqual(date)
  })

  it('clears lastSavedAt when set to null', () => {
    useBuilderStore.getState().setLastSavedAt(new Date())
    useBuilderStore.getState().setLastSavedAt(null)
    expect(useBuilderStore.getState().lastSavedAt).toBeNull()
  })
})

describe('save status reset on loadSurvey', () => {
  it('resets save status fields when loading a new survey', () => {
    useBuilderStore.getState().setSaveStatus('error', 'Previous error')
    const survey = {
      id: 'survey-1',
      user_id: 'user-1',
      title: 'Test Survey',
      description: null,
      status: 'draft',
      welcome_message: null,
      end_message: null,
      default_language: 'en',
      settings: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      groups: [],
      questions: [],
      options: [],
    }
    useBuilderStore.getState().loadSurvey(survey)
    const state = useBuilderStore.getState()
    expect(state.saveStatus).toBe('idle')
    expect(state.saveError).toBeNull()
    expect(state.lastSavedAt).toBeNull()
  })
})

describe('save status reset on reset()', () => {
  it('resets save status fields on reset', () => {
    useBuilderStore.getState().setSaveStatus('error', 'Previous error')
    useBuilderStore.getState().reset()
    const state = useBuilderStore.getState()
    expect(state.saveStatus).toBe('idle')
    expect(state.saveError).toBeNull()
    expect(state.lastSavedAt).toBeNull()
  })
})
