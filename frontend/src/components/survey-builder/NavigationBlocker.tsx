/**
 * NavigationBlocker — renders inside SurveyBuilderPage when `shouldBlock` is
 * true. It is rendered only when a data router context is available (i.e. the
 * app is wrapped in createBrowserRouter / RouterProvider) so that it doesn't
 * break test environments using the legacy MemoryRouter/Routes API.
 *
 * Shows a browser confirm() dialog when the user tries to navigate away with
 * unsaved changes. Calls blocker.proceed() on confirmation or blocker.reset()
 * on cancellation.
 */

import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NavigationBlockerProps {
  shouldBlock: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NavigationBlocker({ shouldBlock }: NavigationBlockerProps) {
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (blocker.state === 'blocked') {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?',
      )
      if (confirmed) {
        blocker.proceed()
      } else {
        blocker.reset()
      }
    }
  }, [blocker])

  return null
}
