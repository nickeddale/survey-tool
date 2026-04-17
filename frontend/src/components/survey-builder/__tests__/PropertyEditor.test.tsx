/**
 * Unit tests for PropertyEditor component.
 *
 * Patterns used:
 * - Wrap every await user.click/type() in act(async () => ...) to avoid act() warnings.
 * - Auth state pre-populated via useAuthStore.setState (no refresh token in localStorage).
 * - vi.useRealTimers() in afterEach to prevent timer leaks.
 * - MSW server lifecycle managed by src/test/setup.ts (do NOT add server.listen here).
 * - Never use vi.useFakeTimers() with MSW — fake timers block MSW promise resolution.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup'
import { useAuthStore } from '../../../store/authStore'
import { useBuilderStore } from '../../../store/builderStore'
import { clearTokens, setTokens } from '../../../services/tokenService'
import { mockTokens, mockUser, mockSurveyFull } from '../../../mocks/handlers'
import { PropertyEditor } from '../PropertyEditor'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SURVEY_ID = mockSurveyFull.id
const GROUP = mockSurveyFull.groups[0] // id: 'g1', title: 'General Questions'

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderEditor(options: { readOnly?: boolean } = {}) {
  const { readOnly = false } = options
  return render(
    <PropertyEditor
      surveyId={SURVEY_ID}
      readOnly={readOnly}
      selectedItem={{ type: 'group', id: GROUP.id }}
    />
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTokens()
  localStorage.clear()
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isInitializing: false,
    isLoading: false,
  })
  useBuilderStore.getState().reset()

  // Pre-populate auth state without triggering AuthProvider.initialize()
  setTokens(mockTokens.access_token)
  localStorage.removeItem('survey_tool_refresh_token')
  useAuthStore.setState({
    user: mockUser,
    isAuthenticated: true,
    isInitializing: false,
    isLoading: false,
  })

  // Load survey into builder store
  useBuilderStore.getState().loadSurvey(mockSurveyFull)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  useBuilderStore.getState().reset()
})

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('empty state', () => {
  it('shows placeholder when nothing is selected', () => {
    render(<PropertyEditor surveyId={SURVEY_ID} readOnly={false} selectedItem={null} />)
    expect(screen.getByText(/select a group or question/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Group properties panel
// ---------------------------------------------------------------------------

describe('group properties', () => {
  it('renders group title input with current group title', () => {
    renderEditor()
    const input = screen.getByTestId('property-group-title') as HTMLInputElement
    expect(input.value).toBe(GROUP.title)
  })

  it('updates store immediately when group title changes', async () => {
    const user = userEvent.setup()
    renderEditor()

    const input = screen.getByTestId('property-group-title')

    await act(async () => {
      await user.clear(input)
      await user.type(input, 'Updated Title')
    })

    const storeGroup = useBuilderStore.getState().groups.find((g) => g.id === GROUP.id)
    expect(storeGroup?.title).toBe('Updated Title')
  })

  it('calls PATCH API after debounce when group title changes', async () => {
    const user = userEvent.setup()

    let patchedBody: Record<string, unknown> | null = null
    server.use(
      http.patch(`/api/v1/surveys/${SURVEY_ID}/groups/${GROUP.id}`, async ({ request }) => {
        patchedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...GROUP, ...patchedBody }, { status: 200 })
      })
    )

    renderEditor()
    const input = screen.getByTestId('property-group-title')

    await act(async () => {
      await user.clear(input)
      await user.type(input, 'New Title')
    })

    await waitFor(
      () => {
        expect(patchedBody).not.toBeNull()
        expect(patchedBody?.title).toBe('New Title')
      },
      { timeout: 2000 }
    )
  })

  it('pushes undo entry when group title changes', async () => {
    const user = userEvent.setup()
    renderEditor()

    const initialUndoLength = useBuilderStore.getState().undoStack.length

    await act(async () => {
      const input = screen.getByTestId('property-group-title')
      await user.clear(input)
      await user.type(input, 'A')
    })

    expect(useBuilderStore.getState().undoStack.length).toBeGreaterThan(initialUndoLength)
  })

  it('disables input when readOnly', () => {
    renderEditor({ readOnly: true })
    const input = screen.getByTestId('property-group-title') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('syncs input value when a different group is selected', async () => {
    // First render with GROUP selected
    const { rerender } = render(
      <PropertyEditor
        surveyId={SURVEY_ID}
        readOnly={false}
        selectedItem={{ type: 'group', id: GROUP.id }}
      />
    )

    // Add a second group to the store and rerender with it selected
    const secondGroup = {
      id: 'g2',
      survey_id: SURVEY_ID,
      title: 'Second Group',
      description: null,
      sort_order: 2,
      relevance: null,
      created_at: '2024-01-09T10:00:00Z',
      questions: [],
    }

    await act(async () => {
      useBuilderStore.getState().addGroup(secondGroup)
    })

    await act(async () => {
      rerender(
        <PropertyEditor
          surveyId={SURVEY_ID}
          readOnly={false}
          selectedItem={{ type: 'group', id: 'g2' }}
        />
      )
    })

    const input = screen.getByTestId('property-group-title') as HTMLInputElement
    expect(input.value).toBe('Second Group')
  })
})
