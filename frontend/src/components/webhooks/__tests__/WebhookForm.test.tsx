import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WebhookForm from '../WebhookForm'
import type { WebhookResponse, SurveyResponse, WebhookCreate } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSurveys: SurveyResponse[] = [
  {
    id: 'survey-1',
    user_id: 'user-1',
    title: 'Customer Satisfaction Survey',
    description: null,
    status: 'active',
    welcome_message: null,
    end_message: null,
    default_language: 'en',
    settings: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'survey-2',
    user_id: 'user-1',
    title: 'Employee Feedback',
    description: null,
    status: 'draft',
    welcome_message: null,
    end_message: null,
    default_language: 'en',
    settings: null,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
]

const mockExistingWebhook: WebhookResponse = {
  id: 'webhook-1',
  user_id: 'user-1',
  url: 'https://example.com/webhook',
  events: ['response.completed', 'survey.activated'],
  survey_id: null,
  is_active: true,
  secret: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockSurveyWebhook: WebhookResponse = {
  id: 'webhook-2',
  user_id: 'user-1',
  url: 'https://myapp.io/hooks',
  events: ['response.started'],
  survey_id: 'survey-1',
  is_active: false,
  secret: null,
  created_at: '2024-01-02T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookForm', () => {
  // -------------------------------------------------------------------------
  // Create mode
  // -------------------------------------------------------------------------

  describe('create mode (no webhook prop)', () => {
    it('renders create title', () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      expect(screen.getByRole('heading', { name: 'Create Webhook' })).toBeInTheDocument()
    })

    it('renders empty URL field', () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      const urlInput = screen.getByTestId('webhook-url-input') as HTMLInputElement
      expect(urlInput.value).toBe('')
    })

    it('renders all 5 event checkboxes unchecked', () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      const events = [
        'response.started',
        'response.completed',
        'survey.activated',
        'survey.closed',
        'quota.reached',
      ]
      for (const event of events) {
        const checkbox = screen.getByTestId(`webhook-event-${event}`) as HTMLInputElement
        expect(checkbox.checked).toBe(false)
      }
    })

    it('renders survey selector with "All surveys" default', () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      const select = screen.getByTestId('webhook-survey-select') as HTMLSelectElement
      expect(select.value).toBe('')
      expect(screen.getByText('All surveys')).toBeInTheDocument()
    })

    it('renders survey options in selector', () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      expect(screen.getByText('Customer Satisfaction Survey')).toBeInTheDocument()
      expect(screen.getByText('Employee Feedback')).toBeInTheDocument()
    })

    it('renders active checkbox checked by default', () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      const checkbox = screen.getByTestId('webhook-active-checkbox') as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })

    it('does not render secret masked field in create mode', () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      expect(screen.queryByTestId('webhook-secret-masked')).not.toBeInTheDocument()
    })

    it('calls onCancel when cancel button is clicked', async () => {
      const onCancel = vi.fn()
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={onCancel} />
      )
      const user = userEvent.setup()
      await act(async () => {
        await user.click(screen.getByTestId('webhook-form-cancel'))
      })
      expect(onCancel).toHaveBeenCalledOnce()
    })

    it('submits with correct payload when form is valid', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={onSubmit} onCancel={vi.fn()} />
      )
      const user = userEvent.setup()

      await act(async () => {
        await user.type(screen.getByTestId('webhook-url-input'), 'https://example.com/hook')
        await user.click(screen.getByTestId('webhook-event-response.completed'))
        await user.click(screen.getByTestId('webhook-form-submit'))
      })

      expect(onSubmit).toHaveBeenCalledWith({
        url: 'https://example.com/hook',
        events: ['response.completed'],
        survey_id: null,
        is_active: true,
      } satisfies WebhookCreate)
    })

    it('shows validation error for empty URL', async () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      const user = userEvent.setup()
      await act(async () => {
        await user.click(screen.getByTestId('webhook-form-submit'))
      })
      expect(screen.getByTestId('webhook-form-error')).toHaveTextContent('URL is required.')
    })

    it('shows validation error for invalid URL', async () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      const user = userEvent.setup()
      await act(async () => {
        await user.type(screen.getByTestId('webhook-url-input'), 'not-a-valid-url')
        await user.click(screen.getByTestId('webhook-form-submit'))
      })
      expect(screen.getByTestId('webhook-form-error')).toHaveTextContent(
        'Please enter a valid URL.'
      )
    })

    it('shows validation error for no events selected', async () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      const user = userEvent.setup()
      await act(async () => {
        await user.type(screen.getByTestId('webhook-url-input'), 'https://example.com/hook')
        await user.click(screen.getByTestId('webhook-form-submit'))
      })
      expect(screen.getByTestId('webhook-form-error')).toHaveTextContent(
        'At least one event must be selected.'
      )
    })

    it('displays error prop', () => {
      render(
        <WebhookForm
          webhook={null}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          error="Server error occurred"
        />
      )
      expect(screen.getByTestId('webhook-form-error')).toHaveTextContent('Server error occurred')
    })

    it('shows loading state on submit button', () => {
      render(
        <WebhookForm
          webhook={null}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          isLoading={true}
        />
      )
      expect(screen.getByTestId('webhook-form-submit')).toHaveTextContent('Saving...')
      expect(screen.getByTestId('webhook-form-submit')).toBeDisabled()
    })
  })

  // -------------------------------------------------------------------------
  // Create mode — secret display
  // -------------------------------------------------------------------------

  describe('secret display on creation', () => {
    it('shows secret display when createdSecret is provided', () => {
      render(
        <WebhookForm
          webhook={null}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          createdSecret="my-super-secret-key"
        />
      )
      expect(screen.getByTestId('webhook-secret-display')).toBeInTheDocument()
      expect(screen.getByTestId('webhook-secret-value')).toHaveTextContent('my-super-secret-key')
    })

    it('shows copy button when createdSecret is provided', () => {
      render(
        <WebhookForm
          webhook={null}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          createdSecret="my-super-secret-key"
        />
      )
      expect(screen.getByTestId('webhook-secret-copy')).toBeInTheDocument()
    })

    it('hides submit button when createdSecret is provided', () => {
      render(
        <WebhookForm
          webhook={null}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          createdSecret="my-super-secret-key"
        />
      )
      expect(screen.queryByTestId('webhook-form-submit')).not.toBeInTheDocument()
    })

    it('shows "Done" text on cancel button when createdSecret is provided', () => {
      render(
        <WebhookForm
          webhook={null}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
          createdSecret="my-super-secret-key"
        />
      )
      expect(screen.getByTestId('webhook-form-cancel')).toHaveTextContent('Done')
    })

    it('does not show secret display when createdSecret is null', () => {
      render(
        <WebhookForm webhook={null} surveys={mockSurveys} onSubmit={vi.fn()} onCancel={vi.fn()} />
      )
      expect(screen.queryByTestId('webhook-secret-display')).not.toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Edit mode
  // -------------------------------------------------------------------------

  describe('edit mode (webhook prop provided)', () => {
    it('renders edit title', () => {
      render(
        <WebhookForm
          webhook={mockExistingWebhook}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )
      expect(screen.getByText('Edit Webhook')).toBeInTheDocument()
    })

    it('pre-fills URL field', () => {
      render(
        <WebhookForm
          webhook={mockExistingWebhook}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )
      const urlInput = screen.getByTestId('webhook-url-input') as HTMLInputElement
      expect(urlInput.value).toBe('https://example.com/webhook')
    })

    it('pre-checks selected events', () => {
      render(
        <WebhookForm
          webhook={mockExistingWebhook}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )
      const completedCheckbox = screen.getByTestId(
        'webhook-event-response.completed'
      ) as HTMLInputElement
      const activatedCheckbox = screen.getByTestId(
        'webhook-event-survey.activated'
      ) as HTMLInputElement
      const startedCheckbox = screen.getByTestId(
        'webhook-event-response.started'
      ) as HTMLInputElement
      expect(completedCheckbox.checked).toBe(true)
      expect(activatedCheckbox.checked).toBe(true)
      expect(startedCheckbox.checked).toBe(false)
    })

    it('pre-selects survey when survey_id is set', () => {
      render(
        <WebhookForm
          webhook={mockSurveyWebhook}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )
      const select = screen.getByTestId('webhook-survey-select') as HTMLSelectElement
      expect(select.value).toBe('survey-1')
    })

    it('renders masked secret field in edit mode', () => {
      render(
        <WebhookForm
          webhook={mockExistingWebhook}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )
      expect(screen.getByTestId('webhook-secret-masked')).toBeInTheDocument()
    })

    it('pre-sets active state', () => {
      render(
        <WebhookForm
          webhook={mockSurveyWebhook}
          surveys={mockSurveys}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      )
      const checkbox = screen.getByTestId('webhook-active-checkbox') as HTMLInputElement
      expect(checkbox.checked).toBe(false)
    })

    it('submits updated data', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(
        <WebhookForm
          webhook={mockExistingWebhook}
          surveys={mockSurveys}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />
      )
      const user = userEvent.setup()
      await act(async () => {
        await user.click(screen.getByTestId('webhook-form-submit'))
      })
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/webhook',
          events: expect.arrayContaining(['response.completed', 'survey.activated']),
        })
      )
    })
  })
})
