import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import type { ParticipantCreate, ParticipantCreateResponse } from '../../types/survey'
import participantService from '../../services/participantService'
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

function rowToParticipant(row: Record<string, string>): ParticipantCreate {
  const { email, uses_remaining, valid_from, valid_until, ...rest } = row

  const attributes: Record<string, string> = {}
  Object.entries(rest).forEach(([k, v]) => {
    if (k && v !== '') attributes[k] = v
  })

  return {
    email: email?.trim() || null,
    uses_remaining: uses_remaining ? parseInt(uses_remaining, 10) : null,
    valid_from: valid_from ? new Date(valid_from).toISOString() : null,
    valid_until: valid_until ? new Date(valid_until).toISOString() : null,
    attributes: Object.keys(attributes).length > 0 ? attributes : null,
  }
}

// ---------------------------------------------------------------------------
// CsvImportDialog
// ---------------------------------------------------------------------------

interface CsvImportDialogProps {
  surveyId: string
  onComplete: (created: ParticipantCreateResponse[]) => void
  onCancel: () => void
}

function CsvImportDialog({ surveyId, onComplete, onCancel }: CsvImportDialogProps) {
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
      const items = preview.map(rowToParticipant)
      const created = await participantService.createParticipantsBatch(surveyId, { items })
      onComplete(created)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to import participants. Please try again.')
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
      aria-labelledby="csv-import-title"
      data-testid="csv-import-dialog"
    >
      <Card className="max-w-2xl w-full mx-4 shadow-lg max-h-[90vh] overflow-y-auto">
        <CardContent className="p-6">
          <h2 id="csv-import-title" className="text-lg font-semibold text-foreground mb-2">
            Import Participants from CSV
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a CSV file with an{' '}
            <code className="font-mono text-xs bg-muted px-1 rounded">email</code> column. Optional
            columns: <code className="font-mono text-xs bg-muted px-1 rounded">uses_remaining</code>
            , <code className="font-mono text-xs bg-muted px-1 rounded">valid_from</code>,{' '}
            <code className="font-mono text-xs bg-muted px-1 rounded">valid_until</code>. Any other
            columns become attributes.
          </p>

          {/* File picker */}
          <div className="mb-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
              data-testid="csv-file-button"
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
              data-testid="csv-file-input"
            />
          </div>

          {/* Parse error */}
          {parseError && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="csv-parse-error"
            >
              {parseError}
            </div>
          )}

          {/* Import error */}
          {error && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="csv-import-error"
            >
              {error}
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                Preview: {preview.length} row{preview.length !== 1 ? 's' : ''} found
              </p>
              <div className="overflow-x-auto rounded border border-border max-h-48">
                <table className="w-full text-xs" data-testid="csv-preview-table">
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

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={preview.length === 0 || isLoading}
              data-testid="csv-import-submit"
            >
              {isLoading
                ? 'Importing...'
                : `Import ${preview.length > 0 ? preview.length : ''} Participants`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default CsvImportDialog
