import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockProfiles } from '../../mocks/handlers'
import ParticipantProfilesPage from '../ParticipantProfilesPage'

const BASE = '/api/v1'

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/participant-profiles']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/participant-profiles" element={<ParticipantProfilesPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

function resetAuthStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isInitializing: false,
    isLoading: false,
  })
}

describe('ParticipantProfilesPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
    setTokens(mockTokens.access_token)
    localStorage.removeItem('survey_tool_refresh_token')
    useAuthStore.setState({
      user: mockUser,
      isAuthenticated: true,
      isInitializing: false,
      isLoading: false,
    })
  })

  it('renders the page heading', async () => {
    renderPage()
    expect(screen.getByText('Participant Profiles')).toBeInTheDocument()
  })

  it('loads and displays profiles', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('profile-table')).toBeInTheDocument()
    })
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
  })

  it('shows empty state when no profiles', async () => {
    server.use(
      http.get(`${BASE}/participant-profiles`, () => {
        return HttpResponse.json(
          { items: [], total: 0, page: 1, per_page: 20, pages: 1 },
          { status: 200 }
        )
      })
    )
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('opens create form when Add Profile is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByTestId('create-profile-button'))
    await user.click(screen.getByTestId('create-profile-button'))
    expect(screen.getByTestId('profile-form-dialog')).toBeInTheDocument()
  })

  it('closes form on cancel', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByTestId('create-profile-button'))
    await user.click(screen.getByTestId('create-profile-button'))
    expect(screen.getByTestId('profile-form-dialog')).toBeInTheDocument()
    await user.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('profile-form-dialog')).not.toBeInTheDocument()
  })

  it('opens delete confirmation when delete button clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByTestId('profile-table'))
    const deleteBtn = screen.getByTestId(`delete-profile-${mockProfiles[0].id}`)
    await user.click(deleteBtn)
    expect(screen.getByTestId('delete-profile-modal')).toBeInTheDocument()
  })

  it('deletes a profile on confirmation', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByTestId('profile-table'))
    const deleteBtn = screen.getByTestId(`delete-profile-${mockProfiles[0].id}`)
    await user.click(deleteBtn)
    await user.click(screen.getByTestId('confirm-delete-profile-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('delete-profile-modal')).not.toBeInTheDocument()
    })
  })

  it('opens CSV import dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByTestId('csv-import-button'))
    await user.click(screen.getByTestId('csv-import-button'))
    expect(screen.getByTestId('profile-csv-import-dialog')).toBeInTheDocument()
  })

  it('shows delete error if delete fails', async () => {
    server.use(
      http.delete(`${BASE}/participant-profiles/:id`, () => {
        return HttpResponse.json(
          { detail: { code: 'INTERNAL_ERROR', message: 'Server error' } },
          { status: 500 }
        )
      })
    )
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByTestId('profile-table'))
    const deleteBtn = screen.getByTestId(`delete-profile-${mockProfiles[0].id}`)
    await user.click(deleteBtn)
    await user.click(screen.getByTestId('confirm-delete-profile-button'))
    await waitFor(() => {
      expect(screen.getByTestId('delete-profile-modal')).toBeInTheDocument()
    })
  })

  it('filters profiles via search form', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByTestId('email-search-input'))
    await user.type(screen.getByTestId('email-search-input'), 'alice')
    await user.click(screen.getByTestId('search-button'))
    // Should trigger a new request — page just re-renders without error
    await waitFor(() => {
      expect(screen.getByTestId('profile-table')).toBeInTheDocument()
    })
  })
})
