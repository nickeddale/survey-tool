import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { AuthProvider } from '../../contexts/AuthContext'
import { useAuthStore } from '../../store/authStore'
import { clearTokens, setTokens } from '../../services/tokenService'
import { mockTokens, mockUser, mockApiKeys } from '../../mocks/handlers'
import SettingsPage from '../SettingsPage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSettings() {
  return render(
    <MemoryRouter
      initialEntries={['/settings']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function resetAuthStore() {
  useAuthStore.setState({ user: null, isAuthenticated: false, isInitializing: false, isLoading: false })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsPage', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    resetAuthStore()
    setTokens(mockTokens.access_token)
    useAuthStore.setState({ user: mockUser, isAuthenticated: true, isInitializing: false, isLoading: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Page structure
  // -------------------------------------------------------------------------

  describe('page structure', () => {
    it('renders the settings page title', async () => {
      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('settings-page')).toBeInTheDocument()
      })

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('renders API Keys and Profile tabs', async () => {
      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('tab-api-keys')).toBeInTheDocument()
      })

      expect(screen.getByTestId('tab-profile')).toBeInTheDocument()
    })

    it('shows API keys tab content by default', async () => {
      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('api-keys-tab')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // API Keys tab — loading state
  // -------------------------------------------------------------------------

  describe('API keys loading state', () => {
    it('renders loading skeleton while fetching keys', async () => {
      server.use(
        http.get('/api/v1/auth/keys', () => new Promise<never>(() => {})),
      )

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('api-keys-loading')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // API Keys tab — data loaded
  // -------------------------------------------------------------------------

  describe('API keys loaded state', () => {
    it('renders API key names', async () => {
      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Production Key')).toBeInTheDocument()
      })

      expect(screen.getByText('Staging Key')).toBeInTheDocument()
    })

    it('renders key_prefix values (not full keys)', async () => {
      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId(`api-key-prefix-${mockApiKeys[0].id}`)).toBeInTheDocument()
      })

      const prefix = screen.getByTestId(`api-key-prefix-${mockApiKeys[0].id}`)
      expect(prefix).toHaveTextContent(mockApiKeys[0].key_prefix)
    })

    it('does NOT expose the full key in the list', async () => {
      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Production Key')).toBeInTheDocument()
      })

      // There must be no element containing a full API key in the list
      // The mock GET response returns only key_prefix, never a 'key' field
      const rows = screen.getAllByRole('row')
      const rowText = rows.map((r) => r.textContent ?? '').join(' ')
      // key_prefix ends in '...' suffix but no full long key
      expect(rowText).not.toMatch(/sk_live_mock_full_api_key/)
    })

    it('renders active badge for active keys', async () => {
      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId(`api-key-active-badge-${mockApiKeys[0].id}`)).toBeInTheDocument()
      })
    })

    it('renders revoke button for each key', async () => {
      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId(`revoke-key-button-${mockApiKeys[0].id}`)).toBeInTheDocument()
      })

      expect(screen.getByTestId(`revoke-key-button-${mockApiKeys[1].id}`)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // API Keys tab — empty state
  // -------------------------------------------------------------------------

  describe('API keys empty state', () => {
    it('renders empty state when no keys exist', async () => {
      server.use(
        http.get('/api/v1/auth/keys', () => HttpResponse.json([], { status: 200 })),
      )

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('api-keys-empty')).toBeInTheDocument()
      })

      expect(screen.getByText(/no api keys yet/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // API Keys tab — create flow
  // -------------------------------------------------------------------------

  describe('create API key', () => {
    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('create-key-form')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('create-key-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('create-key-error')).toBeInTheDocument()
      })

      expect(screen.getByTestId('create-key-error')).toHaveTextContent(/key name is required/i)
    })

    it('submits create form with key name and shows one-time key display', async () => {
      const user = userEvent.setup()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('new-key-name-input')).toBeInTheDocument()
      })

      await act(async () => {
        await user.type(screen.getByTestId('new-key-name-input'), 'My Test Key')
        await user.click(screen.getByTestId('create-key-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('created-key-display')).toBeInTheDocument()
      })

      // The full key should be shown in the one-time display (masked by default)
      expect(screen.getByTestId('created-key-value')).toBeInTheDocument()
    })

    it('shows the full key when visibility toggle is clicked', async () => {
      const user = userEvent.setup()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('new-key-name-input')).toBeInTheDocument()
      })

      await act(async () => {
        await user.type(screen.getByTestId('new-key-name-input'), 'My Test Key')
        await user.click(screen.getByTestId('create-key-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('created-key-display')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('toggle-key-visibility'))
      })

      // After toggle, the full key text should be visible
      expect(screen.getByTestId('created-key-value')).toHaveTextContent('sk_live_mock_full_api_key_abc123xyz456def789ghi0jkl')
    })

    it('clears one-time key display when dismissed', async () => {
      const user = userEvent.setup()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('new-key-name-input')).toBeInTheDocument()
      })

      await act(async () => {
        await user.type(screen.getByTestId('new-key-name-input'), 'My Test Key')
        await user.click(screen.getByTestId('create-key-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('created-key-display')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('dismiss-created-key'))
      })

      expect(screen.queryByTestId('created-key-display')).not.toBeInTheDocument()
    })

    it('sends correct payload to POST /auth/keys', async () => {
      const user = userEvent.setup()

      let capturedBody: Record<string, unknown> | null = null
      server.use(
        http.post('/api/v1/auth/keys', async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(
            {
              id: 'key-captured',
              name: capturedBody.name as string,
              key: 'sk_live_captured_key_value',
              key_prefix: 'sk_live_ca',
              scopes: null,
              is_active: true,
              expires_at: null,
              created_at: new Date().toISOString(),
            },
            { status: 201 },
          )
        }),
      )

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('new-key-name-input')).toBeInTheDocument()
      })

      await act(async () => {
        await user.type(screen.getByTestId('new-key-name-input'), 'Integration Key')
        await user.click(screen.getByTestId('create-key-button'))
      })

      await waitFor(() => {
        expect(capturedBody).not.toBeNull()
      })

      expect(capturedBody!.name).toBe('Integration Key')
    })

    it('shows API error when create fails', async () => {
      const user = userEvent.setup()

      server.use(
        http.post('/api/v1/auth/keys', () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Server error' } },
            { status: 500 },
          ),
        ),
      )

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('new-key-name-input')).toBeInTheDocument()
      })

      await act(async () => {
        await user.type(screen.getByTestId('new-key-name-input'), 'My Key')
        await user.click(screen.getByTestId('create-key-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('create-key-error')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // API Keys tab — revoke flow
  // -------------------------------------------------------------------------

  describe('revoke API key', () => {
    it('shows revoke confirmation modal when revoke button is clicked', async () => {
      const user = userEvent.setup()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId(`revoke-key-button-${mockApiKeys[0].id}`)).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId(`revoke-key-button-${mockApiKeys[0].id}`))
      })

      expect(screen.getByTestId('revoke-confirm-modal')).toBeInTheDocument()
      expect(screen.getByText(/revoke api key/i)).toBeInTheDocument()
    })

    it('cancels revoke when Cancel is clicked', async () => {
      const user = userEvent.setup()

      let deleteCalled = false
      server.use(
        http.delete('/api/v1/auth/keys/:keyId', () => {
          deleteCalled = true
          return new HttpResponse(null, { status: 204 })
        }),
      )

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId(`revoke-key-button-${mockApiKeys[0].id}`)).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId(`revoke-key-button-${mockApiKeys[0].id}`))
      })

      expect(screen.getByTestId('revoke-confirm-modal')).toBeInTheDocument()

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /cancel/i }))
      })

      expect(screen.queryByTestId('revoke-confirm-modal')).not.toBeInTheDocument()
      expect(deleteCalled).toBe(false)
    })

    it('calls DELETE and closes modal when confirmed', async () => {
      const user = userEvent.setup()

      let deletedKeyId = ''
      server.use(
        http.delete('/api/v1/auth/keys/:keyId', ({ params }) => {
          deletedKeyId = params.keyId as string
          return new HttpResponse(null, { status: 204 })
        }),
      )

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId(`revoke-key-button-${mockApiKeys[0].id}`)).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId(`revoke-key-button-${mockApiKeys[0].id}`))
      })

      await act(async () => {
        await user.click(screen.getByTestId('confirm-revoke-button'))
      })

      await waitFor(() => {
        expect(deletedKeyId).toBe(mockApiKeys[0].id)
      })

      await waitFor(() => {
        expect(screen.queryByTestId('revoke-confirm-modal')).not.toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // API Keys tab — error state
  // -------------------------------------------------------------------------

  describe('API keys error state', () => {
    it('renders error alert when GET /auth/keys returns 500', async () => {
      server.use(
        http.get('/api/v1/auth/keys', () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
            { status: 500 },
          ),
        ),
      )

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('api-keys-error')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Profile tab
  // -------------------------------------------------------------------------

  describe('profile tab', () => {
    it('switches to profile tab when clicked', async () => {
      const user = userEvent.setup()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('tab-profile')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('tab-profile'))
      })

      expect(screen.getByTestId('profile-tab')).toBeInTheDocument()
    })

    it('renders email field pre-filled and disabled', async () => {
      const user = userEvent.setup()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('tab-profile')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('tab-profile'))
      })

      const emailInput = screen.getByTestId('profile-email-input') as HTMLInputElement
      expect(emailInput.value).toBe(mockUser.email)
      expect(emailInput.disabled).toBe(true)
    })

    it('renders name field pre-filled with current user name', async () => {
      const user = userEvent.setup()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('tab-profile')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('tab-profile'))
      })

      const nameInput = screen.getByTestId('profile-name-input') as HTMLInputElement
      expect(nameInput.value).toBe(mockUser.name)
    })

    it('submits profile update and shows success message', async () => {
      const user = userEvent.setup()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('tab-profile')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('tab-profile'))
      })

      const nameInput = screen.getByTestId('profile-name-input')
      await act(async () => {
        await user.clear(nameInput)
        await user.type(nameInput, 'New Name')
        await user.click(screen.getByTestId('profile-save-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('profile-success')).toBeInTheDocument()
      })

      expect(screen.getByTestId('profile-success')).toHaveTextContent(/profile updated successfully/i)
    })

    it('sends correct payload to PATCH /auth/me', async () => {
      const user = userEvent.setup()

      let capturedBody: Record<string, unknown> | null = null
      server.use(
        http.patch('/api/v1/auth/me', async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ ...mockUser, name: capturedBody.name as string }, { status: 200 })
        }),
      )

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('tab-profile')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('tab-profile'))
      })

      const nameInput = screen.getByTestId('profile-name-input')
      await act(async () => {
        await user.clear(nameInput)
        await user.type(nameInput, 'Updated Name')
        await user.click(screen.getByTestId('profile-save-button'))
      })

      await waitFor(() => {
        expect(capturedBody).not.toBeNull()
      })

      expect(capturedBody!.name).toBe('Updated Name')
    })

    it('shows profile error when PATCH /auth/me fails', async () => {
      const user = userEvent.setup()

      server.use(
        http.patch('/api/v1/auth/me', () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Server error' } },
            { status: 500 },
          ),
        ),
      )

      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('tab-profile')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('tab-profile'))
      })

      await act(async () => {
        await user.click(screen.getByTestId('profile-save-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('profile-error')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Password change
  // -------------------------------------------------------------------------

  describe('password change', () => {
    async function navigateToProfile(user: ReturnType<typeof userEvent.setup>) {
      renderSettings()

      await waitFor(() => {
        expect(screen.getByTestId('tab-profile')).toBeInTheDocument()
      })

      await act(async () => {
        await user.click(screen.getByTestId('tab-profile'))
      })
    }

    it('shows error when current password is empty', async () => {
      const user = userEvent.setup()
      await navigateToProfile(user)

      await act(async () => {
        await user.click(screen.getByTestId('password-save-button'))
      })

      expect(screen.getByTestId('password-error')).toHaveTextContent(/current password is required/i)
    })

    it('shows error when new passwords do not match', async () => {
      const user = userEvent.setup()
      await navigateToProfile(user)

      await act(async () => {
        await user.type(screen.getByTestId('current-password-input'), 'oldpass')
        await user.type(screen.getByTestId('new-password-input'), 'newpass1')
        await user.type(screen.getByTestId('confirm-password-input'), 'newpass2')
        await user.click(screen.getByTestId('password-save-button'))
      })

      expect(screen.getByTestId('password-error')).toHaveTextContent(/passwords do not match/i)
    })

    it('submits password change and shows success message', async () => {
      const user = userEvent.setup()
      await navigateToProfile(user)

      await act(async () => {
        await user.type(screen.getByTestId('current-password-input'), 'oldpass')
        await user.type(screen.getByTestId('new-password-input'), 'newpass123')
        await user.type(screen.getByTestId('confirm-password-input'), 'newpass123')
        await user.click(screen.getByTestId('password-save-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('password-success')).toBeInTheDocument()
      })

      expect(screen.getByTestId('password-success')).toHaveTextContent(/password changed successfully/i)
    })
  })
})
