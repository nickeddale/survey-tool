import apiClient from './apiClient'
import type { ApiKeyCreate, ApiKeyCreateResponse, ApiKeyResponse } from '../types/auth'

class ApiKeyService {
  async listApiKeys(): Promise<ApiKeyResponse[]> {
    const response = await apiClient.get<ApiKeyResponse[]>('/auth/keys')
    return response.data
  }

  async createApiKey(data: ApiKeyCreate): Promise<ApiKeyCreateResponse> {
    const response = await apiClient.post<ApiKeyCreateResponse>('/auth/keys', data)
    return response.data
  }

  async revokeApiKey(keyId: string): Promise<void> {
    await apiClient.delete(`/auth/keys/${keyId}`)
  }
}

export const apiKeyService = new ApiKeyService()
export default apiKeyService
