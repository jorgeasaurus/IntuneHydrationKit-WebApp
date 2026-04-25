import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  loadTemplateDocumentationCatalog,
  loadTemplateDocumentationPayload,
} from '@/lib/templates/catalog'
import {
  fetchBaselinePolicyByManifestFile,
  fetchCISBaselinePolicyByManifestFile,
} from '@/lib/templates/loader'

vi.mock('@/lib/templates/loader', () => ({
  fetchDynamicGroups: vi.fn().mockResolvedValue([
    {
      displayName: '[IHD] Intune - Windows Devices',
      description: 'All Windows devices. Imported by Intune Hydration Kit',
      membershipRule: '(device.deviceOSType -eq "Windows")',
    },
  ]),
  fetchStaticGroups: vi.fn().mockResolvedValue([
    {
      displayName: '[IHD] Intune - Pilot Users',
      description: 'Pilot assignment group. Imported by Intune Hydration Kit',
    },
  ]),
  fetchFilters: vi.fn().mockResolvedValue([
    {
      displayName: '[IHD] Windows Corporate Devices',
      description: 'Windows corporate filter. Imported by Intune Hydration Kit',
      platform: 'Windows',
      rule: '(device.deviceOwnership -eq "Company")',
    },
  ]),
  fetchCompliancePolicies: vi.fn().mockResolvedValue([
    {
      '@odata.type': '#microsoft.graph.windows10CompliancePolicy',
      displayName: '[IHD] Windows Compliance Policy',
      description: 'Windows compliance. Imported by Intune Hydration Kit',
    },
  ]),
  fetchConditionalAccessPolicies: vi.fn().mockResolvedValue([
    {
      displayName: '[IHD] Require multifactor authentication for admins',
      state: 'disabled',
    },
  ]),
  fetchAppProtectionPolicies: vi.fn().mockResolvedValue([
    {
      '@odata.type': '#microsoft.graph.iosManagedAppProtection',
      displayName: '[IHD] iOS App Protection',
      description: 'iOS app protection. Imported by Intune Hydration Kit',
    },
  ]),
  fetchEnrollmentProfiles: vi.fn().mockResolvedValue([
    {
      '@odata.type': '#microsoft.graph.windowsAutopilotDeploymentProfile',
      displayName: '[IHD] Windows Autopilot Profile',
      description: 'Autopilot profile. Imported by Intune Hydration Kit',
    },
  ]),
  fetchNotificationTemplates: vi.fn().mockResolvedValue([
    {
      displayName: '[IHD] First Warning',
      brandingOptions: 'includeCompanyLogo',
    },
  ]),
  fetchOIBManifest: vi.fn().mockResolvedValue({
    totalFiles: 1,
    files: [
      {
        path: 'Windows/SettingsCatalog/Baseline.json',
        platform: 'WINDOWS',
        policyType: 'Settings Catalog',
        displayName: 'Baseline - Windows Hardening',
      },
    ],
  }),
  fetchCISBaselineManifest: vi.fn().mockResolvedValue({
    totalFiles: 1,
    categories: [
      {
        id: 'cis-windows-11',
        folder: '8.0 - Windows 11 Benchmarks',
        name: 'Windows 11 Benchmarks',
        description: 'Windows 11 benchmark templates',
        count: 1,
        subcategories: [],
      },
    ],
    files: [
      {
        path: '8.0 - Windows 11 Benchmarks/Baseline - Defender.json',
        category: '8.0 - Windows 11 Benchmarks',
        subcategory: 'Windows 11 - Intune Benchmarks',
        displayName: 'Baseline - Defender',
      },
    ],
  }),
  fetchBaselinePolicyByManifestFile: vi.fn().mockResolvedValue({
    displayName: '[IHD] Baseline - Windows Hardening',
  }),
  fetchCISBaselinePolicyByManifestFile: vi.fn().mockResolvedValue({
    displayName: '[IHD] Baseline - Defender',
  }),
}))

describe('template catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a catalog from loader-backed sources and manifests', async () => {
    const catalog = await loadTemplateDocumentationCatalog()

    expect(catalog.totalCount).toBe(10)
    expect(catalog.categories.find((category) => category.id === 'groups')?.count).toBe(2)
    expect(catalog.categories.find((category) => category.id === 'notification')?.count).toBe(1)
    expect(catalog.categories.find((category) => category.id === 'baseline')?.count).toBe(1)
    expect(catalog.categories.find((category) => category.id === 'cisBaseline')?.count).toBe(1)

    const baselineItem = catalog.items.find((item) => item.category === 'baseline')
    expect(baselineItem?.sourcePath).toBe('Windows/SettingsCatalog/Baseline.json')
    expect(baselineItem?.platform).toBe('Windows')

    const cisItem = catalog.items.find((item) => item.category === 'cisBaseline')
    expect(cisItem?.subcategory).toBe('Windows 11 - Intune Benchmarks')
    expect(cisItem?.description).toBe('Windows 11 benchmark templates')
  })

  it('returns inline payloads directly and defers manifest-backed payloads', async () => {
    const catalog = await loadTemplateDocumentationCatalog()

    const groupItem = catalog.items.find(
      (item) => item.displayName === '[IHD] Intune - Windows Devices'
    )
    const baselineItem = catalog.items.find((item) => item.category === 'baseline')
    const cisItem = catalog.items.find((item) => item.category === 'cisBaseline')

    const inlinePayload = await loadTemplateDocumentationPayload(groupItem!)
    const baselinePayload = await loadTemplateDocumentationPayload(baselineItem!)
    const cisPayload = await loadTemplateDocumentationPayload(cisItem!)

    expect(inlinePayload).toMatchObject({
      displayName: '[IHD] Intune - Windows Devices',
    })
    expect(fetchBaselinePolicyByManifestFile).toHaveBeenCalledOnce()
    expect(fetchCISBaselinePolicyByManifestFile).toHaveBeenCalledOnce()
    expect(baselinePayload).toMatchObject({
      displayName: '[IHD] Baseline - Windows Hardening',
    })
    expect(cisPayload).toMatchObject({
      displayName: '[IHD] Baseline - Defender',
    })
  })
})
