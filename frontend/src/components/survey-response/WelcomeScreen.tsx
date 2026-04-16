import { Button } from '../ui/button'
import { LANGUAGE_LABELS } from './constants'
import type { WelcomeScreenProps } from './types'

export function WelcomeScreen({
  survey,
  onStart,
  isStarting,
  availableLanguages,
  activeLang,
  onLangChange,
  submitError,
}: WelcomeScreenProps) {
  return (
    <div className="min-h-screen bg-background" data-testid="survey-response-page">
      {submitError && (
        <div className="max-w-2xl mx-auto px-8 pt-4 w-full" data-testid="submit-error">
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
            {submitError}
          </div>
        </div>
      )}
      {availableLanguages.length > 1 && (
        <div
          className="flex justify-end max-w-2xl mx-auto px-8 pt-4"
          data-testid="language-switcher"
        >
          <div className="flex items-center gap-2">
            <label htmlFor="lang-select" className="text-sm text-muted-foreground">
              Language:
            </label>
            <select
              id="lang-select"
              value={activeLang ?? survey.default_language}
              onChange={(e) => onLangChange(e.target.value)}
              className="px-2 py-1 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="response-lang-select"
            >
              {availableLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang] ?? lang}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="max-w-2xl mx-auto px-8 py-12" data-testid="survey-welcome-screen">
        <h1 className="text-3xl font-bold text-foreground mb-4" data-testid="welcome-survey-title">
          {survey.title}
        </h1>
        {survey.description && (
          <p className="text-muted-foreground mb-6" data-testid="welcome-survey-description">
            {survey.description}
          </p>
        )}
        {survey.welcome_message && (
          <div
            className="prose prose-sm max-w-none text-foreground mb-8 p-4 bg-muted/40 rounded-lg"
            data-testid="welcome-message"
          >
            {survey.welcome_message}
          </div>
        )}
        <Button onClick={onStart} disabled={isStarting} size="lg" data-testid="start-survey-button">
          {isStarting ? 'Starting…' : 'Start Survey'}
        </Button>
      </div>
    </div>
  )
}
