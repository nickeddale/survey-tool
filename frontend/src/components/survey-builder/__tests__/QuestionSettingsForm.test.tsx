/**
 * Unit tests for QuestionSettingsForm and sub-form components.
 *
 * Patterns:
 * - Pure unit tests — no store/MSW needed for sub-forms
 * - Wrap userEvent in act() to avoid act() warnings
 * - vi.useRealTimers() in afterEach for timer safety
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { QuestionSettingsForm } from '../settings/QuestionSettingsForm'
import { TextSettingsForm } from '../settings/TextSettingsForm'
import { ChoiceSettingsForm } from '../settings/ChoiceSettingsForm'
import { MatrixSettingsForm } from '../settings/MatrixSettingsForm'
import { ScalarSettingsForm } from '../settings/ScalarSettingsForm'
import { SpecialSettingsForm } from '../settings/SpecialSettingsForm'
import { getDefaultSettings, getCompatibleSettings } from '../../../types/questionSettings'
import type {
  ShortTextSettings,
  RadioSettings,
  CheckboxSettings,
  MatrixSettings,
  MatrixDynamicSettings,
  NumericSettings,
  RatingSettings,
  BooleanSettings,
  DateSettings,
  ImagePickerSettings,
  ExpressionSettings,
  HtmlSettings,
  FileUploadSettings,
  RankingSettings,
} from '../../../types/questionSettings'

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// getDefaultSettings
// ---------------------------------------------------------------------------

describe('getDefaultSettings', () => {
  const allTypes = [
    'short_text',
    'long_text',
    'huge_text',
    'single_choice',
    'dropdown',
    'multiple_choice',
    'ranking',
    'image_picker',
    'matrix',
    'matrix_dropdown',
    'matrix_dynamic',
    'numeric',
    'rating',
    'boolean',
    'date',
    'file_upload',
    'expression',
    'html',
  ]

  it.each(allTypes)('returns an object for %s', (type) => {
    const defaults = getDefaultSettings(type)
    expect(typeof defaults).toBe('object')
    expect(defaults).not.toBeNull()
  })

  it('short_text defaults are correct', () => {
    const d = getDefaultSettings('short_text') as ShortTextSettings
    expect(d.placeholder).toBeNull()
    expect(d.max_length).toBe(255)
    expect(d.input_type).toBe('text')
  })

  it('long_text defaults are correct', () => {
    const d = getDefaultSettings('long_text') as {
      placeholder: null
      max_length: number
      rows: number
    }
    expect(d.max_length).toBe(5000)
    expect(d.rows).toBe(4)
  })

  it('huge_text defaults include rich_text=false', () => {
    const d = getDefaultSettings('huge_text') as { rich_text: boolean }
    expect(d.rich_text).toBe(false)
  })

  it('single_choice defaults are correct', () => {
    const d = getDefaultSettings('single_choice') as RadioSettings
    expect(d.has_other).toBe(false)
    expect(d.columns).toBe(1)
  })

  it('multiple_choice defaults include select_all=false', () => {
    const d = getDefaultSettings('multiple_choice') as CheckboxSettings
    expect(d.select_all).toBe(false)
    expect(d.min_choices).toBeNull()
    expect(d.max_choices).toBeNull()
  })

  it('ranking defaults include randomize_initial_order=true', () => {
    const d = getDefaultSettings('ranking') as RankingSettings
    expect(d.randomize_initial_order).toBe(true)
  })

  it('rating defaults include icon=star', () => {
    const d = getDefaultSettings('rating') as RatingSettings
    expect(d.icon).toBe('star')
    expect(d.max).toBe(5)
  })

  it('boolean defaults include render_as=toggle', () => {
    const d = getDefaultSettings('boolean') as BooleanSettings
    expect(d.render_as).toBe('toggle')
    expect(d.true_label).toBe('Yes')
    expect(d.false_label).toBe('No')
  })

  it('date defaults include include_time=false', () => {
    const d = getDefaultSettings('date') as DateSettings
    expect(d.include_time).toBe(false)
    expect(d.date_format).toBe('YYYY-MM-DD')
  })

  it('file_upload defaults include max_size_mb=10', () => {
    const d = getDefaultSettings('file_upload') as FileUploadSettings
    expect(d.max_size_mb).toBe(10)
    expect(d.max_files).toBe(1)
    expect(Array.isArray(d.allowed_types)).toBe(true)
  })

  it('expression defaults include empty expression string', () => {
    const d = getDefaultSettings('expression') as ExpressionSettings
    expect(d.expression).toBe('')
    expect(d.display_format).toBe('text')
  })

  it('html defaults include empty html_content', () => {
    const d = getDefaultSettings('html') as HtmlSettings
    expect(d.html_content).toBe('')
  })

  it('matrix defaults include alternate_rows=true', () => {
    const d = getDefaultSettings('matrix') as MatrixSettings
    expect(d.alternate_rows).toBe(true)
    expect(d.is_all_rows_required).toBe(false)
  })

  it('matrix_dynamic defaults include row_count=1', () => {
    const d = getDefaultSettings('matrix_dynamic') as MatrixDynamicSettings
    expect(d.row_count).toBe(1)
    expect(d.add_row_text).toBe('Add row')
  })
})

// ---------------------------------------------------------------------------
// getCompatibleSettings
// ---------------------------------------------------------------------------

describe('getCompatibleSettings', () => {
  it('returns defaults when old settings is null', () => {
    const result = getCompatibleSettings('short_text', 'long_text', null)
    expect(result).toEqual(getDefaultSettings('long_text'))
  })

  it('preserves placeholder when switching between text types', () => {
    const oldSettings = { placeholder: 'Enter your name', max_length: 100, input_type: 'text' }
    const result = getCompatibleSettings('short_text', 'long_text', oldSettings)
    expect(result.placeholder).toBe('Enter your name')
  })

  it('preserves has_other when switching between choice types', () => {
    const oldSettings = {
      has_other: true,
      other_text: 'Custom other',
      randomize: false,
      columns: 2,
    }
    const result = getCompatibleSettings('single_choice', 'multiple_choice', oldSettings)
    expect(result.has_other).toBe(true)
    expect(result.other_text).toBe('Custom other')
  })

  it('preserves randomize and columns when switching radio -> checkbox', () => {
    const oldSettings = { has_other: false, other_text: 'Other', randomize: true, columns: 3 }
    const result = getCompatibleSettings('single_choice', 'multiple_choice', oldSettings)
    expect(result.randomize).toBe(true)
    expect(result.columns).toBe(3)
  })

  it('discards incompatible settings when switching from text to choice', () => {
    const oldSettings = { placeholder: 'Test', max_length: 100, input_type: 'email' }
    const result = getCompatibleSettings('short_text', 'single_choice', oldSettings)
    // radio has no placeholder field
    const radioDefaults = getDefaultSettings('single_choice')
    expect(result).toEqual(radioDefaults)
  })

  it('preserves alternate_rows when switching between matrix types', () => {
    const oldSettings = { alternate_rows: false, is_all_rows_required: true, randomize_rows: true }
    const result = getCompatibleSettings('matrix', 'matrix_dropdown', oldSettings)
    expect(result.alternate_rows).toBe(false)
    expect(result.is_all_rows_required).toBe(true)
    expect(result.randomize_rows).toBe(true)
  })

  it('preserves min/max when switching between numeric and rating', () => {
    const oldSettings = {
      min: 0,
      max: 100,
      decimal_places: 2,
      placeholder: null,
      prefix: null,
      suffix: null,
    }
    const result = getCompatibleSettings('numeric', 'rating', oldSettings)
    expect(result.min).toBe(0)
    expect(result.max).toBe(100)
  })

  it('returns new type defaults when switching between totally unrelated types', () => {
    const oldSettings = { html_content: '<p>Test</p>' }
    const result = getCompatibleSettings('html', 'rating', oldSettings)
    expect(result).toEqual(getDefaultSettings('rating'))
  })
})

// ---------------------------------------------------------------------------
// TextSettingsForm
// ---------------------------------------------------------------------------

describe('TextSettingsForm', () => {
  it('renders placeholder and max_length fields for short_text', () => {
    render(
      <TextSettingsForm
        type="short_text"
        settings={getDefaultSettings('short_text') as ShortTextSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('text-setting-placeholder')).toBeInTheDocument()
    expect(screen.getByTestId('text-setting-max-length')).toBeInTheDocument()
    expect(screen.getByTestId('text-setting-input-type')).toBeInTheDocument()
    expect(screen.queryByTestId('text-setting-rows')).not.toBeInTheDocument()
    expect(screen.queryByTestId('text-setting-rich-text')).not.toBeInTheDocument()
  })

  it('renders rows field for long_text but not input_type', () => {
    render(
      <TextSettingsForm
        type="long_text"
        settings={
          getDefaultSettings('long_text') as Parameters<typeof TextSettingsForm>[0]['settings']
        }
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('text-setting-rows')).toBeInTheDocument()
    expect(screen.queryByTestId('text-setting-input-type')).not.toBeInTheDocument()
    expect(screen.queryByTestId('text-setting-rich-text')).not.toBeInTheDocument()
  })

  it('renders rows and rich_text for huge_text', () => {
    render(
      <TextSettingsForm
        type="huge_text"
        settings={
          getDefaultSettings('huge_text') as Parameters<typeof TextSettingsForm>[0]['settings']
        }
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('text-setting-rows')).toBeInTheDocument()
    expect(screen.getByTestId('text-setting-rich-text')).toBeInTheDocument()
    expect(screen.queryByTestId('text-setting-input-type')).not.toBeInTheDocument()
  })

  it('calls onChange when placeholder is updated', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <TextSettingsForm
        type="short_text"
        settings={getDefaultSettings('short_text') as ShortTextSettings}
        onChange={onChange}
      />
    )

    await act(async () => {
      await user.type(screen.getByTestId('text-setting-placeholder'), 'Test placeholder')
    })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ placeholder: expect.any(String) })
    )
  })

  it('calls onChange when rich_text is toggled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <TextSettingsForm
        type="huge_text"
        settings={
          getDefaultSettings('huge_text') as Parameters<typeof TextSettingsForm>[0]['settings']
        }
        onChange={onChange}
      />
    )

    await act(async () => {
      await user.click(screen.getByTestId('text-setting-rich-text'))
    })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rich_text: true }))
  })
})

// ---------------------------------------------------------------------------
// ChoiceSettingsForm
// ---------------------------------------------------------------------------

describe('ChoiceSettingsForm', () => {
  it('renders has_other for single_choice', () => {
    render(
      <ChoiceSettingsForm
        type="single_choice"
        settings={getDefaultSettings('single_choice') as RadioSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('choice-setting-has-other')).toBeInTheDocument()
    expect(screen.getByTestId('choice-setting-randomize')).toBeInTheDocument()
    expect(screen.getByTestId('choice-setting-columns')).toBeInTheDocument()
    expect(screen.queryByTestId('choice-setting-searchable')).not.toBeInTheDocument()
    expect(screen.queryByTestId('choice-setting-min-choices')).not.toBeInTheDocument()
  })

  it('renders searchable for dropdown but not randomize', () => {
    render(
      <ChoiceSettingsForm
        type="dropdown"
        settings={
          getDefaultSettings('dropdown') as Parameters<typeof ChoiceSettingsForm>[0]['settings']
        }
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('choice-setting-searchable')).toBeInTheDocument()
    expect(screen.getByTestId('choice-setting-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('choice-setting-randomize')).not.toBeInTheDocument()
    expect(screen.queryByTestId('choice-setting-min-choices')).not.toBeInTheDocument()
  })

  it('renders min_choices, max_choices, and select_all for multiple_choice', () => {
    render(
      <ChoiceSettingsForm
        type="multiple_choice"
        settings={getDefaultSettings('multiple_choice') as CheckboxSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('choice-setting-min-choices')).toBeInTheDocument()
    expect(screen.getByTestId('choice-setting-max-choices')).toBeInTheDocument()
    expect(screen.getByTestId('choice-setting-select-all')).toBeInTheDocument()
    expect(screen.queryByTestId('choice-setting-searchable')).not.toBeInTheDocument()
  })

  it('shows other_text field when has_other is enabled', async () => {
    const user = userEvent.setup()
    const settings: CheckboxSettings = {
      ...(getDefaultSettings('multiple_choice') as CheckboxSettings),
      has_other: false,
    }
    const onChange = vi.fn()
    const { rerender } = render(
      <ChoiceSettingsForm type="multiple_choice" settings={settings} onChange={onChange} />
    )

    // Initially no other_text input
    expect(screen.queryByTestId('choice-setting-other-text')).not.toBeInTheDocument()

    // Enable has_other
    await act(async () => {
      await user.click(screen.getByTestId('choice-setting-has-other'))
    })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ has_other: true }))

    // Re-render with updated settings
    rerender(
      <ChoiceSettingsForm
        type="multiple_choice"
        settings={{ ...settings, has_other: true }}
        onChange={onChange}
      />
    )

    expect(screen.getByTestId('choice-setting-other-text')).toBeInTheDocument()
  })

  it('shows select_all_text when select_all is enabled', async () => {
    const user = userEvent.setup()
    const settings: CheckboxSettings = {
      ...(getDefaultSettings('multiple_choice') as CheckboxSettings),
      select_all: false,
    }
    const onChange = vi.fn()
    const { rerender } = render(
      <ChoiceSettingsForm type="multiple_choice" settings={settings} onChange={onChange} />
    )

    expect(screen.queryByTestId('choice-setting-select-all-text')).not.toBeInTheDocument()

    await act(async () => {
      await user.click(screen.getByTestId('choice-setting-select-all'))
    })

    rerender(
      <ChoiceSettingsForm
        type="multiple_choice"
        settings={{ ...settings, select_all: true }}
        onChange={onChange}
      />
    )

    expect(screen.getByTestId('choice-setting-select-all-text')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// MatrixSettingsForm
// ---------------------------------------------------------------------------

describe('MatrixSettingsForm', () => {
  it('renders basic matrix settings', () => {
    render(
      <MatrixSettingsForm
        type="matrix"
        settings={getDefaultSettings('matrix') as MatrixSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('matrix-setting-alternate-rows')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-setting-all-rows-required')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-setting-randomize-rows')).toBeInTheDocument()
    expect(screen.queryByTestId('matrix-setting-cell-type')).not.toBeInTheDocument()
    expect(screen.queryByTestId('matrix-setting-row-count')).not.toBeInTheDocument()
  })

  it('renders cell_type for matrix_dropdown', () => {
    render(
      <MatrixSettingsForm
        type="matrix_dropdown"
        settings={
          getDefaultSettings('matrix_dropdown') as Parameters<
            typeof MatrixSettingsForm
          >[0]['settings']
        }
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('matrix-setting-cell-type')).toBeInTheDocument()
    expect(screen.queryByTestId('matrix-setting-row-count')).not.toBeInTheDocument()
  })

  it('renders dynamic matrix settings for matrix_dynamic', () => {
    render(
      <MatrixSettingsForm
        type="matrix_dynamic"
        settings={getDefaultSettings('matrix_dynamic') as MatrixDynamicSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('matrix-setting-cell-type')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-setting-row-count')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-setting-min-row-count')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-setting-max-row-count')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-setting-add-row-text')).toBeInTheDocument()
    expect(screen.getByTestId('matrix-setting-remove-row-text')).toBeInTheDocument()
    // alternate_rows not shown for matrix_dynamic
    expect(screen.queryByTestId('matrix-setting-alternate-rows')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ScalarSettingsForm
// ---------------------------------------------------------------------------

describe('ScalarSettingsForm', () => {
  it('renders numeric fields', () => {
    render(
      <ScalarSettingsForm
        type="numeric"
        settings={getDefaultSettings('numeric') as NumericSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('scalar-setting-min')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-max')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-decimal-places')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-prefix')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-suffix')).toBeInTheDocument()
  })

  it('renders rating fields including icon select', () => {
    render(
      <ScalarSettingsForm
        type="rating"
        settings={getDefaultSettings('rating') as RatingSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('scalar-setting-icon')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-min')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-max')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-step')).toBeInTheDocument()
  })

  it('renders boolean settings including labels and render_as', () => {
    render(
      <ScalarSettingsForm
        type="boolean"
        settings={getDefaultSettings('boolean') as BooleanSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('scalar-setting-true-label')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-false-label')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-default-value')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-render-as')).toBeInTheDocument()
  })

  it('renders date settings including min/max date and format', () => {
    render(
      <ScalarSettingsForm
        type="date"
        settings={getDefaultSettings('date') as DateSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('scalar-setting-min-date')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-max-date')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-include-time')).toBeInTheDocument()
    expect(screen.getByTestId('scalar-setting-date-format')).toBeInTheDocument()
  })

  it('calls onChange when rating icon is changed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ScalarSettingsForm
        type="rating"
        settings={getDefaultSettings('rating') as RatingSettings}
        onChange={onChange}
      />
    )

    await act(async () => {
      await user.selectOptions(screen.getByTestId('scalar-setting-icon'), 'heart')
    })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ icon: 'heart' }))
  })
})

// ---------------------------------------------------------------------------
// SpecialSettingsForm
// ---------------------------------------------------------------------------

describe('SpecialSettingsForm', () => {
  it('renders ranking settings', () => {
    render(
      <SpecialSettingsForm
        type="ranking"
        settings={getDefaultSettings('ranking') as RankingSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('special-setting-randomize-initial-order')).toBeInTheDocument()
  })

  it('renders image_picker settings', () => {
    render(
      <SpecialSettingsForm
        type="image_picker"
        settings={getDefaultSettings('image_picker') as ImagePickerSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('special-setting-multi-select')).toBeInTheDocument()
    expect(screen.getByTestId('special-setting-image-width')).toBeInTheDocument()
    expect(screen.getByTestId('special-setting-image-height')).toBeInTheDocument()
    expect(screen.getByTestId('special-setting-show-labels')).toBeInTheDocument()
    // min/max choices not shown unless multi_select is true
    expect(screen.queryByTestId('special-setting-min-choices')).not.toBeInTheDocument()
  })

  it('shows min/max choices for image_picker when multi_select is true', () => {
    const settings = {
      ...(getDefaultSettings('image_picker') as ImagePickerSettings),
      multi_select: true,
    }
    render(<SpecialSettingsForm type="image_picker" settings={settings} onChange={() => {}} />)
    expect(screen.getByTestId('special-setting-min-choices')).toBeInTheDocument()
    expect(screen.getByTestId('special-setting-max-choices')).toBeInTheDocument()
  })

  it('renders file_upload settings', () => {
    render(
      <SpecialSettingsForm
        type="file_upload"
        settings={getDefaultSettings('file_upload') as FileUploadSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('special-setting-max-size-mb')).toBeInTheDocument()
    expect(screen.getByTestId('special-setting-max-files')).toBeInTheDocument()
    expect(screen.getByTestId('special-setting-allowed-types')).toBeInTheDocument()
  })

  it('renders expression settings', () => {
    render(
      <SpecialSettingsForm
        type="expression"
        settings={getDefaultSettings('expression') as ExpressionSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('special-setting-expression')).toBeInTheDocument()
    expect(screen.getByTestId('special-setting-display-format')).toBeInTheDocument()
  })

  it('shows currency field for expression when format is currency', () => {
    const settings = {
      ...(getDefaultSettings('expression') as ExpressionSettings),
      display_format: 'currency' as const,
    }
    render(<SpecialSettingsForm type="expression" settings={settings} onChange={() => {}} />)
    expect(screen.getByTestId('special-setting-currency')).toBeInTheDocument()
    expect(screen.getByTestId('special-setting-decimal-places')).toBeInTheDocument()
  })

  it('renders html settings with html_content textarea', () => {
    render(
      <SpecialSettingsForm
        type="html"
        settings={getDefaultSettings('html') as HtmlSettings}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('special-setting-html-content')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// QuestionSettingsForm switcher
// ---------------------------------------------------------------------------

describe('QuestionSettingsForm', () => {
  it('renders text settings form for short_text', () => {
    render(
      <QuestionSettingsForm
        type="short_text"
        settings={getDefaultSettings('short_text')}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('text-settings-form')).toBeInTheDocument()
  })

  it('renders choice settings form for single_choice', () => {
    render(
      <QuestionSettingsForm
        type="single_choice"
        settings={getDefaultSettings('single_choice')}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('choice-settings-form')).toBeInTheDocument()
  })

  it('renders matrix settings form for matrix', () => {
    render(
      <QuestionSettingsForm
        type="matrix"
        settings={getDefaultSettings('matrix')}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('matrix-settings-form')).toBeInTheDocument()
  })

  it('renders scalar settings form for numeric', () => {
    render(
      <QuestionSettingsForm
        type="numeric"
        settings={getDefaultSettings('numeric')}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('scalar-settings-form')).toBeInTheDocument()
  })

  it('renders special settings form for html', () => {
    render(
      <QuestionSettingsForm type="html" settings={getDefaultSettings('html')} onChange={() => {}} />
    )
    expect(screen.getByTestId('special-settings-form')).toBeInTheDocument()
  })

  it('renders no-settings message for unknown type', () => {
    render(
      <QuestionSettingsForm
        type="unknown_type"
        settings={{} as Parameters<typeof QuestionSettingsForm>[0]['settings']}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('settings-form-no-settings')).toBeInTheDocument()
  })

  it('switches form when type changes', () => {
    const { rerender } = render(
      <QuestionSettingsForm
        type="short_text"
        settings={getDefaultSettings('short_text')}
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('text-settings-form')).toBeInTheDocument()

    rerender(
      <QuestionSettingsForm
        type="single_choice"
        settings={getDefaultSettings('single_choice')}
        onChange={() => {}}
      />
    )
    expect(screen.queryByTestId('text-settings-form')).not.toBeInTheDocument()
    expect(screen.getByTestId('choice-settings-form')).toBeInTheDocument()
  })
})
