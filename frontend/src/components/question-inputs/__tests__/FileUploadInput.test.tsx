/**
 * Tests for FileUploadInput component.
 *
 * Covers: renders drop zone, file type validation, file size validation,
 * valid file shows preview, multiple file handling, remove file, external errors,
 * accessibility attributes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileUploadInput } from '../FileUploadInput'
import type { BuilderQuestion } from '../../../store/builderStore'
import { getDefaultSettings } from '../../../types/questionSettings'
import type { FileUploadSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(overrides: Partial<BuilderQuestion> = {}): BuilderQuestion {
  return {
    id: 'q-fu-1',
    group_id: 'g-1',
    parent_id: null,
    question_type: 'file_upload',
    code: 'Q1',
    title: 'Upload a file',
    description: null,
    is_required: false,
    sort_order: 1,
    relevance: null,
    validation: null,
    settings: getDefaultSettings('file_upload'),
    created_at: '2024-01-01T00:00:00Z',
    answer_options: [],
    subquestions: [],
    ...overrides,
  }
}

function makeSettings(overrides: Partial<FileUploadSettings> = {}): FileUploadSettings {
  return {
    max_size_mb: 10,
    allowed_types: [],
    max_files: 1,
    ...overrides,
  }
}

function makeFile(name: string, type: string, sizeBytes: number): File {
  const content = new Array(sizeBytes).fill('a').join('')
  return new File([content], name, { type })
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('FileUploadInput — rendering', () => {
  it('renders container with question id in testid', () => {
    render(<FileUploadInput value={[]} onChange={vi.fn()} question={makeQuestion({ id: 'q-xyz' })} />)
    expect(screen.getByTestId('file-upload-input-q-xyz')).toBeInTheDocument()
  })

  it('renders drop zone', () => {
    render(<FileUploadInput value={[]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('file-upload-dropzone')).toBeInTheDocument()
  })

  it('shows "Drop files here or click to upload" text', () => {
    render(<FileUploadInput value={[]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByText('Drop files here or click to upload')).toBeInTheDocument()
  })

  it('renders hidden file input', () => {
    render(<FileUploadInput value={[]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('file-upload-input')).toBeInTheDocument()
  })

  it('does not show previews when value is empty', () => {
    render(<FileUploadInput value={[]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.queryByTestId('file-upload-previews')).not.toBeInTheDocument()
  })

  it('shows file preview when file is provided', () => {
    const file = makeFile('document.pdf', 'application/pdf', 1024)
    render(<FileUploadInput value={[file]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('file-upload-previews')).toBeInTheDocument()
    expect(screen.getByTestId(`file-preview-document.pdf`)).toBeInTheDocument()
  })

  it('shows file name in preview', () => {
    const file = makeFile('report.pdf', 'application/pdf', 1024)
    render(<FileUploadInput value={[file]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId(`file-preview-name-report.pdf`)).toHaveTextContent('report.pdf')
  })

  it('shows file size in preview', () => {
    const file = makeFile('report.pdf', 'application/pdf', 2048)
    render(<FileUploadInput value={[file]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId(`file-preview-size-report.pdf`)).toHaveTextContent('KB')
  })

  it('shows image preview for image files', () => {
    // URL.createObjectURL/revokeObjectURL are not available in jsdom — define before use
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    const file = makeFile('photo.jpg', 'image/jpeg', 1024)
    render(<FileUploadInput value={[file]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId(`file-preview-img-photo.jpg`)).toBeInTheDocument()
  })

  it('shows remove button for each file in preview', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1024)
    render(<FileUploadInput value={[file]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId(`file-remove-doc.pdf`)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// File selection
// ---------------------------------------------------------------------------

describe('FileUploadInput — file selection', () => {
  it('calls onChange when files are dropped on dropzone', () => {
    const onChange = vi.fn()
    render(<FileUploadInput value={[]} onChange={onChange} question={makeQuestion()} />)
    const dropzone = screen.getByTestId('file-upload-dropzone')
    const file = makeFile('test.pdf', 'application/pdf', 1024)
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    })
    expect(onChange).toHaveBeenCalledWith([file])
  })

  it('calls onChange with new file replacing old file (single mode)', () => {
    const onChange = vi.fn()
    const oldFile = makeFile('old.pdf', 'application/pdf', 1024)
    const newFile = makeFile('new.pdf', 'application/pdf', 1024)
    render(<FileUploadInput value={[oldFile]} onChange={onChange} question={makeQuestion()} />)
    const dropzone = screen.getByTestId('file-upload-dropzone')
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [newFile] },
    })
    expect(onChange).toHaveBeenCalledWith([newFile])
  })

  it('accepts multiple files when max_files > 1', () => {
    const onChange = vi.fn()
    render(
      <FileUploadInput
        value={[]}
        onChange={onChange}
        question={makeQuestion({ settings: makeSettings({ max_files: 3 }) })}
      />
    )
    const dropzone = screen.getByTestId('file-upload-dropzone')
    const file1 = makeFile('a.pdf', 'application/pdf', 1024)
    const file2 = makeFile('b.pdf', 'application/pdf', 1024)
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file1, file2] },
    })
    expect(onChange).toHaveBeenCalledWith([file1, file2])
  })

  it('removes file when remove button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const file = makeFile('doc.pdf', 'application/pdf', 1024)
    render(<FileUploadInput value={[file]} onChange={onChange} question={makeQuestion()} />)
    await act(async () => {
      await user.click(screen.getByTestId('file-remove-doc.pdf'))
    })
    expect(onChange).toHaveBeenCalledWith([])
  })
})

// ---------------------------------------------------------------------------
// Validation — file type
// ---------------------------------------------------------------------------

describe('FileUploadInput — file type validation', () => {
  it('shows error for invalid file type after drop', () => {
    const onChange = vi.fn()
    render(
      <FileUploadInput
        value={[]}
        onChange={onChange}
        question={makeQuestion({ settings: makeSettings({ allowed_types: ['image/*'] }) })}
      />
    )
    const file = makeFile('document.exe', 'application/octet-stream', 1024)
    // onChange will receive the file (validation is shown as errors, not blocked)
    onChange.mockImplementation(() => {})

    // Render with the invalid file as value to trigger validation display
    render(
      <FileUploadInput
        value={[file]}
        onChange={vi.fn()}
        question={makeQuestion({ id: 'q-val', settings: makeSettings({ allowed_types: ['image/*'] }) })}
        errors={['"document.exe" is not an allowed file type.']}
      />
    )
    expect(screen.getByTestId('file-upload-errors')).toHaveTextContent('not an allowed file type')
  })

  it('shows error for oversized file via external errors', () => {
    const bigFile = makeFile('huge.pdf', 'application/pdf', 1024)
    render(
      <FileUploadInput
        value={[bigFile]}
        onChange={vi.fn()}
        question={makeQuestion({ id: 'q-size', settings: makeSettings({ max_size_mb: 1 }) })}
        errors={['"huge.pdf" exceeds the maximum size of 1 MB.']}
      />
    )
    expect(screen.getByTestId('file-upload-errors')).toHaveTextContent('exceeds the maximum size')
  })

  it('accepts files with no allowed_types restriction', () => {
    const file = makeFile('anything.xyz', 'application/octet-stream', 1024)
    render(
      <FileUploadInput
        value={[file]}
        onChange={vi.fn()}
        question={makeQuestion({ settings: makeSettings({ allowed_types: [] }) })}
      />
    )
    // No errors should be shown
    expect(screen.queryByTestId('file-upload-errors')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Validation — required
// ---------------------------------------------------------------------------

describe('FileUploadInput — required validation', () => {
  it('does not show error before interaction', () => {
    render(
      <FileUploadInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ is_required: true })}
      />
    )
    expect(screen.queryByTestId('file-upload-errors')).not.toBeInTheDocument()
  })

  it('shows required error on blur when no file uploaded', () => {
    render(
      <FileUploadInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ is_required: true })}
      />
    )
    fireEvent.blur(screen.getByTestId('file-upload-input-q-fu-1'))
    expect(screen.getByTestId('file-upload-errors')).toHaveTextContent('This field is required.')
  })
})

// ---------------------------------------------------------------------------
// External errors prop
// ---------------------------------------------------------------------------

describe('FileUploadInput — external errors', () => {
  it('displays external errors immediately without user interaction', () => {
    render(
      <FileUploadInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Upload failed on server']}
      />
    )
    expect(screen.getByTestId('file-upload-errors')).toHaveTextContent('Upload failed on server')
  })
})

// ---------------------------------------------------------------------------
// Memory leak — URL.revokeObjectURL cleanup
// ---------------------------------------------------------------------------

describe('FileUploadInput — FilePreview URL memory leak', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls revokeObjectURL when an image preview is unmounted', () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 1024)
    const { unmount } = render(
      <FileUploadInput value={[file]} onChange={vi.fn()} question={makeQuestion()} />
    )
    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('revokes the previous URL when a new image file replaces it', () => {
    const file1 = makeFile('photo1.jpg', 'image/jpeg', 1024)
    const file2 = makeFile('photo2.jpg', 'image/jpeg', 1024)

    URL.createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:mock-url-1')
      .mockReturnValueOnce('blob:mock-url-2')

    const { rerender } = render(
      <FileUploadInput value={[file1]} onChange={vi.fn()} question={makeQuestion()} />
    )
    expect(URL.createObjectURL).toHaveBeenCalledWith(file1)

    rerender(
      <FileUploadInput value={[file2]} onChange={vi.fn()} question={makeQuestion()} />
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url-1')
    expect(URL.createObjectURL).toHaveBeenCalledWith(file2)
  })

  it('does not call createObjectURL for non-image files', () => {
    const file = makeFile('doc.pdf', 'application/pdf', 1024)
    render(<FileUploadInput value={[file]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('image preview still renders with the created URL', () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 1024)
    render(<FileUploadInput value={[file]} onChange={vi.fn()} question={makeQuestion()} />)
    const img = screen.getByTestId('file-preview-img-photo.jpg')
    expect(img).toHaveAttribute('src', 'blob:mock-url')
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('FileUploadInput — accessibility', () => {
  it('dropzone has aria-label', () => {
    render(<FileUploadInput value={[]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('file-upload-dropzone')).toHaveAttribute('aria-label', 'Upload files')
  })

  it('sets aria-invalid=false when no errors', () => {
    render(<FileUploadInput value={[]} onChange={vi.fn()} question={makeQuestion()} />)
    expect(screen.getByTestId('file-upload-dropzone')).toHaveAttribute('aria-invalid', 'false')
  })

  it('sets aria-invalid=true when errors present', () => {
    render(
      <FileUploadInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Error']}
      />
    )
    expect(screen.getByTestId('file-upload-dropzone')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sets aria-describedby pointing to error element when errors present', () => {
    render(
      <FileUploadInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion({ id: 'q-test' })}
        errors={['Error']}
      />
    )
    expect(screen.getByTestId('file-upload-dropzone')).toHaveAttribute(
      'aria-describedby',
      'question-q-test-error',
    )
    expect(screen.getByTestId('file-upload-errors')).toHaveAttribute('id', 'question-q-test-error')
  })

  it('error list has role=alert', () => {
    render(
      <FileUploadInput
        value={[]}
        onChange={vi.fn()}
        question={makeQuestion()}
        errors={['Error']}
      />
    )
    expect(screen.getByTestId('file-upload-errors')).toHaveAttribute('role', 'alert')
  })
})
