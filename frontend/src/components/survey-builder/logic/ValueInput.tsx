import type { ValueInputProps } from './types'

export function ValueInput({ question, value, onChange, disabled }: ValueInputProps) {
  const type = question.question_type

  if (type === 'boolean') {
    return (
      <select
        className="rounded-md border border-input bg-background px-2 py-1 text-sm
          focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Boolean value"
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }

  if (['single_choice', 'dropdown', 'multiple_choice', 'ranking', 'image_picker'].includes(type)) {
    if (question.answer_options.length > 0) {
      return (
        <select
          className="rounded-md border border-input bg-background px-2 py-1 text-sm
            focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label="Choice value"
        >
          <option value="">Select option…</option>
          {question.answer_options
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((opt) => (
              <option key={opt.id} value={opt.code}>
                {opt.title}
              </option>
            ))}
        </select>
      )
    }
  }

  if (['numeric', 'rating'].includes(type)) {
    return (
      <input
        type="number"
        className="rounded-md border border-input bg-background px-2 py-1 text-sm
          focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 w-24"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Numeric value"
      />
    )
  }

  return (
    <input
      type="text"
      className="rounded-md border border-input bg-background px-2 py-1 text-sm
        focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 flex-1 min-w-0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="value"
      aria-label="Condition value"
    />
  )
}
