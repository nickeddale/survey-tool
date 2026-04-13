import apiClient from './apiClient'
import type {
  EmailInvitationCreate,
  EmailInvitationBatchCreate,
  EmailInvitationResponse,
  EmailInvitationListResponse,
  EmailInvitationStats,
  EmailInvitationBatchResponse,
} from '../types/survey'

export interface EmailInvitationFetchParams {
  page?: number
  per_page?: number
  status?: string
  invitation_type?: 'invite' | 'reminder'
}

class EmailInvitationService {
  async listInvitations(
    surveyId: string,
    params: EmailInvitationFetchParams = {},
  ): Promise<EmailInvitationListResponse> {
    const response = await apiClient.get<EmailInvitationListResponse>(
      `/surveys/${surveyId}/invitations`,
      { params },
    )
    return response.data
  }

  async getInvitation(surveyId: string, invitationId: string): Promise<EmailInvitationResponse> {
    const response = await apiClient.get<EmailInvitationResponse>(
      `/surveys/${surveyId}/invitations/${invitationId}`,
    )
    return response.data
  }

  async sendInvitation(
    surveyId: string,
    data: EmailInvitationCreate,
  ): Promise<EmailInvitationResponse> {
    const response = await apiClient.post<EmailInvitationResponse>(
      `/surveys/${surveyId}/invitations`,
      data,
    )
    return response.data
  }

  async sendBatchInvitations(
    surveyId: string,
    data: EmailInvitationBatchCreate,
  ): Promise<EmailInvitationBatchResponse> {
    const response = await apiClient.post<EmailInvitationBatchResponse>(
      `/surveys/${surveyId}/invitations/batch`,
      data,
    )
    return response.data
  }

  async resendInvitation(surveyId: string, invitationId: string): Promise<EmailInvitationResponse> {
    const response = await apiClient.post<EmailInvitationResponse>(
      `/surveys/${surveyId}/invitations/${invitationId}/resend`,
    )
    return response.data
  }

  async deleteInvitation(surveyId: string, invitationId: string): Promise<void> {
    await apiClient.delete(`/surveys/${surveyId}/invitations/${invitationId}`)
  }

  async getStats(surveyId: string): Promise<EmailInvitationStats> {
    const response = await apiClient.get<EmailInvitationStats>(
      `/surveys/${surveyId}/invitations/stats`,
    )
    return response.data
  }
}

export const emailInvitationService = new EmailInvitationService()
export default emailInvitationService
