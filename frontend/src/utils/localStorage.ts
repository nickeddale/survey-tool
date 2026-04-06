/**
 * localStorage helpers for survey response persistence.
 * All functions silently suppress storage errors (private browsing, quota exceeded, etc.).
 */

/**
 * Returns the localStorage key for a given survey's in-progress response ID.
 */
export function localStorageKey(surveyId: string): string {
  return `survey_response_${surveyId}`
}

/**
 * Retrieve a stored response ID for the given survey.
 * Returns null if no value is stored or if localStorage is unavailable.
 */
export function getStoredResponseId(surveyId: string): string | null {
  try {
    return localStorage.getItem(localStorageKey(surveyId))
  } catch {
    return null
  }
}

/**
 * Persist a response ID for the given survey.
 * Silently ignores localStorage errors (private browsing, storage full, etc.).
 */
export function storeResponseId(surveyId: string, responseId: string): void {
  try {
    localStorage.setItem(localStorageKey(surveyId), responseId)
  } catch {
    // Ignore localStorage errors (private browsing, storage full, etc.)
  }
}

/**
 * Remove the stored response ID for the given survey.
 * Silently ignores localStorage errors.
 */
export function clearStoredResponseId(surveyId: string): void {
  try {
    localStorage.removeItem(localStorageKey(surveyId))
  } catch {
    // Ignore
  }
}
