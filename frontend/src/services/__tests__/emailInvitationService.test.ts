import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import emailInvitationService from '../emailInvitationService'
import { clearTokens, setTokens } from '../tokenService'
import { mockTokens, mockEmailInvitations } from '../../mocks/handlers'

const BASE = '/api/v1'
const SURVEY_ID = '10000000-0000-0000-0000-000000000002'
const INVITATION_ID = 'inv-00000000-0000-0000-0000-000000000001'

describe('emailInvitationService', () => {
  beforeEach(() => {
    clearTokens()
    localStorage.clear()
    setTokens(mockTokens.access_token)
  })

  // -------------------------------------------------------------------------
  // listInvitations
  // -------------------------------------------------------------------------

  describe('listInvitations()', () => {
    it('returns a paginated list of invitations for a survey', async () => {
      const result = await emailInvitationService.listInvitations(SURVEY_ID)
      expect(result.items).toHaveLength(
        mockEmailInvitations.filter((i) => i.survey_id === SURVEY_ID).length
      )
      expect(result.total).toBeGreaterThanOrEqual(2)
    })

    it('returns correct pagination info', async () => {
      const result = await emailInvitationService.listInvitations(SURVEY_ID, {
        page: 1,
        per_page: 20,
      })
      expect(result.page).toBe(1)
      expect(result.per_page).toBe(20)
    })

    it('sends status filter param to API', async () => {
      let capturedUrl = ''
      server.use(
        http.get(`${BASE}/surveys/${SURVEY_ID}/invitations`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 20, total_pages: 1 },
            { status: 200 }
          )
        })
      )

      await emailInvitationService.listInvitations(SURVEY_ID, { status: 'delivered' })
      expect(capturedUrl).toContain('status=delivered')
    })

    it('sends invitation_type filter param to API', async () => {
      let capturedUrl = ''
      server.use(
        http.get(`${BASE}/surveys/${SURVEY_ID}/invitations`, ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json(
            { items: [], total: 0, page: 1, per_page: 20, total_pages: 1 },
            { status: 200 }
          )
        })
      )

      await emailInvitationService.listInvitations(SURVEY_ID, { invitation_type: 'reminder' })
      expect(capturedUrl).toContain('invitation_type=reminder')
    })

    it('throws ApiError on 401', async () => {
      server.use(
        http.get(`${BASE}/surveys/${SURVEY_ID}/invitations`, () =>
          HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
            { status: 401 }
          )
        )
      )

      clearTokens()
      await expect(emailInvitationService.listInvitations(SURVEY_ID)).rejects.toMatchObject({
        status: 401,
      })
    })
  })

  // -------------------------------------------------------------------------
  // getInvitation
  // -------------------------------------------------------------------------

  describe('getInvitation()', () => {
    it('returns a single invitation by ID', async () => {
      const result = await emailInvitationService.getInvitation(SURVEY_ID, INVITATION_ID)
      expect(result.id).toBe(INVITATION_ID)
      expect(result.survey_id).toBe(SURVEY_ID)
      expect(result.recipient_email).toBe('alice@example.com')
    })

    it('throws ApiError on 404 for unknown invitation', async () => {
      await expect(
        emailInvitationService.getInvitation(SURVEY_ID, 'non-existent-id')
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  // -------------------------------------------------------------------------
  // sendInvitation
  // -------------------------------------------------------------------------

  describe('sendInvitation()', () => {
    it('sends a single invitation and returns the created invitation', async () => {
      const result = await emailInvitationService.sendInvitation(SURVEY_ID, {
        recipient_email: 'new@example.com',
        recipient_name: 'New User',
        invitation_type: 'invite',
      })

      expect(result.recipient_email).toBe('new@example.com')
      expect(result.survey_id).toBe(SURVEY_ID)
      expect(result.status).toBe('sent')
    })

    it('sends correct payload to the API', async () => {
      let capturedBody: Record<string, unknown> | null = null

      server.use(
        http.post(`${BASE}/surveys/${SURVEY_ID}/invitations`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(
            {
              id: 'inv-new-test',
              survey_id: SURVEY_ID,
              recipient_email: capturedBody.recipient_email as string,
              recipient_name: capturedBody.recipient_name as string | null,
              subject: capturedBody.subject as string | null,
              invitation_type: capturedBody.invitation_type ?? 'invite',
              status: 'sent',
              sent_at: new Date().toISOString(),
              delivered_at: null,
              opened_at: null,
              clicked_at: null,
              bounced_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { status: 201 }
          )
        })
      )

      await emailInvitationService.sendInvitation(SURVEY_ID, {
        recipient_email: 'payload@example.com',
        subject: 'Custom subject',
        invitation_type: 'reminder',
      })

      expect(capturedBody).not.toBeNull()
      expect(capturedBody!.recipient_email).toBe('payload@example.com')
      expect(capturedBody!.subject).toBe('Custom subject')
      expect(capturedBody!.invitation_type).toBe('reminder')
    })
  })

  // -------------------------------------------------------------------------
  // sendBatchInvitations
  // -------------------------------------------------------------------------

  describe('sendBatchInvitations()', () => {
    it('sends batch invitations and returns counts', async () => {
      const result = await emailInvitationService.sendBatchInvitations(SURVEY_ID, {
        items: [
          { email: 'batch1@example.com', name: 'Batch One' },
          { email: 'batch2@example.com' },
        ],
      })

      expect(result.sent).toBe(2)
      expect(result.failed).toBe(0)
      expect(result.skipped).toBe(0)
    })

    it('sends correct payload to the batch endpoint', async () => {
      let capturedBody: Record<string, unknown> | null = null

      server.use(
        http.post(`${BASE}/surveys/${SURVEY_ID}/invitations/batch`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ sent: 1, failed: 0, skipped: 0 }, { status: 201 })
        })
      )

      await emailInvitationService.sendBatchInvitations(SURVEY_ID, {
        items: [{ email: 'single@example.com', name: 'Single' }],
        subject: 'Batch subject',
      })

      expect(capturedBody).not.toBeNull()
      expect((capturedBody!.items as Array<{ email: string }>)[0].email).toBe('single@example.com')
      expect(capturedBody!.subject).toBe('Batch subject')
    })
  })

  // -------------------------------------------------------------------------
  // resendInvitation
  // -------------------------------------------------------------------------

  describe('resendInvitation()', () => {
    it('resends an invitation and returns updated invitation', async () => {
      const result = await emailInvitationService.resendInvitation(SURVEY_ID, INVITATION_ID)
      expect(result.id).toBe(INVITATION_ID)
      expect(result.status).toBe('sent')
      expect(result.sent_at).not.toBeNull()
    })

    it('throws ApiError on 404 for unknown invitation', async () => {
      await expect(
        emailInvitationService.resendInvitation(SURVEY_ID, 'non-existent-id')
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  // -------------------------------------------------------------------------
  // deleteInvitation
  // -------------------------------------------------------------------------

  describe('deleteInvitation()', () => {
    it('deletes an invitation without returning data', async () => {
      await expect(
        emailInvitationService.deleteInvitation(SURVEY_ID, INVITATION_ID)
      ).resolves.toBeUndefined()
    })

    it('throws ApiError on 401', async () => {
      server.use(
        http.delete(`${BASE}/surveys/${SURVEY_ID}/invitations/:invitationId`, () =>
          HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
            { status: 401 }
          )
        )
      )

      clearTokens()
      await expect(
        emailInvitationService.deleteInvitation(SURVEY_ID, INVITATION_ID)
      ).rejects.toMatchObject({ status: 401 })
    })
  })

  // -------------------------------------------------------------------------
  // getStats
  // -------------------------------------------------------------------------

  describe('getStats()', () => {
    it('returns delivery statistics for a survey', async () => {
      const result = await emailInvitationService.getStats(SURVEY_ID)
      expect(typeof result.total_sent).toBe('number')
      expect(typeof result.total_delivered).toBe('number')
      expect(typeof result.total_bounced).toBe('number')
      expect(typeof result.total_failed).toBe('number')
      expect(typeof result.open_rate).toBe('number')
      expect(typeof result.click_rate).toBe('number')
    })

    it('returns correct stats based on mock invitations', async () => {
      const result = await emailInvitationService.getStats(SURVEY_ID)
      const surveyInvitations = mockEmailInvitations.filter((i) => i.survey_id === SURVEY_ID)
      const expectedSent = surveyInvitations.filter((i) => i.sent_at).length
      expect(result.total_sent).toBe(expectedSent)
    })

    it('throws ApiError on 401', async () => {
      server.use(
        http.get(`${BASE}/surveys/${SURVEY_ID}/invitations/stats`, () =>
          HttpResponse.json(
            { detail: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
            { status: 401 }
          )
        )
      )

      clearTokens()
      await expect(emailInvitationService.getStats(SURVEY_ID)).rejects.toMatchObject({
        status: 401,
      })
    })
  })
})
