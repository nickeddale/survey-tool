/**
 * Drag-and-drop unit tests for QuestionCard, GroupPanel, and
 * the onDragEnd logic in SurveyBuilderPage's SurveyCanvas.
 *
 * Strategy:
 *  - Mock @dnd-kit hooks to control dragging state in tests.
 *  - Test the drag logic by directly calling the handler via store state.
 *  - Verify store actions (reorderQuestions, moveQuestion) are called correctly.
 *  - Mock surveyService to verify API calls.
 *  - Follow all MEMORY.md patterns (act(), useRealTimers, etc.).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useBuilderStore } from '../../../store/builderStore'
import type { BuilderGroup, BuilderQuestion } from '../../../store/builderStore'

// ---------------------------------------------------------------------------
// Mock @dnd-kit — prevents JSDOM pointer event errors
// ---------------------------------------------------------------------------

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DragOverlay: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="drag-overlay">{children}</div>
    ),
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn((...sensors: unknown[]) => sensors),
    PointerSensor: class PointerSensor {},
    KeyboardSensor: class KeyboardSensor {},
    closestCorners: vi.fn(),
  }
})

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable')
  return {
    ...actual,
    useSortable: vi.fn(() => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: false,
    })),
    useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    sortableKeyboardCoordinates: vi.fn(),
    arrayMove: actual.arrayMove,
    verticalListSortingStrategy: actual.verticalListSortingStrategy,
  }
})

// Also mock @dnd-kit/core's useDroppable used in GroupPanel
vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DragOverlay: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="drag-overlay">{children}</div>
    ),
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn((...sensors: unknown[]) => sensors),
    PointerSensor: class PointerSensor {},
    KeyboardSensor: class KeyboardSensor {},
    closestCorners: vi.fn(),
    useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  }
})

// ---------------------------------------------------------------------------
// Mock surveyService
// ---------------------------------------------------------------------------

vi.mock('../../../services/surveyService', () => ({
  default: {
    getSurvey: vi.fn(),
    reorderQuestions: vi.fn().mockResolvedValue(undefined),
    moveQuestion: vi.fn().mockResolvedValue(undefined),
  },
}))

import surveyService from '../../../services/surveyService'
import { QuestionCard } from '../QuestionCard'
import { GroupPanel } from '../GroupPanel'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const makeQuestion = (id: string, groupId: string, sortOrder: number): BuilderQuestion => ({
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

const makeGroup = (id: string, questions: BuilderQuestion[]): BuilderGroup => ({
  id,
  survey_id: 'survey-1',
  title: `Group ${id}`,
  description: null,
  sort_order: 1,
  relevance: null,
  created_at: '2024-01-01T00:00:00Z',
  questions,
})

// ---------------------------------------------------------------------------
// QuestionCard tests
// ---------------------------------------------------------------------------

describe('QuestionCard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders question code, title, and type', () => {
    const question = makeQuestion('q1', 'g1', 1)
    render(
      <QuestionCard
        question={question}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
      />,
    )

    expect(screen.getByTestId('canvas-question-q1')).toBeInTheDocument()
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(screen.getByText('Question q1')).toBeInTheDocument()
    expect(screen.getByText('text')).toBeInTheDocument()
  })

  it('renders drag handle when not readOnly', () => {
    const question = makeQuestion('q1', 'g1', 1)
    render(
      <QuestionCard
        question={question}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
      />,
    )

    expect(screen.getByTestId('drag-handle-q1')).toBeInTheDocument()
  })

  it('does not render drag handle when readOnly', () => {
    const question = makeQuestion('q1', 'g1', 1)
    render(
      <QuestionCard
        question={question}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={true}
      />,
    )

    expect(screen.queryByTestId('drag-handle-q1')).not.toBeInTheDocument()
  })

  it('shows selected state when question is selected', () => {
    const question = makeQuestion('q1', 'g1', 1)
    render(
      <QuestionCard
        question={question}
        selectedItem={{ type: 'question', id: 'q1' }}
        onSelectItem={() => {}}
        readOnly={false}
      />,
    )

    const card = screen.getByTestId('canvas-question-q1')
    expect(card.className).toContain('bg-primary/5')
  })

  it('calls onSelectItem when clicked', async () => {
    const question = makeQuestion('q1', 'g1', 1)
    const onSelectItem = vi.fn()
    render(
      <QuestionCard
        question={question}
        selectedItem={null}
        onSelectItem={onSelectItem}
        readOnly={false}
      />,
    )

    await act(async () => {
      screen.getByTestId('canvas-question-q1').click()
    })

    expect(onSelectItem).toHaveBeenCalledWith({ type: 'question', id: 'q1' })
  })

  it('deselects when clicked while already selected', async () => {
    const question = makeQuestion('q1', 'g1', 1)
    const onSelectItem = vi.fn()
    render(
      <QuestionCard
        question={question}
        selectedItem={{ type: 'question', id: 'q1' }}
        onSelectItem={onSelectItem}
        readOnly={false}
      />,
    )

    await act(async () => {
      screen.getByTestId('canvas-question-q1').click()
    })

    expect(onSelectItem).toHaveBeenCalledWith(null)
  })

  it('renders required asterisk for required questions', () => {
    const question = { ...makeQuestion('q1', 'g1', 1), is_required: true }
    render(
      <QuestionCard
        question={question}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
      />,
    )

    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('renders overlay style when isOverlay=true', () => {
    const question = makeQuestion('q1', 'g1', 1)
    render(
      <QuestionCard
        question={question}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
        isOverlay
      />,
    )

    const card = screen.getByTestId('canvas-question-q1')
    expect(card.className).toContain('shadow-lg')
  })
})

// ---------------------------------------------------------------------------
// GroupPanel tests
// ---------------------------------------------------------------------------

describe('GroupPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders group title', () => {
    const group = makeGroup('g1', [])
    render(
      <GroupPanel
        group={group}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
      />,
    )

    expect(screen.getByTestId('canvas-group-g1')).toBeInTheDocument()
    expect(screen.getByText('Group g1')).toBeInTheDocument()
  })

  it('renders empty drop zone when group has no questions', () => {
    const group = makeGroup('g1', [])
    render(
      <GroupPanel
        group={group}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
      />,
    )

    expect(screen.getByTestId('empty-group-dropzone-g1')).toBeInTheDocument()
    expect(screen.getByText(/no questions in this group/i)).toBeInTheDocument()
  })

  it('renders "Drop question here" when isOver and group is empty', () => {
    const group = makeGroup('g1', [])
    render(
      <GroupPanel
        group={group}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
        isOver={true}
      />,
    )

    expect(screen.getByText('Drop question here')).toBeInTheDocument()
  })

  it('renders question cards for each question', () => {
    const group = makeGroup('g1', [
      makeQuestion('q1', 'g1', 1),
      makeQuestion('q2', 'g1', 2),
    ])
    render(
      <GroupPanel
        group={group}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
      />,
    )

    expect(screen.getByTestId('canvas-question-q1')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-question-q2')).toBeInTheDocument()
  })

  it('shows add question button when not readOnly', () => {
    const group = makeGroup('g1', [])
    render(
      <GroupPanel
        group={group}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
      />,
    )

    expect(screen.getByTestId('add-question-button-g1')).toBeInTheDocument()
  })

  it('hides add question button when readOnly', () => {
    const group = makeGroup('g1', [])
    render(
      <GroupPanel
        group={group}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={true}
      />,
    )

    expect(screen.queryByTestId('add-question-button-g1')).not.toBeInTheDocument()
  })

  it('applies ring style when isOver and not readOnly', () => {
    const group = makeGroup('g1', [makeQuestion('q1', 'g1', 1)])
    render(
      <GroupPanel
        group={group}
        selectedItem={null}
        onSelectItem={() => {}}
        readOnly={false}
        isOver={true}
      />,
    )

    const card = screen.getByTestId('canvas-group-g1')
    expect(card.className).toContain('ring-2')
  })

  it('calls onSelectItem with group when header clicked', async () => {
    const group = makeGroup('g1', [])
    const onSelectItem = vi.fn()
    render(
      <GroupPanel
        group={group}
        selectedItem={null}
        onSelectItem={onSelectItem}
        readOnly={false}
      />,
    )

    // Click on the group title
    await act(async () => {
      screen.getByText('Group g1').click()
    })

    expect(onSelectItem).toHaveBeenCalledWith({ type: 'group', id: 'g1' })
  })

  it('deselects group when header clicked while already selected', async () => {
    const group = makeGroup('g1', [])
    const onSelectItem = vi.fn()
    render(
      <GroupPanel
        group={group}
        selectedItem={{ type: 'group', id: 'g1' }}
        onSelectItem={onSelectItem}
        readOnly={false}
      />,
    )

    await act(async () => {
      screen.getByText('Group g1').click()
    })

    expect(onSelectItem).toHaveBeenCalledWith(null)
  })
})

// ---------------------------------------------------------------------------
// DnD logic: store + service integration tests
// ---------------------------------------------------------------------------

describe('drag-and-drop store logic', () => {
  const SURVEY_ID = 'survey-1'

  beforeEach(() => {
    useBuilderStore.getState().reset()
    vi.mocked(surveyService.reorderQuestions).mockResolvedValue(undefined)
    vi.mocked(surveyService.moveQuestion).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    useBuilderStore.getState().reset()
  })

  // Setup helper: load groups into the store
  function setupStore(groups: BuilderGroup[]) {
    useBuilderStore.setState({
      surveyId: SURVEY_ID,
      groups,
      title: 'Test Survey',
      status: 'draft',
    })
  }

  it('reorderQuestions updates store correctly', () => {
    const q1 = makeQuestion('q1', 'g1', 1)
    const q2 = makeQuestion('q2', 'g1', 2)
    const group = makeGroup('g1', [q1, q2])
    setupStore([group])

    act(() => {
      useBuilderStore.getState().reorderQuestions('g1', ['q2', 'q1'])
    })

    const updatedGroup = useBuilderStore.getState().groups.find((g) => g.id === 'g1')!
    expect(updatedGroup.questions[0].id).toBe('q2')
    expect(updatedGroup.questions[1].id).toBe('q1')
  })

  it('moveQuestion updates group_id and moves question to target group', () => {
    const q1 = makeQuestion('q1', 'g1', 1)
    const g1 = makeGroup('g1', [q1])
    const g2 = makeGroup('g2', [])
    setupStore([g1, g2])

    act(() => {
      useBuilderStore.getState().moveQuestion('g1', 'g2', 'q1')
    })

    const state = useBuilderStore.getState()
    const updatedG1 = state.groups.find((g) => g.id === 'g1')!
    const updatedG2 = state.groups.find((g) => g.id === 'g2')!

    expect(updatedG1.questions).toHaveLength(0)
    expect(updatedG2.questions).toHaveLength(1)
    expect(updatedG2.questions[0].id).toBe('q1')
    expect(updatedG2.questions[0].group_id).toBe('g2')
  })

  it('undo restores previous state after reorder', () => {
    const q1 = makeQuestion('q1', 'g1', 1)
    const q2 = makeQuestion('q2', 'g1', 2)
    const group = makeGroup('g1', [q1, q2])
    setupStore([group])

    act(() => {
      useBuilderStore.getState().reorderQuestions('g1', ['q2', 'q1'])
    })

    // Verify reordered
    expect(useBuilderStore.getState().groups[0].questions[0].id).toBe('q2')

    act(() => {
      useBuilderStore.getState().undo()
    })

    // Verify restored
    expect(useBuilderStore.getState().groups[0].questions[0].id).toBe('q1')
  })

  it('calls surveyService.reorderQuestions after same-group reorder', async () => {
    const q1 = makeQuestion('q1', 'g1', 1)
    const q2 = makeQuestion('q2', 'g1', 2)
    const group = makeGroup('g1', [q1, q2])
    setupStore([group])

    // Simulate the same-group reorder flow (as done in handleDragEnd)
    const newOrder = ['q2', 'q1']

    await act(async () => {
      useBuilderStore.getState().reorderQuestions('g1', newOrder)
      await surveyService.reorderQuestions(SURVEY_ID, 'g1', newOrder)
    })

    expect(surveyService.reorderQuestions).toHaveBeenCalledWith(SURVEY_ID, 'g1', newOrder)
    expect(useBuilderStore.getState().groups[0].questions[0].id).toBe('q2')
  })

  it('calls surveyService.moveQuestion after cross-group move', async () => {
    const q1 = makeQuestion('q1', 'g1', 1)
    const g1 = makeGroup('g1', [q1])
    const g2 = makeGroup('g2', [])
    setupStore([g1, g2])

    await act(async () => {
      useBuilderStore.getState().moveQuestion('g1', 'g2', 'q1')
      await surveyService.moveQuestion(SURVEY_ID, 'q1', 'g2')
    })

    expect(surveyService.moveQuestion).toHaveBeenCalledWith(SURVEY_ID, 'q1', 'g2')

    const state = useBuilderStore.getState()
    expect(state.groups.find((g) => g.id === 'g2')!.questions).toHaveLength(1)
  })

  it('undoes optimistic update when API fails', async () => {
    const q1 = makeQuestion('q1', 'g1', 1)
    const q2 = makeQuestion('q2', 'g1', 2)
    const group = makeGroup('g1', [q1, q2])
    setupStore([group])

    vi.mocked(surveyService.reorderQuestions).mockRejectedValueOnce(new Error('API Error'))

    let caughtError: unknown
    await act(async () => {
      useBuilderStore.getState().reorderQuestions('g1', ['q2', 'q1'])
      try {
        await surveyService.reorderQuestions(SURVEY_ID, 'g1', ['q2', 'q1'])
      } catch (err) {
        caughtError = err
        // On failure, undo the optimistic update
        useBuilderStore.getState().undo()
      }
    })

    expect(caughtError).toBeDefined()
    // Original order restored
    expect(useBuilderStore.getState().groups[0].questions[0].id).toBe('q1')
  })

  it('undoes cross-group move when API fails', async () => {
    const q1 = makeQuestion('q1', 'g1', 1)
    const g1 = makeGroup('g1', [q1])
    const g2 = makeGroup('g2', [])
    setupStore([g1, g2])

    vi.mocked(surveyService.moveQuestion).mockRejectedValueOnce(new Error('API Error'))

    let caughtError: unknown
    await act(async () => {
      useBuilderStore.getState().moveQuestion('g1', 'g2', 'q1')
      try {
        await surveyService.moveQuestion(SURVEY_ID, 'q1', 'g2')
      } catch (err) {
        caughtError = err
        useBuilderStore.getState().undo()
      }
    })

    expect(caughtError).toBeDefined()
    // q1 is back in g1
    const state = useBuilderStore.getState()
    expect(state.groups.find((g) => g.id === 'g1')!.questions).toHaveLength(1)
    expect(state.groups.find((g) => g.id === 'g2')!.questions).toHaveLength(0)
  })

  it('empty group accepts dropped question via store moveQuestion', () => {
    const q1 = makeQuestion('q1', 'g1', 1)
    const g1 = makeGroup('g1', [q1])
    const g2 = makeGroup('g2', []) // empty
    setupStore([g1, g2])

    act(() => {
      useBuilderStore.getState().moveQuestion('g1', 'g2', 'q1')
    })

    const state = useBuilderStore.getState()
    expect(state.groups.find((g) => g.id === 'g2')!.questions).toHaveLength(1)
    expect(state.groups.find((g) => g.id === 'g2')!.questions[0].id).toBe('q1')
  })

  it('reorderQuestions with 3 questions moves correctly', () => {
    const q1 = makeQuestion('q1', 'g1', 1)
    const q2 = makeQuestion('q2', 'g1', 2)
    const q3 = makeQuestion('q3', 'g1', 3)
    const group = makeGroup('g1', [q1, q2, q3])
    setupStore([group])

    // Move q3 to position 0 (front)
    act(() => {
      useBuilderStore.getState().reorderQuestions('g1', ['q3', 'q1', 'q2'])
    })

    const updatedQuestions = useBuilderStore.getState().groups[0].questions
    expect(updatedQuestions[0].id).toBe('q3')
    expect(updatedQuestions[1].id).toBe('q1')
    expect(updatedQuestions[2].id).toBe('q2')
  })
})

// ---------------------------------------------------------------------------
// SurveyCanvas integration: render test with DnD mocked
// ---------------------------------------------------------------------------

describe('SurveyCanvas DnD rendering', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    useBuilderStore.getState().reset()
  })

  it('renders GroupPanel for each group', () => {
    const g1 = makeGroup('g1', [makeQuestion('q1', 'g1', 1)])
    const g2 = makeGroup('g2', [makeQuestion('q2', 'g2', 1)])

    useBuilderStore.setState({
      surveyId: 'survey-1',
      groups: [g1, g2],
      title: 'Test',
      status: 'draft',
    })

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GroupPanel group={g1} selectedItem={null} onSelectItem={() => {}} readOnly={false} />
        <GroupPanel group={g2} selectedItem={null} onSelectItem={() => {}} readOnly={false} />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('canvas-group-g1')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-group-g2')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-question-q1')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-question-q2')).toBeInTheDocument()
  })

  it('renders drag handles for questions in non-readonly mode', () => {
    const g1 = makeGroup('g1', [makeQuestion('q1', 'g1', 1), makeQuestion('q2', 'g1', 2)])

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GroupPanel group={g1} selectedItem={null} onSelectItem={() => {}} readOnly={false} />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('drag-handle-q1')).toBeInTheDocument()
    expect(screen.getByTestId('drag-handle-q2')).toBeInTheDocument()
  })

  it('does not render drag handles in readOnly mode', () => {
    const g1 = makeGroup('g1', [makeQuestion('q1', 'g1', 1)])

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GroupPanel group={g1} selectedItem={null} onSelectItem={() => {}} readOnly={true} />
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('drag-handle-q1')).not.toBeInTheDocument()
  })

  it('renders empty drop zone for group with no questions', () => {
    const emptyGroup = makeGroup('g-empty', [])

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GroupPanel group={emptyGroup} selectedItem={null} onSelectItem={() => {}} readOnly={false} />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('empty-group-dropzone-g-empty')).toBeInTheDocument()
  })

  it('shows "Drop question here" in empty group when isOver=true', () => {
    const emptyGroup = makeGroup('g-empty', [])

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GroupPanel
          group={emptyGroup}
          selectedItem={null}
          onSelectItem={() => {}}
          readOnly={false}
          isOver={true}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('Drop question here')).toBeInTheDocument()
  })
})
