import apiClient from './apiClient'
import type {
  ParticipantCreate,
  ParticipantBatchCreate,
  ParticipantUpdate,
  ParticipantResponse,
  ParticipantCreateResponse,
  ParticipantListResponse,
} from '../types/survey'

export interface ParticipantFetchParams {
  page?: number
  per_page?: number
  completed?: boolean
  email?: string
  valid?: boolean
}

class ParticipantService {
  async listParticipants(
    surveyId: string,
    params: ParticipantFetchParams = {}
  ): Promise<ParticipantListResponse> {
    const response = await apiClient.get<ParticipantListResponse>(
      `/surveys/${surveyId}/participants`,
      { params }
    )
    return response.data
  }

  async getParticipant(surveyId: string, participantId: string): Promise<ParticipantResponse> {
    const response = await apiClient.get<ParticipantResponse>(
      `/surveys/${surveyId}/participants/${participantId}`
    )
    return response.data
  }

  async createParticipant(
    surveyId: string,
    data: ParticipantCreate
  ): Promise<ParticipantCreateResponse> {
    const response = await apiClient.post<ParticipantCreateResponse>(
      `/surveys/${surveyId}/participants`,
      data
    )
    return response.data
  }

  async createParticipantsBatch(
    surveyId: string,
    data: ParticipantBatchCreate
  ): Promise<ParticipantCreateResponse[]> {
    const response = await apiClient.post<ParticipantCreateResponse[]>(
      `/surveys/${surveyId}/participants/batch`,
      data
    )
    return response.data
  }

  async updateParticipant(
    surveyId: string,
    participantId: string,
    data: ParticipantUpdate
  ): Promise<ParticipantResponse> {
    const response = await apiClient.patch<ParticipantResponse>(
      `/surveys/${surveyId}/participants/${participantId}`,
      data
    )
    return response.data
  }

  async deleteParticipant(surveyId: string, participantId: string): Promise<void> {
    await apiClient.delete(`/surveys/${surveyId}/participants/${participantId}`)
  }
}

export const participantService = new ParticipantService()
export default participantService
