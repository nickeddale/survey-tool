import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import participantService from '../participantService'
import { clearTokens, setTokens } from '../tokenService'
import { mockTokens, mockParticipants } from '../../mocks/handlers'

const BASE = '/api/v1'
const SURVEY_ID = '10000000-0000-0000-0000-000000000002'

describe('participantService', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    setTokens(mockTokens.access_token)
  })

  // -------------------------------------------------------------------------
  // listParticipants
  // -------------------------------------------------------------------------

  describe('listParticipants()', () => {
    it('returns a list of participants for a survey', async () => {
      const result = await participantService.listParticipants(SURVEY_ID)
      expect(result.items).toHaveLength(
        mockParticipants.filter((p) => p.survey_id === SURVEY_ID).length,
      )
      expect(result.total).toBeGreaterThanOrEqual(2)
    })

    it('returns correct pagination info', async () => {
      const result = await participantService.listParticipants(SURVEY_ID, {
        page: 1,
        per_page: 20,
      })
      expect(result.page).toBe(1)
      expect(result.per_page).toBe(20)
    })

    it('sends email filter param to API', async () => {
      let capturedUrl = ''
      server.use(
        http.get(`${BASE}/surveys/${SURVEY_ID}/participants`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 20, pages: 1 },
            { status: 200 },
          )
        }),
      )

      await participantService.listParticipants(SURVEY_ID, { email: 'test@example.com' })
      expect(capturedUrl).toContain('email=test%40example.com')
    })

    it('sends completed filter param to API', async () => {
      let capturedUrl = ''
      server.use(
        http.get(`${BASE}/surveys/${SURVEY_ID}/participants`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 20, pages: 1 },
            { status: 200 },
          )
        }),
      )

      await participantService.listParticipants(SURVEY_ID, { completed: true })
      expect(capturedUrl).toContain('completed=true')
    })

    it('throws ApiError on 401', async () => {
      server.use(
        http.get(`${BASE}/surveys/${SURVEY_ID}/participants`, () =>
          HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
            { status: 401 },
          ),
        ),
      )

      clearTokens()
      await expect(participantService.listParticipants(SURVEY_ID)).rejects.toMatchObject({
        status: 401,
      })
    })
  })

  // -------------------------------------------------------------------------
  // createParticipant
  // -------------------------------------------------------------------------

  describe('createParticipant()', () => {
    it('creates a participant and returns response with token', async () => {
      const result = await participantService.createParticipant(SURVEY_ID, {
        email: 'test@example.com',
        uses_remaining: 5,
      })

      expect(result.email).toBe('test@example.com')
      expect(result.survey_id).toBe(SURVEY_ID)
      expect(result.token).toBeTruthy()
    })

    it('sends correct payload to the API', async () => {
      let capturedBody: Record<string, unknown> | null = null

      server.use(
        http.post(`${BASE}/surveys/${SURVEY_ID}/participants`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(
            {
              id: 'new-id',
              survey_id: SURVEY_ID,
              external_id: null,
              email: capturedBody.email as string | null,
              attributes: null,
              uses_remaining: capturedBody.uses_remaining as number | null,
              valid_from: null,
              valid_until: null,
              completed: false,
              created_at: new Date().toISOString(),
              token: 'test-token-xyz',
            },
            { status: 201 },
          )
        }),
      )

      await participantService.createParticipant(SURVEY_ID, {
        email: 'payload@example.com',
        uses_remaining: 10,
        attributes: { role: 'admin' },
      })

      expect(capturedBody).not.toBeNull()
      expect(capturedBody!.email).toBe('payload@example.com')
      expect(capturedBody!.uses_remaining).toBe(10)
    })
  })

  // -------------------------------------------------------------------------
  // createParticipantsBatch
  // -------------------------------------------------------------------------

  describe('createParticipantsBatch()', () => {
    it('creates multiple participants and returns array', async () => {
      const result = await participantService.createParticipantsBatch(SURVEY_ID, {
        items: [
          { email: 'batch1@example.com' },
          { email: 'batch2@example.com' },
        ],
      })

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
      expect(result[0].email).toBe('batch1@example.com')
      expect(result[1].email).toBe('batch2@example.com')
    })
  })

  // -------------------------------------------------------------------------
  // updateParticipant
  // -------------------------------------------------------------------------

  describe('updateParticipant()', () => {
    it('updates a participant and returns updated object', async () => {
      const target = mockParticipants[0]
      const result = await participantService.updateParticipant(SURVEY_ID, target.id, {
        email: 'updated@example.com',
      })
      expect(result.email).toBe('updated@example.com')
    })

    it('throws ApiError on 404', async () => {
      await expect(
        participantService.updateParticipant(SURVEY_ID, 'non-existent-id', { email: 'x@x.com' }),
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  // -------------------------------------------------------------------------
  // deleteParticipant
  // -------------------------------------------------------------------------

  describe('deleteParticipant()', () => {
    it('deletes a participant without returning data', async () => {
      const target = mockParticipants[0]
      await expect(
        participantService.deleteParticipant(SURVEY_ID, target.id),
      ).resolves.toBeUndefined()
    })

    it('throws ApiError on 401', async () => {
      server.use(
        http.delete(`${BASE}/surveys/${SURVEY_ID}/participants/:participantId`, () =>
          HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
            { status: 401 },
          ),
        ),
      )

      clearTokens()
      await expect(
        participantService.deleteParticipant(SURVEY_ID, 'any-id'),
      ).rejects.toMatchObject({ status: 401 })
    })
  })
})
