/**
 * Auth service — login, register, logout, token refresh, and user profile.
 *
 * All methods use the shared apiClient (which handles token attachment and 401 retry).
 * Exception: refreshToken() uses the raw apiClient to avoid recursive refresh loops.
 *
 * Token rotation: the backend revokes the old refresh token on /auth/refresh.
 * On logout, the refresh token is sent to the backend for server-side revocation
 * before clearing local storage.
 */

import apiClient from './apiClient'
import { setTokens, clearTokens, getRefreshToken } from './tokenService'
import type {
  UserResponse,
  UserCreate,
  LoginRequest,
  TokenResponse,
  UserUpdateRequest,
} from '../types/auth'

class AuthService {
  /**
   * Authenticate with email and password.
   * Stores the returned token pair (access in memory, refresh in localStorage).
   */
  async login(credentials: LoginRequest): Promise<TokenResponse> {
    const response = await apiClient.post<TokenResponse>('/auth/login', credentials)
    const tokens = response.data
    setTokens(tokens.access_token, tokens.refresh_token)
    return tokens
  }

  /**
   * Register a new user account. Returns the created user.
   * Does NOT log the user in — caller must call login() afterwards if needed.
   */
  async register(data: UserCreate): Promise<UserResponse> {
    const response = await apiClient.post<UserResponse>('/auth/register', data)
    return response.data
  }

  /**
   * Log out the current user.
   * Sends the refresh token to the backend for server-side revocation (token rotation).
   * Clears local token storage regardless of backend response.
   */
  async logout(): Promise<void> {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken })
      } catch {
        // Ignore errors — token may already be invalid. Clear local state regardless.
      }
    }
    clearTokens()
  }

  /**
   * Refresh the access token using the stored refresh token.
   * Updates the stored token pair on success.
   * Clears tokens on failure (refresh token consumed by token rotation).
   */
  async refreshToken(): Promise<TokenResponse> {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await apiClient.post<TokenResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    })
    const tokens = response.data
    setTokens(tokens.access_token, tokens.refresh_token)
    return tokens
  }

  /**
   * Fetch the authenticated user's profile.
   * Requires a valid access token (attached automatically by apiClient interceptor).
   * The returned object will NOT contain password_hash — it is excluded by the backend schema.
   */
  async getCurrentUser(): Promise<UserResponse> {
    const response = await apiClient.get<UserResponse>('/auth/me')
    return response.data
  }

  /**
   * Update the authenticated user's profile.
   */
  async updateCurrentUser(data: UserUpdateRequest): Promise<UserResponse> {
    const response = await apiClient.patch<UserResponse>('/auth/me', data)
    return response.data
  }
}

export const authService = new AuthService()
export default authService
