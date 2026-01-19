import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { mockOrganization, mockLicenses, mockUser, mockUserRoles } from './mock-data'

const GRAPH_BASE = 'https://graph.microsoft.com'

export const handlers = [
  // Organization info
  http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
    return HttpResponse.json({
      value: [mockOrganization],
    })
  }),

  // Subscribed SKUs (licenses)
  http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
    return HttpResponse.json({
      value: mockLicenses,
    })
  }),

  // Current user
  http.get(`${GRAPH_BASE}/v1.0/me`, () => {
    return HttpResponse.json(mockUser)
  }),

  // User roles
  http.get(`${GRAPH_BASE}/v1.0/me/memberOf`, () => {
    return HttpResponse.json({
      value: mockUserRoles,
    })
  }),

  // Groups
  http.get(`${GRAPH_BASE}/v1.0/groups`, ({ request }) => {
    const url = new URL(request.url)
    const filter = url.searchParams.get('$filter')
    return HttpResponse.json({
      value: [],
    })
  }),

  http.post(`${GRAPH_BASE}/v1.0/groups`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: crypto.randomUUID(),
      ...body,
    }, { status: 201 })
  }),

  // Device filters
  http.get(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, () => {
    return HttpResponse.json({
      value: [],
    })
  }),

  http.post(`${GRAPH_BASE}/beta/deviceManagement/assignmentFilters`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: crypto.randomUUID(),
      ...body,
    }, { status: 201 })
  }),

  // Compliance policies
  http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceCompliancePolicies`, () => {
    return HttpResponse.json({
      value: [],
    })
  }),

  http.post(`${GRAPH_BASE}/beta/deviceManagement/deviceCompliancePolicies`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: crypto.randomUUID(),
      ...body,
    }, { status: 201 })
  }),

  // Conditional Access policies
  http.get(`${GRAPH_BASE}/v1.0/identity/conditionalAccess/policies`, () => {
    return HttpResponse.json({
      value: [],
    })
  }),

  http.post(`${GRAPH_BASE}/v1.0/identity/conditionalAccess/policies`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: crypto.randomUUID(),
      ...body,
    }, { status: 201 })
  }),

  // App protection policies
  http.get(`${GRAPH_BASE}/beta/deviceAppManagement/managedAppPolicies`, () => {
    return HttpResponse.json({
      value: [],
    })
  }),

  // Device configurations (for connectivity test)
  http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, ({ request }) => {
    const url = new URL(request.url)
    const top = url.searchParams.get('$top')
    return HttpResponse.json({
      value: [],
    })
  }),
]

export const server = setupServer(...handlers)

// Helper to add custom handlers for specific tests
export function addHandler(handler: ReturnType<typeof http.get | typeof http.post>) {
  server.use(handler)
}

// Common error responses
export const errorHandlers = {
  unauthorized: http.get(`${GRAPH_BASE}/*`, () => {
    return HttpResponse.json(
      { error: { code: 'Unauthorized', message: 'Invalid token' } },
      { status: 401 }
    )
  }),

  forbidden: http.get(`${GRAPH_BASE}/*`, () => {
    return HttpResponse.json(
      { error: { code: 'Forbidden', message: 'Insufficient privileges' } },
      { status: 403 }
    )
  }),

  tooManyRequests: http.get(`${GRAPH_BASE}/*`, () => {
    return HttpResponse.json(
      { error: { code: 'TooManyRequests', message: 'Rate limit exceeded' } },
      { status: 429, headers: { 'Retry-After': '5' } }
    )
  }),

  serverError: http.get(`${GRAPH_BASE}/*`, () => {
    return HttpResponse.json(
      { error: { code: 'InternalServerError', message: 'Server error' } },
      { status: 500 }
    )
  }),
}
