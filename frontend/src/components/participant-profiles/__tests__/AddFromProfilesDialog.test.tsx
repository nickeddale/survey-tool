import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../../../contexts/AuthContext'
import { useAuthStore } from '../../../store/authStore'
import { clearTokens, setTokens } from '../../../services/tokenService'
import { mockTokens, mockUser } from '../../../mocks/handlers'
import AddFromProfilesDialog from '../AddFromProfilesDialog'

function renderDialog(onComplete = vi.fn(), onCancel = vi.fn()) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AddFromProfilesDialog
          surveyId="10000000-0000-0000-0000-000000000001"
          onComplete={onComplete}
          onCancel={onCancel}
        />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('AddFromProfilesDialog', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isInitializing: false,
      isLoading: false,
    })
    setTokens(mockTokens.access_token)
    useAuthStore.setState({
      user: mockUser,
      isAuthenticated: true,
      isInitializing: false,
      isLoading: false,
    })
  })

  it('renders the dialog', () => {
    renderDialog()
    expect(screen.getByTestId('add-from-profiles-dialog')).toBeInTheDocument()
    expect(screen.getByText('Add Participants from Profiles')).toBeInTheDocument()
  })

  it('loads profiles on render', async () => {
    renderDialog()
    await waitFor(() => {
      expect(screen.getByTestId('profiles-select-table')).toBeInTheDocument()
    })
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('calls onCancel when cancel clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    renderDialog(vi.fn(), onCancel)
    await user.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('assign button is disabled when no profiles selected', async () => {
    renderDialog()
    await waitFor(() => screen.getByTestId('assign-profiles-button'))
    expect(screen.getByTestId('assign-profiles-button')).toBeDisabled()
  })

  it('enables assign button when a profile is selected', async () => {
    const user = userEvent.setup()
    renderDialog()
    await waitFor(() => screen.getByTestId('profiles-select-table'))
    // Click on first profile row
    const rows = screen.getAllByRole('row')
    await user.click(rows[1]) // First data row (after header)
    await waitFor(() => {
      expect(screen.getByTestId('assign-profiles-button')).not.toBeDisabled()
    })
  })
})
