/**
 * responseService — public (no-auth) survey response API wrapper.
 *
 * Wraps the public POST/PATCH /surveys/{id}/responses endpoints.
 * No auth token is required; the apiClient will simply not attach a header
 * when no access token is present in the token store.
 */

import axios from 'axios'
import apiClient from './apiClient'
import type {
  ResolveFlowRequest,
  ResolveFlowResponse,
  ResponseListResponse,
  ResponseDetailFull,
  SurveyStatisticsResponse,
  ExportParams,
} from '../types/survey'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnswerInput {
  question_id: string
  value: unknown
}

export interface ResponseResponse {
  id: string
  survey_id: string
  participant_id: string | null
  status: string
  ip_address: string | null
  metadata_: Record<string, unknown> | null
  started_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
  answers: ResponseAnswerResponse[]
}

export interface ResponseAnswerResponse {
  id: string
  response_id: string
  question_id: string
  value: unknown
  created_at: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ResponseService {
  /**
   * Create a new (in-progress) response for the given survey.
   * Returns the created ResponseResponse with its id.
   */
  async createResponse(surveyId: string, answers: AnswerInput[] = []): Promise<ResponseResponse> {
    const response = await axios.post<ResponseResponse>(
      `${BASE_URL}/surveys/${surveyId}/responses`,
      { answers },
      { headers: { 'Content-Type': 'application/json' } }
    )
    return response.data
  }

  /**
   * Save progress (partial answers) for an existing in-progress response.
   */
  async saveProgress(
    surveyId: string,
    responseId: string,
    answers: AnswerInput[]
  ): Promise<ResponseResponse> {
    const response = await axios.patch<ResponseResponse>(
      `${BASE_URL}/surveys/${surveyId}/responses/${responseId}`,
      { answers },
      { headers: { 'Content-Type': 'application/json' } }
    )
    return response.data
  }

  /**
   * Complete the response (mark as complete and submit all answers).
   */
  async completeResponse(
    surveyId: string,
    responseId: string,
    answers: AnswerInput[]
  ): Promise<ResponseResponse> {
    const response = await axios.patch<ResponseResponse>(
      `${BASE_URL}/surveys/${surveyId}/responses/${responseId}`,
      { status: 'complete', answers },
      { headers: { 'Content-Type': 'application/json' } }
    )
    return response.data
  }

  /**
   * Resolve survey flow logic: determines which questions/groups are visible
   * and computes piped text substitutions for the given answer state.
   */
  async resolveFlow(surveyId: string, data: ResolveFlowRequest): Promise<ResolveFlowResponse> {
    const response = await axios.post<ResolveFlowResponse>(
      `${BASE_URL}/surveys/${surveyId}/logic/resolve-flow`,
      data,
      { headers: { 'Content-Type': 'application/json' } }
    )
    return response.data
  }

  // ---------------------------------------------------------------------------
  // Admin (authenticated) response methods
  // ---------------------------------------------------------------------------

  /**
   * List responses for a survey. Requires authentication.
   */
  async listResponses(
    surveyId: string,
    params: {
      page?: number
      per_page?: number
      status?: string
      sort_by?: 'started_at' | 'completed_at' | 'status'
      sort_order?: 'asc' | 'desc'
    } = {}
  ): Promise<ResponseListResponse> {
    const response = await apiClient.get<ResponseListResponse>(`/surveys/${surveyId}/responses`, {
      params,
    })
    return response.data
  }

  /**
   * Get full response detail with enriched answers. Requires authentication.
   */
  async getResponseDetail(surveyId: string, responseId: string): Promise<ResponseDetailFull> {
    const response = await apiClient.get<ResponseDetailFull>(
      `/surveys/${surveyId}/responses/${responseId}/detail`
    )
    return response.data
  }

  /**
   * Export survey responses as CSV or JSON. Requires authentication.
   * Returns a Blob for file download.
   */
  async exportResponses(surveyId: string, params: ExportParams): Promise<Blob> {
    const queryParams: Record<string, string> = {
      format: params.format,
    }
    if (params.status && params.status !== 'all') {
      queryParams.status = params.status
    }
    if (params.columns && params.columns.length > 0) {
      queryParams.columns = params.columns.join(',')
    }

    const response = await apiClient.get(`/surveys/${surveyId}/responses/export`, {
      params: queryParams,
      responseType: 'blob',
    })
    return response.data as Blob
  }

  /**
   * Get aggregate statistics for a survey. Requires authentication.
   */
  async getSurveyStatistics(surveyId: string): Promise<SurveyStatisticsResponse> {
    const response = await apiClient.get<SurveyStatisticsResponse>(
      `/surveys/${surveyId}/statistics`
    )
    return response.data
  }
}

export const responseService = new ResponseService()
export default responseService
