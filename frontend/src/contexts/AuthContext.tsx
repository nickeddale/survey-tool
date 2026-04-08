import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useAuthStore } from '../store/authStore'
import type { UserResponse, LoginRequest, UserCreate } from '../types/auth'

export interface AuthContextValue {
  user: UserResponse | null
  isAuthenticated: boolean
  isInitializing: boolean  // true only during cold-start token check
  isLoading: boolean       // true during any in-flight auth action
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
  const isInitializing = useAuthStore((state) => state.isInitializing)
  const isLoading = useAuthStore((state) => state.isLoading)
  const initialize = useAuthStore((state) => state.initialize)
  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)
  const logout = useAuthStore((state) => state.logout)

  // Always attempt initialization on mount — we must probe the refresh cookie to
  // determine auth state (httpOnly cookies are not readable from JS).
  // isInitializing in the store stays true until initialize() resolves, preventing
  // route guards from flashing the unauthenticated view before the probe completes.
  const initStarted = useRef(false)

  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true
    initialize()
  }, [initialize])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isInitializing, isLoading, login, register, logout }}>
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
