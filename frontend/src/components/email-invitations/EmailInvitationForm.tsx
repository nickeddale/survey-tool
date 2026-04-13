import { useState } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import type { EmailInvitationCreate, EmailInvitationType } from '../../types/survey'

// ---------------------------------------------------------------------------
// EmailInvitationForm
// ---------------------------------------------------------------------------

interface EmailInvitationFormProps {
  onSubmit: (data: EmailInvitationCreate) => void
  onCancel: () => void
  isLoading?: boolean
  error?: string | null
}

function EmailInvitationForm({ onSubmit, onCancel, isLoading, error }: EmailInvitationFormProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [invitationType, setInvitationType] = useState<EmailInvitationType>('invite')
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim()) {
      setValidationError('Recipient email is required.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setValidationError('Please enter a valid email address.')
      return
    }

    setValidationError(null)
    onSubmit({
      recipient_email: email.trim(),
      recipient_name: name.trim() || undefined,
      subject: subject.trim() || undefined,
      invitation_type: invitationType,
    })
  }

  const displayError = validationError ?? error

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invitation-form-title"
      data-testid="invitation-form-modal"
    >
      <Card className="max-w-lg w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="invitation-form-title" className="text-lg font-semibold text-foreground mb-4">
            Send Invitation
          </h2>

          {displayError && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="form-error"
            >
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Recipient Email */}
            <div>
              <label htmlFor="inv-email" className="block text-sm font-medium text-foreground mb-1">
                Recipient Email <span className="text-destructive">*</span>
              </label>
              <input
                id="inv-email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isLoading}
                data-testid="inv-email-input"
              />
            </div>

            {/* Recipient Name */}
            <div>
              <label htmlFor="inv-name" className="block text-sm font-medium text-foreground mb-1">
                Recipient Name
              </label>
              <input
                id="inv-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isLoading}
                data-testid="inv-name-input"
              />
            </div>

            {/* Subject */}
            <div>
              <label
                htmlFor="inv-subject"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Subject
              </label>
              <input
                id="inv-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="You are invited to take our survey"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isLoading}
                data-testid="inv-subject-input"
              />
            </div>

            {/* Invitation Type */}
            <div>
              <label htmlFor="inv-type" className="block text-sm font-medium text-foreground mb-1">
                Type
              </label>
              <select
                id="inv-type"
                value={invitationType}
                onChange={(e) => setInvitationType(e.target.value as EmailInvitationType)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isLoading}
                data-testid="inv-type-select"
              >
                <option value="invite">Invite</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="inv-submit-button">
                {isLoading ? 'Sending...' : 'Send Invitation'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default EmailInvitationForm
