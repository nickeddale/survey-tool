import type { SurveyFullResponse } from '../../types/survey'

export type PageScreen = 'welcome' | 'form' | 'end'

export interface WelcomeScreenProps {
  survey: SurveyFullResponse
  onStart: () => void
  isStarting: boolean
  availableLanguages: string[]
  activeLang: string | undefined
  onLangChange: (lang: string) => void
  submitError: string | null
}
