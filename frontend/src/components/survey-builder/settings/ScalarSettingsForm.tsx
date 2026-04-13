/**
 * ScalarSettingsForm — settings form for scalar question types.
 * Covers: numeric, rating, boolean, date
 */

import type {
  NumericSettings,
  RatingSettings,
  BooleanSettings,
  DateSettings,
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

interface ScalarSettingsFormProps {
  type: 'numeric' | 'rating' | 'boolean' | 'date'
  settings: NumericSettings | RatingSettings | BooleanSettings | DateSettings
  onChange: (
    updates: Partial<NumericSettings & RatingSettings & BooleanSettings & DateSettings>
  ) => void
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScalarSettingsForm({
  type,
  settings,
  onChange,
  readOnly = false,
}: ScalarSettingsFormProps) {
  const s = settings as NumericSettings & RatingSettings & BooleanSettings & DateSettings

  // ---- Numeric ----
  if (type === 'numeric') {
    return (
      <div className="space-y-3" data-testid="scalar-settings-form">
        <FieldRow label="Min Value">
          <input
            type="number"
            className={inputClass}
            value={s.min ?? ''}
            placeholder="None"
            onChange={(e) => {
              const val = e.target.value === '' ? null : parseFloat(e.target.value)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onChange({ min: (isNaN(val as number) ? null : val) as any })
            }}
            disabled={readOnly}
            data-testid="scalar-setting-min"
          />
        </FieldRow>
        <FieldRow label="Max Value">
          <input
            type="number"
            className={inputClass}
            value={s.max ?? ''}
            placeholder="None"
            onChange={(e) => {
              const val = e.target.value === '' ? null : parseFloat(e.target.value)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onChange({ max: (isNaN(val as number) ? null : val) as any })
            }}
            disabled={readOnly}
            data-testid="scalar-setting-max"
          />
        </FieldRow>
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
            data-testid="scalar-setting-decimal-places"
          />
        </FieldRow>
        <FieldRow label="Placeholder">
          <input
            type="text"
            className={inputClass}
            value={s.placeholder ?? ''}
            placeholder="Enter placeholder text..."
            onChange={(e) => onChange({ placeholder: e.target.value || null })}
            disabled={readOnly}
            data-testid="scalar-setting-placeholder"
          />
        </FieldRow>
        <FieldRow label="Prefix">
          <input
            type="text"
            className={inputClass}
            value={s.prefix ?? ''}
            placeholder="e.g. $"
            onChange={(e) => onChange({ prefix: e.target.value || null })}
            disabled={readOnly}
            data-testid="scalar-setting-prefix"
          />
        </FieldRow>
        <FieldRow label="Suffix">
          <input
            type="text"
            className={inputClass}
            value={s.suffix ?? ''}
            placeholder="e.g. kg"
            onChange={(e) => onChange({ suffix: e.target.value || null })}
            disabled={readOnly}
            data-testid="scalar-setting-suffix"
          />
        </FieldRow>
      </div>
    )
  }

  // ---- Rating ----
  if (type === 'rating') {
    return (
      <div className="space-y-3" data-testid="scalar-settings-form">
        <FieldRow label="Min Rating">
          <input
            type="number"
            className={inputClass}
            value={s.min ?? 1}
            min={0}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val)) onChange({ min: val })
            }}
            disabled={readOnly}
            data-testid="scalar-setting-min"
          />
        </FieldRow>
        <FieldRow label="Max Rating">
          <input
            type="number"
            className={inputClass}
            value={s.max ?? 5}
            min={1}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val)) onChange({ max: val })
            }}
            disabled={readOnly}
            data-testid="scalar-setting-max"
          />
        </FieldRow>
        <FieldRow label="Step">
          <input
            type="number"
            className={inputClass}
            value={(s as RatingSettings).step ?? 1}
            min={1}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val > 0) onChange({ step: val })
            }}
            disabled={readOnly}
            data-testid="scalar-setting-step"
          />
        </FieldRow>
        <FieldRow label="Icon">
          <select
            className={inputClass}
            value={(s as RatingSettings).icon ?? 'star'}
            onChange={(e) => onChange({ icon: e.target.value as RatingSettings['icon'] })}
            disabled={readOnly}
            data-testid="scalar-setting-icon"
          >
            <option value="star">Star</option>
            <option value="heart">Heart</option>
            <option value="thumb">Thumb</option>
            <option value="smiley">Smiley</option>
          </select>
        </FieldRow>
      </div>
    )
  }

  // ---- Boolean ----
  if (type === 'boolean') {
    return (
      <div className="space-y-3" data-testid="scalar-settings-form">
        <FieldRow label="True Label">
          <input
            type="text"
            className={inputClass}
            value={(s as BooleanSettings).true_label ?? 'Yes'}
            onChange={(e) => onChange({ true_label: e.target.value })}
            disabled={readOnly}
            data-testid="scalar-setting-true-label"
          />
        </FieldRow>
        <FieldRow label="False Label">
          <input
            type="text"
            className={inputClass}
            value={(s as BooleanSettings).false_label ?? 'No'}
            onChange={(e) => onChange({ false_label: e.target.value })}
            disabled={readOnly}
            data-testid="scalar-setting-false-label"
          />
        </FieldRow>
        <FieldRow label="Default Value">
          <select
            className={inputClass}
            value={
              (s as BooleanSettings).default_value === null
                ? 'null'
                : (s as BooleanSettings).default_value
                  ? 'true'
                  : 'false'
            }
            onChange={(e) => {
              const val = e.target.value === 'null' ? null : e.target.value === 'true'
              onChange({ default_value: val })
            }}
            disabled={readOnly}
            data-testid="scalar-setting-default-value"
          >
            <option value="null">None</option>
            <option value="true">{(s as BooleanSettings).true_label ?? 'Yes'}</option>
            <option value="false">{(s as BooleanSettings).false_label ?? 'No'}</option>
          </select>
        </FieldRow>
        <FieldRow label="Display As">
          <select
            className={inputClass}
            value={(s as BooleanSettings).render_as ?? 'toggle'}
            onChange={(e) =>
              onChange({ render_as: e.target.value as BooleanSettings['render_as'] })
            }
            disabled={readOnly}
            data-testid="scalar-setting-render-as"
          >
            <option value="toggle">Toggle</option>
            <option value="radio">Radio buttons</option>
            <option value="checkbox">Checkbox</option>
          </select>
        </FieldRow>
      </div>
    )
  }

  // ---- Date ----
  if (type === 'date') {
    return (
      <div className="space-y-3" data-testid="scalar-settings-form">
        <FieldRow label="Min Date">
          <input
            type="date"
            className={inputClass}
            value={(s as DateSettings).min_date ?? ''}
            onChange={(e) => onChange({ min_date: e.target.value || null })}
            disabled={readOnly}
            data-testid="scalar-setting-min-date"
          />
        </FieldRow>
        <FieldRow label="Max Date">
          <input
            type="date"
            className={inputClass}
            value={(s as DateSettings).max_date ?? ''}
            onChange={(e) => onChange({ max_date: e.target.value || null })}
            disabled={readOnly}
            data-testid="scalar-setting-max-date"
          />
        </FieldRow>
        <ToggleRow
          id="setting-include-time"
          label="Include time"
          checked={(s as DateSettings).include_time ?? false}
          onChange={(checked) => onChange({ include_time: checked })}
          disabled={readOnly}
          data-testid="scalar-setting-include-time"
        />
        <FieldRow label="Date Format">
          <select
            className={inputClass}
            value={(s as DateSettings).date_format ?? 'YYYY-MM-DD'}
            onChange={(e) => onChange({ date_format: e.target.value })}
            disabled={readOnly}
            data-testid="scalar-setting-date-format"
          >
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="DD-MM-YYYY">DD-MM-YYYY</option>
            <option value="MMMM D, YYYY">Month D, YYYY</option>
          </select>
        </FieldRow>
        <FieldRow label="Placeholder">
          <input
            type="text"
            className={inputClass}
            value={(s as DateSettings).placeholder ?? ''}
            placeholder="Enter placeholder text..."
            onChange={(e) => onChange({ placeholder: e.target.value || null })}
            disabled={readOnly}
            data-testid="scalar-setting-placeholder"
          />
        </FieldRow>
      </div>
    )
  }

  return null
}

export default ScalarSettingsForm
