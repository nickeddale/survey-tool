/**
 * SpecialSettingsForm — settings form for special question types.
 * Covers: ranking, image_picker, file_upload, expression, html
 */

import type {
  RankingSettings,
  ImagePickerSettings,
  FileUploadSettings,
  ExpressionSettings,
  HtmlSettings,
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

interface ToggleRowProps {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  'data-testid'?: string
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
  disabled,
  'data-testid': testId,
}: ToggleRowProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        data-testid={testId}
      />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  )
}

const inputClass =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm ' +
  'focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SpecialType = 'ranking' | 'image_picker' | 'file_upload' | 'expression' | 'html'

interface SpecialSettingsFormProps {
  type: SpecialType
  settings:
    | RankingSettings
    | ImagePickerSettings
    | FileUploadSettings
    | ExpressionSettings
    | HtmlSettings
  onChange: (
    updates: Partial<
      RankingSettings & ImagePickerSettings & FileUploadSettings & ExpressionSettings & HtmlSettings
    >
  ) => void
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpecialSettingsForm({
  type,
  settings,
  onChange,
  readOnly = false,
}: SpecialSettingsFormProps) {
  // ---- Ranking ----
  if (type === 'ranking') {
    const s = settings as RankingSettings
    return (
      <div className="space-y-3" data-testid="special-settings-form">
        <ToggleRow
          id="setting-randomize-initial-order"
          label="Randomize initial order"
          checked={s.randomize_initial_order ?? true}
          onChange={(checked) => onChange({ randomize_initial_order: checked })}
          disabled={readOnly}
          data-testid="special-setting-randomize-initial-order"
        />
      </div>
    )
  }

  // ---- Image Picker ----
  if (type === 'image_picker') {
    const s = settings as ImagePickerSettings
    return (
      <div className="space-y-3" data-testid="special-settings-form">
        <ToggleRow
          id="setting-multi-select"
          label="Allow multiple selections"
          checked={s.multi_select ?? false}
          onChange={(checked) => onChange({ multi_select: checked })}
          disabled={readOnly}
          data-testid="special-setting-multi-select"
        />
        {s.multi_select && (
          <>
            <FieldRow label="Min Choices">
              <input
                type="number"
                className={inputClass}
                value={s.min_choices ?? ''}
                min={0}
                placeholder="None"
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
                  onChange({ min_choices: isNaN(val as number) ? null : val })
                }}
                disabled={readOnly}
                data-testid="special-setting-min-choices"
              />
            </FieldRow>
            <FieldRow label="Max Choices">
              <input
                type="number"
                className={inputClass}
                value={s.max_choices ?? ''}
                min={0}
                placeholder="None"
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
                  onChange({ max_choices: isNaN(val as number) ? null : val })
                }}
                disabled={readOnly}
                data-testid="special-setting-max-choices"
              />
            </FieldRow>
          </>
        )}
        <FieldRow label="Image Width (px)">
          <input
            type="number"
            className={inputClass}
            value={s.image_width ?? 200}
            min={50}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val >= 50) onChange({ image_width: val })
            }}
            disabled={readOnly}
            data-testid="special-setting-image-width"
          />
        </FieldRow>
        <FieldRow label="Image Height (px)">
          <input
            type="number"
            className={inputClass}
            value={s.image_height ?? 150}
            min={50}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val >= 50) onChange({ image_height: val })
            }}
            disabled={readOnly}
            data-testid="special-setting-image-height"
          />
        </FieldRow>
        <ToggleRow
          id="setting-show-labels"
          label="Show labels below images"
          checked={s.show_labels ?? true}
          onChange={(checked) => onChange({ show_labels: checked })}
          disabled={readOnly}
          data-testid="special-setting-show-labels"
        />
      </div>
    )
  }

  // ---- File Upload ----
  if (type === 'file_upload') {
    const s = settings as FileUploadSettings
    return (
      <div className="space-y-3" data-testid="special-settings-form">
        <FieldRow label="Max File Size (MB)">
          <input
            type="number"
            className={inputClass}
            value={s.max_size_mb ?? 10}
            min={1}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val > 0) onChange({ max_size_mb: val })
            }}
            disabled={readOnly}
            data-testid="special-setting-max-size-mb"
          />
        </FieldRow>
        <FieldRow label="Max Files">
          <input
            type="number"
            className={inputClass}
            value={s.max_files ?? 1}
            min={1}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val > 0) onChange({ max_files: val })
            }}
            disabled={readOnly}
            data-testid="special-setting-max-files"
          />
        </FieldRow>
        <FieldRow label="Allowed File Types">
          <p className="text-xs text-muted-foreground mb-1">
            One MIME type per line (e.g. image/*, application/pdf)
          </p>
          <textarea
            className={`${inputClass} resize-none font-mono text-xs`}
            rows={4}
            value={(s.allowed_types ?? []).join('\n')}
            onChange={(e) => {
              const types = e.target.value
                .split('\n')
                .map((t) => t.trim())
                .filter(Boolean)
              onChange({ allowed_types: types })
            }}
            disabled={readOnly}
            data-testid="special-setting-allowed-types"
          />
        </FieldRow>
      </div>
    )
  }

  // ---- Expression ----
  if (type === 'expression') {
    const s = settings as ExpressionSettings
    return (
      <div className="space-y-3" data-testid="special-settings-form">
        <FieldRow label="Expression">
          <p className="text-xs text-muted-foreground mb-1">
            Reference other questions by name, e.g. &#123;q1&#125; + &#123;q2&#125;
          </p>
          <textarea
            className={`${inputClass} resize-none font-mono text-xs`}
            rows={3}
            value={s.expression ?? ''}
            onChange={(e) => onChange({ expression: e.target.value })}
            disabled={readOnly}
            placeholder="{question_code} + {other_code}"
            data-testid="special-setting-expression"
          />
        </FieldRow>
        <FieldRow label="Display Format">
          <select
            className={inputClass}
            value={s.display_format ?? 'text'}
            onChange={(e) =>
              onChange({ display_format: e.target.value as ExpressionSettings['display_format'] })
            }
            disabled={readOnly}
            data-testid="special-setting-display-format"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="percent">Percent</option>
          </select>
        </FieldRow>
        {s.display_format === 'currency' && (
          <FieldRow label="Currency Code">
            <input
              type="text"
              className={inputClass}
              value={s.currency ?? ''}
              placeholder="USD"
              maxLength={3}
              onChange={(e) => onChange({ currency: e.target.value.toUpperCase() || null })}
              disabled={readOnly}
              data-testid="special-setting-currency"
            />
          </FieldRow>
        )}
        {(s.display_format === 'number' ||
          s.display_format === 'currency' ||
          s.display_format === 'percent') && (
          <FieldRow label="Decimal Places">
            <input
              type="number"
              className={inputClass}
              value={s.decimal_places ?? 0}
              min={0}
              max={10}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= 0) onChange({ decimal_places: val })
              }}
              disabled={readOnly}
              data-testid="special-setting-decimal-places"
            />
          </FieldRow>
        )}
      </div>
    )
  }

  // ---- HTML ----
  if (type === 'html') {
    const s = settings as HtmlSettings
    return (
      <div className="space-y-3" data-testid="special-settings-form">
        <FieldRow label="HTML Content">
          <p className="text-xs text-muted-foreground mb-1">
            Content is sanitized on save to prevent XSS.
          </p>
          <textarea
            className={`${inputClass} resize-y font-mono text-xs`}
            rows={8}
            value={s.html_content ?? ''}
            onChange={(e) => onChange({ html_content: e.target.value })}
            disabled={readOnly}
            placeholder="<p>Your HTML content here...</p>"
            data-testid="special-setting-html-content"
          />
        </FieldRow>
      </div>
    )
  }

  return null
}

export default SpecialSettingsForm
