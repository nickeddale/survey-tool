import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { ApiError } from '../../types/api'
import emailInvitationService from '../../services/emailInvitationService'
import type { EmailInvitationBatchResponse } from '../../types/survey'

// ---------------------------------------------------------------------------
// CSV parsing helpers (same pattern as CsvImportDialog)
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

function rowToInvitationItem(row: Record<string, string>): { email: string; name?: string } {
  return {
    email: (row['email'] ?? row['Email'] ?? '').trim(),
    name: (row['name'] ?? row['Name'] ?? '').trim() || undefined,
  }
}

// ---------------------------------------------------------------------------
// EmailBatchDialog
// ---------------------------------------------------------------------------

interface EmailBatchDialogProps {
  surveyId: string
  onComplete: (result: EmailInvitationBatchResponse) => void
  onCancel: () => void
}

function EmailBatchDialog({ surveyId, onComplete, onCancel }: EmailBatchDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
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
      const items = preview
        .map(rowToInvitationItem)
        .filter((item) => item.email)
      const result = await emailInvitationService.sendBatchInvitations(surveyId, {
        items,
        subject: subject.trim() || undefined,
      })
      onComplete(result)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to send batch invitations. Please try again.')
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
      aria-labelledby="batch-dialog-title"
      data-testid="batch-dialog"
    >
      <Card className="max-w-2xl w-full mx-4 shadow-lg max-h-[90vh] overflow-y-auto">
        <CardContent className="p-6">
          <h2
            id="batch-dialog-title"
            className="text-lg font-semibold text-foreground mb-2"
          >
            Send Batch Invitations
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a CSV file with an{' '}
            <code className="font-mono text-xs bg-muted px-1 rounded">email</code> column.
            Optional column:{' '}
            <code className="font-mono text-xs bg-muted px-1 rounded">name</code>.
          </p>

          {/* Subject override */}
          <div className="mb-4">
            <label
              htmlFor="batch-subject"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Subject (optional — overrides default template subject)
            </label>
            <input
              id="batch-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="You are invited to take our survey"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isLoading}
              data-testid="batch-subject-input"
            />
          </div>

          {/* File picker */}
          <div className="mb-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
              data-testid="batch-file-button"
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
              data-testid="batch-file-input"
            />
          </div>

          {/* Parse error */}
          {parseError && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="batch-parse-error"
            >
              {parseError}
            </div>
          )}

          {/* Import error */}
          {error && (
            <div
              className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
              role="alert"
              data-testid="batch-import-error"
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
                <table className="w-full text-xs" data-testid="batch-preview-table">
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
              data-testid="batch-import-submit"
            >
              {isLoading
                ? 'Sending...'
                : `Send ${preview.length > 0 ? preview.length : ''} Invitations`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default EmailBatchDialog
