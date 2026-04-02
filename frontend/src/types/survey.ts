// Survey-related TypeScript types matching backend schemas

export interface AnswerOptionResponse {
  id: string
  question_id: string
  code: string
  title: string
  sort_order: number
  assessment_value: number
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
