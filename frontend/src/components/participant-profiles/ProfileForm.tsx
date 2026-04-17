import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type {
  ParticipantProfileResponse,
  ParticipantProfileCreate,
  ParticipantProfileUpdate,
} from '../../types/survey'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'

interface KeyValuePair {
  key: string
  value: string
}

interface ProfileFormProps {
  profile?: ParticipantProfileResponse | null
  onSubmit: (data: ParticipantProfileCreate | ParticipantProfileUpdate) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  error?: string | null
}

function ProfileForm({ profile, onSubmit, onCancel, isLoading, error }: ProfileFormProps) {
  const isEdit = Boolean(profile)

  const [email, setEmail] = useState(profile?.email ?? '')
  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [organization, setOrganization] = useState(profile?.organization ?? '')
  const [tagsInput, setTagsInput] = useState(profile?.tags?.join(', ') ?? '')
  const [attributes, setAttributes] = useState<KeyValuePair[]>(() => {
    if (!profile?.attributes) return []
    return Object.entries(profile.attributes).map(([key, value]) => ({
      key,
      value: String(value),
    }))
  })
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setEmail(profile.email)
      setFirstName(profile.first_name ?? '')
      setLastName(profile.last_name ?? '')
      setPhone(profile.phone ?? '')
      setOrganization(profile.organization ?? '')
      setTagsInput(profile.tags?.join(', ') ?? '')
      setAttributes(
        profile.attributes
          ? Object.entries(profile.attributes).map(([key, value]) => ({
              key,
              value: String(value),
            }))
          : []
      )
    }
  }, [profile])

  function addAttribute() {
    setAttributes((prev) => [...prev, { key: '', value: '' }])
  }

  function removeAttribute(index: number) {
    setAttributes((prev) => prev.filter((_, i) => i !== index))
  }

  function updateAttribute(index: number, field: 'key' | 'value', val: string) {
    setAttributes((prev) => prev.map((pair, i) => (i === index ? { ...pair, [field]: val } : pair)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)

    if (!isEdit && !email.trim()) {
      setValidationError('Email is required.')
      return
    }

    const keys = attributes.map((a) => a.key.trim()).filter(Boolean)
    const uniqueKeys = new Set(keys)
    if (uniqueKeys.size !== keys.length) {
      setValidationError('Attribute keys must be unique.')
      return
    }

    const attrsObj =
      attributes.length > 0
        ? Object.fromEntries(attributes.map((a) => [a.key.trim(), a.value]))
        : null

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const payload: ParticipantProfileCreate | ParticipantProfileUpdate = {
      email: email.trim() || undefined,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      phone: phone.trim() || null,
      organization: organization.trim() || null,
      attributes: attrsObj,
      tags: tags.length > 0 ? tags : null,
    }

    await onSubmit(payload)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-form-title"
      data-testid="profile-form-dialog"
    >
      <Card className="max-w-lg w-full mx-4 shadow-lg max-h-[90vh] overflow-y-auto">
        <CardContent className="p-6">
          <h2 id="profile-form-title" className="text-lg font-semibold text-foreground mb-4">
            {isEdit ? 'Edit Profile' : 'Add Profile'}
          </h2>

          <form onSubmit={handleSubmit} noValidate>
            {(error || validationError) && (
              <div
                className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
                role="alert"
                data-testid="profile-form-error"
              >
                {error ?? validationError}
              </div>
            )}

            {/* Email */}
            <div className="mb-4">
              <label
                htmlFor="profile-email"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Email {!isEdit && <span className="text-destructive">*</span>}
              </label>
              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@example.com"
                required={!isEdit}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="profile-email-input"
              />
            </div>

            {/* First Name */}
            <div className="mb-4">
              <label
                htmlFor="profile-first-name"
                className="block text-sm font-medium text-foreground mb-1"
              >
                First Name
              </label>
              <input
                id="profile-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Alice"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="profile-first-name-input"
              />
            </div>

            {/* Last Name */}
            <div className="mb-4">
              <label
                htmlFor="profile-last-name"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Last Name
              </label>
              <input
                id="profile-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="profile-last-name-input"
              />
            </div>

            {/* Phone */}
            <div className="mb-4">
              <label
                htmlFor="profile-phone"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Phone
              </label>
              <input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="profile-phone-input"
              />
            </div>

            {/* Organization */}
            <div className="mb-4">
              <label
                htmlFor="profile-organization"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Organization
              </label>
              <input
                id="profile-organization"
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Acme Corp"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="profile-organization-input"
              />
            </div>

            {/* Tags */}
            <div className="mb-4">
              <label
                htmlFor="profile-tags"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Tags
                <span className="ml-1 text-xs text-muted-foreground">(comma-separated)</span>
              </label>
              <input
                id="profile-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="vip, region-us"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="profile-tags-input"
              />
            </div>

            {/* Attributes */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-foreground">Attributes</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAttribute}
                  className="gap-1"
                  data-testid="add-attribute-button"
                >
                  <Plus size={13} />
                  Add
                </Button>
              </div>
              {attributes.length === 0 && (
                <p className="text-xs text-muted-foreground">No attributes configured.</p>
              )}
              <div className="space-y-2">
                {attributes.map((pair, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={pair.key}
                      onChange={(e) => updateAttribute(idx, 'key', e.target.value)}
                      placeholder="Key"
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      data-testid={`attribute-key-${idx}`}
                    />
                    <input
                      type="text"
                      value={pair.value}
                      onChange={(e) => updateAttribute(idx, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      data-testid={`attribute-value-${idx}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAttribute(idx)}
                      aria-label="Remove attribute"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      data-testid={`remove-attribute-${idx}`}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end mt-6">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="profile-form-submit">
                {isLoading
                  ? isEdit
                    ? 'Saving...'
                    : 'Adding...'
                  : isEdit
                    ? 'Save Changes'
                    : 'Add Profile'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default ProfileForm
