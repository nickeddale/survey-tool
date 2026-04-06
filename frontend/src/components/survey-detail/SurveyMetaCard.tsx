import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  zh: 'Chinese',
  ja: 'Japanese',
  ar: 'Arabic',
}

interface SurveyMetaCardProps {
  description?: string | null
  welcomeMessage?: string | null
  endMessage?: string | null
  defaultLanguage: string
  totalQuestions: number
  createdAt: string
  updatedAt: string
}

function formattedDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function SurveyMetaCard({
  description,
  welcomeMessage,
  endMessage,
  defaultLanguage,
  totalQuestions,
  createdAt,
  updatedAt,
}: SurveyMetaCardProps) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">Survey Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {description && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-foreground">{description}</p>
          </div>
        )}

        {welcomeMessage && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Welcome Message</p>
            <p className="text-sm text-foreground">{welcomeMessage}</p>
          </div>
        )}

        {endMessage && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">End Message</p>
            <p className="text-sm text-foreground">{endMessage}</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Language</p>
            <p className="text-sm text-foreground">
              {LANGUAGE_LABELS[defaultLanguage] ?? defaultLanguage}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Questions</p>
            <p className="text-sm text-foreground">{totalQuestions}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Created</p>
            <p className="text-sm text-foreground">{formattedDate(createdAt)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Last Updated</p>
            <p className="text-sm text-foreground">{formattedDate(updatedAt)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
