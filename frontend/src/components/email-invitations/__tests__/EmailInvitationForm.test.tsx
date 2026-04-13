import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmailInvitationForm from '../EmailInvitationForm'

describe('EmailInvitationForm', () => {
  it('renders the form modal', () => {
    render(<EmailInvitationForm onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByTestId('invitation-form-modal')).toBeInTheDocument()
    expect(screen.getByTestId('inv-email-input')).toBeInTheDocument()
    expect(screen.getByTestId('inv-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('inv-subject-input')).toBeInTheDocument()
    expect(screen.getByTestId('inv-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('inv-submit-button')).toBeInTheDocument()
  })

  it('shows validation error when email is empty', async () => {
    const user = userEvent.setup()
    render(<EmailInvitationForm onSubmit={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByTestId('inv-submit-button'))

    expect(screen.getByTestId('form-error')).toHaveTextContent('Recipient email is required')
  })

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup()
    render(<EmailInvitationForm onSubmit={vi.fn()} onCancel={vi.fn()} />)

    await user.type(screen.getByTestId('inv-email-input'), 'not-an-email')
    await user.click(screen.getByTestId('inv-submit-button'))

    expect(screen.getByTestId('form-error')).toHaveTextContent('valid email address')
  })

  it('calls onSubmit with correct data on valid submission', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(<EmailInvitationForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByTestId('inv-email-input'), 'test@example.com')
    await user.type(screen.getByTestId('inv-name-input'), 'Test User')
    await user.type(screen.getByTestId('inv-subject-input'), 'Take our survey')
    await user.click(screen.getByTestId('inv-submit-button'))

    expect(onSubmit).toHaveBeenCalledWith({
      recipient_email: 'test@example.com',
      recipient_name: 'Test User',
      subject: 'Take our survey',
      invitation_type: 'invite',
    })
  })

  it('submits with undefined for empty optional fields', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(<EmailInvitationForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.type(screen.getByTestId('inv-email-input'), 'test@example.com')
    await user.click(screen.getByTestId('inv-submit-button'))

    expect(onSubmit).toHaveBeenCalledWith({
      recipient_email: 'test@example.com',
      recipient_name: undefined,
      subject: undefined,
      invitation_type: 'invite',
    })
  })

  it('calls onCancel when cancel button clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<EmailInvitationForm onSubmit={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows API error when error prop provided', () => {
    render(
      <EmailInvitationForm onSubmit={vi.fn()} onCancel={vi.fn()} error="Server error occurred" />,
    )

    expect(screen.getByTestId('form-error')).toHaveTextContent('Server error occurred')
  })

  it('shows loading state', () => {
    render(<EmailInvitationForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading />)

    expect(screen.getByTestId('inv-submit-button')).toHaveTextContent('Sending...')
    expect(screen.getByTestId('inv-submit-button')).toBeDisabled()
  })

  it('allows selecting reminder type', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(<EmailInvitationForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    await user.selectOptions(screen.getByTestId('inv-type-select'), 'reminder')
    await user.type(screen.getByTestId('inv-email-input'), 'test@example.com')
    await user.click(screen.getByTestId('inv-submit-button'))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ invitation_type: 'reminder' }),
    )
  })
})
