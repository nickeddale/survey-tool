import { useState, useCallback } from 'react'
import { Download } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import type { QuestionResponse } from '../../types/survey'
import responseService from '../../services/responseService'
import { ApiError } from '../../types/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  surveyId: string
  questions: QuestionResponse[]
}

// ---------------------------------------------------------------------------
// ExportDialog
// ---------------------------------------------------------------------------

function ExportDialog({ open, onOpenChange, surveyId, questions }: ExportDialogProps) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    () => new Set(questions.map((q) => q.code)),
  )
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allSelected = selectedColumns.size === questions.length
  const noneSelected = selectedColumns.size === 0

  const handleSelectAll = useCallback(() => {
    setSelectedColumns(new Set(questions.map((q) => q.code)))
  }, [questions])

  const handleDeselectAll = useCallback(() => {
    setSelectedColumns(new Set())
  }, [])

  const handleToggleColumn = useCallback((code: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }, [])

  const handleExport = useCallback(async () => {
    setError(null)
    setIsExporting(true)

    try {
      const columns = questions
        .filter((q) => selectedColumns.has(q.code))
        .map((q) => q.code)

      const blob = await responseService.exportResponses(surveyId, {
        format,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        columns: columns.length < questions.length ? columns : undefined,
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `survey_${surveyId}_responses.${format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Export failed. Please try again.')
      }
    } finally {
      setIsExporting(false)
    }
  }, [surveyId, format, statusFilter, selectedColumns, questions, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col" data-testid="export-dialog">
        <DialogHeader>
          <DialogTitle>Export Responses</DialogTitle>
          <DialogDescription>
            Choose a format, filter by status, and select which question columns to include.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2">
          {/* Error */}
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
              {error}
            </div>
          )}

          {/* Format selection */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Format</p>
            <div className="flex gap-2" role="group" aria-label="Export format">
              {(['csv', 'json'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  aria-pressed={format === f}
                  data-testid={`format-${f}`}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    format === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:bg-muted'
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div>
            <label htmlFor="export-status-filter" className="text-sm font-medium text-foreground mb-2 block">
              Status Filter
            </label>
            <select
              id="export-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              data-testid="export-status-filter"
              className="px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full"
            >
              <option value="all">All Responses</option>
              <option value="complete">Complete Only</option>
              <option value="incomplete">Incomplete Only</option>
              <option value="disqualified">Disqualified Only</option>
            </select>
          </div>

          {/* Column selection */}
          {questions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">
                  Columns ({selectedColumns.size}/{questions.length} selected)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAll}
                    disabled={allSelected}
                    data-testid="select-all-columns"
                    className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    Select All
                  </button>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button
                    onClick={handleDeselectAll}
                    disabled={noneSelected}
                    data-testid="deselect-all-columns"
                    className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div
                className="border border-border rounded-md divide-y divide-border max-h-52 overflow-y-auto"
                data-testid="column-selection"
              >
                {questions.map((q) => (
                  <label
                    key={q.code}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    data-testid={`column-checkbox-${q.code}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedColumns.has(q.code)}
                      onChange={() => handleToggleColumn(q.code)}
                      aria-label={`Include ${q.title}`}
                      className="rounded border-border"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-mono text-muted-foreground mr-2">{q.code}</span>
                      <span className="text-sm text-foreground truncate">{q.title}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || noneSelected}
            data-testid="export-download-button"
          >
            <Download size={15} className="mr-2" />
            {isExporting ? 'Exporting…' : `Download ${format.toUpperCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ExportDialog
