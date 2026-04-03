import apiClient from './apiClient'
import type {
  WebhookCreate,
  WebhookUpdate,
  WebhookResponse,
  WebhookCreateResponse,
  WebhookListResponse,
  WebhookTestResult,
} from '../types/survey'

export interface WebhookFetchParams {
  page?: number
  per_page?: number
}

class WebhookService {
  async listWebhooks(params: WebhookFetchParams = {}): Promise<WebhookListResponse> {
    const response = await apiClient.get<WebhookListResponse>('/webhooks', { params })
    return response.data
  }

  async getWebhook(webhookId: string): Promise<WebhookResponse> {
    const response = await apiClient.get<WebhookResponse>(`/webhooks/${webhookId}`)
    return response.data
  }

  async createWebhook(data: WebhookCreate): Promise<WebhookCreateResponse> {
    const response = await apiClient.post<WebhookCreateResponse>('/webhooks', data)
    return response.data
  }

  async updateWebhook(webhookId: string, data: WebhookUpdate): Promise<WebhookResponse> {
    const response = await apiClient.patch<WebhookResponse>(`/webhooks/${webhookId}`, data)
    return response.data
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await apiClient.delete(`/webhooks/${webhookId}`)
  }

  async testWebhook(webhookId: string): Promise<WebhookTestResult> {
    const response = await apiClient.post<WebhookTestResult>(`/webhooks/${webhookId}/test`)
    return response.data
  }
}

export const webhookService = new WebhookService()
export default webhookService
