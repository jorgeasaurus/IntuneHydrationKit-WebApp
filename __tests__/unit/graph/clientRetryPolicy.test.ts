import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../setup/msw-handlers'
import { GraphClient } from '@/lib/graph/client'
import { MAX_RETRY_AFTER_MS, RunCancelledError } from '@/lib/utils/retry'

vi.mock('@/lib/auth/authUtils', () => ({
  assertActiveAccountMatches: vi.fn(),
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}))

const GRAPH_BASE = 'https://graph.microsoft.com'

function sessionError(name = 'AuthSessionExpiredError') {
  return Object.assign(new Error('Session expired. Please sign out and sign in again.'), { name, status: 401 })
}

function createClient(onAuthSessionLost?: () => Promise<'retry' | 'stop' | 'cancelled'>) {
  const wait = vi.fn(async (_ms: number) => 'completed' as const)
  const client = new GraphClient()
  client.setExecutionControls({ wait, onAuthSessionLost })
  return { client, wait }
}

describe('GraphClient retry policy', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const auth = await import('@/lib/auth/authUtils')
    vi.mocked(auth.getAccessToken).mockReset().mockResolvedValue('mock-access-token')
  })

  describe('POST create', () => {
    it('does not send a create again after a 504; it finds the object by name and returns it', async () => {
      let posts = 0
      server.use(
        http.post(`${GRAPH_BASE}/v1.0/groups`, () => {
          posts++
          return HttpResponse.json({ error: { message: 'Gateway timeout' } }, { status: 504 })
        }),
        http.get(`${GRAPH_BASE}/v1.0/groups`, () =>
          HttpResponse.json({ value: [{ id: 'other', displayName: 'Other' }, { id: 'g-1', displayName: '[IHD] Group A' }] })
        )
      )
      const { client } = createClient()

      const created = await client.post<{ id: string }>('/groups', { displayName: '[IHD] Group A' }, 'v1.0')

      expect(created.id).toBe('g-1')
      expect(posts).toBe(1)
    })

    it('does not send a create again after a network error when the object is not found', async () => {
      let posts = 0
      let reads = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta/deviceManagement/configurationPolicies`, () => {
          posts++
          return HttpResponse.error()
        }),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/configurationPolicies`, () => {
          reads++
          return HttpResponse.json({ value: [] })
        })
      )
      const { client } = createClient()

      await expect(
        client.post('/deviceManagement/configurationPolicies', { name: '[IHD] Policy' })
      ).rejects.toThrow(/Outcome unknown.*not found in the tenant/)
      expect(posts).toBe(1)
      expect(reads).toBe(2)
    })

    it('reports "outcome unknown" without a resend when the tenant cannot be read', async () => {
      let posts = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () => {
          posts++
          return HttpResponse.json({ error: { message: 'Internal' } }, { status: 500 })
        }),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () =>
          HttpResponse.json({ error: { message: 'Forbidden' } }, { status: 403 })
        )
      )
      const { client } = createClient()

      const error = await client
        .post('/deviceManagement/deviceConfigurations', { displayName: 'Config' })
        .catch((e: unknown) => e)

      expect((error as Error).message).toMatch(/\[500\] Internal \(Outcome unknown.*could not be read/)
      expect((error as { status?: number }).status).toBe(500)
      expect(posts).toBe(1)
    })

    it('retries a create on 429 and honours Retry-After', async () => {
      let posts = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, () => {
          posts++
          if (posts === 1) {
            return HttpResponse.json({ error: { message: 'Throttled' } }, { status: 429, headers: { 'Retry-After': '2' } })
          }
          return HttpResponse.json({ id: 'f-1' }, { status: 201 })
        })
      )
      const { client, wait } = createClient()

      const created = await client.post<{ id: string }>('/deviceManagement/assignmentFilters', { displayName: 'Filter' })

      expect(created.id).toBe('f-1')
      expect(posts).toBe(2)
      expect(wait).toHaveBeenCalledWith(2000)
    })

    it('retries a create on 503 only when the response has Retry-After (HTTP-date form)', async () => {
      let posts = 0
      const retryAt = new Date(Date.now() + 5000).toUTCString()
      server.use(
        http.post(`${GRAPH_BASE}/beta/deviceManagement/intents`, () => {
          posts++
          if (posts === 1) {
            return HttpResponse.json({ error: { message: 'Busy' } }, { status: 503, headers: { 'Retry-After': retryAt } })
          }
          return HttpResponse.json({ id: 'i-1' }, { status: 201 })
        })
      )
      const { client, wait } = createClient()

      await expect(client.post('/deviceManagement/intents', { displayName: 'Intent' })).resolves.toEqual({ id: 'i-1' })
      expect(posts).toBe(2)
      const waited = wait.mock.calls[0][0]
      expect(waited).toBeGreaterThan(0)
      expect(waited).toBeLessThanOrEqual(5000)
    })

    it('does not retry a create on 503 without Retry-After', async () => {
      let posts = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta/deviceManagement/intents`, () => {
          posts++
          return HttpResponse.json({ error: { message: 'Busy' } }, { status: 503 })
        }),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/intents`, () => HttpResponse.json({ value: [] }))
      )
      const { client } = createClient()

      await expect(client.post('/deviceManagement/intents', { displayName: 'Intent' })).rejects.toThrow(/Outcome unknown/)
      expect(posts).toBe(1)
    })

    it('gives up after MAX_RETRIES on repeated 429 responses', async () => {
      let posts = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, () => {
          posts++
          return HttpResponse.json({ error: { message: 'Throttled' } }, { status: 429 })
        })
      )
      const { client } = createClient()

      await expect(client.post('/deviceManagement/assignmentFilters', { displayName: 'F' })).rejects.toThrow('[429]')
      expect(posts).toBe(4)
    })

    it('uses the same rule for postNoRetry', async () => {
      let posts = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta/deviceManagement/deviceCompliancePolicies`, () => {
          posts++
          if (posts === 1) return HttpResponse.json({ error: { message: 'Throttled' } }, { status: 429 })
          return HttpResponse.json({ id: 'c-1' }, { status: 201 })
        })
      )
      const { client } = createClient()

      await expect(client.postNoRetry('/deviceManagement/deviceCompliancePolicies', { displayName: 'C' })).resolves.toEqual({ id: 'c-1' })
      expect(posts).toBe(2)
    })
  })

  describe('POST action', () => {
    const FILE = '/deviceAppManagement/mobileApps/app-1/microsoft.graph.win32LobApp/contentVersions/1/files/file-1'

    it.each(['renewUpload', 'commit'])('retries a 5xx on %s and returns the next response, without a create check', async (action) => {
      let posts = 0
      let reads = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta${FILE}/${action}`, () => {
          posts++
          return posts < 3
            ? HttpResponse.json({ error: { message: 'Internal error' } }, { status: posts === 1 ? 500 : 503 })
            : new HttpResponse(null, { status: 204 })
        }),
        http.get(`${GRAPH_BASE}/beta${FILE}`, () => {
          reads++
          return HttpResponse.json({})
        })
      )
      const { client, wait } = createClient()

      await expect(client.postAction(`${FILE}/${action}`, action === 'commit' ? { fileEncryptionInfo: {} } : {})).resolves.toEqual({})
      expect(posts).toBe(3)
      expect(reads).toBe(0)
      expect(wait).toHaveBeenCalledTimes(2)
    })

    it('retries a network error and stops after MAX_RETRIES', async () => {
      let posts = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta${FILE}/renewUpload`, () => {
          posts++
          return HttpResponse.error()
        })
      )
      const { client } = createClient()

      await expect(client.postAction(`${FILE}/renewUpload`, {})).rejects.toThrow()
      expect(posts).toBe(4)
    })

    it('does not retry a 400 response', async () => {
      let posts = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta${FILE}/commit`, () => {
          posts++
          return HttpResponse.json({ error: { code: 'BadRequest', message: 'Invalid state' } }, { status: 400 })
        })
      )
      const { client } = createClient()

      await expect(client.postAction(`${FILE}/commit`, {})).rejects.toMatchObject({ status: 400 })
      expect(posts).toBe(1)
    })

    it('stops when the run is cancelled during a retry wait', async () => {
      server.use(
        http.post(`${GRAPH_BASE}/beta${FILE}/commit`, () =>
          HttpResponse.json({ error: { message: 'Internal error' } }, { status: 500 })
        )
      )
      const client = new GraphClient()
      client.setExecutionControls({ wait: async () => 'cancelled' })

      await expect(client.postAction(`${FILE}/commit`, {})).rejects.toBeInstanceOf(RunCancelledError)
    })
  })

  describe('GET', () => {
    it('caps one Retry-After wait', async () => {
      let reads = 0
      server.use(
        http.get(`${GRAPH_BASE}/beta/slow`, () => {
          reads++
          if (reads === 1) {
            return HttpResponse.json({ error: { message: 'Busy' } }, { status: 503, headers: { 'Retry-After': '600' } })
          }
          return HttpResponse.json({ ok: true })
        })
      )
      const { client, wait } = createClient()

      await expect(client.get('/slow')).resolves.toEqual({ ok: true })
      expect(wait).toHaveBeenCalledWith(MAX_RETRY_AFTER_MS)
    })

    it('makes at most 1 + MAX_RETRIES attempts', async () => {
      let reads = 0
      server.use(
        http.get(`${GRAPH_BASE}/beta/broken`, () => {
          reads++
          return HttpResponse.json({ error: { message: 'Internal' } }, { status: 500 })
        })
      )
      const { client } = createClient()

      await expect(client.get('/broken')).rejects.toThrow('[500]')
      expect(reads).toBe(4)
    })

    it('throws RunCancelledError when the run is cancelled during a retry wait', async () => {
      let reads = 0
      server.use(
        http.get(`${GRAPH_BASE}/beta/throttled`, () => {
          reads++
          return HttpResponse.json({ error: { message: 'Throttled' } }, { status: 429, headers: { 'Retry-After': '30' } })
        })
      )
      const client = new GraphClient()
      client.setExecutionControls({ wait: async () => 'cancelled' })

      await expect(client.get('/throttled')).rejects.toBeInstanceOf(RunCancelledError)
      expect(reads).toBe(1)
    })
  })

  describe('DELETE', () => {
    it('reads the object again after a 5xx and reports success when it is gone', async () => {
      let deletes = 0
      server.use(
        http.delete(`${GRAPH_BASE}/beta/deviceManagement/configurationPolicies/p-1`, () => {
          deletes++
          return HttpResponse.json({ error: { message: 'Gateway timeout' } }, { status: 504 })
        }),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/configurationPolicies/p-1`, () =>
          HttpResponse.json({ error: { code: 'NotFound', message: 'Not found' } }, { status: 404 })
        )
      )
      const { client } = createClient()

      await expect(client.delete('/deviceManagement/configurationPolicies/p-1')).resolves.toBeUndefined()
      expect(deletes).toBe(4)
    })

    it('reports the delete error when the object still exists', async () => {
      server.use(
        http.delete(`${GRAPH_BASE}/beta/deviceManagement/configurationPolicies/p-2`, () =>
          HttpResponse.json({ error: { message: 'Gateway timeout' } }, { status: 504 })
        ),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/configurationPolicies/p-2`, () => HttpResponse.json({ id: 'p-2' }))
      )
      const { client } = createClient()

      await expect(client.delete('/deviceManagement/configurationPolicies/p-2')).rejects.toThrow('[504]')
    })
  })

  describe('sign-in session loss', () => {
    it('asks the run to recover and sends the request when the run resumes', async () => {
      const auth = await import('@/lib/auth/authUtils')
      vi.mocked(auth.getAccessToken).mockRejectedValueOnce(sessionError('InteractionRequiredError'))
      let posts = 0
      server.use(
        http.post(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, () => {
          posts++
          return HttpResponse.json({ id: 'f-2' }, { status: 201 })
        })
      )
      const onAuthSessionLost = vi.fn(async () => 'retry' as const)
      const { client } = createClient(onAuthSessionLost)

      await expect(client.post('/deviceManagement/assignmentFilters', { displayName: 'F' })).resolves.toEqual({ id: 'f-2' })
      expect(onAuthSessionLost).toHaveBeenCalledTimes(1)
      expect(posts).toBe(1)
    })

    it('throws RunCancelledError when the run is cancelled while it waits for sign-in', async () => {
      const auth = await import('@/lib/auth/authUtils')
      vi.mocked(auth.getAccessToken).mockRejectedValueOnce(sessionError())
      const { client } = createClient(async () => 'cancelled')

      await expect(client.get('/anything')).rejects.toBeInstanceOf(RunCancelledError)
    })

    it('throws the session error when no recovery is available', async () => {
      const auth = await import('@/lib/auth/authUtils')
      vi.mocked(auth.getAccessToken).mockRejectedValue(sessionError())
      const { client } = createClient(async () => 'stop')

      await expect(client.get('/anything')).rejects.toThrow('Session expired')
    })
  })

  describe('batch', () => {
    it('adds the Retry-After value to an outer 429 error', async () => {
      server.use(
        http.post(`${GRAPH_BASE}/beta/$batch`, () =>
          HttpResponse.json({ error: { message: 'Throttled' } }, { status: 429, headers: { 'Retry-After': '4' } })
        )
      )
      const { client } = createClient()

      const error = await client
        .batch([{ id: '1', method: 'POST', url: '/x', body: { displayName: 'X' } }])
        .catch((e: unknown) => e)

      expect(error).toMatchObject({ status: 429, retryAfterMs: 4000 })
    })
  })
})
