import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ParticipantTable from '../ParticipantTable'
import type { ParticipantResponse } from '../../../types/survey'

const mockParticipants: ParticipantResponse[] = [
  {
    id: 'p1',
    survey_id: 'survey-1',
    external_id: null,
    email: 'alice@example.com',
    attributes: { department: 'Engineering' },
    uses_remaining: 3,
    valid_from: null,
    valid_until: null,
    completed: false,
    created_at: '2024-01-10T10:00:00Z',
    token: 'abcd1234',
  },
  {
    id: 'p2',
    survey_id: 'survey-1',
    external_id: null,
    email: null,
    attributes: null,
    uses_remaining: null,
    valid_from: '2024-01-01T00:00:00Z',
    valid_until: '2024-12-31T23:59:59Z',
    completed: true,
    created_at: '2024-01-11T10:00:00Z',
  },
]

describe('ParticipantTable', () => {
  it('renders empty state when no participants', () => {
    render(
      <ParticipantTable
        participants={[]}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('renders participant emails in table', () => {
    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('renders masked token for each participant', () => {
    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )
    const tokenEl = screen.getByTestId('participant-token-p1')
    expect(tokenEl.textContent).toBe('••••1234')
  })

  it('shows ∞ for unlimited uses_remaining', () => {
    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )
    expect(screen.getByText('∞')).toBeInTheDocument()
  })

  it('shows uses_remaining number when set', () => {
    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders completed badge for completed participant', () => {
    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )
    expect(screen.getByTestId('participant-completed-badge-p2')).toBeInTheDocument()
  })

  it('renders pending badge for incomplete participant', () => {
    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )
    expect(screen.getByTestId('participant-pending-badge-p1')).toBeInTheDocument()
  })

  it('calls onEdit when edit button clicked', async () => {
    const onEdit = vi.fn()
    const user = userEvent.setup()

    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={onEdit}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )

    await user.click(screen.getByTestId('participant-edit-p1'))
    expect(onEdit).toHaveBeenCalledWith(mockParticipants[0])
  })

  it('calls onDelete when delete button clicked', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()

    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={onDelete}
        onCopyLink={vi.fn()}
      />,
    )

    await user.click(screen.getByTestId('participant-delete-p1'))
    expect(onDelete).toHaveBeenCalledWith(mockParticipants[0])
  })

  it('calls onCopyLink when copy link button clicked', async () => {
    const onCopyLink = vi.fn()
    const user = userEvent.setup()

    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={onCopyLink}
      />,
    )

    await user.click(screen.getByTestId('participant-copy-link-p1'))
    expect(onCopyLink).toHaveBeenCalledWith(mockParticipants[0])
  })

  it('renders all table headers', () => {
    render(
      <ParticipantTable
        participants={mockParticipants}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )

    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Token')).toBeInTheDocument()
    expect(screen.getByText('Uses Remaining')).toBeInTheDocument()
    expect(screen.getByText('Valid From')).toBeInTheDocument()
    expect(screen.getByText('Valid Until')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('shows dash for null email', () => {
    render(
      <ParticipantTable
        participants={[mockParticipants[1]]}
        surveyId="survey-1"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
      />,
    )
    expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument()
  })
})
