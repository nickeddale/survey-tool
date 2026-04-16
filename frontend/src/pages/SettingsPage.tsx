import { useState, useEffect, useCallback } from 'react'
import { Key, User, Copy, Eye, EyeOff, Trash2, Plus } from 'lucide-react'
import apiKeyService from '../services/apiKeyService'
import authService from '../services/authService'
import type { ApiKeyResponse, ApiKeyCreateResponse } from '../types/auth'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { Card, CardContent } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useAuth } from '../contexts/AuthContext'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div aria-label="Loading API keys" aria-busy="true" data-testid="api-keys-loading">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

interface ConfirmRevokeModalProps {
  keyName: string
  isLoading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmRevokeModal({
  keyName,
  isLoading,
  error,
  onConfirm,
  onCancel,
}: ConfirmRevokeModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-key-title"
      data-testid="revoke-confirm-modal"
    >
      <Card className="max-w-md w-full mx-4 shadow-lg">
        <CardContent className="p-6">
          <h2 id="revoke-key-title" className="text-lg font-semibold text-foreground mb-2">
            Revoke API Key
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to revoke &quot;{keyName}&quot;? This action cannot be undone and
            any integrations using this key will stop working.
          </p>
          {error && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
            >
              {error}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={isLoading}
              data-testid="confirm-revoke-button"
            >
              {isLoading ? 'Revoking...' : 'Revoke Key'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// API Keys Tab
// ---------------------------------------------------------------------------

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [newKeyName, setNewKeyName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Newly created key (shown once)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
  const [showFullKey, setShowFullKey] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  // Revoke confirmation state
  const [revokingKey, setRevokingKey] = useState<ApiKeyResponse | null>(null)
  const [revokeLoading, setRevokeLoading] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const loadKeys = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiKeyService.listApiKeys()
      setKeys(data)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to load API keys. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadKeys()
  }, [loadKeys])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newKeyName.trim()
    if (!name) {
      setCreateError('Key name is required.')
      return
    }
    setCreateLoading(true)
    setCreateError(null)
    try {
      const created = await apiKeyService.createApiKey({ name })
      setCreatedKey(created)
      setNewKeyName('')
      setShowFullKey(false)
      setCopySuccess(false)
      await loadKeys()
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message)
      } else {
        setCreateError('Failed to create API key. Please try again.')
      }
    } finally {
      setCreateLoading(false)
    }
  }

  const handleCopyKey = async () => {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey.key)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      // Clipboard API may not be available in all environments
    }
  }

  const handleDismissCreatedKey = () => {
    setCreatedKey(null)
    setShowFullKey(false)
    setCopySuccess(false)
  }

  function openRevoke(key: ApiKeyResponse) {
    setRevokingKey(key)
    setRevokeError(null)
  }

  function closeRevoke() {
    setRevokingKey(null)
    setRevokeError(null)
  }

  const handleRevoke = useCallback(async () => {
    if (!revokingKey) return
    setRevokeLoading(true)
    setRevokeError(null)
    try {
      await apiKeyService.revokeApiKey(revokingKey.id)
      closeRevoke()
      await loadKeys()
    } catch (err) {
      if (err instanceof ApiError) {
        setRevokeError(err.message)
      } else {
        setRevokeError('Failed to revoke API key. Please try again.')
      }
    } finally {
      setRevokeLoading(false)
    }
  }, [revokingKey, loadKeys])

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div data-testid="api-keys-tab">
      {/* Revoke confirmation modal */}
      {revokingKey && (
        <ConfirmRevokeModal
          keyName={revokingKey.name}
          isLoading={revokeLoading}
          error={revokeError}
          onConfirm={handleRevoke}
          onCancel={closeRevoke}
        />
      )}

      {/* One-time key display */}
      {createdKey && (
        <div
          className="mb-6 p-4 rounded-lg border border-green-300 bg-green-50"
          role="alert"
          data-testid="created-key-display"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-green-800">
              API key created — copy it now. You will not be able to see it again.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissCreatedKey}
              className="text-green-700 hover:text-green-900 text-xs"
              data-testid="dismiss-created-key"
            >
              Dismiss
            </Button>
          </div>
          <p className="text-xs text-green-700 mb-2">Name: {createdKey.name}</p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 font-mono text-xs bg-white border border-green-200 rounded px-3 py-2 text-green-900 break-all"
              data-testid="created-key-value"
            >
              {showFullKey ? createdKey.key : createdKey.key.replace(/./g, '•')}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFullKey((v) => !v)}
              aria-label={showFullKey ? 'Hide key' : 'Show key'}
              className="shrink-0 h-8 w-8 border-green-300 text-green-700"
              data-testid="toggle-key-visibility"
            >
              {showFullKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyKey}
              aria-label="Copy key to clipboard"
              className="shrink-0 h-8 w-8 border-green-300 text-green-700"
              data-testid="copy-key-button"
            >
              <Copy size={14} />
            </Button>
          </div>
          {copySuccess && (
            <p className="text-xs text-green-700 mt-1" data-testid="copy-success-message">
              Copied to clipboard!
            </p>
          )}
        </div>
      )}

      {/* Create key form */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-foreground mb-3">Create New API Key</h2>
        <form
          onSubmit={handleCreate}
          className="flex gap-3 items-end"
          data-testid="create-key-form"
        >
          <div className="flex-1">
            <Label htmlFor="new-key-name" className="text-sm mb-1 block">
              Key name
            </Label>
            <Input
              id="new-key-name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production integration"
              disabled={createLoading}
              data-testid="new-key-name-input"
            />
          </div>
          <Button type="submit" disabled={createLoading} data-testid="create-key-button">
            <Plus size={16} />
            {createLoading ? 'Creating...' : 'Create Key'}
          </Button>
        </form>
        {createError && (
          <p className="mt-2 text-sm text-destructive" role="alert" data-testid="create-key-error">
            {createError}
          </p>
        )}
      </div>

      {/* API keys list */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">Your API Keys</h2>

        {error && (
          <div
            className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
            role="alert"
            data-testid="api-keys-error"
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : keys.length === 0 ? (
          <div
            className="text-center py-12 bg-card border border-border rounded-lg"
            data-testid="api-keys-empty"
          >
            <Key size={32} className="mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground text-sm">No API keys yet. Create one above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm" role="table">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Key prefix
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Last used
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((key) => (
                  <tr
                    key={key.id}
                    className="bg-card hover:bg-muted/30 transition-colors"
                    data-testid={`api-key-row-${key.id}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{key.name}</td>
                    <td
                      className="px-4 py-3 font-mono text-xs text-muted-foreground"
                      data-testid={`api-key-prefix-${key.id}`}
                    >
                      {key.key_prefix}...
                    </td>
                    <td className="px-4 py-3">
                      {key.is_active ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 hover:bg-green-100"
                          data-testid={`api-key-active-badge-${key.id}`}
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-muted text-muted-foreground hover:bg-muted"
                          data-testid={`api-key-inactive-badge-${key.id}`}
                        >
                          Revoked
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(key.last_used_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(key.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openRevoke(key)}
                          aria-label={`Revoke API key ${key.name}`}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          data-testid={`revoke-key-button-${key.id}`}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile Tab
// ---------------------------------------------------------------------------

function ProfileTab() {
  const { user } = useAuth()

  const [name, setName] = useState(user?.name ?? '')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)
    setProfileError(null)
    setProfileSuccess(false)
    try {
      await authService.updateCurrentUser({ name: name.trim() || null })
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err) {
      if (err instanceof ApiError) {
        setProfileError(err.message)
      } else {
        setProfileError('Failed to update profile. Please try again.')
      }
    } finally {
      setProfileLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    if (!currentPassword) {
      setPasswordError('Current password is required.')
      return
    }
    if (!newPassword) {
      setPasswordError('New password is required.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setPasswordLoading(true)
    try {
      await authService.updateCurrentUser({ password: newPassword })
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(err.message)
      } else {
        setPasswordError('Failed to change password. Please try again.')
      }
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="space-y-8 max-w-md" data-testid="profile-tab">
      {/* Profile info */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">Profile Information</h2>
        <form onSubmit={handleProfileUpdate} className="space-y-4" data-testid="profile-form">
          <div>
            <Label htmlFor="profile-email" className="text-sm mb-1 block">
              Email
            </Label>
            <Input
              id="profile-email"
              type="email"
              value={user?.email ?? ''}
              disabled
              className="bg-muted text-muted-foreground"
              data-testid="profile-email-input"
            />
            <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>
          </div>
          <div>
            <Label htmlFor="profile-name" className="text-sm mb-1 block">
              Display name
            </Label>
            <Input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              disabled={profileLoading}
              data-testid="profile-name-input"
            />
          </div>
          {profileError && (
            <p className="text-sm text-destructive" role="alert" data-testid="profile-error">
              {profileError}
            </p>
          )}
          {profileSuccess && (
            <p className="text-sm text-green-700" role="status" data-testid="profile-success">
              Profile updated successfully.
            </p>
          )}
          <Button type="submit" disabled={profileLoading} data-testid="profile-save-button">
            {profileLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </div>

      {/* Change password */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4" data-testid="password-form">
          <div>
            <Label htmlFor="current-password" className="text-sm mb-1 block">
              Current password
            </Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={passwordLoading}
              data-testid="current-password-input"
            />
          </div>
          <div>
            <Label htmlFor="new-password" className="text-sm mb-1 block">
              New password
            </Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={passwordLoading}
              data-testid="new-password-input"
            />
          </div>
          <div>
            <Label htmlFor="confirm-password" className="text-sm mb-1 block">
              Confirm new password
            </Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={passwordLoading}
              data-testid="confirm-password-input"
            />
          </div>
          {passwordError && (
            <p className="text-sm text-destructive" role="alert" data-testid="password-error">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p className="text-sm text-green-700" role="status" data-testid="password-success">
              Password changed successfully.
            </p>
          )}
          <Button type="submit" disabled={passwordLoading} data-testid="password-save-button">
            {passwordLoading ? 'Changing...' : 'Change Password'}
          </Button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

function SettingsPage() {
  return (
    <div className="max-w-5xl mx-auto" data-testid="settings-page">
      <h1 className="text-2xl font-bold text-foreground mb-6">Settings</h1>

      <Tabs defaultValue="api-keys">
        <TabsList className="mb-6">
          <TabsTrigger value="api-keys" data-testid="tab-api-keys">
            <Key size={16} className="mr-2" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="profile" data-testid="tab-profile">
            <User size={16} className="mr-2" />
            Profile
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default SettingsPage
