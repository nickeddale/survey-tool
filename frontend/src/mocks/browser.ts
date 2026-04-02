/**
 * MSW browser service worker setup.
 * Used in development to mock API calls in the browser.
 */

import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
