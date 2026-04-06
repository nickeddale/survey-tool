/**
 * Zustand auth store.
 *
 * Initialization: on mount, optimistically attempt a token refresh using the httpOnly
 * cookie (sent automatically by the browser). If successful, fetch the current user.
 * If it fails (no cookie, expired, or revoked), treat as unauthenticated — no retry.
 *
 * Actions delegate to authService and update store state atomically.
 */

import { create } from 'zustand'
import authService from '../services/authService'
import { clearTokens } from '../services/tokenService'
import type { UserResponse, LoginRequest, UserCreate, UserUpdateRequest } from '../types/auth'

interface AuthState {
  user: UserResponse | null
  isAuthenticated: boolean
  isLoading: boolean

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
  isLoading: false,

  /**
   * Initialize auth state on app load.
   * Optimistically attempt a token refresh using the httpOnly cookie (sent automatically).
   * If successful, fetch the current user. On failure (no cookie, expired, revoked),
   * clear access token and mark as unauthenticated — do not retry.
   */
  initialize: async () => {
    set({ isLoading: true })
    try {
      // Optimistic refresh — browser sends httpOnly cookie automatically
      await authService.refreshToken()
      const user = await authService.getCurrentUser()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch {
      // Refresh failed (no cookie or invalid) — unauthenticated state
      clearTokens()
      set({ user: null, isAuthenticated: false, isLoading: false })
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
