/**
 * responseService — public (no-auth) survey response API wrapper.
 *
 * Wraps the public POST/PATCH /surveys/{id}/responses endpoints.
 * No auth token is required; the apiClient will simply not attach a header
 * when no access token is present in the token store.
 */

import apiClient from './apiClient'
import type { ResolveFlowRequest, ResolveFlowResponse } from '../types/survey'

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
  async createResponse(
    surveyId: string,
    answers: AnswerInput[] = [],
  ): Promise<ResponseResponse> {
    const response = await apiClient.post<ResponseResponse>(
      `/surveys/${surveyId}/responses`,
      { answers },
    )
    return response.data
  }

  /**
   * Save progress (partial answers) for an existing in-progress response.
   */
  async saveProgress(
    surveyId: string,
    responseId: string,
    answers: AnswerInput[],
  ): Promise<ResponseResponse> {
    const response = await apiClient.patch<ResponseResponse>(
      `/surveys/${surveyId}/responses/${responseId}`,
      { answers },
    )
    return response.data
  }

  /**
   * Complete the response (mark as complete and submit all answers).
   */
  async completeResponse(
    surveyId: string,
    responseId: string,
    answers: AnswerInput[],
  ): Promise<ResponseResponse> {
    const response = await apiClient.patch<ResponseResponse>(
      `/surveys/${surveyId}/responses/${responseId}`,
      { status: 'complete', answers },
    )
    return response.data
  }

  /**
   * Resolve survey flow logic: determines which questions/groups are visible
   * and computes piped text substitutions for the given answer state.
   */
  async resolveFlow(
    surveyId: string,
    data: ResolveFlowRequest,
  ): Promise<ResolveFlowResponse> {
    const response = await apiClient.post<ResolveFlowResponse>(
      `/surveys/${surveyId}/logic/resolve-flow`,
      data,
    )
    return response.data
  }
}

export const responseService = new ResponseService()
export default responseService
