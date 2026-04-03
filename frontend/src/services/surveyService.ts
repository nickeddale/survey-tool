import apiClient from './apiClient'
import type { SurveyResponse, SurveyFullResponse, SurveyListResponse, SurveyCreatePayload, SurveyUpdatePayload, AnswerOptionResponse, QuestionResponse, QuestionUpdatePayload, QuestionCreatePayload, QuestionGroupResponse, QuestionGroupCreatePayload, QuestionGroupUpdatePayload, GroupReorderPayload, ValidateExpressionResult } from '../types/survey'

export interface TranslationsUpdatePayload {
  lang: string
  translations: Record<string, string | null>
}

export interface AnswerOptionCreatePayload {
  code: string
  title: string
  sort_order?: number
  assessment_value?: number
  image_url?: string | null
}

export interface AnswerOptionUpdatePayload {
  title?: string
  code?: string
  sort_order?: number
  assessment_value?: number
  image_url?: string | null
}

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

export interface ValidateExpressionPayload {
  expression: string
  question_code?: string
}

// Re-export ValidateExpressionResult from types/survey for convenience
export type { ValidateExpressionResult } from '../types/survey'

class SurveyService {
  async fetchSurveys(params: SurveyFetchParams = {}): Promise<SurveyListResponse> {
    const response = await apiClient.get<SurveyListResponse>('/surveys', { params })
    return response.data
  }

  async getSurvey(id: string, lang?: string): Promise<SurveyFullResponse> {
    const params = lang ? { lang } : undefined
    const response = await apiClient.get<SurveyFullResponse>(`/surveys/${id}`, { params })
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

  async createQuestion(
    surveyId: string,
    groupId: string,
    data: QuestionCreatePayload,
  ): Promise<QuestionResponse> {
    const response = await apiClient.post<QuestionResponse>(
      `/surveys/${surveyId}/groups/${groupId}/questions`,
      data,
    )
    return response.data
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

  async createOption(
    surveyId: string,
    questionId: string,
    data: AnswerOptionCreatePayload,
  ): Promise<AnswerOptionResponse> {
    const response = await apiClient.post<AnswerOptionResponse>(
      `/surveys/${surveyId}/questions/${questionId}/options`,
      data,
    )
    return response.data
  }

  async updateOption(
    surveyId: string,
    questionId: string,
    optionId: string,
    data: AnswerOptionUpdatePayload,
  ): Promise<AnswerOptionResponse> {
    const response = await apiClient.patch<AnswerOptionResponse>(
      `/surveys/${surveyId}/questions/${questionId}/options/${optionId}`,
      data,
    )
    return response.data
  }

  async deleteOption(surveyId: string, questionId: string, optionId: string): Promise<void> {
    await apiClient.delete(`/surveys/${surveyId}/questions/${questionId}/options/${optionId}`)
  }

  async reorderOptions(surveyId: string, questionId: string, orderedIds: string[]): Promise<void> {
    await apiClient.patch(`/surveys/${surveyId}/questions/${questionId}/options/reorder`, {
      ordered_ids: orderedIds,
    })
  }

  // ---------------------------------------------------------------------------
  // Translation methods
  // ---------------------------------------------------------------------------

  async updateSurveyTranslations(
    surveyId: string,
    data: TranslationsUpdatePayload,
  ): Promise<SurveyResponse> {
    const response = await apiClient.patch<SurveyResponse>(
      `/surveys/${surveyId}/translations`,
      data,
    )
    return response.data
  }

  async updateGroupTranslations(
    surveyId: string,
    groupId: string,
    data: TranslationsUpdatePayload,
  ): Promise<QuestionGroupResponse> {
    const response = await apiClient.patch<QuestionGroupResponse>(
      `/surveys/${surveyId}/groups/${groupId}/translations`,
      data,
    )
    return response.data
  }

  async updateQuestionTranslations(
    surveyId: string,
    groupId: string,
    questionId: string,
    data: TranslationsUpdatePayload,
  ): Promise<QuestionResponse> {
    const response = await apiClient.patch<QuestionResponse>(
      `/surveys/${surveyId}/groups/${groupId}/questions/${questionId}/translations`,
      data,
    )
    return response.data
  }

  async updateOptionTranslations(
    surveyId: string,
    questionId: string,
    optionId: string,
    data: TranslationsUpdatePayload,
  ): Promise<AnswerOptionResponse> {
    const response = await apiClient.patch<AnswerOptionResponse>(
      `/surveys/${surveyId}/questions/${questionId}/options/${optionId}/translations`,
      data,
    )
    return response.data
  }

  async validateExpression(
    surveyId: string,
    data: ValidateExpressionPayload,
  ): Promise<ValidateExpressionResult> {
    const response = await apiClient.post<ValidateExpressionResult>(
      `/surveys/${surveyId}/logic/validate-expression`,
      data,
    )
    return response.data
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
