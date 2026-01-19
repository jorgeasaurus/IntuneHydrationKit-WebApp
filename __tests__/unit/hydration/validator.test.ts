import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../setup/msw-handlers'
import {
  validateTenant,
  quickConnectivityTest,
  getTenantInfo,
} from '@/lib/hydration/validator'
import { GraphClient } from '@/lib/graph/client'

// Mock the auth module
vi.mock('@/lib/auth/authUtils', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}))

const GRAPH_BASE = 'https://graph.microsoft.com'

describe('validator', () => {
  let client: GraphClient

  beforeEach(() => {
    client = new GraphClient('global')
    vi.clearAllMocks()
  })

  describe('validateTenant', () => {
    it('returns valid when all checks pass', async () => {
      server.use(
        // Organization endpoint for connectivity
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({
            value: [{ id: 'tenant-id', displayName: 'Test Tenant' }],
          })
        }),
        // Subscribed SKUs for licenses
        http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
          return HttpResponse.json({
            value: [
              { skuPartNumber: 'INTUNE_A', servicePlans: [] },
              { skuPartNumber: 'SPE_E3', servicePlans: [] },
            ],
          })
        }),
        // User info for permissions
        http.get(`${GRAPH_BASE}/v1.0/me`, () => {
          return HttpResponse.json({
            id: 'user-id',
            userPrincipalName: 'admin@test.com',
          })
        }),
        // Device configurations for permission check
        http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () => {
          return HttpResponse.json({ value: [] })
        }),
        // Groups for permission check
        http.get(`${GRAPH_BASE}/v1.0/groups`, () => {
          return HttpResponse.json({ value: [] })
        }),
        // Conditional access for permission check
        http.get(`${GRAPH_BASE}/beta/identity/conditionalAccess/policies`, () => {
          return HttpResponse.json({ value: [] })
        }),
        // User roles
        http.get(`${GRAPH_BASE}/v1.0/me/memberOf/$/microsoft.graph.directoryRole`, () => {
          return HttpResponse.json({
            value: [
              { displayName: 'Global Administrator', roleTemplateId: 'abc123' },
            ],
          })
        })
      )

      const result = await validateTenant(client)

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.checks.connectivity.passed).toBe(true)
      expect(result.checks.licenses.passed).toBe(true)
      expect(result.checks.permissions.passed).toBe(true)
      expect(result.checks.role.passed).toBe(true)
    })

    it('detects missing Intune license', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({ value: [{ id: 'tenant-id' }] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
          return HttpResponse.json({
            value: [{ skuPartNumber: 'EXCHANGESTANDARD', servicePlans: [] }],
          })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me`, () => {
          return HttpResponse.json({ id: 'user-id' })
        }),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/groups`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/beta/identity/conditionalAccess/policies`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me/memberOf/$/microsoft.graph.directoryRole`, () => {
          return HttpResponse.json({
            value: [{ displayName: 'Global Administrator' }],
          })
        })
      )

      const result = await validateTenant(client)

      expect(result.isValid).toBe(false)
      expect(result.checks.licenses.passed).toBe(false)
      expect(result.checks.licenses.message).toContain('No Intune license found')
    })

    it('detects various Intune license types', async () => {
      const licenseTypes = ['INTUNE_A', 'EMS', 'SPE_E3', 'SPE_E5', 'O365_BUSINESS_PREMIUM']

      for (const license of licenseTypes) {
        server.use(
          http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
            return HttpResponse.json({ value: [{ id: 'tenant-id' }] })
          }),
          http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
            return HttpResponse.json({
              value: [{ skuPartNumber: license, servicePlans: [] }],
            })
          }),
          http.get(`${GRAPH_BASE}/v1.0/me`, () => {
            return HttpResponse.json({ id: 'user-id' })
          }),
          http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () => {
            return HttpResponse.json({ value: [] })
          }),
          http.get(`${GRAPH_BASE}/v1.0/groups`, () => {
            return HttpResponse.json({ value: [] })
          }),
          http.get(`${GRAPH_BASE}/beta/identity/conditionalAccess/policies`, () => {
            return HttpResponse.json({ value: [] })
          }),
          http.get(`${GRAPH_BASE}/v1.0/me/memberOf/$/microsoft.graph.directoryRole`, () => {
            return HttpResponse.json({
              value: [{ displayName: 'Global Administrator' }],
            })
          })
        )

        const result = await validateTenant(client)
        expect(result.checks.licenses.passed).toBe(true)
        server.resetHandlers()
      }
    })

    it('warns when Windows E3/E5 is missing', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({ value: [{ id: 'tenant-id' }] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
          return HttpResponse.json({
            value: [{ skuPartNumber: 'INTUNE_A', servicePlans: [] }],
          })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me`, () => {
          return HttpResponse.json({ id: 'user-id' })
        }),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/groups`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/beta/identity/conditionalAccess/policies`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me/memberOf/$/microsoft.graph.directoryRole`, () => {
          return HttpResponse.json({
            value: [{ displayName: 'Global Administrator' }],
          })
        })
      )

      const result = await validateTenant(client)

      expect(result.warnings).toContain(
        'Windows E3/E5 license not detected. Driver update profiles will not be available.'
      )
      expect(result.checks.licenses.details?.hasWindowsE3OrHigher).toBe(false)
    })

    it('detects Windows E3/E5 license', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({ value: [{ id: 'tenant-id' }] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
          return HttpResponse.json({
            value: [
              { skuPartNumber: 'INTUNE_A', servicePlans: [] },
              { skuPartNumber: 'WIN10_VDA_E5', servicePlans: [] },
            ],
          })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me`, () => {
          return HttpResponse.json({ id: 'user-id' })
        }),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/groups`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/beta/identity/conditionalAccess/policies`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me/memberOf/$/microsoft.graph.directoryRole`, () => {
          return HttpResponse.json({
            value: [{ displayName: 'Global Administrator' }],
          })
        })
      )

      const result = await validateTenant(client)

      expect(result.warnings).not.toContain(
        'Windows E3/E5 license not detected. Driver update profiles will not be available.'
      )
      expect(result.checks.licenses.details?.hasWindowsE3OrHigher).toBe(true)
    })

    it('detects missing permissions', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({ value: [{ id: 'tenant-id' }] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
          return HttpResponse.json({
            value: [{ skuPartNumber: 'INTUNE_A', servicePlans: [] }],
          })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me`, () => {
          return HttpResponse.json({ id: 'user-id' })
        }),
        // This endpoint fails - simulating missing permission
        http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () => {
          return HttpResponse.json(
            { error: { code: 'Forbidden', message: 'Insufficient privileges' } },
            { status: 403 }
          )
        }),
        http.get(`${GRAPH_BASE}/v1.0/groups`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/beta/identity/conditionalAccess/policies`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me/memberOf/$/microsoft.graph.directoryRole`, () => {
          return HttpResponse.json({
            value: [{ displayName: 'Global Administrator' }],
          })
        })
      )

      const result = await validateTenant(client)

      expect(result.isValid).toBe(false)
      expect(result.checks.permissions.passed).toBe(false)
      expect(result.checks.permissions.missingPermissions).toContain(
        'DeviceManagementConfiguration.ReadWrite.All'
      )
    })

    it('detects user without admin role', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({ value: [{ id: 'tenant-id' }] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
          return HttpResponse.json({
            value: [{ skuPartNumber: 'INTUNE_A', servicePlans: [] }],
          })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me`, () => {
          return HttpResponse.json({ id: 'user-id' })
        }),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/groups`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/beta/identity/conditionalAccess/policies`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me/memberOf/$/microsoft.graph.directoryRole`, () => {
          return HttpResponse.json({
            value: [{ displayName: 'User' }],
          })
        })
      )

      const result = await validateTenant(client)

      expect(result.isValid).toBe(false)
      expect(result.checks.role.passed).toBe(false)
      expect(result.checks.role.message).toContain(
        'User must have Global Administrator or Intune Administrator role'
      )
    })

    it('accepts Intune Administrator role', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({ value: [{ id: 'tenant-id' }] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
          return HttpResponse.json({
            value: [{ skuPartNumber: 'INTUNE_A', servicePlans: [] }],
          })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me`, () => {
          return HttpResponse.json({ id: 'user-id' })
        }),
        http.get(`${GRAPH_BASE}/beta/deviceManagement/deviceConfigurations`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/groups`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/beta/identity/conditionalAccess/policies`, () => {
          return HttpResponse.json({ value: [] })
        }),
        http.get(`${GRAPH_BASE}/v1.0/me/memberOf/$/microsoft.graph.directoryRole`, () => {
          return HttpResponse.json({
            value: [{ displayName: 'Intune Administrator' }],
          })
        })
      )

      const result = await validateTenant(client)

      expect(result.checks.role.passed).toBe(true)
      expect(result.checks.role.message).toContain('Intune Administrator role')
    })

    it('handles connectivity failure', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json(
            { error: { message: 'Unauthorized' } },
            { status: 401 }
          )
        }),
        // Still need to mock other endpoints as they run in parallel
        http.get(`${GRAPH_BASE}/v1.0/subscribedSkus`, () => {
          return HttpResponse.json(
            { error: { message: 'Unauthorized' } },
            { status: 401 }
          )
        }),
        http.get(`${GRAPH_BASE}/v1.0/me`, () => {
          return HttpResponse.json(
            { error: { message: 'Unauthorized' } },
            { status: 401 }
          )
        }),
        http.get(`${GRAPH_BASE}/v1.0/me/memberOf/$/microsoft.graph.directoryRole`, () => {
          return HttpResponse.json(
            { error: { message: 'Unauthorized' } },
            { status: 401 }
          )
        })
      )

      const result = await validateTenant(client)

      expect(result.isValid).toBe(false)
      expect(result.checks.connectivity.passed).toBe(false)
      expect(result.checks.connectivity.message).toContain('Failed to connect')
    })
  })

  describe('quickConnectivityTest', () => {
    it('returns true when API is reachable', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({ value: [{ id: 'tenant-id' }] })
        })
      )

      const result = await quickConnectivityTest(client)
      expect(result).toBe(true)
    })

    it('returns false when API is not reachable', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json(
            { error: { message: 'Unauthorized' } },
            { status: 401 }
          )
        })
      )

      const result = await quickConnectivityTest(client)
      expect(result).toBe(false)
    })
  })

  describe('getTenantInfo', () => {
    it('returns tenant information from wrapped response', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({
            value: [
              {
                id: 'tenant-123',
                displayName: 'Contoso',
                verifiedDomains: [
                  { name: 'contoso.onmicrosoft.com', isDefault: true },
                  { name: 'contoso.com', isDefault: false },
                ],
              },
            ],
          })
        })
      )

      const info = await getTenantInfo(client)

      expect(info.tenantId).toBe('tenant-123')
      expect(info.displayName).toBe('Contoso')
      expect(info.verifiedDomains).toEqual(['contoso.onmicrosoft.com', 'contoso.com'])
    })

    it('returns tenant information from direct response', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({
            id: 'tenant-456',
            displayName: 'Direct Corp',
            verifiedDomains: [{ name: 'direct.com', isDefault: true }],
          })
        })
      )

      const info = await getTenantInfo(client)

      expect(info.tenantId).toBe('tenant-456')
      expect(info.displayName).toBe('Direct Corp')
      expect(info.verifiedDomains).toEqual(['direct.com'])
    })

    it('handles empty verifiedDomains array', async () => {
      server.use(
        http.get(`${GRAPH_BASE}/v1.0/organization`, () => {
          return HttpResponse.json({
            value: [{
              id: 'tenant-empty',
              displayName: 'Empty Domains',
              verifiedDomains: [],
            }],
          })
        })
      )

      const info = await getTenantInfo(client)

      expect(info.tenantId).toBe('tenant-empty')
      expect(info.displayName).toBe('Empty Domains')
      expect(info.verifiedDomains).toEqual([])
    })
  })
})
