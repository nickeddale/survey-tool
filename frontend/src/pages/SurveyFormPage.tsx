import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import surveyService from '../services/surveyService'
import type { SurveyResponse } from '../types/survey'
import { ApiError } from '../types/api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent } from '../components/ui/card'
import { ValidationErrors } from '../components/common/ValidationErrors'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ar', label: 'Arabic' },
]

// ---------------------------------------------------------------------------
// Form field types
// ---------------------------------------------------------------------------

interface FormFields {
  title: string
  description: string
  welcome_message: string
  end_message: string
  default_language: string
}

interface FieldErrors {
  title?: string
}

// ---------------------------------------------------------------------------
// SurveyFormPage
// ---------------------------------------------------------------------------

function SurveyFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const isEditMode = Boolean(id)

  // Form state
  const [fields, setFields] = useState<FormFields>({
    title: '',
    description: '',
    welcome_message: '',
    end_message: '',
    default_language: 'en',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Edit mode state
  const [isLoadingSurvey, setIsLoadingSurvey] = useState(isEditMode)
  const [survey, setSurvey] = useState<SurveyResponse | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Load existing survey in edit mode
  useEffect(() => {
    if (!isEditMode || !id) return

    let cancelled = false

    async function load() {
      setIsLoadingSurvey(true)
      setError(null)
      try {
        const data = await surveyService.getSurvey(id!)
        if (!cancelled) {
          setSurvey(data)
          setFields({
            title: data.title,
            description: data.description ?? '',
            welcome_message: data.welcome_message ?? '',
            end_message: data.end_message ?? '',
            default_language: data.default_language,
          })
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            setNotFound(true)
          } else if (err instanceof ApiError) {
            setError(err.message)
          } else {
            setError('Failed to load survey. Please try again.')
          }
        }
      } finally {
        if (!cancelled) setIsLoadingSurvey(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id, isEditMode])

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!fields.title.trim()) {
      errors.title = 'Title is required'
    }
    return errors
  }

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    const payload = {
      title: fields.title.trim(),
      description: fields.description.trim() || null,
      welcome_message: fields.welcome_message.trim() || null,
      end_message: fields.end_message.trim() || null,
      default_language: fields.default_language,
    }

    setIsSubmitting(true)
    try {
      let result: SurveyResponse
      if (isEditMode && id) {
        result = await surveyService.updateSurvey(id, payload)
      } else {
        result = await surveyService.createSurvey(payload)
      }
      navigate(`/surveys/${result.id}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to save survey. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleCancel() {
    navigate('/surveys')
  }

  function handleFieldChange(field: keyof FormFields, value: string) {
    setFields((prev) => ({ ...prev, [field]: value }))
    // Clear field error on change
    if (field in fieldErrors) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  // ---------------------------------------------------------------------------
  // Render: loading
  // ---------------------------------------------------------------------------

  if (isLoadingSurvey) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="survey-form-loading">
        <div className="text-muted-foreground text-sm">Loading survey...</div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: 404
  // ---------------------------------------------------------------------------

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card data-testid="survey-not-found">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Survey Not Found</h2>
            <p className="text-muted-foreground text-sm mb-4">
              The survey you are looking for does not exist or has been deleted.
            </p>
            <Button onClick={() => navigate('/surveys')}>Back to Surveys</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: read-only view for non-draft surveys
  // ---------------------------------------------------------------------------

  if (isEditMode && survey && survey.status !== 'draft') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Survey Details</h1>
          <Button variant="outline" onClick={handleCancel}>
            Back to Surveys
          </Button>
        </div>

        <div
          className="p-4 mb-6 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md"
          role="alert"
          data-testid="readonly-notice"
        >
          This survey is in <strong>{survey.status}</strong> status and cannot be edited. Only draft
          surveys can be modified.
        </div>

        <Card data-testid="readonly-view">
          <CardContent className="p-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Title
              </p>
              <p className="text-foreground">{survey.title}</p>
            </div>
            {survey.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Description
                </p>
                <p className="text-foreground">{survey.description}</p>
              </div>
            )}
            {survey.welcome_message && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Welcome Message
                </p>
                <p className="text-foreground">{survey.welcome_message}</p>
              </div>
            )}
            {survey.end_message && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  End Message
                </p>
                <p className="text-foreground">{survey.end_message}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Default Language
              </p>
              <p className="text-foreground">{survey.default_language}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: create / edit form
  // ---------------------------------------------------------------------------

  const pageTitle = isEditMode ? 'Edit Survey' : 'Create Survey'
  const submitLabel = isSubmitting
    ? isEditMode
      ? 'Saving...'
      : 'Creating...'
    : isEditMode
      ? 'Save Changes'
      : 'Create Survey'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
      </div>

      {error && (
        <div
          className="mb-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md"
          role="alert"
        >
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Title */}
            <div className="space-y-1">
              <Label htmlFor="survey-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="survey-title"
                type="text"
                value={fields.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                placeholder="Enter survey title"
                aria-required="true"
              />
              <ValidationErrors
                errors={fieldErrors.title ? [fieldErrors.title] : []}
                id="survey-form-title-error"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label htmlFor="survey-description">Description</Label>
              <textarea
                id="survey-description"
                value={fields.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                placeholder="Optional description"
                rows={3}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y text-sm"
              />
            </div>

            {/* Welcome message */}
            <div className="space-y-1">
              <Label htmlFor="survey-welcome">Welcome Message</Label>
              <textarea
                id="survey-welcome"
                value={fields.welcome_message}
                onChange={(e) => handleFieldChange('welcome_message', e.target.value)}
                placeholder="Message shown before the survey begins"
                rows={3}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y text-sm"
              />
            </div>

            {/* End message */}
            <div className="space-y-1">
              <Label htmlFor="survey-end">End Message</Label>
              <textarea
                id="survey-end"
                value={fields.end_message}
                onChange={(e) => handleFieldChange('end_message', e.target.value)}
                placeholder="Message shown after the survey is completed"
                rows={3}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y text-sm"
              />
            </div>

            {/* Default language */}
            <div className="space-y-1">
              <Label htmlFor="survey-language">Default Language</Label>
              <select
                id="survey-language"
                value={fields.default_language}
                onChange={(e) => handleFieldChange('default_language', e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {submitLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default SurveyFormPage
