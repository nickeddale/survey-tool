// Survey-related TypeScript types matching backend schemas

export interface AnswerOptionResponse {
  id: string
  question_id: string
  code: string
  title: string
  sort_order: number
  assessment_value: number
  image_url?: string | null
  created_at: string
}

export interface QuestionResponse {
  id: string
  group_id: string
  parent_id: string | null
  question_type: string
  code: string
  title: string
  description: string | null
  is_required: boolean
  sort_order: number
  relevance: string | null
  validation: Record<string, unknown> | null
  settings: Record<string, unknown> | null
  created_at: string
  subquestions: QuestionResponse[]
  answer_options: AnswerOptionResponse[]
}

export interface QuestionGroupResponse {
  id: string
  survey_id: string
  title: string
  description: string | null
  sort_order: number
  relevance: string | null
  created_at: string
  questions: QuestionResponse[]
}

export interface SurveyResponse {
  id: string
  user_id: string
  title: string
  description: string | null
  status: string
  welcome_message: string | null
  end_message: string | null
  default_language: string
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface SurveyFullResponse extends SurveyResponse {
  groups: QuestionGroupResponse[]
  questions: QuestionResponse[]
  options: AnswerOptionResponse[]
}

export interface SurveyListResponse {
  items: SurveyResponse[]
  total: number
  page: number
  per_page: number
  total_pages?: number
}

export interface ApiKeyResponse {
  id: string
  name: string
  key_prefix: string
  scopes: string[] | null
  is_active: boolean
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

export interface ApiKeyCreateResponse {
  id: string
  name: string
  key: string
  key_prefix: string
  scopes: string[] | null
  is_active: boolean
  expires_at: string | null
  created_at: string
}

export interface ApiKeyCreate {
  name: string
  scopes?: string[] | null
  expires_at?: string | null
}

export type SurveyStatus = 'draft' | 'active' | 'closed' | 'archived'

// ---------------------------------------------------------------------------
// Expression validation types (matching backend ExpressionErrorSchema /
// ExpressionWarningSchema / ValidateExpressionResponse)
// ---------------------------------------------------------------------------

export type ExpressionErrorCode =
  | 'SYNTAX_ERROR'
  | 'UNKNOWN_VARIABLE'
  | 'TYPE_MISMATCH'
  | 'UNSUPPORTED_FUNCTION'
  | 'FORWARD_REFERENCE'

export interface ExpressionError {
  message: string
  position: number
  code: ExpressionErrorCode
}

export interface ExpressionWarning {
  message: string
  position: number
  code: string
}

export interface ValidateExpressionResult {
  /** Variable names (question codes) found in the expression, in order of first occurrence. */
  parsed_variables: string[]
  /** Validation errors (syntax + semantic). Expression is invalid when non-empty. */
  errors: ExpressionError[]
  /** Advisory warnings (non-fatal). */
  warnings: ExpressionWarning[]
}

export interface SurveyCreatePayload {
  title: string
  description?: string | null
  welcome_message?: string | null
  end_message?: string | null
  default_language?: string
}

export interface SurveyUpdatePayload {
  title?: string
  description?: string | null
  welcome_message?: string | null
  end_message?: string | null
  default_language?: string
}

export interface QuestionUpdatePayload {
  title?: string
  code?: string
  question_type?: string
  description?: string | null
  is_required?: boolean
  relevance?: string | null
  validation?: Record<string, unknown> | null
  settings?: Record<string, unknown> | null
}

export interface QuestionGroupCreatePayload {
  title: string
  description?: string | null
}

export interface QuestionGroupUpdatePayload {
  title?: string
  description?: string | null
}

export interface QuestionCreatePayload {
  question_type: string
  title: string
  code?: string
  description?: string | null
  is_required?: boolean
  sort_order?: number
}

export interface GroupReorderPayload {
  group_ids: string[]
}
