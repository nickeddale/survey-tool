import apiClient from './apiClient'
import type {
  QuotaCreate,
  QuotaUpdate,
  QuotaResponse,
  QuotaListResponse,
} from '../types/survey'

export interface QuotaFetchParams {
  page?: number
  per_page?: number
}

class QuotaService {
  async listQuotas(surveyId: string, params: QuotaFetchParams = {}): Promise<QuotaListResponse> {
    const response = await apiClient.get<QuotaListResponse>(
      `/surveys/${surveyId}/quotas`,
      { params },
    )
    return response.data
  }

  async getQuota(surveyId: string, quotaId: string): Promise<QuotaResponse> {
    const response = await apiClient.get<QuotaResponse>(
      `/surveys/${surveyId}/quotas/${quotaId}`,
    )
    return response.data
  }

  async createQuota(surveyId: string, data: QuotaCreate): Promise<QuotaResponse> {
    const response = await apiClient.post<QuotaResponse>(
      `/surveys/${surveyId}/quotas`,
      data,
    )
    return response.data
  }

  async updateQuota(surveyId: string, quotaId: string, data: QuotaUpdate): Promise<QuotaResponse> {
    const response = await apiClient.patch<QuotaResponse>(
      `/surveys/${surveyId}/quotas/${quotaId}`,
      data,
    )
    return response.data
  }

  async deleteQuota(surveyId: string, quotaId: string): Promise<void> {
    await apiClient.delete(`/surveys/${surveyId}/quotas/${quotaId}`)
  }
}

export const quotaService = new QuotaService()
export default quotaService
