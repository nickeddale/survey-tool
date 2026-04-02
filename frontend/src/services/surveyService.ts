import apiClient from './apiClient'
import type { SurveyResponse, SurveyFullResponse, SurveyListResponse, SurveyCreatePayload, SurveyUpdatePayload, QuestionResponse, QuestionUpdatePayload, QuestionGroupResponse, QuestionGroupCreatePayload, QuestionGroupUpdatePayload, GroupReorderPayload } from '../types/survey'

export interface SurveyFetchParams {
  page?: number
  per_page?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  status?: string
  search?: string
}

export interface DashboardStats {
  total: number
  draft: number
  active: number
  closed: number
  archived: number
}

class SurveyService {
  async fetchSurveys(params: SurveyFetchParams = {}): Promise<SurveyListResponse> {
    const response = await apiClient.get<SurveyListResponse>('/surveys', { params })
    return response.data
  }

  async getSurvey(id: string): Promise<SurveyFullResponse> {
    const response = await apiClient.get<SurveyFullResponse>(`/surveys/${id}`)
    return response.data
  }

  async activateSurvey(id: string): Promise<SurveyResponse> {
    const response = await apiClient.post<SurveyResponse>(`/surveys/${id}/activate`)
    return response.data
  }

  async closeSurvey(id: string): Promise<SurveyResponse> {
    const response = await apiClient.post<SurveyResponse>(`/surveys/${id}/close`)
    return response.data
  }

  async archiveSurvey(id: string): Promise<SurveyResponse> {
    const response = await apiClient.post<SurveyResponse>(`/surveys/${id}/archive`)
    return response.data
  }

  async cloneSurvey(id: string, title?: string): Promise<SurveyResponse> {
    const response = await apiClient.post<SurveyResponse>(`/surveys/${id}/clone`, title ? { title } : {})
    return response.data
  }

  async exportSurvey(id: string): Promise<Blob> {
    const response = await apiClient.get<Blob>(`/surveys/${id}/export`, { responseType: 'blob' })
    return response.data
  }

  async createSurvey(data: SurveyCreatePayload): Promise<SurveyResponse> {
    const response = await apiClient.post<SurveyResponse>('/surveys', data)
    return response.data
  }

  async updateSurvey(id: string, data: SurveyUpdatePayload): Promise<SurveyResponse> {
    const response = await apiClient.patch<SurveyResponse>(`/surveys/${id}`, data)
    return response.data
  }

  async deleteSurvey(id: string): Promise<void> {
    await apiClient.delete(`/surveys/${id}`)
  }

  async updateQuestion(
    surveyId: string,
    groupId: string,
    questionId: string,
    data: QuestionUpdatePayload,
  ): Promise<QuestionResponse> {
    const response = await apiClient.patch<QuestionResponse>(
      `/surveys/${surveyId}/groups/${groupId}/questions/${questionId}`,
      data,
    )
    return response.data
  }

  async createGroup(surveyId: string, data: QuestionGroupCreatePayload): Promise<QuestionGroupResponse> {
    const response = await apiClient.post<QuestionGroupResponse>(
      `/surveys/${surveyId}/groups`,
      data,
    )
    return response.data
  }

  async updateGroup(
    surveyId: string,
    groupId: string,
    data: QuestionGroupUpdatePayload,
  ): Promise<QuestionGroupResponse> {
    const response = await apiClient.patch<QuestionGroupResponse>(
      `/surveys/${surveyId}/groups/${groupId}`,
      data,
    )
    return response.data
  }

  async deleteGroup(surveyId: string, groupId: string): Promise<void> {
    await apiClient.delete(`/surveys/${surveyId}/groups/${groupId}`)
  }

  async reorderGroups(surveyId: string, data: GroupReorderPayload): Promise<QuestionGroupResponse[]> {
    const response = await apiClient.patch<QuestionGroupResponse[]>(
      `/surveys/${surveyId}/groups/reorder`,
      data,
    )
    return response.data
  }

  async reorderQuestions(surveyId: string, groupId: string, orderedIds: string[]): Promise<void> {
    await apiClient.patch(`/surveys/${surveyId}/groups/${groupId}/questions/reorder`, {
      ordered_ids: orderedIds,
    })
  }

  async moveQuestion(surveyId: string, questionId: string, newGroupId: string): Promise<void> {
    await apiClient.patch(`/surveys/${surveyId}/questions/${questionId}`, {
      group_id: newGroupId,
    })
  }

  async getDashboardStats(): Promise<{ stats: DashboardStats; recentSurveys: SurveyResponse[] }> {
    const response = await this.fetchSurveys({ per_page: 100, page: 1 })
    const surveys = response.items

    const stats: DashboardStats = {
      total: response.total,
      draft: surveys.filter((s) => s.status === 'draft').length,
      active: surveys.filter((s) => s.status === 'active').length,
      closed: surveys.filter((s) => s.status === 'closed').length,
      archived: surveys.filter((s) => s.status === 'archived').length,
    }

    const recentSurveys = [...surveys]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5)

    return { stats, recentSurveys }
  }
}

export const surveyService = new SurveyService()
export default surveyService
