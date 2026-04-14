import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmailInvitationTable, { EmailInvitationTableSkeleton } from '../EmailInvitationTable'
import type { EmailInvitationResponse } from '../../../types/survey'

const mockInvitations: EmailInvitationResponse[] = [
  {
    id: 'inv-1',
    survey_id: 'survey-1',
    recipient_email: 'alice@example.com',
    recipient_name: 'Alice',
    subject: 'Survey Invite',
    invitation_type: 'invite',
    status: 'delivered',
    sent_at: '2024-01-10T10:00:00Z',
    delivered_at: '2024-01-10T10:01:00Z',
    opened_at: null,
    clicked_at: null,
    bounced_at: null,
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-01-10T10:01:00Z',
  },
  {
    id: 'inv-2',
    survey_id: 'survey-1',
    recipient_email: 'bob@example.com',
    recipient_name: null,
    subject: null,
    invitation_type: 'reminder',
    status: 'failed',
    sent_at: null,
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    bounced_at: null,
    created_at: '2024-01-11T10:00:00Z',
    updated_at: '2024-01-11T10:00:00Z',
  },
  {
    id: 'inv-3',
    survey_id: 'survey-1',
    recipient_email: 'carol@example.com',
    recipient_name: null,
    subject: null,
    invitation_type: 'invite',
    status: 'bounced',
    sent_at: '2024-01-12T10:00:00Z',
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    bounced_at: '2024-01-12T10:05:00Z',
    created_at: '2024-01-12T10:00:00Z',
    updated_at: '2024-01-12T10:05:00Z',
  },
]

describe('EmailInvitationTableSkeleton', () => {
  it('renders skeleton', () => {
    render(<EmailInvitationTableSkeleton />)
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument()
  })
})

describe('EmailInvitationTable', () => {
  it('renders table with invitations', () => {
    render(
      <EmailInvitationTable invitations={mockInvitations} onResend={vi.fn()} onDelete={vi.fn()} />
    )

    expect(screen.getByTestId('invitation-table')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()
  })

  it('renders recipient name when provided', () => {
    render(
      <EmailInvitationTable invitations={mockInvitations} onResend={vi.fn()} onDelete={vi.fn()} />
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('renders correct status badges with color classes', () => {
    render(
      <EmailInvitationTable invitations={mockInvitations} onResend={vi.fn()} onDelete={vi.fn()} />
    )

    const deliveredBadge = screen.getByTestId('status-badge-delivered')
    expect(deliveredBadge).toBeInTheDocument()
    expect(deliveredBadge).toHaveClass('bg-green-100')

    const failedBadge = screen.getByTestId('status-badge-failed')
    expect(failedBadge).toBeInTheDocument()
    expect(failedBadge).toHaveClass('bg-red-100')

    const bouncedBadge = screen.getByTestId('status-badge-bounced')
    expect(bouncedBadge).toBeInTheDocument()
    expect(bouncedBadge).toHaveClass('bg-red-100')
  })

  it('shows resend button only for failed and bounced invitations', () => {
    render(
      <EmailInvitationTable invitations={mockInvitations} onResend={vi.fn()} onDelete={vi.fn()} />
    )

    // delivered invitation should NOT have resend button
    expect(screen.queryByTestId('resend-button-inv-1')).not.toBeInTheDocument()

    // failed invitation should have resend button
    expect(screen.getByTestId('resend-button-inv-2')).toBeInTheDocument()

    // bounced invitation should have resend button
    expect(screen.getByTestId('resend-button-inv-3')).toBeInTheDocument()
  })

  it('calls onResend when resend button clicked', async () => {
    const onResend = vi.fn()
    const user = userEvent.setup()

    render(
      <EmailInvitationTable invitations={mockInvitations} onResend={onResend} onDelete={vi.fn()} />
    )

    await user.click(screen.getByTestId('resend-button-inv-2'))
    expect(onResend).toHaveBeenCalledWith(mockInvitations[1])
  })

  it('calls onDelete when delete button clicked', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()

    render(
      <EmailInvitationTable invitations={mockInvitations} onResend={vi.fn()} onDelete={onDelete} />
    )

    await user.click(screen.getByTestId('delete-button-inv-1'))
    expect(onDelete).toHaveBeenCalledWith(mockInvitations[0])
  })

  it('disables resend button when resendingId matches', () => {
    render(
      <EmailInvitationTable
        invitations={mockInvitations}
        onResend={vi.fn()}
        onDelete={vi.fn()}
        resendingId="inv-2"
      />
    )

    expect(screen.getByTestId('resend-button-inv-2')).toBeDisabled()
  })

  it('shows dash for null sent_at', () => {
    render(
      <EmailInvitationTable
        invitations={[mockInvitations[1]]}
        onResend={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders table headers', () => {
    render(
      <EmailInvitationTable invitations={mockInvitations} onResend={vi.fn()} onDelete={vi.fn()} />
    )

    expect(screen.getByText('Recipient')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Sent At')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })
})
