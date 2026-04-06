/**
 * Auth service — login, register, logout, token refresh, and user profile.
 *
 * All methods use the shared apiClient (which handles token attachment and 401 retry).
 * Exception: refreshToken() uses the raw apiClient to avoid recursive refresh loops.
 *
 * Token rotation: the backend revokes the old refresh token on /auth/refresh.
 * The refresh token is stored in an httpOnly cookie — the browser sends it automatically.
 * On logout, the backend revokes the cookie-based refresh token server-side and clears
 * the cookie.
 */

import apiClient from './apiClient'
import { setTokens, clearTokens } from './tokenService'
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
   * Stores the returned access token in memory. The refresh token is set as an
   * httpOnly cookie by the backend — no localStorage usage.
   */
  async login(credentials: LoginRequest): Promise<TokenResponse> {
    const response = await apiClient.post<TokenResponse>('/auth/login', credentials)
    const tokens = response.data
    setTokens(tokens.access_token)
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
   * Calls the backend to revoke the refresh token cookie and clear it server-side.
   * Clears local access token storage regardless of backend response.
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout')
    } catch {
      // Ignore errors — token may already be invalid. Clear local state regardless.
    }
    clearTokens()
  }

  /**
   * Refresh the access token using the refresh token cookie.
   * The browser sends the httpOnly cookie automatically — no manual token handling.
   * Updates the stored access token on success.
   * Clears access token on failure (refresh token consumed by rotation).
   */
  async refreshToken(): Promise<TokenResponse> {
    const response = await apiClient.post<TokenResponse>('/auth/refresh')
    const tokens = response.data
    setTokens(tokens.access_token)
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
