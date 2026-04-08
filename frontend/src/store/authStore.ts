/**
 * Zustand auth store.
 *
 * Initialization: on mount, optimistically attempt a token refresh using the httpOnly
 * cookie (sent automatically by the browser). If successful, fetch the current user.
 * If it fails with 429 (rate limited), wait Retry-After duration and retry once before
 * treating as unauthenticated — 429 is transient, not an auth failure.
 * If it fails for any other reason (no cookie, expired, or revoked), treat as unauthenticated.
 *
 * Actions delegate to authService and update store state atomically.
 */

import { create } from 'zustand'
import authService from '../services/authService'
import { clearTokens } from '../services/tokenService'
import { ApiError } from '../types/api'
import type { UserResponse, LoginRequest, UserCreate, UserUpdateRequest } from '../types/auth'

interface AuthState {
  user: UserResponse | null
  isAuthenticated: boolean
  isInitializing: boolean  // true only during cold-start token check; set false once, never again
  isLoading: boolean       // true during any in-flight auth action (login, logout, register, update)

  // Actions
  initialize: () => Promise<void>
  login: (credentials: LoginRequest) => Promise<void>
  register: (data: UserCreate) => Promise<UserResponse>
  logout: () => Promise<void>
  updateUser: (data: UserUpdateRequest) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isInitializing: true,  // starts true — blocks route guards until initialize() completes
  isLoading: false,

  /**
   * Initialize auth state on app load.
   * Optimistically attempt a token refresh using the httpOnly cookie (sent automatically).
   * If successful, fetch the current user.
   * If the refresh returns 429 (rate limited), wait the Retry-After duration and retry once —
   * 429 is transient and should not be treated as an auth failure that clears tokens.
   * Note: the apiClient response interceptor already handles one 429 retry for /auth/refresh,
   * so this path handles the case where the caller-level error is still a 429 after that retry.
   * On any non-recoverable failure (no cookie, expired, revoked), clear tokens and mark
   * as unauthenticated.
   *
   * Sets isInitializing=false exactly once when complete — never sets it back to true.
   */
  initialize: async () => {
    const attemptRefresh = async (): Promise<boolean> => {
      try {
        await authService.refreshToken()
        return true
      } catch (err) {
        // If rate-limited, wait and retry once — do not treat 429 as an auth failure
        if (err instanceof ApiError && err.status === 429) {
          // Default to 5 seconds if no explicit delay is available.
          // The apiClient response interceptor already waited Retry-After before re-throwing,
          // so we use a short additional delay here as a safety buffer.
          await new Promise<void>((resolve) => setTimeout(resolve, 5_000))
          try {
            await authService.refreshToken()
            return true
          } catch {
            // Second attempt also failed — treat as unauthenticated
            return false
          }
        }
        return false
      }
    }

    try {
      const refreshed = await attemptRefresh()
      if (refreshed) {
        const user = await authService.getCurrentUser()
        set({ user, isAuthenticated: true, isInitializing: false })
      } else {
        // Refresh failed (no cookie, invalid, or persistent rate limit)
        clearTokens()
        set({ user: null, isAuthenticated: false, isInitializing: false })
      }
    } catch {
      // getCurrentUser() failed after successful refresh — clear and mark unauthenticated
      clearTokens()
      set({ user: null, isAuthenticated: false, isInitializing: false })
    }
  },

  login: async (credentials: LoginRequest) => {
    set({ isLoading: true })
    try {
      await authService.login(credentials)
      const user = await authService.getCurrentUser()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  register: async (data: UserCreate): Promise<UserResponse> => {
    set({ isLoading: true })
    try {
      const user = await authService.register(data)
      set({ isLoading: false })
      return user
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  logout: async () => {
    set({ isLoading: true })
    try {
      await authService.logout()
    } finally {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  updateUser: async (data: UserUpdateRequest) => {
    set({ isLoading: true })
    try {
      const user = await authService.updateCurrentUser(data)
      set({ user, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },
}))
