import { Card, CardContent } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import type { EmailInvitationStats } from '../../types/survey'

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

interface MetricCardProps {
  label: string
  value: string | number
  subtitle?: string
  testId?: string
}

function MetricCard({ label, value, subtitle, testId }: MetricCardProps) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {label}
        </p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

function MetricCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-7 w-16 mb-1" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// EmailStatsCards
// ---------------------------------------------------------------------------

interface EmailStatsCardsProps {
  stats: EmailInvitationStats | null
  isLoading?: boolean
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function EmailStatsCards({ stats, isLoading }: EmailStatsCardsProps) {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="stats-cards-loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <MetricCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6" data-testid="stats-cards">
      <MetricCard
        label="Sent"
        value={stats.total_sent}
        testId="stat-total-sent"
      />
      <MetricCard
        label="Delivered"
        value={stats.total_delivered}
        testId="stat-total-delivered"
      />
      <MetricCard
        label="Bounced"
        value={stats.total_bounced}
        testId="stat-total-bounced"
      />
      <MetricCard
        label="Failed"
        value={stats.total_failed}
        testId="stat-total-failed"
      />
      <MetricCard
        label="Open Rate"
        value={formatRate(stats.open_rate)}
        testId="stat-open-rate"
      />
      <MetricCard
        label="Click Rate"
        value={formatRate(stats.click_rate)}
        testId="stat-click-rate"
      />
    </div>
  )
}

export default EmailStatsCards
