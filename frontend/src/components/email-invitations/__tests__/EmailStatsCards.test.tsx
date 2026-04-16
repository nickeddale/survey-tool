import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmailStatsCards from '../EmailStatsCards'
import type { EmailInvitationStats } from '../../../types/survey'

const mockStats: EmailInvitationStats = {
  sent: 10,
  delivered: 8,
  bounced: 1,
  failed: 1,
  open_rate: 0.5,
  click_rate: 0.25,
}

describe('EmailStatsCards', () => {
  it('renders loading skeletons when isLoading', () => {
    render(<EmailStatsCards stats={null} isLoading />)
    expect(screen.getByTestId('stats-cards-loading')).toBeInTheDocument()
  })

  it('renders loading skeletons when stats is null', () => {
    render(<EmailStatsCards stats={null} />)
    expect(screen.getByTestId('stats-cards-loading')).toBeInTheDocument()
  })

  it('renders all stat cards with correct values', () => {
    render(<EmailStatsCards stats={mockStats} />)

    expect(screen.getByTestId('stats-cards')).toBeInTheDocument()
    expect(screen.getByTestId('stat-total-sent')).toHaveTextContent('10')
    expect(screen.getByTestId('stat-total-delivered')).toHaveTextContent('8')
    expect(screen.getByTestId('stat-total-bounced')).toHaveTextContent('1')
    expect(screen.getByTestId('stat-total-failed')).toHaveTextContent('1')
    expect(screen.getByTestId('stat-open-rate')).toHaveTextContent('50%')
    expect(screen.getByTestId('stat-click-rate')).toHaveTextContent('25%')
  })

  it('renders correct labels', () => {
    render(<EmailStatsCards stats={mockStats} />)

    expect(screen.getByText('Sent')).toBeInTheDocument()
    expect(screen.getByText('Delivered')).toBeInTheDocument()
    expect(screen.getByText('Bounced')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Open Rate')).toBeInTheDocument()
    expect(screen.getByText('Click Rate')).toBeInTheDocument()
  })

  it('formats rates as percentages', () => {
    render(<EmailStatsCards stats={{ ...mockStats, open_rate: 0.333, click_rate: 0 }} />)

    expect(screen.getByTestId('stat-open-rate')).toHaveTextContent('33%')
    expect(screen.getByTestId('stat-click-rate')).toHaveTextContent('0%')
  })
})
