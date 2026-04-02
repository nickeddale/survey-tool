// API utility types matching backend error and pagination shapes

/**
 * Backend error shape: {detail: {code: string, message: string}}
 * All custom AppError subclasses (UnauthorizedError, NotFoundError, etc.)
 * produce this exact shape. Some middleware-level 401s may produce plain string detail.
 */
export interface ApiErrorDetail {
  code: string
  message: string
}

export interface ApiErrorResponse {
  detail: ApiErrorDetail | string
}

export class ApiError extends Error {
  status: number
  code: string
  detail: ApiErrorDetail | string

  constructor(status: number, detail: ApiErrorDetail | string) {
    const message =
      typeof detail === 'string' ? detail : detail.message
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = typeof detail === 'object' ? detail.code : 'UNKNOWN_ERROR'
    this.detail = detail
  }

  static isStructured(detail: ApiErrorDetail | string): detail is ApiErrorDetail {
    return typeof detail === 'object' && 'code' in detail && 'message' in detail
  }
}

/**
 * Generic paginated response matching backend PaginatedResponse shape.
 * Confirmed from backend/app/schemas/survey.py SurveyListResponse pattern.
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}
