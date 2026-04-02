/**
 * Axios API client with authentication interceptors.
 *
 * Request interceptor:
 *   - Attaches Authorization: Bearer <access_token> from in-memory token store
 *   - Proactively refreshes if token is within 60 seconds of expiry
 *
 * Response interceptor (401 handler):
 *   - On 401, queues the failed request and attempts a token refresh
 *   - Uses isRefreshing flag + promise queue so concurrent 401s only trigger one refresh call
 *   - On successful refresh, drains the queue and retries all pending requests
 *   - On refresh failure, rejects all queued requests and redirects to /login
 *
 * Token rotation: the backend revokes the old refresh token on /auth/refresh.
 * A failed refresh means the refresh token is consumed — do not retry the refresh itself.
 */

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { ApiError, ApiErrorResponse } from '../types/api'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './tokenService'
import { isTokenExpiringSoon } from '../utils/jwt'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ---------------------------------------------------------------------------
// Refresh state
// ---------------------------------------------------------------------------

let isRefreshing = false

interface QueueItem {
  resolve: (token: string) => void
  reject: (err: unknown) => void
}

let refreshQueue: QueueItem[] = []

function drainQueue(newToken: string): void {
  refreshQueue.forEach(({ resolve }) => resolve(newToken))
  refreshQueue = []
}

function rejectQueue(err: unknown): void {
  refreshQueue.forEach(({ reject }) => reject(err))
  refreshQueue = []
}

/**
 * Returns a promise that resolves with a fresh access token once the in-progress
 * refresh completes (or rejects on failure). Used to queue concurrent 401s.
 */
function waitForRefresh(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    refreshQueue.push({ resolve, reject })
  })
}

/**
 * Perform a token refresh call directly (not via apiClient to avoid interceptor loops).
 */
async function performRefresh(): Promise<string> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new ApiError(401, { code: 'UNAUTHORIZED', message: 'No refresh token available' })
  }

  const response = await axios.post<{ access_token: string; refresh_token: string }>(
    `${BASE_URL}/auth/refresh`,
    { refresh_token: refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  )

  const { access_token, refresh_token } = response.data
  setTokens(access_token, refresh_token)
  return access_token
}

// ---------------------------------------------------------------------------
// Request interceptor — attach token, proactive refresh
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()

  if (token) {
    if (isTokenExpiringSoon(token)) {
      // Proactive refresh before the request goes out
      if (!isRefreshing) {
        isRefreshing = true
        try {
          const newToken = await performRefresh()
          isRefreshing = false
          drainQueue(newToken)
          config.headers.Authorization = `Bearer ${newToken}`
        } catch (err) {
          isRefreshing = false
          rejectQueue(err)
          clearTokens()
          if (typeof window !== 'undefined') {
            window.location.href = '/login'
          }
          return Promise.reject(err)
        }
      } else {
        // Another proactive refresh is in progress — wait for it
        try {
          const newToken = await waitForRefresh()
          config.headers.Authorization = `Bearer ${newToken}`
        } catch (err) {
          return Promise.reject(err)
        }
      }
    } else {
      config.headers.Authorization = `Bearer ${token}`
    }
  }

  return config
})

// ---------------------------------------------------------------------------
// Response interceptor — 401 retry after refresh
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retried?: boolean }

    if (error.response?.status === 401 && !originalRequest._retried) {
      originalRequest._retried = true

      if (isRefreshing) {
        // Another request is already refreshing — queue this one
        try {
          const newToken = await waitForRefresh()
          const retryConfig = {
            ...originalRequest,
            headers: {
              ...originalRequest.headers,
              Authorization: `Bearer ${newToken}`,
            },
          }
          return apiClient(retryConfig)
        } catch (queueErr) {
          return Promise.reject(queueErr)
        }
      }

      isRefreshing = true
      try {
        const newToken = await performRefresh()
        isRefreshing = false
        drainQueue(newToken)

        const retryConfig = {
          ...originalRequest,
          headers: {
            ...originalRequest.headers,
            Authorization: `Bearer ${newToken}`,
          },
        }
        return apiClient(retryConfig)
      } catch (refreshErr) {
        isRefreshing = false
        rejectQueue(refreshErr)
        clearTokens()
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshErr)
      }
    }

    // Normalize errors into ApiError instances
    if (error.response) {
      const { status, data } = error.response
      const detail = data?.detail ?? { code: 'UNKNOWN_ERROR', message: error.message }
      return Promise.reject(new ApiError(status, detail))
    }

    return Promise.reject(error)
  },
)

export default apiClient
