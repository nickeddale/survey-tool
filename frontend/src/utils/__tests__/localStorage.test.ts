import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  localStorageKey,
  getStoredResponseId,
  storeResponseId,
  clearStoredResponseId,
} from '../localStorage'

const SURVEY_ID = 'survey-abc-123'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('localStorageKey', () => {
  it('returns the correct key format', () => {
    expect(localStorageKey(SURVEY_ID)).toBe(`survey_response_${SURVEY_ID}`)
  })
})

describe('getStoredResponseId', () => {
  it('returns null when no value is stored', () => {
    vi.spyOn(localStorage, 'getItem').mockReturnValue(null)
    expect(getStoredResponseId(SURVEY_ID)).toBeNull()
  })

  it('returns the stored response ID when present', () => {
    vi.spyOn(localStorage, 'getItem').mockReturnValue('resp-xyz')
    expect(getStoredResponseId(SURVEY_ID)).toBe('resp-xyz')
  })

  it('calls getItem with the correct key', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockReturnValue(null)
    getStoredResponseId(SURVEY_ID)
    expect(spy).toHaveBeenCalledWith(`survey_response_${SURVEY_ID}`)
  })

  it('returns null when localStorage throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('localStorage unavailable')
    })
    expect(getStoredResponseId(SURVEY_ID)).toBeNull()
  })
})

describe('storeResponseId', () => {
  it('calls setItem with the correct key and value', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => undefined)
    storeResponseId(SURVEY_ID, 'resp-xyz')
    expect(spy).toHaveBeenCalledWith(`survey_response_${SURVEY_ID}`, 'resp-xyz')
  })

  it('silently ignores throws from localStorage', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => storeResponseId(SURVEY_ID, 'resp-xyz')).not.toThrow()
  })
})

describe('clearStoredResponseId', () => {
  it('calls removeItem with the correct key', () => {
    const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => undefined)
    clearStoredResponseId(SURVEY_ID)
    expect(spy).toHaveBeenCalledWith(`survey_response_${SURVEY_ID}`)
  })

  it('silently ignores throws from localStorage', () => {
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('localStorage unavailable')
    })
    expect(() => clearStoredResponseId(SURVEY_ID)).not.toThrow()
  })
})
