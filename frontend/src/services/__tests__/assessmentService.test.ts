import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import assessmentService from '../assessmentService'
import { clearTokens, setTokens } from '../tokenService'
import { mockTokens, mockAssessments } from '../../mocks/handlers'

const BASE = '/api/v1'
const SURVEY_ID = '10000000-0000-0000-0000-000000000002'

describe('assessmentService', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    setTokens(mockTokens.access_token)
  })

  // -------------------------------------------------------------------------
  // listAssessments
  // -------------------------------------------------------------------------

  describe('listAssessments()', () => {
    it('returns a list of assessments for a survey', async () => {
      const result = await assessmentService.listAssessments(SURVEY_ID)
      expect(result.items).toHaveLength(
        mockAssessments.filter((a) => a.survey_id === SURVEY_ID).length
      )
      expect(result.total).toBeGreaterThanOrEqual(2)
    })

    it('returns correct pagination info', async () => {
      const result = await assessmentService.listAssessments(SURVEY_ID, { page: 1, per_page: 10 })
      expect(result.page).toBe(1)
      expect(result.per_page).toBe(10)
    })

    it('throws ApiError on 401', async () => {
      server.use(
        http.get(`${BASE}/surveys/${SURVEY_ID}/assessments`, () =>
          HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
            { status: 401 }
          )
        )
      )

      clearTokens()
      await expect(assessmentService.listAssessments(SURVEY_ID)).rejects.toMatchObject({
        status: 401,
      })
    })

    it('throws on server error', async () => {
      server.use(
        http.get(`${BASE}/surveys/${SURVEY_ID}/assessments`, () =>
          HttpResponse.json(
            { detail: { code: 'INTERNAL_SERVER_ERROR', message: 'Server error' } },
            { status: 500 }
          )
        )
      )

      await expect(assessmentService.listAssessments(SURVEY_ID)).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // getAssessment
  // -------------------------------------------------------------------------

  describe('getAssessment()', () => {
    it('returns a single assessment by id', async () => {
      const target = mockAssessments[0]
      const result = await assessmentService.getAssessment(SURVEY_ID, target.id)
      expect(result.id).toBe(target.id)
      expect(result.name).toBe(target.name)
    })

    it('throws ApiError on 404', async () => {
      await expect(
        assessmentService.getAssessment(SURVEY_ID, 'non-existent-id')
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  // -------------------------------------------------------------------------
  // createAssessment
  // -------------------------------------------------------------------------

  describe('createAssessment()', () => {
    it('creates a new assessment and returns it', async () => {
      const result = await assessmentService.createAssessment(SURVEY_ID, {
        name: 'New Assessment',
        scope: 'total',
        group_id: null,
        min_score: 0,
        max_score: 10,
        message: 'Test message',
      })

      expect(result.name).toBe('New Assessment')
      expect(result.scope).toBe('total')
      expect(result.min_score).toBe(0)
      expect(result.max_score).toBe(10)
      expect(result.message).toBe('Test message')
      expect(result.survey_id).toBe(SURVEY_ID)
    })

    it('sends correct payload to the API', async () => {
      let capturedBody: Record<string, unknown> | null = null

      server.use(
        http.post(`${BASE}/surveys/${SURVEY_ID}/assessments`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(
            {
              id: 'new-id',
              survey_id: SURVEY_ID,
              name: capturedBody.name as string,
              scope: capturedBody.scope as string,
              group_id: capturedBody.group_id as string | null,
              min_score: capturedBody.min_score as number,
              max_score: capturedBody.max_score as number,
              message: capturedBody.message as string,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { status: 201 }
          )
        })
      )

      await assessmentService.createAssessment(SURVEY_ID, {
        name: 'Payload Test',
        scope: 'group',
        group_id: 'g1',
        min_score: 5,
        max_score: 8,
        message: 'Payload message',
      })

      expect(capturedBody).not.toBeNull()
      expect(capturedBody!.name).toBe('Payload Test')
      expect(capturedBody!.scope).toBe('group')
      expect(capturedBody!.group_id).toBe('g1')
      expect(capturedBody!.min_score).toBe(5)
      expect(capturedBody!.max_score).toBe(8)
    })
  })

  // -------------------------------------------------------------------------
  // updateAssessment
  // -------------------------------------------------------------------------

  describe('updateAssessment()', () => {
    it('updates an assessment and returns the updated object', async () => {
      const target = mockAssessments[0]
      const result = await assessmentService.updateAssessment(SURVEY_ID, target.id, {
        name: 'Updated Name',
      })
      expect(result.name).toBe('Updated Name')
    })

    it('throws ApiError on 404', async () => {
      await expect(
        assessmentService.updateAssessment(SURVEY_ID, 'non-existent-id', { name: 'X' })
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  // -------------------------------------------------------------------------
  // deleteAssessment
  // -------------------------------------------------------------------------

  describe('deleteAssessment()', () => {
    it('deletes an assessment without returning data', async () => {
      const target = mockAssessments[0]
      await expect(
        assessmentService.deleteAssessment(SURVEY_ID, target.id)
      ).resolves.toBeUndefined()
    })

    it('throws ApiError on 401', async () => {
      server.use(
        http.delete(`${BASE}/surveys/${SURVEY_ID}/assessments/:assessmentId`, () =>
          HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
            { status: 401 }
          )
        )
      )

      clearTokens()
      await expect(assessmentService.deleteAssessment(SURVEY_ID, 'any-id')).rejects.toMatchObject({
        status: 401,
      })
    })
  })
})
