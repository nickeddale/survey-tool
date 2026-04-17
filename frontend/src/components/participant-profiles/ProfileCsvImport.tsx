import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import type { ParticipantProfileCreate, ParticipantProfileResponse } from '../../types/survey'
import participantProfileService from '../../services/participantProfileService'
import { ApiError } from '../../types/api'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'

// ---------------------------------------------------------------------------
// CSV parsing helpers
// ---------------------------------------------------------------------------

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = values[i] ?? ''
    })
    return row
  })
}

const KNOWN_FIELDS = ['email', 'first_name', 'last_name', 'phone', 'organization', 'tags']

function rowToProfile(row: Record<string, string>): ParticipantProfileCreate {
  const { email, first_name, last_name, phone, organization, tags, ...rest } = row

  const attributes: Record<string, string> = {}
  Object.entries(rest).forEach(([k, v]) => {
    if (k && v !== '') attributes[k] = v
  })

  const parsedTags = tags
    ? tags
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)
    : null

  return {
    email: email?.trim() ?? '',
    first_name: first_name?.trim() || null,
    last_name: last_name?.trim() || null,
    phone: phone?.trim() || null,
    organization: organization?.trim() || null,
    tags: parsedTags && parsedTags.length > 0 ? parsedTags : null,
    attributes: Object.keys(attributes).length > 0 ? attributes : null,
  }
}

// ---------------------------------------------------------------------------
// ProfileCsvImport
// ---------------------------------------------------------------------------

interface ProfileCsvImportProps {
  onComplete: (created: ParticipantProfileResponse[]) => void
  onCancel: () => void
}

function ProfileCsvImport({ onComplete, onCancel }: ProfileCsvImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError(null)
    setError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      try {
        const rows = parseCsv(text)
        if (rows.length === 0) {
          setParseError('CSV appears to be empty or has no data rows.')
          setPreview([])
        } else {
          setPreview(rows)
        }
      } catch {
        setParseError('Failed to parse CSV file.')
        setPreview([])
      }
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (preview.length === 0) return
    setIsLoading(true)
    setError(null)
    try {
      const items = preview.map(rowToProfile)
      const created = await participantProfileService.createProfilesBatch({ items })
      onComplete(created)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to import profiles. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const previewHeaders = preview.length > 0 ? Object.keys(preview[0]) : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-csv-import-title"
      data-testid="profile-csv-import-dialog"
    >
      <Card className="max-w-2xl w-full mx-4 shadow-lg max-h-[90vh] overflow-y-auto">
        <CardContent className="p-6">
          <h2 id="profile-csv-import-title" className="text-lg font-semibold text-foreground mb-2">
            Import Profiles from CSV
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a CSV with an{' '}
            <code className="font-mono text-xs bg-muted px-1 rounded">email</code> column
            (required). Optional columns:{' '}
            {KNOWN_FIELDS.filter((f) => f !== 'email').map((f, i, arr) => (
              <span key={f}>
                <code className="font-mono text-xs bg-muted px-1 rounded">{f}</code>
                {i < arr.length - 1 ? ', ' : ''}
              </span>
            ))}
            . Tags should be semicolon-separated within the cell. Any other columns become
            attributes.
          </p>

          <div className="mb-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
              data-testid="profile-csv-file-button"
            >
              <Upload size={15} />
              {fileName ?? 'Choose CSV file'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
              data-testid="profile-csv-file-input"
            />
          </div>

          {parseError && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="profile-csv-parse-error"
            >
              {parseError}
            </div>
          )}

          {error && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="profile-csv-import-error"
            >
              {error}
            </div>
          )}

          {preview.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                Preview: {preview.length} row{preview.length !== 1 ? 's' : ''} found
              </p>
              <div className="overflow-x-auto rounded border border-border max-h-48">
                <table className="w-full text-xs" data-testid="profile-csv-preview-table">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      {previewHeaders.map((h) => (
                        <th
                          key={h}
                          className="text-left px-3 py-2 font-medium text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.slice(0, 5).map((row, i) => (
                      <tr key={i} className="bg-card">
                        {previewHeaders.map((h) => (
                          <td key={h} className="px-3 py-1.5 text-foreground">
                            {row[h] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {preview.length > 5 && (
                      <tr>
                        <td
                          colSpan={previewHeaders.length}
                          className="px-3 py-1.5 text-muted-foreground text-center italic"
                        >
                          … and {preview.length - 5} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={preview.length === 0 || isLoading}
              data-testid="profile-csv-import-submit"
            >
              {isLoading
                ? 'Importing...'
                : `Import ${preview.length > 0 ? preview.length : ''} Profiles`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ProfileCsvImport
