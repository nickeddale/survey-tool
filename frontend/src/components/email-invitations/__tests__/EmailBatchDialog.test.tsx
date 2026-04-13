import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup'
import { setTokens } from '../../../services/tokenService'
import { mockTokens } from '../../../mocks/handlers'
import EmailBatchDialog from '../EmailBatchDialog'

const SURVEY_ID = '10000000-0000-0000-0000-000000000002'

function createCsvFile(content: string, name = 'invites.csv'): File {
  return new File([content], name, { type: 'text/csv' })
}

describe('EmailBatchDialog', () => {
  beforeEach(() => {
    setTokens(mockTokens.access_token)
  })

  it('renders the batch dialog', () => {
    render(<EmailBatchDialog surveyId={SURVEY_ID} onComplete={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByTestId('batch-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('batch-file-button')).toBeInTheDocument()
    expect(screen.getByTestId('batch-import-submit')).toBeInTheDocument()
    expect(screen.getByTestId('batch-import-submit')).toBeDisabled()
  })

  it('calls onCancel when cancel button clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<EmailBatchDialog surveyId={SURVEY_ID} onComplete={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('parses CSV and shows preview', async () => {
    const user = userEvent.setup()
    render(<EmailBatchDialog surveyId={SURVEY_ID} onComplete={vi.fn()} onCancel={vi.fn()} />)

    const csvContent = 'email,name\nalice@example.com,Alice\nbob@example.com,Bob'
    const file = createCsvFile(csvContent)

    const fileInput = screen.getByTestId('batch-file-input')
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByTestId('batch-preview-table')).toBeInTheDocument()
    })

    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText(/2 rows found/)).toBeInTheDocument()
  })

  it('shows parse error for empty CSV', async () => {
    const user = userEvent.setup()
    render(<EmailBatchDialog surveyId={SURVEY_ID} onComplete={vi.fn()} onCancel={vi.fn()} />)

    const file = createCsvFile('email\n')
    const fileInput = screen.getByTestId('batch-file-input')
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByTestId('batch-parse-error')).toBeInTheDocument()
    })
  })

  it('enables submit button after CSV loaded', async () => {
    const user = userEvent.setup()
    render(<EmailBatchDialog surveyId={SURVEY_ID} onComplete={vi.fn()} onCancel={vi.fn()} />)

    const file = createCsvFile('email,name\nalice@example.com,Alice')
    await user.upload(screen.getByTestId('batch-file-input'), file)

    await waitFor(() => {
      expect(screen.getByTestId('batch-import-submit')).not.toBeDisabled()
    })
  })

  it('calls onComplete with batch result after successful import', async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()

    render(<EmailBatchDialog surveyId={SURVEY_ID} onComplete={onComplete} onCancel={vi.fn()} />)

    const file = createCsvFile('email,name\nalice@example.com,Alice')
    await user.upload(screen.getByTestId('batch-file-input'), file)

    await waitFor(() => {
      expect(screen.getByTestId('batch-import-submit')).not.toBeDisabled()
    })

    await user.click(screen.getByTestId('batch-import-submit'))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({ sent: 1, failed: 0, skipped: 0 })
    })
  })

  it('shows error when batch send fails', async () => {
    server.use(
      http.post(`/api/v1/surveys/${SURVEY_ID}/invitations/batch`, () =>
        HttpResponse.json({ detail: { code: 'SERVER_ERROR', message: 'Internal error' } }, { status: 500 }),
      ),
    )

    const user = userEvent.setup()
    render(<EmailBatchDialog surveyId={SURVEY_ID} onComplete={vi.fn()} onCancel={vi.fn()} />)

    const file = createCsvFile('email,name\nalice@example.com,Alice')
    await user.upload(screen.getByTestId('batch-file-input'), file)

    await waitFor(() => {
      expect(screen.getByTestId('batch-import-submit')).not.toBeDisabled()
    })

    await user.click(screen.getByTestId('batch-import-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('batch-import-error')).toBeInTheDocument()
    })
  })

  it('shows ellipsis row for more than 5 CSV rows', async () => {
    const user = userEvent.setup()
    render(<EmailBatchDialog surveyId={SURVEY_ID} onComplete={vi.fn()} onCancel={vi.fn()} />)

    const rows = Array.from({ length: 8 }, (_, i) => `user${i}@example.com,User${i}`).join('\n')
    const file = createCsvFile(`email,name\n${rows}`)
    await user.upload(screen.getByTestId('batch-file-input'), file)

    await waitFor(() => {
      expect(screen.getByText(/and 3 more rows/)).toBeInTheDocument()
    })
  })
})
