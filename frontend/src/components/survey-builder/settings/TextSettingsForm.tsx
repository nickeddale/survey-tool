/**
 * TextSettingsForm — settings form for text question types.
 * Covers: short_text, long_text, huge_text
 */

import type {
  ShortTextSettings,
  LongTextSettings,
  HugeTextSettings,
} from '../../../types/questionSettings'

// ---------------------------------------------------------------------------
// Shared field components
// ---------------------------------------------------------------------------

interface FieldRowProps {
  label: string
  children: React.ReactNode
}

function FieldRow({ label, children }: FieldRowProps) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      {children}
    </div>
  )
}

const inputClass =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm ' +
  'focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TextSettingsFormProps {
  type: 'short_text' | 'long_text' | 'huge_text'
  settings: ShortTextSettings | LongTextSettings | HugeTextSettings
  onChange: (updates: Partial<ShortTextSettings & LongTextSettings & HugeTextSettings>) => void
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TextSettingsForm({
  type,
  settings,
  onChange,
  readOnly = false,
}: TextSettingsFormProps) {
  const s = settings as ShortTextSettings & LongTextSettings & HugeTextSettings

  return (
    <div className="space-y-3" data-testid="text-settings-form">
      {/* placeholder */}
      <FieldRow label="Placeholder">
        <input
          type="text"
          className={inputClass}
          value={s.placeholder ?? ''}
          onChange={(e) => onChange({ placeholder: e.target.value || null })}
          disabled={readOnly}
          placeholder="Enter placeholder text..."
          data-testid="text-setting-placeholder"
        />
      </FieldRow>

      {/* max_length */}
      <FieldRow label="Max Length">
        <input
          type="number"
          className={inputClass}
          value={s.max_length ?? ''}
          min={1}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10)
            if (!isNaN(val) && val > 0) onChange({ max_length: val })
          }}
          disabled={readOnly}
          data-testid="text-setting-max-length"
        />
      </FieldRow>

      {/* rows — long_text and huge_text only */}
      {(type === 'long_text' || type === 'huge_text') && (
        <FieldRow label="Rows">
          <input
            type="number"
            className={inputClass}
            value={(s as LongTextSettings).rows ?? ''}
            min={1}
            max={50}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val > 0) onChange({ rows: val })
            }}
            disabled={readOnly}
            data-testid="text-setting-rows"
          />
        </FieldRow>
      )}

      {/* rich_text — huge_text only */}
      {type === 'huge_text' && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="setting-rich-text"
            checked={(s as HugeTextSettings).rich_text ?? false}
            onChange={(e) => onChange({ rich_text: e.target.checked })}
            disabled={readOnly}
            data-testid="text-setting-rich-text"
          />
          <label htmlFor="setting-rich-text" className="text-sm">
            Enable rich text editor
          </label>
        </div>
      )}

      {/* input_type — short_text only */}
      {type === 'short_text' && (
        <FieldRow label="Input Type">
          <select
            className={inputClass}
            value={(s as ShortTextSettings).input_type ?? 'text'}
            onChange={(e) =>
              onChange({ input_type: e.target.value as ShortTextSettings['input_type'] })
            }
            disabled={readOnly}
            data-testid="text-setting-input-type"
          >
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="url">URL</option>
            <option value="tel">Phone</option>
          </select>
        </FieldRow>
      )}
    </div>
  )
}

export default TextSettingsForm
