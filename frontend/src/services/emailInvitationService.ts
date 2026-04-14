import apiClient from './apiClient'
import type {
  EmailInvitationCreate,
  EmailInvitationBatchCreate,
  EmailInvitationResponse,
  EmailInvitationListResponse,
  EmailInvitationStats,
  EmailInvitationBatchResponse,
  SendRemindersRequest,
  SendRemindersResponse,
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
    params: EmailInvitationFetchParams = {}
  ): Promise<EmailInvitationListResponse> {
    const response = await apiClient.get<EmailInvitationListResponse>(
      `/surveys/${surveyId}/email-invitations`,
      { params }
    )
    return response.data
  }

  async getInvitation(surveyId: string, invitationId: string): Promise<EmailInvitationResponse> {
    const response = await apiClient.get<EmailInvitationResponse>(
      `/surveys/${surveyId}/email-invitations/${invitationId}`
    )
    return response.data
  }

  async sendInvitation(
    surveyId: string,
    data: EmailInvitationCreate
  ): Promise<EmailInvitationResponse> {
    const response = await apiClient.post<EmailInvitationResponse>(
      `/surveys/${surveyId}/email-invitations`,
      data
    )
    return response.data
  }

  async sendBatchInvitations(
    surveyId: string,
    data: EmailInvitationBatchCreate
  ): Promise<EmailInvitationBatchResponse> {
    const response = await apiClient.post<EmailInvitationBatchResponse>(
      `/surveys/${surveyId}/email-invitations/batch`,
      data
    )
    return response.data
  }

  async resendInvitation(surveyId: string, invitationId: string): Promise<EmailInvitationResponse> {
    const response = await apiClient.post<EmailInvitationResponse>(
      `/surveys/${surveyId}/email-invitations/${invitationId}/resend`
    )
    return response.data
  }

  async deleteInvitation(surveyId: string, invitationId: string): Promise<void> {
    await apiClient.delete(`/surveys/${surveyId}/email-invitations/${invitationId}`)
  }

  async getStats(surveyId: string): Promise<EmailInvitationStats> {
    const response = await apiClient.get<EmailInvitationStats>(
      `/surveys/${surveyId}/email-invitations/stats`
    )
    return response.data
  }

  async sendReminders(
    surveyId: string,
    params: SendRemindersRequest = {}
  ): Promise<SendRemindersResponse> {
    const response = await apiClient.post<SendRemindersResponse>(
      `/surveys/${surveyId}/email-invitations/send-reminders`,
      params
    )
    return response.data
  }
}

export const emailInvitationService = new EmailInvitationService()
export default emailInvitationService
