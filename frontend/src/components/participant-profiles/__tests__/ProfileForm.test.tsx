import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileForm from '../ProfileForm'

const noop = vi.fn().mockResolvedValue(undefined)

describe('ProfileForm', () => {
  it('renders create form with email field', () => {
    render(<ProfileForm onSubmit={noop} onCancel={noop} />)
    expect(screen.getByTestId('profile-form-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('profile-email-input')).toBeInTheDocument()
    expect(screen.getByTestId('profile-form-submit')).toHaveTextContent('Add Profile')
  })

  it('renders edit form when profile provided', () => {
    const profile = {
      id: 'pp-1',
      email: 'test@example.com',
      first_name: 'Alice',
      last_name: null,
      phone: null,
      organization: null,
      attributes: null,
      tags: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    render(<ProfileForm profile={profile} onSubmit={noop} onCancel={noop} />)
    expect(screen.getByTestId('profile-email-input')).toHaveValue('test@example.com')
    expect(screen.getByTestId('profile-first-name-input')).toHaveValue('Alice')
    expect(screen.getByText('Save Changes')).toBeInTheDocument()
  })

  it('shows validation error if email is empty on create', async () => {
    const user = userEvent.setup()
    render(<ProfileForm onSubmit={noop} onCancel={noop} />)
    await user.click(screen.getByTestId('profile-form-submit'))
    expect(screen.getByTestId('profile-form-error')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<ProfileForm onSubmit={noop} onCancel={onCancel} />)
    await user.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onSubmit with correct data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ProfileForm onSubmit={onSubmit} onCancel={noop} />)
    await user.type(screen.getByTestId('profile-email-input'), 'newuser@example.com')
    await user.type(screen.getByTestId('profile-first-name-input'), 'New')
    await user.click(screen.getByTestId('profile-form-submit'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'newuser@example.com', first_name: 'New' })
    )
  })

  it('shows error prop when passed', () => {
    render(<ProfileForm onSubmit={noop} onCancel={noop} error="Server error" />)
    expect(screen.getByTestId('profile-form-error')).toHaveTextContent('Server error')
  })

  it('can add and remove attributes', async () => {
    const user = userEvent.setup()
    render(<ProfileForm onSubmit={noop} onCancel={noop} />)
    await user.click(screen.getByTestId('add-attribute-button'))
    expect(screen.getByTestId('attribute-key-0')).toBeInTheDocument()
    await user.click(screen.getByTestId('remove-attribute-0'))
    expect(screen.queryByTestId('attribute-key-0')).not.toBeInTheDocument()
  })
})
