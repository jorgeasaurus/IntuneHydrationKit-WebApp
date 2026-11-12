import { describe, expect, it } from 'vitest'
import { getPortalLink } from '@/lib/utils/portalLinks'
import type { CloudEnvironment, TaskCategory } from '@/types/hydration'

const base = { cloud: 'global' as const, objectId: 'abc-123', objectName: 'All Windows Devices' }

describe('getPortalLink', () => {
  it.each([
    ['groups', 'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/abc-123', 'Open in Entra admin center'],
    ['conditionalAccess', 'https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/abc-123', 'Open in Entra admin center'],
    ['win32Apps', 'https://intune.microsoft.com/#view/Microsoft_Intune_Apps/SettingsMenu/~/0/appId/abc-123', 'Open in Intune'],
  ] as const)('links %s to the created object', (category, href, label) => {
    expect(getPortalLink({ ...base, category })).toEqual({
      href,
      label,
      accessibleName: `${label}: All Windows Devices`,
      target: 'object',
    })
  })

  it.each([
    ['filters', 'https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/assignmentFilters', 'Open Assignment filters in Intune'],
    ['compliance', 'https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesComplianceMenu/~/policies', 'Open Compliance policies in Intune'],
  ] as const)('links %s to the list, with a label that names the list', (category, href, label) => {
    const link = getPortalLink({ ...base, category })
    expect(link).toEqual({
      href,
      label,
      accessibleName: `${label} (list that contains All Windows Devices)`,
      target: 'list',
    })
    expect(link?.href).not.toContain('abc-123')
  })

  it.each([
    ['SettingsCatalog', 'https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration'],
    ['DeviceConfiguration', 'https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration'],
    ['CompliancePolicies', 'https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesComplianceMenu/~/policies'],
  ])('links baseline policy type %s to its list', (policyType, href) => {
    expect(getPortalLink({ ...base, category: 'baseline', policyType })).toMatchObject({ href, target: 'list' })
  })

  it.each(['AppProtection', 'UpdatePolicies', 'DriverUpdateProfiles', undefined])(
    'returns null for baseline policy type %s',
    (policyType) => {
      expect(getPortalLink({ ...base, category: 'baseline', policyType })).toBeNull()
    },
  )

  it.each<TaskCategory>(['appProtection', 'enrollment', 'notification', 'cisBaseline'])(
    'returns null for %s, which has no known route',
    (category) => {
      expect(getPortalLink({ ...base, category })).toBeNull()
    },
  )

  it('returns null without an object ID', () => {
    expect(getPortalLink({ ...base, category: 'groups', objectId: '' })).toBeNull()
  })

  it('returns null for a cloud without a known portal origin', () => {
    expect(getPortalLink({ ...base, cloud: 'usgov' as CloudEnvironment, category: 'groups' })).toBeNull()
  })

  it('encodes the object ID in the route', () => {
    expect(getPortalLink({ ...base, category: 'groups', objectId: 'a/b#c' })?.href).toMatch(/groupId\/a%2Fb%23c$/)
  })
})
