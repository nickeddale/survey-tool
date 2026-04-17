import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssessmentResults, AssessmentResultsSkeleton } from '../AssessmentResults'
import type { AssessmentScoreResponse, AssessmentResponse } from '../../../types/survey'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssessmentBand(overrides: Partial<AssessmentResponse> = {}): AssessmentResponse {
  return {
    id: 'band-001',
    survey_id: 'survey-001',
    name: 'High Score',
    scope: 'total',
    group_id: null,
    question_id: null,
    subquestion_id: null,
    min_score: 8,
    max_score: 10,
    message: 'Excellent result!',
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-01-10T10:00:00Z',
    ...overrides,
  }
}

function makeResult(overrides: Partial<AssessmentScoreResponse> = {}): AssessmentScoreResponse {
  return {
    score: 9,
    matching_assessments: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// AssessmentResults
// ---------------------------------------------------------------------------

describe('AssessmentResults', () => {
  it('renders the total score', () => {
    render(<AssessmentResults result={makeResult({ score: 7.5 })} />)
    expect(screen.getByTestId('assessment-score')).toHaveTextContent('7.5')
  })

  it('renders "Assessment Results" heading', () => {
    render(<AssessmentResults result={makeResult()} />)
    expect(screen.getByText('Assessment Results')).toBeInTheDocument()
  })

  it('shows no-match message when matching_assessments is empty', () => {
    render(<AssessmentResults result={makeResult({ matching_assessments: [] })} />)
    expect(screen.getByTestId('no-matching-bands')).toBeInTheDocument()
    expect(screen.queryByTestId('assessment-bands')).not.toBeInTheDocument()
  })

  it('renders a matching band with name and message', () => {
    const band = makeAssessmentBand({ name: 'High Score', message: 'Excellent result!' })
    render(<AssessmentResults result={makeResult({ matching_assessments: [band] })} />)

    expect(screen.getByTestId('assessment-bands')).toBeInTheDocument()
    expect(screen.getByText('High Score')).toBeInTheDocument()
    expect(screen.getByText('Excellent result!')).toBeInTheDocument()
  })

  it('renders the score range for each band', () => {
    const band = makeAssessmentBand({ min_score: 8, max_score: 10 })
    render(<AssessmentResults result={makeResult({ matching_assessments: [band] })} />)
    expect(screen.getByText('8 – 10')).toBeInTheDocument()
  })

  it('does not show scope label for total-scoped bands', () => {
    const band = makeAssessmentBand({ scope: 'total' })
    render(<AssessmentResults result={makeResult({ matching_assessments: [band] })} />)
    expect(screen.queryByText(/Scope:/)).not.toBeInTheDocument()
  })

  it('shows scope label for non-total scoped bands', () => {
    const band = makeAssessmentBand({ scope: 'group', id: 'band-group-001' })
    render(<AssessmentResults result={makeResult({ matching_assessments: [band] })} />)
    expect(screen.getByText('Scope: group')).toBeInTheDocument()
  })

  it('renders multiple matching bands', () => {
    const bands = [
      makeAssessmentBand({ id: 'b1', name: 'Band A', message: 'Message A' }),
      makeAssessmentBand({ id: 'b2', name: 'Band B', message: 'Message B' }),
    ]
    render(<AssessmentResults result={makeResult({ matching_assessments: bands })} />)
    expect(screen.getByText('Band A')).toBeInTheDocument()
    expect(screen.getByText('Band B')).toBeInTheDocument()
  })

  it('renders with score of 0', () => {
    render(<AssessmentResults result={makeResult({ score: 0 })} />)
    expect(screen.getByTestId('assessment-score')).toHaveTextContent('0')
  })
})

// ---------------------------------------------------------------------------
// AssessmentResultsSkeleton
// ---------------------------------------------------------------------------

describe('AssessmentResultsSkeleton', () => {
  it('renders the skeleton container', () => {
    render(<AssessmentResultsSkeleton />)
    expect(screen.getByTestId('assessment-results-skeleton')).toBeInTheDocument()
  })
})
