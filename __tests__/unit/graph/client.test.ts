import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../setup/msw-handlers'
import { GraphClient, createGraphClient } from '@/lib/graph/client'

// Mock the auth module
vi.mock('@/lib/auth/authUtils', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}))

const GRAPH_BASE = 'https://graph.microsoft.com'

describe('GraphClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('uses global environment by default', () => {
      const client = new GraphClient()
      // The baseUrl is private, so we test indirectly through requests
      expect(client).toBeDefined()
    })

    it('accepts different cloud environments', () => {
      const usgov = new GraphClient('usgov')
      const china = new GraphClient('china')
      expect(usgov).toBeDefined()
      expect(china).toBeDefined()
    })
  })

  describe('get', () => {
    it('makes GET request with correct headers', async () => {
      let capturedHeaders: Headers | null = null

      server.use(
        http.get(`${GRAPH_BASE}/beta/test`, ({ request }) => {
          capturedHeaders = new Headers(request.headers)
          return HttpResponse.json({ data: 'test' })
        })
      )

      const client = new GraphClient()
      await client.get('/test')

      expect(capturedHeaders?.get('Authorization')).toBe('Bearer mock-access-token')
      expect(capturedHeaders?.get('Content-Type')).toBe('application/json')
    })

    it('returns parsed JSON response', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/beta/users`, () => {
          return HttpResponse.json({ id: '123', displayName: 'Test User' })
        })
      )

      const client = new GraphClient()
      const result = await client.get<{ id: string; displayName: string }>('/users')

      expect(result).toEqual({ id: '123', displayName: 'Test User' })
    })

    it('uses beta version by default', async () => {
      let requestUrl = ''

      server.use(
        http.get(`${GRAPH_BASE}/beta/endpoint`, ({ request }) => {
          requestUrl = request.url
          return HttpResponse.json({})
        })
      )

      const client = new GraphClient()
      await client.get('/endpoint')

      expect(requestUrl).toBe(`${GRAPH_BASE}/beta/endpoint`)
    })

    it('can use v1.0 version', async () => {
      let requestUrl = ''

      server.use(
        http.get(`${GRAPH_BASE}/v1.0/endpoint`, ({ request }) => {
          requestUrl = request.url
          return HttpResponse.json({})
        })
      )

      const client = new GraphClient()
      await client.get('/endpoint', 'v1.0')

      expect(requestUrl).toBe(`${GRAPH_BASE}/v1.0/endpoint`)
    })

    it('throws error on non-OK response', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/beta/error`, () => {
          return HttpResponse.json(
            { error: { code: 'NotFound', message: 'Resource not found' } },
            { status: 404 }
          )
        })
      )

      const client = new GraphClient()

      await expect(client.get('/error')).rejects.toThrow('Resource not found')
    })

    it('includes status code in error', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/beta/forbidden`, () => {
          return HttpResponse.json(
            { error: { code: 'Forbidden', message: 'Access denied' } },
            { status: 403 }
          )
        })
      )

      const client = new GraphClient()

      try {
        await client.get('/forbidden')
        expect.fail('Should have thrown')
      } catch (error) {
        expect((error as Error & { status: number }).status).toBe(403)
      }
    })
  })

  describe('getCollection', () => {
    it('returns array of items from value property', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/beta/groups`, () => {
          return HttpResponse.json({
            value: [
              { id: '1', displayName: 'Group 1' },
              { id: '2', displayName: 'Group 2' },
            ],
          })
        })
      )

      const client = new GraphClient()
      const results = await client.getCollection<{ id: string; displayName: string }>('/groups')

      expect(results).toHaveLength(2)
      expect(results[0].displayName).toBe('Group 1')
      expect(results[1].displayName).toBe('Group 2')
    })

    it('handles pagination with @odata.nextLink', async () => {
      let requestCount = 0

      server.use(
        http.get(`${GRAPH_BASE}/beta/groups`, () => {
          requestCount++
          if (requestCount === 1) {
            return HttpResponse.json({
              value: [{ id: '1' }],
              '@odata.nextLink': `${GRAPH_BASE}/beta/groups?$skiptoken=page2`,
            })
          }
          return HttpResponse.json({
            value: [{ id: '2' }],
          })
        })
      )

      const client = new GraphClient()
      const results = await client.getCollection<{ id: string }>('/groups')

      expect(requestCount).toBe(2)
      expect(results).toHaveLength(2)
      expect(results.map(r => r.id)).toEqual(['1', '2'])
    })

    it('handles empty collections', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/beta/empty`, () => {
          return HttpResponse.json({ value: [] })
        })
      )

      const client = new GraphClient()
      const results = await client.getCollection('/empty')

      expect(results).toEqual([])
    })
  })

  describe('post', () => {
    it('sends POST request with JSON body', async () => {
      let capturedBody: unknown = null

      server.use(
        http.post(`${GRAPH_BASE}/beta/groups`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ id: 'new-group-id' }, { status: 201 })
        })
      )

      const client = new GraphClient()
      const data = { displayName: 'New Group', mailEnabled: false }
      await client.post('/groups', data)

      expect(capturedBody).toEqual(data)
    })

    it('returns created resource', async () => {
      server.use(
        http.post(`${GRAPH_BASE}/beta/groups`, () => {
          return HttpResponse.json(
            { id: 'created-id', displayName: 'Created Group' },
            { status: 201 }
          )
        })
      )

      const client = new GraphClient()
      const result = await client.post<{ id: string; displayName: string }>(
        '/groups',
        { displayName: 'Created Group' }
      )

      expect(result.id).toBe('created-id')
      expect(result.displayName).toBe('Created Group')
    })

    it('throws on error response', async () => {
      server.use(
        http.post(`${GRAPH_BASE}/beta/groups`, () => {
          return HttpResponse.json(
            { error: { code: 'BadRequest', message: 'Invalid request body' } },
            { status: 400 }
          )
        })
      )

      const client = new GraphClient()

      await expect(client.post('/groups', {})).rejects.toThrow('Invalid request body')
    })
  })

  describe('patch', () => {
    it('sends PATCH request with JSON body', async () => {
      let capturedMethod = ''
      let capturedBody: unknown = null

      server.use(
        http.patch(`${GRAPH_BASE}/beta/groups/123`, async ({ request }) => {
          capturedMethod = request.method
          capturedBody = await request.json()
          return HttpResponse.json({ id: '123', displayName: 'Updated' })
        })
      )

      const client = new GraphClient()
      await client.patch('/groups/123', { displayName: 'Updated' })

      expect(capturedMethod).toBe('PATCH')
      expect(capturedBody).toEqual({ displayName: 'Updated' })
    })

    it('returns updated resource', async () => {
      server.use(
        http.patch(`${GRAPH_BASE}/beta/groups/456`, () => {
          return HttpResponse.json({ id: '456', displayName: 'New Name' })
        })
      )

      const client = new GraphClient()
      const result = await client.patch<{ id: string; displayName: string }>(
        '/groups/456',
        { displayName: 'New Name' }
      )

      expect(result.displayName).toBe('New Name')
    })
  })

  describe('delete', () => {
    it('sends DELETE request', async () => {
      let capturedMethod = ''

      server.use(
        http.delete(`${GRAPH_BASE}/beta/groups/789`, ({ request }) => {
          capturedMethod = request.method
          return new HttpResponse(null, { status: 204 })
        })
      )

      const client = new GraphClient()
      await client.delete('/groups/789')

      expect(capturedMethod).toBe('DELETE')
    })

    it('handles 204 No Content response', async () => {
      server.use(
        http.delete(`${GRAPH_BASE}/beta/groups/123`, () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      const client = new GraphClient()
      const result = await client.delete('/groups/123')

      expect(result).toEqual({})
    })

    it('throws on error response', async () => {
      server.use(
        http.delete(`${GRAPH_BASE}/beta/groups/999`, () => {
          return HttpResponse.json(
            { error: { code: 'NotFound', message: 'Group not found' } },
            { status: 404 }
          )
        })
      )

      const client = new GraphClient()

      await expect(client.delete('/groups/999')).rejects.toThrow('Group not found')
    })
  })

  describe('error handling', () => {
    it('handles malformed error response', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/beta/malformed`, () => {
          // Use 400 to avoid retry logic (only 429 and 5xx are retried)
          return new HttpResponse('Not JSON', { status: 400 })
        })
      )

      const client = new GraphClient()

      await expect(client.get('/malformed')).rejects.toThrow('Graph API error: 400')
    })

    it('handles network errors via retry logic', async () => {
      let callCount = 0

      server.use(
        http.get(`${GRAPH_BASE}/beta/retry-test`, () => {
          callCount++
          if (callCount < 2) {
            return HttpResponse.json(
              { error: { message: 'Service unavailable' } },
              { status: 503 }
            )
          }
          return HttpResponse.json({ success: true })
        })
      )

      const client = new GraphClient()
      const result = await client.get<{ success: boolean }>('/retry-test')

      expect(result.success).toBe(true)
      expect(callCount).toBe(2)
    })
  })

  describe('cloud environments', () => {
    it('uses US Gov endpoint', async () => {
      let requestUrl = ''

      server.use(
        http.get('https://graph.microsoft.us/beta/test', ({ request }) => {
          requestUrl = request.url
          return HttpResponse.json({ data: 'usgov' })
        })
      )

      const client = new GraphClient('usgov')
      await client.get('/test')

      expect(requestUrl).toContain('graph.microsoft.us')
    })

    it('uses China endpoint', async () => {
      let requestUrl = ''

      server.use(
        http.get('https://microsoftgraph.chinacloudapi.cn/beta/test', ({ request }) => {
          requestUrl = request.url
          return HttpResponse.json({ data: 'china' })
        })
      )

      const client = new GraphClient('china')
      await client.get('/test')

      expect(requestUrl).toContain('microsoftgraph.chinacloudapi.cn')
    })
  })

  describe('createGraphClient', () => {
    it('creates client with default environment', () => {
      const client = createGraphClient()
      expect(client).toBeInstanceOf(GraphClient)
    })

    it('creates client with specified environment', () => {
      const client = createGraphClient('germany')
      expect(client).toBeInstanceOf(GraphClient)
    })
  })
})
