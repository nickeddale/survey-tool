import apiClient from './apiClient'
import type {
  AssignFromProfilesPayload,
  ParticipantCreateResponse,
  ParticipantProfileBatchCreate,
  ParticipantProfileCreate,
  ParticipantProfileDetailResponse,
  ParticipantProfileListResponse,
  ParticipantProfileResponse,
  ParticipantProfileUpdate,
} from '../types/survey'

export interface ProfileFetchParams {
  page?: number
  per_page?: number
  email?: string
  name?: string
  organization?: string
  tag?: string
}

class ParticipantProfileService {
  async listProfiles(params: ProfileFetchParams = {}): Promise<ParticipantProfileListResponse> {
    const response = await apiClient.get<ParticipantProfileListResponse>('/participant-profiles', {
      params,
    })
    return response.data
  }

  async getProfile(profileId: string): Promise<ParticipantProfileDetailResponse> {
    const response = await apiClient.get<ParticipantProfileDetailResponse>(
      `/participant-profiles/${profileId}`
    )
    return response.data
  }

  async createProfile(data: ParticipantProfileCreate): Promise<ParticipantProfileResponse> {
    const response = await apiClient.post<ParticipantProfileResponse>('/participant-profiles', data)
    return response.data
  }

  async createProfilesBatch(
    data: ParticipantProfileBatchCreate
  ): Promise<ParticipantProfileResponse[]> {
    const response = await apiClient.post<ParticipantProfileResponse[]>(
      '/participant-profiles/batch',
      data
    )
    return response.data
  }

  async updateProfile(
    profileId: string,
    data: ParticipantProfileUpdate
  ): Promise<ParticipantProfileResponse> {
    const response = await apiClient.patch<ParticipantProfileResponse>(
      `/participant-profiles/${profileId}`,
      data
    )
    return response.data
  }

  async deleteProfile(profileId: string): Promise<void> {
    await apiClient.delete(`/participant-profiles/${profileId}`)
  }

  async assignFromProfiles(
    surveyId: string,
    data: AssignFromProfilesPayload
  ): Promise<ParticipantCreateResponse[]> {
    const response = await apiClient.post<ParticipantCreateResponse[]>(
      `/surveys/${surveyId}/participants/from-profiles`,
      data
    )
    return response.data
  }
}

export const participantProfileService = new ParticipantProfileService()
export default participantProfileService
