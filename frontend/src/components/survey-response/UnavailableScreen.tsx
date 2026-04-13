export function UnavailableScreen({ status }: { status: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-4"
      data-testid="survey-unavailable-screen"
    >
      <div className="max-w-md w-full rounded-lg border border-border bg-background p-8 text-center space-y-3">
        <h1 className="text-2xl font-bold text-foreground" data-testid="unavailable-title">
          Survey Unavailable
        </h1>
        <p className="text-muted-foreground" data-testid="unavailable-message">
          {status === 'closed'
            ? 'This survey has been closed and is no longer accepting responses.'
            : status === 'archived'
              ? 'This survey has been archived and is no longer available.'
              : 'This survey is not currently available.'}
        </p>
      </div>
    </div>
  )
}
