import type { SurveyFullResponse } from '../../types/survey'

export function ThankYouScreen({ survey }: { survey: SurveyFullResponse }) {
  return (
    <div className="max-w-2xl mx-auto px-8 py-12" data-testid="survey-thankyou-screen">
      <h1 className="text-3xl font-bold text-foreground mb-4" data-testid="thankyou-title">
        Thank You!
      </h1>
      {survey.end_message ? (
        <div
          className="prose prose-sm max-w-none text-foreground p-4 bg-muted/40 rounded-lg"
          data-testid="thankyou-end-message"
        >
          {survey.end_message}
        </div>
      ) : (
        <p className="text-muted-foreground" data-testid="thankyou-default-message">
          Your response has been recorded. Thank you for your time!
        </p>
      )}
    </div>
  )
}
