/**
 * Unit tests for SaveIndicator component.
 *
 * Tests each saveStatus display state and retry button interaction.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useBuilderStore } from '../../../store/builderStore'
import { SaveIndicator } from '../SaveIndicator'

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderIndicator(onRetry?: () => void) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SaveIndicator onRetry={onRetry} />
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  useBuilderStore.getState().reset()
})

afterEach(() => {
  vi.restoreAllMocks()
  useBuilderStore.getState().reset()
})

// ---------------------------------------------------------------------------
// idle state
// ---------------------------------------------------------------------------

describe('idle state', () => {
  it('renders nothing when saveStatus is idle', () => {
    renderIndicator()
    expect(screen.queryByTestId('save-indicator-saving')).not.toBeInTheDocument()
    expect(screen.queryByTestId('save-indicator-saved')).not.toBeInTheDocument()
    expect(screen.queryByTestId('save-indicator-error')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// saving state
// ---------------------------------------------------------------------------

describe('saving state', () => {
  it('renders spinner and "Saving…" text when saveStatus is saving', async () => {
    await act(async () => {
      useBuilderStore.getState().setSaveStatus('saving')
    })
    renderIndicator()
    expect(screen.getByTestId('save-indicator-saving')).toBeInTheDocument()
    expect(screen.getByText('Saving…')).toBeInTheDocument()
  })

  it('does not render saved or error indicators when saving', async () => {
    await act(async () => {
      useBuilderStore.getState().setSaveStatus('saving')
    })
    renderIndicator()
    expect(screen.queryByTestId('save-indicator-saved')).not.toBeInTheDocument()
    expect(screen.queryByTestId('save-indicator-error')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// saved state
// ---------------------------------------------------------------------------

describe('saved state', () => {
  it('renders check icon and "All changes saved" text when saveStatus is saved', async () => {
    await act(async () => {
      useBuilderStore.getState().setSaveStatus('saved')
    })
    renderIndicator()
    expect(screen.getByTestId('save-indicator-saved')).toBeInTheDocument()
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
  })

  it('does not render saving or error indicators when saved', async () => {
    await act(async () => {
      useBuilderStore.getState().setSaveStatus('saved')
    })
    renderIndicator()
    expect(screen.queryByTestId('save-indicator-saving')).not.toBeInTheDocument()
    expect(screen.queryByTestId('save-indicator-error')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// error state
// ---------------------------------------------------------------------------

describe('error state', () => {
  it('renders error icon and "Save failed" text when saveStatus is error', async () => {
    await act(async () => {
      useBuilderStore.getState().setSaveStatus('error', 'Network error')
    })
    renderIndicator()
    expect(screen.getByTestId('save-indicator-error')).toBeInTheDocument()
    expect(screen.getByText('Save failed')).toBeInTheDocument()
  })

  it('renders Retry button when onRetry prop is provided', async () => {
    const onRetry = vi.fn()
    await act(async () => {
      useBuilderStore.getState().setSaveStatus('error')
    })
    renderIndicator(onRetry)
    expect(screen.getByTestId('save-indicator-retry')).toBeInTheDocument()
  })

  it('does not render Retry button when onRetry prop is not provided', async () => {
    await act(async () => {
      useBuilderStore.getState().setSaveStatus('error')
    })
    renderIndicator()
    expect(screen.queryByTestId('save-indicator-retry')).not.toBeInTheDocument()
  })

  it('calls onRetry callback when Retry button is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    await act(async () => {
      useBuilderStore.getState().setSaveStatus('error')
    })
    renderIndicator(onRetry)

    await act(async () => {
      await user.click(screen.getByTestId('save-indicator-retry'))
    })

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('does not render saving or saved indicators when error', async () => {
    await act(async () => {
      useBuilderStore.getState().setSaveStatus('error')
    })
    renderIndicator()
    expect(screen.queryByTestId('save-indicator-saving')).not.toBeInTheDocument()
    expect(screen.queryByTestId('save-indicator-saved')).not.toBeInTheDocument()
  })
})
