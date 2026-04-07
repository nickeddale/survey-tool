/**
 * QuestionSettingsForm — top-level switcher that renders the correct settings sub-form
 * based on question type. Used inside QuestionEditor.
 */

import { TextSettingsForm } from './TextSettingsForm'
import { ChoiceSettingsForm } from './ChoiceSettingsForm'
import { MatrixSettingsForm } from './MatrixSettingsForm'
import { ScalarSettingsForm } from './ScalarSettingsForm'
import { SpecialSettingsForm } from './SpecialSettingsForm'
import type { QuestionSettings } from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface QuestionSettingsFormProps {
  type: string
  settings: QuestionSettings
  onChange: (updates: Partial<Record<string, unknown>>) => void
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuestionSettingsForm({ type, settings, onChange, readOnly = false }: QuestionSettingsFormProps) {
  // Text types
  if (type === 'short_text' || type === 'long_text' || type === 'huge_text') {
    return (
      <TextSettingsForm
        type={type}
        settings={settings as Parameters<typeof TextSettingsForm>[0]['settings']}
        onChange={onChange as Parameters<typeof TextSettingsForm>[0]['onChange']}
        readOnly={readOnly}
      />
    )
  }

  // Choice types
  if (type === 'single_choice' || type === 'dropdown' || type === 'multiple_choice') {
    return (
      <ChoiceSettingsForm
        type={type}
        settings={settings as Parameters<typeof ChoiceSettingsForm>[0]['settings']}
        onChange={onChange as Parameters<typeof ChoiceSettingsForm>[0]['onChange']}
        readOnly={readOnly}
      />
    )
  }

  // Matrix types
  if (type === 'matrix' || type === 'matrix_dropdown' || type === 'matrix_dynamic') {
    return (
      <MatrixSettingsForm
        type={type}
        settings={settings as Parameters<typeof MatrixSettingsForm>[0]['settings']}
        onChange={onChange as Parameters<typeof MatrixSettingsForm>[0]['onChange']}
        readOnly={readOnly}
      />
    )
  }

  // Scalar types
  if (type === 'numeric' || type === 'rating' || type === 'boolean' || type === 'date') {
    return (
      <ScalarSettingsForm
        type={type}
        settings={settings as Parameters<typeof ScalarSettingsForm>[0]['settings']}
        onChange={onChange as Parameters<typeof ScalarSettingsForm>[0]['onChange']}
        readOnly={readOnly}
      />
    )
  }

  // Special types
  if (
    type === 'ranking' ||
    type === 'image_picker' ||
    type === 'file_upload' ||
    type === 'expression' ||
    type === 'html'
  ) {
    return (
      <SpecialSettingsForm
        type={type}
        settings={settings as Parameters<typeof SpecialSettingsForm>[0]['settings']}
        onChange={onChange as Parameters<typeof SpecialSettingsForm>[0]['onChange']}
        readOnly={readOnly}
      />
    )
  }

  // Fallback for unrecognized types (legacy or unknown)
  return (
    <p className="text-xs text-muted-foreground italic" data-testid="settings-form-no-settings">
      No additional settings for this question type.
    </p>
  )
}

export default QuestionSettingsForm
