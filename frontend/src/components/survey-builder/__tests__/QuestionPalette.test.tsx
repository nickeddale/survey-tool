/**
 * Unit tests for QuestionPalette component.
 *
 * Verifies that clicking question type buttons calls the onAddQuestion handler
 * with the correct question type.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionPalette } from '../QuestionPalette'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('QuestionPalette rendering', () => {
  it('renders all question type buttons', () => {
    render(<QuestionPalette readOnly={false} />)
    expect(screen.getByTestId('palette-question-type-short_text')).toBeInTheDocument()
    expect(screen.getByTestId('palette-question-type-long_text')).toBeInTheDocument()
    expect(screen.getByTestId('palette-question-type-single_choice')).toBeInTheDocument()
    expect(screen.getByTestId('palette-question-type-multiple_choice')).toBeInTheDocument()
    expect(screen.getByTestId('palette-question-type-dropdown')).toBeInTheDocument()
    expect(screen.getByTestId('palette-question-type-numeric')).toBeInTheDocument()
  })

  it('renders buttons as disabled in read-only mode', () => {
    render(<QuestionPalette readOnly={true} />)
    const textBtn = screen.getByTestId('palette-question-type-short_text')
    expect(textBtn).toBeDisabled()
  })

  it('renders buttons as enabled when not read-only', () => {
    render(<QuestionPalette readOnly={false} />)
    const textBtn = screen.getByTestId('palette-question-type-short_text')
    expect(textBtn).not.toBeDisabled()
  })
})

describe('QuestionPalette onAddQuestion', () => {
  it('calls onAddQuestion with correct type when short_text button is clicked', async () => {
    const onAddQuestion = vi.fn()
    render(<QuestionPalette readOnly={false} onAddQuestion={onAddQuestion} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('palette-question-type-short_text'))
    })

    expect(onAddQuestion).toHaveBeenCalledWith('short_text')
  })

  it('calls onAddQuestion with correct type when single_choice button is clicked', async () => {
    const onAddQuestion = vi.fn()
    render(<QuestionPalette readOnly={false} onAddQuestion={onAddQuestion} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('palette-question-type-single_choice'))
    })

    expect(onAddQuestion).toHaveBeenCalledWith('single_choice')
  })

  it('calls onAddQuestion with correct type when multiple_choice button is clicked', async () => {
    const onAddQuestion = vi.fn()
    render(<QuestionPalette readOnly={false} onAddQuestion={onAddQuestion} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('palette-question-type-multiple_choice'))
    })

    expect(onAddQuestion).toHaveBeenCalledWith('multiple_choice')
  })

  it('does not call onAddQuestion when read-only and button is clicked', async () => {
    const onAddQuestion = vi.fn()
    render(<QuestionPalette readOnly={true} onAddQuestion={onAddQuestion} />)

    // Buttons are disabled so click should be ignored
    const textBtn = screen.getByTestId('palette-question-type-short_text')
    await act(async () => {
      await userEvent.click(textBtn)
    })

    expect(onAddQuestion).not.toHaveBeenCalled()
  })

  it('does not throw when no onAddQuestion prop is provided', async () => {
    render(<QuestionPalette readOnly={false} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('palette-question-type-short_text'))
    })
    // Should not throw
  })
})
