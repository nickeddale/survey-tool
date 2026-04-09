// Survey-related TypeScript types matching backend schemas

import type { QuestionSettings } from './questionSettings'

/** Translations map: { "fr": { "title": "...", "description": "..." }, "es": {...} } */
export type TranslationsMap = Record<string, Record<string, string>>

export interface AnswerOptionResponse {
  id: string
  question_id: string
  code: string
  title: string
  sort_order: number
  assessment_value: number
  image_url?: string | null
  translations?: TranslationsMap
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
  settings: QuestionSettings | null
  translations?: TranslationsMap
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
  translations?: TranslationsMap
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
  translations?: TranslationsMap
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

export type ExpressionWarningCode = 'FORWARD_REFERENCE' | string

export interface ExpressionWarning {
  message: string
  position: number
  code: ExpressionWarningCode
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

// ---------------------------------------------------------------------------
// Flow resolution types (matching backend ResolveFlowRequest / ResolveFlowResponse)
// POST /surveys/{id}/logic/resolve-flow
// ---------------------------------------------------------------------------

export interface ResolveFlowAnswerInput {
  question_id: string
  value: unknown
}

export interface ResolveFlowRequest {
  answers: ResolveFlowAnswerInput[]
  /** Optional: current question id to compute next navigation target */
  current_question_id?: string | null
}

export interface ResolveFlowResponse {
  /** Question ids that should be visible (i.e. their relevance is truthy) */
  visible_questions: string[]
  /** Question ids that should be hidden */
  hidden_questions: string[]
  /** Group ids that should be visible */
  visible_groups: string[]
  /** Group ids that should be hidden */
  hidden_groups: string[]
  /** Piped text substitutions: maps question/group id to text with variables resolved */
  piped_texts: Record<string, string>
  /** Next question id to navigate to (for skip logic) — may be null */
  next_question_id: string | null
}

// ---------------------------------------------------------------------------
// Admin response list / detail types (matching backend ResponseSummary,
// ResponseListResponse, ResponseAnswerDetail, ResponseDetail)
// ---------------------------------------------------------------------------

export interface ResponseSummary {
  id: string
  status: string
  started_at: string
  completed_at: string | null
  ip_address: string | null
  participant_id: string | null
}

export interface ResponseListResponse {
  items: ResponseSummary[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface ResponseAnswerDetail {
  question_id: string
  question_code: string
  question_title: string
  question_type: string
  value: unknown
  values: unknown[] | null
  selected_option_title: string | null
  subquestion_label: string | null
}

export interface ResponseDetailFull {
  id: string
  status: string
  started_at: string
  completed_at: string | null
  ip_address: string | null
  metadata: Record<string, unknown> | null
  participant_id: string | null
  answers: ResponseAnswerDetail[]
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

export interface ExportParams {
  format: 'csv' | 'json'
  status?: string
  columns?: string[]
}

// ---------------------------------------------------------------------------
// Statistics types (matching backend SurveyStatisticsResponse)
// ---------------------------------------------------------------------------

export interface ChoiceOptionStat {
  option_code: string
  option_title: string | null
  count: number
  percentage: number
}

export interface ChoiceQuestionStats {
  question_type: string
  response_count: number
  options: ChoiceOptionStat[]
}

export interface NumericQuestionStats {
  question_type: string
  response_count: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
}

export interface RatingDistributionEntry {
  value: string
  count: number
}

export interface RatingQuestionStats {
  question_type: string
  response_count: number
  average: number | null
  distribution: RatingDistributionEntry[]
}

export interface TextQuestionStats {
  question_type: string
  response_count: number
}

export type QuestionStatsUnion =
  | ChoiceQuestionStats
  | NumericQuestionStats
  | RatingQuestionStats
  | TextQuestionStats

export interface QuestionStatistics {
  question_id: string
  question_code: string
  question_title: string
  question_type: string
  stats: QuestionStatsUnion
}

export interface SurveyStatisticsResponse {
  survey_id: string
  total_responses: number
  complete_responses: number
  incomplete_responses: number
  disqualified_responses: number
  completion_rate: number
  average_completion_time_seconds: number | null
  questions: QuestionStatistics[]
}

// ---------------------------------------------------------------------------
// Quota types (matching backend QuotaCondition, QuotaCreate, QuotaUpdate,
// QuotaResponse, QuotaListResponse)
// ---------------------------------------------------------------------------

export type QuotaAction = 'terminate' | 'hide_question'

export type QuotaOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains'

export interface QuotaCondition {
  question_id: string
  operator: QuotaOperator
  value: string | number | boolean | string[]
}

export interface QuotaCreate {
  name: string
  limit: number
  action: QuotaAction
  conditions: QuotaCondition[]
  is_active?: boolean
}

export interface QuotaUpdate {
  name?: string
  limit?: number
  action?: QuotaAction
  conditions?: QuotaCondition[]
  is_active?: boolean
}

export interface QuotaResponse {
  id: string
  survey_id: string
  name: string
  limit: number
  current_count: number
  action: QuotaAction
  conditions: QuotaCondition[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface QuotaListResponse {
  items: QuotaResponse[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

// ---------------------------------------------------------------------------
// Assessment types (matching backend AssessmentCreate, AssessmentUpdate,
// AssessmentResponse, AssessmentListResponse)
// ---------------------------------------------------------------------------

export type AssessmentScope = 'total' | 'group' | 'question'

export interface AssessmentCreate {
  name: string
  scope: AssessmentScope
  group_id?: string | null
  question_id?: string | null
  min_score: number
  max_score: number
  message: string
}

export interface AssessmentUpdate {
  name?: string
  scope?: AssessmentScope
  group_id?: string | null
  question_id?: string | null
  min_score?: number
  max_score?: number
  message?: string
}

export interface AssessmentResponse {
  id: string
  survey_id: string
  name: string
  scope: AssessmentScope
  group_id: string | null
  question_id: string | null
  min_score: number
  max_score: number
  message: string
  created_at: string
  updated_at: string
}

export interface AssessmentListResponse {
  items: AssessmentResponse[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

// ---------------------------------------------------------------------------
// Webhook types (matching backend WebhookCreate, WebhookUpdate,
// WebhookResponse, WebhookListResponse)
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | 'response.started'
  | 'response.completed'
  | 'survey.activated'
  | 'survey.closed'
  | 'quota.reached'

export interface WebhookCreate {
  url: string
  events: WebhookEvent[]
  survey_id?: string | null
  is_active?: boolean
}

export interface WebhookUpdate {
  url?: string
  events?: WebhookEvent[]
  survey_id?: string | null
  is_active?: boolean
}

export interface WebhookResponse {
  id: string
  user_id: string
  url: string
  events: WebhookEvent[]
  survey_id: string | null
  is_active: boolean
  secret: string | null
  created_at: string
  updated_at: string
}

export interface WebhookCreateResponse extends WebhookResponse {
  secret: string
}

export interface WebhookListResponse {
  items: WebhookResponse[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface WebhookTestResult {
  success: boolean
  status_code: number | null
  error: string | null
}

// ---------------------------------------------------------------------------
// Participant types (matching backend ParticipantCreate, ParticipantUpdate,
// ParticipantResponse, ParticipantCreateResponse, ParticipantListResponse)
// ---------------------------------------------------------------------------

export interface ParticipantCreate {
  email?: string | null
  attributes?: Record<string, unknown> | null
  uses_remaining?: number | null
  valid_from?: string | null
  valid_until?: string | null
}

export interface ParticipantBatchCreate {
  items: ParticipantCreate[]
}

export interface ParticipantUpdate {
  email?: string | null
  attributes?: Record<string, unknown> | null
  uses_remaining?: number | null
  valid_from?: string | null
  valid_until?: string | null
  completed?: boolean
}

export interface ParticipantResponse {
  id: string
  survey_id: string
  external_id: string | null
  email: string | null
  attributes: Record<string, unknown> | null
  uses_remaining: number | null
  valid_from: string | null
  valid_until: string | null
  completed: boolean
  created_at: string
  token?: string
}

export interface ParticipantCreateResponse extends ParticipantResponse {
  token: string
}

export interface ParticipantListResponse {
  items: ParticipantResponse[]
  total: number
  page: number
  per_page: number
  pages: number
}
