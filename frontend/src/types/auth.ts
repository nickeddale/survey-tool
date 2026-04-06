// Auth-related TypeScript types matching backend schemas in backend/app/schemas/user.py

export interface UserResponse {
  id: string
  email: string
  name: string | null
  is_active: boolean
  created_at: string
}

export interface UserCreate {
  email: string
  password: string
  name?: string | null
}

export interface LoginRequest {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface RefreshRequest {
  refresh_token: string
}

export interface LogoutRequest {
  refresh_token: string
}

export interface UserUpdateRequest {
  name?: string | null
  password?: string | null
}

// API Key types — field names match backend ApiKeyResponse / ApiKeyCreateResponse schemas exactly

export interface ApiKeyResponse {
  id: string
  name: string
  key_prefix: string
  scopes: string[] | null
  is_active: boolean
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

export interface ApiKeyCreateResponse {
  id: string
  name: string
  key: string // full key — returned ONLY on creation, never again
  key_prefix: string
  scopes: string[] | null
  is_active: boolean
  expires_at: string | null
  created_at: string
}

export interface ApiKeyCreate {
  name: string
  scopes?: string[] | null
  expires_at?: string | null
}
