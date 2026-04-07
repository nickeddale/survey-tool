/**
 * ChoiceSettingsForm — settings form for choice question types.
 * Covers: radio, dropdown, checkbox
 */

import type {
  RadioSettings,
  DropdownSettings,
  CheckboxSettings,
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

function ToggleRow({ id, label, checked, onChange, disabled, 'data-testid': testId }: ToggleRowProps) {
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
      <label htmlFor={id} className="text-sm">{label}</label>
    </div>
  )
}

const inputClass =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm ' +
  'focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChoiceSettingsFormProps {
  type: 'single_choice' | 'dropdown' | 'multiple_choice'
  settings: RadioSettings | DropdownSettings | CheckboxSettings
  onChange: (updates: Partial<RadioSettings & DropdownSettings & CheckboxSettings>) => void
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChoiceSettingsForm({ type, settings, onChange, readOnly = false }: ChoiceSettingsFormProps) {
  const s = settings as RadioSettings & DropdownSettings & CheckboxSettings

  return (
    <div className="space-y-3" data-testid="choice-settings-form">
      {/* placeholder — dropdown only */}
      {type === 'dropdown' && (
        <FieldRow label="Placeholder">
          <input
            type="text"
            className={inputClass}
            value={s.placeholder ?? ''}
            onChange={(e) => onChange({ placeholder: e.target.value })}
            disabled={readOnly}
            placeholder="Select an option"
            data-testid="choice-setting-placeholder"
          />
        </FieldRow>
      )}

      {/* searchable — dropdown only */}
      {type === 'dropdown' && (
        <ToggleRow
          id="setting-searchable"
          label="Searchable (type-ahead filter)"
          checked={s.searchable ?? false}
          onChange={(checked) => onChange({ searchable: checked })}
          disabled={readOnly}
          data-testid="choice-setting-searchable"
        />
      )}

      {/* has_other */}
      <ToggleRow
        id="setting-has-other"
        label='Show "Other" option'
        checked={s.has_other ?? false}
        onChange={(checked) => onChange({ has_other: checked })}
        disabled={readOnly}
        data-testid="choice-setting-has-other"
      />

      {/* other_text — shown when has_other is true */}
      {s.has_other && (
        <FieldRow label='"Other" label'>
          <input
            type="text"
            className={inputClass}
            value={s.other_text ?? ''}
            onChange={(e) => onChange({ other_text: e.target.value })}
            disabled={readOnly}
            placeholder="Other"
            data-testid="choice-setting-other-text"
          />
        </FieldRow>
      )}

      {/* randomize — single_choice and multiple_choice only */}
      {(type === 'single_choice' || type === 'multiple_choice') && (
        <ToggleRow
          id="setting-randomize"
          label="Randomize option order"
          checked={s.randomize ?? false}
          onChange={(checked) => onChange({ randomize: checked })}
          disabled={readOnly}
          data-testid="choice-setting-randomize"
        />
      )}

      {/* columns — single_choice and multiple_choice only */}
      {(type === 'single_choice' || type === 'multiple_choice') && (
        <FieldRow label="Columns">
          <select
            className={inputClass}
            value={s.columns ?? 1}
            onChange={(e) => onChange({ columns: parseInt(e.target.value, 10) })}
            disabled={readOnly}
            data-testid="choice-setting-columns"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </FieldRow>
      )}

      {/* min_choices / max_choices — multiple_choice only */}
      {type === 'multiple_choice' && (
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
              data-testid="choice-setting-min-choices"
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
              data-testid="choice-setting-max-choices"
            />
          </FieldRow>
        </>
      )}

      {/* select_all — multiple_choice only */}
      {type === 'multiple_choice' && (
        <>
          <ToggleRow
            id="setting-select-all"
            label='Show "Select all" checkbox'
            checked={s.select_all ?? false}
            onChange={(checked) => onChange({ select_all: checked })}
            disabled={readOnly}
            data-testid="choice-setting-select-all"
          />
          {s.select_all && (
            <FieldRow label='"Select all" label'>
              <input
                type="text"
                className={inputClass}
                value={s.select_all_text ?? ''}
                onChange={(e) => onChange({ select_all_text: e.target.value })}
                disabled={readOnly}
                placeholder="Select all"
                data-testid="choice-setting-select-all-text"
              />
            </FieldRow>
          )}
        </>
      )}
    </div>
  )
}

export default ChoiceSettingsForm
