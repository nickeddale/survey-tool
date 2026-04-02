import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuthStore } from '../store/authStore'
import { getRefreshToken } from '../services/tokenService'
import type { UserResponse, LoginRequest, UserCreate } from '../types/auth'

export interface AuthContextValue {
  user: UserResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginRequest) => Promise<void>
  register: (data: UserCreate) => Promise<UserResponse>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const storeIsLoading = useAuthStore((state) => state.isLoading)
  const initialize = useAuthStore((state) => state.initialize)
  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)
  const logout = useAuthStore((state) => state.logout)

  // Synchronously determine if we need to load: if a refresh token exists, we
  // must attempt initialization before showing protected content. This avoids a
  // flash of the unauthenticated view on the first render before useEffect fires.
  const [pendingInit, setPendingInit] = useState(() => !!getRefreshToken())
  const initStarted = useRef(false)

  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true
    initialize().finally(() => setPendingInit(false))
  }, [initialize])

  // Show loading while: the store says so OR we're about to start initialization
  // (pendingInit is true until initialize() resolves).
  const isLoading = storeIsLoading || pendingInit

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
