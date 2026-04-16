/**
 * MatrixSettingsForm — settings form for matrix question types.
 * Covers: matrix, matrix_dropdown, matrix_dynamic
 */

import type {
  MatrixSettings,
  MatrixDropdownSettings,
  MatrixDynamicSettings,
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

interface MatrixSettingsFormProps {
  type: 'matrix' | 'matrix_single' | 'matrix_multiple' | 'matrix_dropdown' | 'matrix_dynamic'
  settings: MatrixSettings | MatrixDropdownSettings | MatrixDynamicSettings
  onChange: (
    updates: Partial<MatrixSettings & MatrixDropdownSettings & MatrixDynamicSettings>
  ) => void
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MatrixSettingsForm({
  type,
  settings,
  onChange,
  readOnly = false,
}: MatrixSettingsFormProps) {
  const s = settings as MatrixSettings & MatrixDropdownSettings & MatrixDynamicSettings

  return (
    <div className="space-y-3" data-testid="matrix-settings-form">
      {/* alternate_rows — all except matrix_dynamic */}
      {type !== 'matrix_dynamic' && (
        <ToggleRow
          id="setting-alternate-rows"
          label="Alternate row colors"
          checked={s.alternate_rows ?? true}
          onChange={(checked) => onChange({ alternate_rows: checked })}
          disabled={readOnly}
          data-testid="matrix-setting-alternate-rows"
        />
      )}

      {/* is_all_rows_required — all except matrix_dynamic */}
      {type !== 'matrix_dynamic' && (
        <ToggleRow
          id="setting-all-rows-required"
          label="All rows required"
          checked={s.is_all_rows_required ?? false}
          onChange={(checked) => onChange({ is_all_rows_required: checked })}
          disabled={readOnly}
          data-testid="matrix-setting-all-rows-required"
        />
      )}

      {/* randomize_rows — all except matrix_dynamic */}
      {type !== 'matrix_dynamic' && (
        <ToggleRow
          id="setting-randomize-rows"
          label="Randomize row order"
          checked={s.randomize_rows ?? false}
          onChange={(checked) => onChange({ randomize_rows: checked })}
          disabled={readOnly}
          data-testid="matrix-setting-randomize-rows"
        />
      )}

      {/* transpose — all except matrix_dynamic */}
      {type !== 'matrix_dynamic' && (
        <ToggleRow
          id="setting-transpose"
          label="Transpose (swap rows and columns)"
          checked={s.transpose ?? false}
          onChange={(checked) => onChange({ transpose: checked })}
          disabled={readOnly}
          data-testid="matrix-setting-transpose"
        />
      )}

      {/* cell_type — matrix_dropdown and matrix_dynamic only */}
      {(type === 'matrix_dropdown' || type === 'matrix_dynamic') && (
        <FieldRow label="Default Cell Type">
          <select
            className={inputClass}
            value={s.cell_type ?? 'dropdown'}
            onChange={(e) =>
              onChange({
                cell_type: e.target.value as 'dropdown' | 'text' | 'checkbox' | 'radio',
              })
            }
            disabled={readOnly}
            data-testid="matrix-setting-cell-type"
          >
            <option value="dropdown">Dropdown</option>
            <option value="text">Text</option>
            <option value="checkbox">Checkbox</option>
            <option value="radio">Radio</option>
          </select>
        </FieldRow>
      )}

      {/* matrix_dynamic specific fields */}
      {type === 'matrix_dynamic' && (
        <>
          <FieldRow label="Initial Row Count">
            <input
              type="number"
              className={inputClass}
              value={s.default_row_count ?? 1}
              min={0}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= 0) onChange({ default_row_count: val })
              }}
              disabled={readOnly}
              data-testid="matrix-setting-row-count"
            />
          </FieldRow>
          <FieldRow label="Min Row Count">
            <input
              type="number"
              className={inputClass}
              value={s.min_rows ?? 0}
              min={0}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= 0) onChange({ min_rows: val })
              }}
              disabled={readOnly}
              data-testid="matrix-setting-min-row-count"
            />
          </FieldRow>
          <FieldRow label="Max Row Count">
            <input
              type="number"
              className={inputClass}
              value={s.max_rows ?? ''}
              min={0}
              placeholder="None"
              onChange={(e) => {
                const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
                onChange({ max_rows: isNaN(val as number) ? null : val })
              }}
              disabled={readOnly}
              data-testid="matrix-setting-max-row-count"
            />
          </FieldRow>
          <FieldRow label='"Add row" button text'>
            <input
              type="text"
              className={inputClass}
              value={s.add_row_text ?? ''}
              onChange={(e) => onChange({ add_row_text: e.target.value })}
              disabled={readOnly}
              placeholder="Add row"
              data-testid="matrix-setting-add-row-text"
            />
          </FieldRow>
          <FieldRow label='"Remove row" button text'>
            <input
              type="text"
              className={inputClass}
              value={s.remove_row_text ?? ''}
              onChange={(e) => onChange({ remove_row_text: e.target.value })}
              disabled={readOnly}
              placeholder="Remove"
              data-testid="matrix-setting-remove-row-text"
            />
          </FieldRow>
        </>
      )}
    </div>
  )
}

export default MatrixSettingsForm
