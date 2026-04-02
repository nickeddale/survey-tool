/**
 * Zustand auth store.
 *
 * Initialization guard: on mount, if a refresh token exists in localStorage,
 * attempt getCurrentUser(). If it fails (expired/invalid), clear tokens immediately
 * and set isAuthenticated=false. A failed init must NOT re-queue another refresh attempt.
 *
 * Actions delegate to authService and update store state atomically.
 */

import { create } from 'zustand'
import authService from '../services/authService'
import { clearTokens, getRefreshToken } from '../services/tokenService'
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
   * If a refresh token exists, fetch the current user (which will use/refresh the access token).
   * On failure, clear tokens and mark as unauthenticated — do not retry.
   */
  initialize: async () => {
    if (!getRefreshToken()) {
      // No refresh token — skip init entirely
      set({ isLoading: false })
      return
    }

    set({ isLoading: true })
    try {
      // Attempt to refresh then fetch the user
      await authService.refreshToken()
      const user = await authService.getCurrentUser()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch {
      // Refresh or user fetch failed — clear tokens and mark as logged out
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
