/**
 * FileUploadInput — file upload drop zone for file_upload questions.
 *
 * Supports drag-to-upload and click-to-upload. Client-side validation of
 * file types and max size. Shows file preview after selection.
 * For images, shows an image thumbnail. For other types, shows file info.
 */

import { useState, useRef } from 'react'
import type { BuilderQuestion } from '../../store/builderStore'
import type { FileUploadSettings } from '../../types/questionSettings'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileUploadInputProps {
  value: File[]
  onChange: (value: File[]) => void
  question: BuilderQuestion
  errors?: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function matchesAllowedType(file: File, allowedTypes: string[]): boolean {
  if (allowedTypes.length === 0) return true
  return allowedTypes.some((type) => {
    if (type.endsWith('/*')) {
      const category = type.slice(0, -2)
      return file.type.startsWith(`${category}/`)
    }
    return file.type === type || file.name.toLowerCase().endsWith(`.${type.replace(/^\./, '')}`)
  })
}

function validateFiles(
  files: File[],
  allowedTypes: string[],
  maxSizeMb: number,
): string[] {
  const errs: string[] = []
  for (const file of files) {
    if (!matchesAllowedType(file, allowedTypes)) {
      errs.push(`"${file.name}" is not an allowed file type.`)
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      errs.push(`"${file.name}" exceeds the maximum size of ${maxSizeMb} MB.`)
    }
  }
  return errs
}

// ---------------------------------------------------------------------------
// File preview sub-component
// ---------------------------------------------------------------------------

interface FilePreviewProps {
  file: File
  onRemove: () => void
}

function FilePreview({ file, onRemove }: FilePreviewProps) {
  const isImage = file.type.startsWith('image/')
  const [previewUrl] = useState(() => (isImage ? URL.createObjectURL(file) : null))

  return (
    <div
      className="flex items-center gap-3 rounded-md border border-input bg-background px-3 py-2 text-sm"
      data-testid={`file-preview-${file.name}`}
    >
      {isImage && previewUrl ? (
        <img
          src={previewUrl}
          alt={file.name}
          className="w-10 h-10 object-cover rounded"
          data-testid={`file-preview-img-${file.name}`}
        />
      ) : (
        <div
          className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground"
          aria-hidden="true"
          data-testid={`file-preview-icon-${file.name}`}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H4zm7 1.5L17.5 9H11V3.5z" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium" data-testid={`file-preview-name-${file.name}`}>
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground" data-testid={`file-preview-size-${file.name}`}>
          {formatFileSize(file.size)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive focus:outline-none"
        aria-label={`Remove ${file.name}`}
        data-testid={`file-remove-${file.name}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileUploadInput({ value, onChange, question, errors: externalErrors }: FileUploadInputProps) {
  const s = (question.settings ?? {}) as Partial<FileUploadSettings>
  const allowedTypes = s.allowed_types ?? []
  const maxSizeMb = s.max_size_mb ?? 10
  const maxFiles = s.max_files ?? 1
  const multiple = maxFiles > 1

  const [touched, setTouched] = useState(false)
  const [internalErrors, setInternalErrors] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const validationErrors = validateFiles(value, allowedTypes, maxSizeMb)
  const displayErrors = externalErrors ?? (touched ? [...internalErrors, ...validationErrors] : [])
  const hasErrors = displayErrors.length > 0
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`

  function processFiles(incoming: FileList | null) {
    if (!incoming) return
    const filesArray = Array.from(incoming)

    let next: File[]
    if (multiple) {
      next = [...value, ...filesArray].slice(0, maxFiles)
    } else {
      next = filesArray.slice(0, 1)
    }

    onChange(next)
    setTouched(true)
    setInternalErrors(validateFiles(next, allowedTypes, maxSizeMb))
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    processFiles(e.target.files)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    processFiles(e.dataTransfer.files)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave() {
    setIsDragOver(false)
  }

  function handleRemoveFile(index: number) {
    const next = value.filter((_, i) => i !== index)
    onChange(next)
    if (touched) {
      setInternalErrors(validateFiles(next, allowedTypes, maxSizeMb))
    }
  }

  function handleBlur() {
    setTouched(true)
    if (question.is_required && value.length === 0) {
      setInternalErrors(['This field is required.'])
    } else {
      setInternalErrors(validateFiles(value, allowedTypes, maxSizeMb))
    }
  }

  const acceptAttr = allowedTypes.length > 0 ? allowedTypes.join(',') : undefined

  return (
    <div
      className="space-y-3"
      data-testid={`file-upload-input-${question.id}`}
      onBlur={handleBlur}
    >
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? errorId : undefined}
        className={[
          'flex flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-ring transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : hasErrors
              ? 'border-destructive'
              : 'border-input hover:border-primary/50',
        ].join(' ')}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid="file-upload-dropzone"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="currentColor"
          className="mb-2 text-muted-foreground"
          aria-hidden="true"
        >
          <path d="M16 2a14 14 0 100 28A14 14 0 0016 2zm0 4l6 6h-4v6h-4v-6H10l6-6zm-8 16h16v2H8v-2z" />
        </svg>
        <p className="text-sm font-medium">Drop files here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-1">
          {allowedTypes.length > 0 ? `Accepted: ${allowedTypes.join(', ')}` : 'All file types accepted'}
          {` · Max ${maxSizeMb} MB`}
          {multiple ? ` · Up to ${maxFiles} files` : ''}
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        multiple={multiple}
        accept={acceptAttr}
        onChange={handleFileInputChange}
        className="sr-only"
        data-testid="file-upload-input"
        aria-hidden="true"
      />

      {/* File previews */}
      {value.length > 0 && (
        <div className="space-y-2" data-testid="file-upload-previews">
          {value.map((file, index) => (
            <FilePreview
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => handleRemoveFile(index)}
            />
          ))}
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <ul id={errorId} role="alert" aria-live="assertive" className="space-y-0.5" data-testid="file-upload-errors">
          {displayErrors.map((err, i) => (
            <li key={i} className="text-xs text-destructive">
              {err}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FileUploadInput
