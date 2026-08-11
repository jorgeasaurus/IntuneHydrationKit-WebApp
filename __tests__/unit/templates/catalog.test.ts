import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    totalFiles: 2,
    platforms: [
      {
        id: 'WINDOWS',
        name: 'Windows',
        count: 1,
        policyTypes: [],
      },
      {
        id: 'BYOD',
        name: 'BYOD (Bring Your Own Device)',
        count: 1,
        policyTypes: [],
      },
    ],
    files: [
      {
        path: 'Windows/SettingsCatalog/Baseline.json',
        platform: 'WINDOWS',
        policyType: 'Settings Catalog',
        displayName: 'Baseline - Windows Hardening',
      },
      {
        path: 'BYOD/AppProtection/Android - Baseline - BYOD - App Protection.json',
        platform: 'BYOD',
        policyType: 'AppProtection',
        displayName: 'Android - Baseline - BYOD - App Protection',
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
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        const operation = url.includes('/Install-') ? 'Install' : 'Uninstall'
        return Promise.resolve(
          new Response(
            `$packageIdentifier = '7zip.7zip'\n${operation}-WinGetPackage $packageIdentifier`,
            { status: 200 }
          )
        )
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds a catalog from loader-backed sources and manifests', async () => {
    const catalog = await loadTemplateDocumentationCatalog()

    expect(catalog.totalCount).toBe(15)
    expect(catalog.categories.find((category) => category.id === 'groups')?.count).toBe(2)
    expect(catalog.categories.find((category) => category.id === 'notification')?.count).toBe(1)
    expect(catalog.categories.find((category) => category.id === 'win32Apps')?.count).toBe(4)
    expect(catalog.categories.find((category) => category.id === 'baseline')?.count).toBe(2)
    expect(catalog.categories.find((category) => category.id === 'cisBaseline')?.count).toBe(1)

    const baselineItem = catalog.items.find(
      (item) => item.sourcePath === 'Windows/SettingsCatalog/Baseline.json'
    )
    expect(baselineItem?.sourcePath).toBe('Windows/SettingsCatalog/Baseline.json')
    expect(baselineItem?.platform).toBe('Windows')

    const byodItem = catalog.items.find(
      (item) =>
        item.sourcePath === 'BYOD/AppProtection/Android - Baseline - BYOD - App Protection.json'
    )
    expect(byodItem?.platform).toBe('BYOD (Bring Your Own Device)')

    const cisItem = catalog.items.find((item) => item.category === 'cisBaseline')
    expect(cisItem?.subcategory).toBe('Windows 11 - Intune Benchmarks')
    expect(cisItem?.description).toBe('Windows 11 benchmark templates')

    const win32Items = catalog.items.filter((item) => item.category === 'win32Apps')
    expect(win32Items.map((item) => item.displayName)).toEqual([
      '7-Zip - [IHD]',
      'Google Chrome - [IHD]',
      'Mozilla Firefox - [IHD]',
      'Visual Studio Code - [IHD]',
    ])

    const win32Item = win32Items.find((item) => item.displayName === '7-Zip - [IHD]')
    expect(win32Item).toMatchObject({
      displayName: '7-Zip - [IHD]',
      itemType: 'Windows app (Win32)',
      platform: 'Windows',
      sourcePath: '/win32-apps/7-zip.intunewin',
      subcategory: 'WinGet Package',
    })

    await expect(loadTemplateDocumentationPayload(win32Item!)).resolves.toMatchObject({
      packageIdentifier: '7zip.7zip',
      setupFilePath: 'Install-WinGetPackage.ps1',
      installScriptContent: expect.stringContaining('Install-WinGetPackage'),
      uninstallScriptContent: expect.stringContaining('Uninstall-WinGetPackage'),
    })
    expect(fetch).toHaveBeenNthCalledWith(1, '/win32-apps/7-zip/Install-WinGetPackage.ps1')
    expect(fetch).toHaveBeenNthCalledWith(2, '/win32-apps/7-zip/Uninstall-WinGetPackage.ps1')
  })

  it('identifies a Win32 script asset that cannot be loaded', async () => {
    const catalog = await loadTemplateDocumentationCatalog()
    const win32Item = catalog.items.find(
      (item) => item.displayName === 'Google Chrome - [IHD]'
    )
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 404, statusText: 'Not Found' }))
      .mockResolvedValueOnce(new Response('uninstall', { status: 200 }))

    await expect(loadTemplateDocumentationPayload(win32Item!)).rejects.toThrow(
      'Unable to load the Win32 install script from /win32-apps/google-chrome/Install-WinGetPackage.ps1: 404 Not Found'
    )
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
