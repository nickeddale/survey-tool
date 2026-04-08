/**
 * Axios API client with authentication interceptors.
 *
 * Request interceptor:
 *   - Attaches Authorization: Bearer <access_token> from in-memory token store
 *   - Proactively refreshes if token is within 60 seconds of expiry
 *
 * Response interceptor (401/429 handler):
 *   - On 401, queues the failed request and attempts a token refresh
 *   - Uses isRefreshing flag + promise queue so concurrent 401s only trigger one refresh call
 *   - On successful refresh, drains the queue and retries all pending requests
 *   - On refresh failure, rejects all queued requests and redirects to /login
 *   - On 429 from /auth/refresh, waits Retry-After seconds then retries once.
 *     If the retry also 429s, rejects without redirecting (no spurious logout).
 *   - On 429 from any other endpoint, propagates the ApiError as-is.
 *
 * Token rotation: the backend revokes the old refresh token on /auth/refresh.
 * The refresh token is stored in an httpOnly cookie — the browser sends it automatically
 * with every request due to withCredentials: true.
 * A failed refresh means the refresh token is consumed — do not retry the refresh itself.
 */

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { ApiError, ApiErrorResponse } from '../types/api'
import { getAccessToken, setTokens, clearTokens } from './tokenService'
import { isTokenExpiringSoon } from '../utils/jwt'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

// ---------------------------------------------------------------------------
// Redirect function — abstracted so tests can swap it out
// ---------------------------------------------------------------------------

let redirectToLogin: () => void = () => {
  if (typeof window !== 'undefined') {
    // Do not redirect if already on /login — would cause a full-page reload that
    // clears React state (including error messages set after a failed login).
    if (window.location.pathname.startsWith('/login')) return
    window.location.href = '/login'
  }
}

/** Override the redirect-to-login function (useful in tests). */
export function setRedirectFn(fn: () => void): void {
  redirectToLogin = fn
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
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
 * The refresh token httpOnly cookie is sent automatically by the browser.
 */
async function performRefresh(): Promise<string> {
  const response = await axios.post<{ access_token: string }>(
    `${BASE_URL}/auth/refresh`,
    {},
    { headers: { 'Content-Type': 'application/json' }, withCredentials: true },
  )

  const { access_token } = response.data
  setTokens(access_token)
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
          if (!isPublicRoute()) redirectToLogin()
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

// Auth endpoints that should never trigger the refresh/redirect flow.
// A 401 from these endpoints means bad credentials — let the error propagate.
const AUTH_PASSTHROUGH_PATHS = ['/auth/login', '/auth/register']

function isAuthPassthrough(url: string | undefined): boolean {
  if (!url) return false
  return AUTH_PASSTHROUGH_PATHS.some((path) => url.includes(path))
}

// Routes where a failed token refresh should not trigger a redirect to /login.
// This includes public survey pages (/s/*) and the auth pages themselves (/login, /register).
const NO_REDIRECT_ROUTE_PATTERNS = ['/s/', '/login', '/register']

function isPublicRoute(): boolean {
  if (typeof window === 'undefined') return false
  return NO_REDIRECT_ROUTE_PATTERNS.some((pattern) =>
    window.location.pathname.startsWith(pattern),
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REFRESH_PATH = '/auth/refresh'

function isRefreshEndpoint(url: string | undefined): boolean {
  if (!url) return false
  return url.includes(REFRESH_PATH)
}

/**
 * Parse the Retry-After header value (seconds integer or HTTP-date) and return
 * the number of milliseconds to wait. Defaults to 5000 ms if absent or unparseable.
 */
function parseRetryAfterMs(retryAfterHeader: string | null, defaultMs = 5000): number {
  if (!retryAfterHeader) return defaultMs
  const seconds = parseInt(retryAfterHeader, 10)
  if (!isNaN(seconds) && seconds >= 0) return seconds * 1000
  // HTTP-date format
  const date = new Date(retryAfterHeader)
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now())
  return defaultMs
}

// ---------------------------------------------------------------------------
// Response interceptor — 401/429 retry after refresh
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorResponse>) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retried?: boolean
      _refreshRateLimitRetried?: boolean
    }

    // ------------------------------------------------------------------
    // 429 on the /auth/refresh endpoint — wait then retry once, no redirect
    // ------------------------------------------------------------------
    if (error.response?.status === 429 && isRefreshEndpoint(originalRequest.url)) {
      if (originalRequest._refreshRateLimitRetried) {
        // Already retried once after 429 — give up without redirecting
        const { status, data } = error.response
        const detail = data?.detail ?? { code: 'RATE_LIMITED', message: error.message }
        return Promise.reject(new ApiError(status, detail))
      }

      originalRequest._refreshRateLimitRetried = true
      const retryAfterMs = parseRetryAfterMs(
        error.response.headers['retry-after'] as string | null,
      )
      await new Promise<void>((resolve) => setTimeout(resolve, retryAfterMs))

      // Retry the refresh call directly (not via apiClient to avoid interceptor loops)
      try {
        const newToken = await performRefresh()
        isRefreshing = false
        drainQueue(newToken)
        return newToken
      } catch (retryErr) {
        isRefreshing = false
        rejectQueue(retryErr)
        // Do NOT call redirectToLogin — rate limiting is transient, not an auth failure
        return Promise.reject(retryErr)
      }
    }

    if (error.response?.status === 401 && !originalRequest._retried) {
      // Auth endpoints (login, register) should not trigger the refresh flow.
      // A 401 here means bad credentials — propagate it so the UI can show an error.
      if (isAuthPassthrough(originalRequest.url)) {
        const { status, data } = error.response
        const detail = data?.detail ?? { code: 'UNAUTHORIZED', message: error.message }
        return Promise.reject(new ApiError(status, detail))
      }

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
        if (!isPublicRoute()) redirectToLogin()
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
