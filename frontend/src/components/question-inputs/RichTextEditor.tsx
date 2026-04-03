/**
 * RichTextEditor — Tiptap-based rich text editor for HugeTextInput.
 *
 * Isolated into its own module so it can be mocked in tests.
 * The parent component (HugeTextInput) only renders this when rich_text=true.
 */

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  onBlur: () => void
  hasErrors: boolean
  editorId: string
  errorId?: string
}

export function RichTextEditor({ value, onChange, onBlur, hasErrors, editorId, errorId }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    onBlur() {
      onBlur()
    },
    editorProps: {
      attributes: {
        id: editorId,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-invalid': hasErrors ? 'true' : 'false',
        ...(errorId ? { 'aria-describedby': errorId } : {}),
        class: [
          'min-h-[200px] w-full rounded-md border bg-background px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          hasErrors ? 'border-destructive focus:ring-destructive' : 'border-input',
          'prose prose-sm max-w-none',
        ].join(' '),
      },
    },
  })

  // Sync external value changes into the editor (e.g., form reset)
  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [editor, value])

  return (
    <div data-testid="rich-text-editor">
      <EditorContent editor={editor} />
    </div>
  )
}

export default RichTextEditor
