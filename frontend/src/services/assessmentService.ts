import apiClient from './apiClient'
import type {
  AssessmentCreate,
  AssessmentUpdate,
  AssessmentResponse,
  AssessmentListResponse,
} from '../types/survey'

export interface AssessmentFetchParams {
  page?: number
  per_page?: number
}

class AssessmentService {
  async listAssessments(surveyId: string, params: AssessmentFetchParams = {}): Promise<AssessmentListResponse> {
    const response = await apiClient.get<AssessmentListResponse>(
      `/surveys/${surveyId}/assessments`,
      { params },
    )
    return response.data
  }

  async getAssessment(surveyId: string, assessmentId: string): Promise<AssessmentResponse> {
    const response = await apiClient.get<AssessmentResponse>(
      `/surveys/${surveyId}/assessments/${assessmentId}`,
    )
    return response.data
  }

  async createAssessment(surveyId: string, data: AssessmentCreate): Promise<AssessmentResponse> {
    const response = await apiClient.post<AssessmentResponse>(
      `/surveys/${surveyId}/assessments`,
      data,
    )
    return response.data
  }

  async updateAssessment(surveyId: string, assessmentId: string, data: AssessmentUpdate): Promise<AssessmentResponse> {
    const response = await apiClient.patch<AssessmentResponse>(
      `/surveys/${surveyId}/assessments/${assessmentId}`,
      data,
    )
    return response.data
  }

  async deleteAssessment(surveyId: string, assessmentId: string): Promise<void> {
    await apiClient.delete(`/surveys/${surveyId}/assessments/${assessmentId}`)
  }
}

export const assessmentService = new AssessmentService()
export default assessmentService
