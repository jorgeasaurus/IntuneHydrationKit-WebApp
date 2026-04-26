import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, render, screen, waitFor, within } from '@/__tests__/setup/test-utils'
import { TargetSelection } from '@/components/wizard/TargetSelection'
import { IMPORT_PREFIX } from '@/lib/utils/hydrationMarker'
import type { CISBaselineManifest, OIBManifest } from '@/lib/templates/loader'
import type { WizardState } from '@/types/hydration'

const setSelectedTargets = vi.fn()
const setSelectedCISCategories = vi.fn()
const setBaselineSelection = vi.fn()
const setCategorySelections = vi.fn()
const nextStep = vi.fn()
const previousStep = vi.fn()

const useWizardStateMock = vi.fn()
const fetchOIBManifestMock = vi.fn()
const fetchDynamicGroupsMock = vi.fn()
const fetchStaticGroupsMock = vi.fn()
const fetchFiltersMock = vi.fn()
const fetchCompliancePoliciesMock = vi.fn()
const fetchConditionalAccessPoliciesMock = vi.fn()
const fetchAppProtectionPoliciesMock = vi.fn()
const fetchEnrollmentProfilesMock = vi.fn()
const fetchCISBaselineManifestMock = vi.fn()

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => useWizardStateMock(),
}))

vi.mock('@/lib/templates/loader', async () => {
  const actual = await vi.importActual('@/lib/templates/loader')

  return {
    ...actual,
    fetchOIBManifest: (...args: unknown[]) => fetchOIBManifestMock(...args),
    fetchDynamicGroups: (...args: unknown[]) => fetchDynamicGroupsMock(...args),
    fetchStaticGroups: (...args: unknown[]) => fetchStaticGroupsMock(...args),
    fetchFilters: (...args: unknown[]) => fetchFiltersMock(...args),
    fetchCompliancePolicies: (...args: unknown[]) => fetchCompliancePoliciesMock(...args),
    fetchConditionalAccessPolicies: (...args: unknown[]) => fetchConditionalAccessPoliciesMock(...args),
    fetchAppProtectionPolicies: (...args: unknown[]) => fetchAppProtectionPoliciesMock(...args),
    fetchEnrollmentProfiles: (...args: unknown[]) => fetchEnrollmentProfilesMock(...args),
    fetchCISBaselineManifest: (...args: unknown[]) => fetchCISBaselineManifestMock(...args),
  }
})

function createState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    currentStep: 3,
    isPreview: true,
    selectedTargets: [],
    selectedCISCategories: [],
    confirmed: false,
    operationMode: 'create',
    ...overrides,
  }
}

function createOIBManifest(): OIBManifest {
  return {
    version: '1.0.0',
    generatedAt: '2026-04-27T00:00:00.000Z',
    totalFiles: 2,
    platforms: [
      {
        id: 'WINDOWS',
        name: 'Windows',
        count: 1,
        policyTypes: [{ type: 'Settings Catalog', description: 'Settings', count: 1 }],
      },
      {
        id: 'MACOS',
        name: 'macOS',
        count: 1,
        policyTypes: [{ type: 'Settings Catalog', description: 'Settings', count: 1 }],
      },
    ],
    files: [
      {
        path: 'windows/policy-1.json',
        platform: 'WINDOWS',
        policyType: 'Settings Catalog',
        displayName: 'Windows Baseline',
      },
      {
        path: 'macos/policy-1.json',
        platform: 'MACOS',
        policyType: 'Settings Catalog',
        displayName: 'macOS Baseline',
      },
    ],
  }
}

function createCISManifest(): CISBaselineManifest {
  return {
    version: '1.0.0',
    generatedAt: '2026-04-27T00:00:00.000Z',
    totalFiles: 2,
    categories: [
      {
        id: 'cis-windows-11',
        folder: 'Windows 11 Benchmarks',
        name: 'Windows 11 Benchmarks',
        description: 'Windows hardening',
        count: 1,
        subcategories: [{ name: 'Windows', count: 1 }],
      },
      {
        id: 'cis-apple',
        folder: 'Apple Benchmarks',
        name: 'Apple Benchmarks',
        description: 'Apple hardening',
        count: 1,
        subcategories: [{ name: 'Apple', count: 1 }],
      },
    ],
    files: [
      {
        path: 'cis/windows/policy-1.json',
        category: 'Windows 11 Benchmarks',
        subcategory: 'Windows',
        displayName: 'Windows CIS Benchmark',
      },
      {
        path: 'cis/apple/policy-1.json',
        category: 'Apple Benchmarks',
        subcategory: 'Apple',
        displayName: 'Apple CIS Benchmark',
      },
    ],
  }
}

function getCategoryRegion(heading: string) {
  const label = screen.getByText(heading)
  const region = label.closest('div')?.parentElement?.parentElement

  if (!region) {
    throw new Error(`Unable to locate region for ${heading}`)
  }

  return region
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('TargetSelection', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    fetchDynamicGroupsMock.mockResolvedValue([
      {
        displayName: `${IMPORT_PREFIX}Windows Devices`,
        description: 'Windows device group',
        membershipRule: '(device.deviceOSType -contains "Windows")',
      },
      {
        displayName: `${IMPORT_PREFIX}Mac Devices`,
        description: 'macOS device group',
        membershipRule: '(device.deviceOSType -contains "Mac")',
      },
    ])
    fetchStaticGroupsMock.mockResolvedValue([])
    fetchFiltersMock.mockResolvedValue([
      {
        displayName: `${IMPORT_PREFIX}Windows Filter`,
        description: 'Windows only filter',
        platform: 'Windows',
        rule: '(device.osVersion -contains "Windows")',
      },
      {
        displayName: `${IMPORT_PREFIX}Android Filter`,
        description: 'Android only filter',
        platform: 'Android',
        rule: '(device.osVersion -contains "Android")',
      },
    ])
    fetchCompliancePoliciesMock.mockResolvedValue([
      {
        '@odata.type': '#microsoft.graph.windows10CompliancePolicy',
        displayName: `${IMPORT_PREFIX}Windows Compliance`,
        description: 'Windows compliance policy',
      },
      {
        '@odata.type': '#microsoft.graph.linuxCompliancePolicy',
        displayName: `${IMPORT_PREFIX}Linux Compliance`,
        description: 'Linux compliance policy',
      },
    ])
    fetchConditionalAccessPoliciesMock.mockResolvedValue([
      { displayName: `${IMPORT_PREFIX}Require MFA`, state: 'disabled', conditions: {}, grantControls: {}, sessionControls: {} },
    ])
    fetchAppProtectionPoliciesMock.mockResolvedValue([
      {
        '@odata.type': '#microsoft.graph.iosManagedAppProtection',
        displayName: `${IMPORT_PREFIX}iOS App Protection`,
        description: 'iOS policy',
      },
    ])
    fetchEnrollmentProfilesMock.mockResolvedValue([
      { displayName: `${IMPORT_PREFIX}Windows Autopilot`, description: 'Windows enrollment profile' },
    ])
    fetchOIBManifestMock.mockResolvedValue(createOIBManifest())
    fetchCISBaselineManifestMock.mockResolvedValue(createCISManifest())

    useWizardStateMock.mockReturnValue({
      state: createState(),
      setSelectedTargets,
      setSelectedCISCategories,
      setBaselineSelection,
      setCategorySelections,
      nextStep,
      previousStep,
    })
  })

  it('restores persisted item selections and supports navigating back', async () => {
    const user = userEvent.setup()

    useWizardStateMock.mockReturnValue({
      state: createState({
        categorySelections: {
          groups: { selectedItems: [`${IMPORT_PREFIX}Windows Devices`] },
          baseline: { platforms: [], selectedPolicies: ['windows/policy-1.json'], excludedPolicies: [] },
          cisBaseline: { selectedItems: ['cis/windows/policy-1.json'] },
        },
      }),
      setSelectedTargets,
      setSelectedCISCategories,
      setBaselineSelection,
      setCategorySelections,
      nextStep,
      previousStep,
    })

    render(<TargetSelection />)

    await user.click(screen.getByLabelText('Entra Groups'))
    expect(await screen.findByLabelText(`${IMPORT_PREFIX}Windows Devices`)).toBeChecked()

    await user.click(screen.getByLabelText('OpenIntuneBaseline'))
    await waitFor(() => expect(fetchOIBManifestMock).toHaveBeenCalled())
    await user.click(within(getCategoryRegion('Select OpenIntuneBaseline Policies')).getByText('Windows'))
    expect(await screen.findByLabelText('Windows Baseline')).toBeChecked()

    await user.click(screen.getByLabelText('CIS Intune Baselines'))
    await waitFor(() => expect(fetchCISBaselineManifestMock).toHaveBeenCalled())
    await user.click(within(getCategoryRegion('Select CIS Benchmark Policies')).getByText('Windows 11 Benchmarks'))
    expect(await screen.findByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark`)).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(previousStep).toHaveBeenCalledTimes(1)
  })

  it('applies the Windows platform filter to matching categories, baseline, and CIS manifests', async () => {
    const user = userEvent.setup()

    render(<TargetSelection />)

    await user.click(screen.getByLabelText('Windows'))

    await waitFor(() => {
      expect(fetchDynamicGroupsMock).toHaveBeenCalled()
      expect(fetchFiltersMock).toHaveBeenCalled()
      expect(fetchCompliancePoliciesMock).toHaveBeenCalled()
      expect(fetchEnrollmentProfilesMock).toHaveBeenCalled()
      expect(fetchOIBManifestMock).toHaveBeenCalled()
      expect(fetchCISBaselineManifestMock).toHaveBeenCalled()
    })

    expect(screen.getByLabelText('Entra Groups')).toBeChecked()
    expect(screen.getByLabelText('Device Filters')).toBeChecked()
    expect(screen.getByLabelText('OpenIntuneBaseline')).toBeChecked()
    expect(screen.getByLabelText('Compliance Policies')).toBeChecked()
    expect(screen.getByLabelText('Enrollment Profiles')).toBeChecked()
    expect(screen.getByLabelText('CIS Intune Baselines')).toBeChecked()
    expect(screen.getByLabelText('App Protection')).not.toBeChecked()

    expect(await screen.findByText('Total: 6 categories (6 items)')).toBeInTheDocument()

    await user.click(within(getCategoryRegion('Select OpenIntuneBaseline Policies')).getByText('Windows'))
    expect(await screen.findByLabelText('Windows Baseline')).toBeChecked()

    await user.click(within(getCategoryRegion('Select CIS Benchmark Policies')).getByText('Windows 11 Benchmarks'))
    expect(await screen.findByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark`)).toBeChecked()
  })

  it('persists non-baseline selections and skips the baseline step on continue', async () => {
    const user = userEvent.setup()

    useWizardStateMock.mockReturnValue({
      state: createState({
        selectedTargets: ['groups'],
        categorySelections: {
          groups: { selectedItems: [`${IMPORT_PREFIX}Windows Devices`] },
        },
      }),
      setSelectedTargets,
      setSelectedCISCategories,
      setBaselineSelection,
      setCategorySelections,
      nextStep,
      previousStep,
    })

    render(<TargetSelection />)

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(setSelectedTargets).toHaveBeenCalledWith(['groups'])
    expect(setSelectedCISCategories).toHaveBeenCalledWith([])
    expect(setCategorySelections).toHaveBeenCalledWith({
      groups: { selectedItems: [`${IMPORT_PREFIX}Windows Devices`] },
    })
    expect(setBaselineSelection).not.toHaveBeenCalled()
    expect(nextStep).toHaveBeenCalledTimes(2)
  })

  it('loads baseline policies, validates empty selections, and saves baseline choices on continue', async () => {
    const user = userEvent.setup()

    render(<TargetSelection />)

    await user.click(screen.getByLabelText('OpenIntuneBaseline'))
    await waitFor(() => expect(fetchOIBManifestMock).toHaveBeenCalled())

    const baselineRegion = getCategoryRegion('Select OpenIntuneBaseline Policies')

    await user.click(within(baselineRegion).getByRole('button', { name: 'None' }))
    expect(await screen.findByText('Please select at least one baseline policy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await user.click(within(baselineRegion).getByRole('button', { name: 'All' }))

    await waitFor(() => {
      expect(screen.queryByText('Please select at least one baseline policy')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(setSelectedTargets).toHaveBeenCalledWith(['baseline'])
    expect(setBaselineSelection).toHaveBeenCalledWith({
      platforms: [],
      selectedPolicies: ['windows/policy-1.json', 'macos/policy-1.json'],
      excludedPolicies: [],
    })
    expect(setCategorySelections).toHaveBeenCalledWith({
      baseline: {
        platforms: [],
        selectedPolicies: ['windows/policy-1.json', 'macos/policy-1.json'],
        excludedPolicies: [],
      },
    })
    expect(nextStep).toHaveBeenCalledTimes(1)
  })

  it('supports item-level group selection plus search-aware select and deselect actions', async () => {
    const user = userEvent.setup()

    render(<TargetSelection />)

    await user.click(screen.getByLabelText('Entra Groups'))
    const windowsGroup = await screen.findByLabelText(`${IMPORT_PREFIX}Windows Devices`)
    const groupsRegion = getCategoryRegion('Select Entra Groups')

    expect(windowsGroup).toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Mac Devices`)).toBeChecked()

    await user.click(windowsGroup)
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows Devices`)).not.toBeChecked()

    await user.click(within(groupsRegion).getByRole('button', { name: 'None' }))
    expect(await screen.findByText('Please select at least one entra group')).toBeInTheDocument()

    await user.click(within(groupsRegion).getByRole('button', { name: 'All' }))
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows Devices`)).toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Mac Devices`)).toBeChecked()

    await user.type(screen.getByPlaceholderText('Search categories and policies...'), 'mac')
    expect(screen.queryByLabelText(`${IMPORT_PREFIX}Windows Devices`)).not.toBeInTheDocument()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Mac Devices`)).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Deselect All' }))
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Mac Devices`)).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Select All' }))
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Mac Devices`)).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows Devices`)).toBeChecked()
  })

  it('filters baseline and CIS manifests by search and only clears matching policies', async () => {
    const user = userEvent.setup()

    render(<TargetSelection />)

    await user.click(screen.getByLabelText('OpenIntuneBaseline'))
    await user.click(screen.getByLabelText('CIS Intune Baselines'))

    await waitFor(() => {
      expect(fetchOIBManifestMock).toHaveBeenCalled()
      expect(fetchCISBaselineManifestMock).toHaveBeenCalled()
    })

    await user.type(screen.getByPlaceholderText('Search categories and policies...'), 'windows')

    const baselineRegion = getCategoryRegion('Select OpenIntuneBaseline Policies')
    expect(within(baselineRegion).queryByText('macOS')).not.toBeInTheDocument()
    await user.click(within(baselineRegion).getByText('Windows'))
    expect(await screen.findByLabelText('Windows Baseline')).toBeChecked()
    expect(screen.queryByLabelText('macOS Baseline')).not.toBeInTheDocument()

    const cisRegion = getCategoryRegion('Select CIS Benchmark Policies')
    expect(within(cisRegion).queryByText('Apple Benchmarks')).not.toBeInTheDocument()
    await user.click(within(cisRegion).getByText('Windows 11 Benchmarks'))
    expect(await screen.findByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark`)).toBeChecked()
    expect(screen.queryByLabelText(`${IMPORT_PREFIX}Apple CIS Benchmark`)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Deselect All' }))

    await waitFor(() => {
      expect(screen.queryByText('Please select at least one baseline policy')).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    await user.click(within(baselineRegion).getByText('macOS'))
    await user.click(within(cisRegion).getByText('Apple Benchmarks'))

    expect(await screen.findByLabelText('macOS Baseline')).toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Apple CIS Benchmark`)).toBeChecked()
    expect(screen.getByLabelText('Windows Baseline')).not.toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark`)).not.toBeChecked()
  })

  it('selects every category by default and clears all selections globally', async () => {
    const user = userEvent.setup()

    render(<TargetSelection />)

    await user.click(screen.getByRole('button', { name: 'Select All' }))

    await waitFor(() => {
      expect(fetchOIBManifestMock).toHaveBeenCalled()
      expect(fetchCISBaselineManifestMock).toHaveBeenCalled()
    })

    expect(screen.getByText('Total: 8 categories (13 items)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Deselect All' }))

    await waitFor(() => {
      expect(screen.queryByText('Total: 8 categories (13 items)')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    })
  })

  it('shows generic loading and empty states and clears an empty search result', async () => {
    const user = userEvent.setup()
    const dynamicGroupsDeferred = createDeferred<
      Array<{ displayName: string; description?: string; membershipRule?: string }>
    >()

    fetchDynamicGroupsMock.mockReturnValueOnce(dynamicGroupsDeferred.promise)
    fetchStaticGroupsMock.mockResolvedValueOnce([])

    render(<TargetSelection />)

    await user.click(screen.getByLabelText('Entra Groups'))
    expect(await screen.findByText('Loading entra groups...')).toBeInTheDocument()

    dynamicGroupsDeferred.resolve([])

    expect(await screen.findByText('No items available.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Search categories and policies...'), 'no-match-value')
    expect(await screen.findByText('No categories or policies match "no-match-value"')).toBeInTheDocument()

    await user.click(screen.getByText('Clear search'))
    await waitFor(() => {
      expect(screen.queryByText('No categories or policies match "no-match-value"')).not.toBeInTheDocument()
    })
  })

  it('shows baseline and CIS loading states while manifests are pending', async () => {
    const user = userEvent.setup()
    const baselineDeferred = createDeferred<OIBManifest>()
    const cisDeferred = createDeferred<CISBaselineManifest>()

    fetchOIBManifestMock.mockReturnValueOnce(baselineDeferred.promise)
    fetchCISBaselineManifestMock.mockReturnValueOnce(cisDeferred.promise)

    render(<TargetSelection />)

    await user.click(screen.getByLabelText('OpenIntuneBaseline'))
    await user.click(screen.getByLabelText('CIS Intune Baselines'))

    expect(await screen.findByText('Loading baseline policies...')).toBeInTheDocument()
    expect(await screen.findByText('Loading CIS policies...')).toBeInTheDocument()

    await act(async () => {
      baselineDeferred.resolve(createOIBManifest())
      cisDeferred.resolve(createCISManifest())
    })

    const baselineRegion = getCategoryRegion('Select OpenIntuneBaseline Policies')
    const cisRegion = getCategoryRegion('Select CIS Benchmark Policies')

    await user.click(within(baselineRegion).getByText('Windows'))
    await user.click(within(cisRegion).getByText('Windows 11 Benchmarks'))

    expect(await screen.findByLabelText('Windows Baseline')).toBeChecked()
    expect(await screen.findByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark`)).toBeChecked()
  })

  it('toggles baseline platforms between partial, full, and empty selection states', async () => {
    const user = userEvent.setup()

    fetchOIBManifestMock.mockResolvedValueOnce({
      version: '2.0.0',
      generatedAt: '2026-04-27T00:00:00.000Z',
      totalFiles: 3,
      platforms: [
        {
          id: 'WINDOWS',
          name: 'Windows',
          count: 2,
          policyTypes: [{ type: 'Settings Catalog', description: 'Settings', count: 2 }],
        },
        {
          id: 'MACOS',
          name: 'macOS',
          count: 1,
          policyTypes: [{ type: 'Settings Catalog', description: 'Settings', count: 1 }],
        },
      ],
      files: [
        {
          path: 'windows/policy-1.json',
          platform: 'WINDOWS',
          policyType: 'Settings Catalog',
          displayName: 'Windows Security Baseline',
        },
        {
          path: 'windows/policy-2.json',
          platform: 'WINDOWS',
          policyType: 'Administrative Templates',
          displayName: 'Windows Defender Baseline',
        },
        {
          path: 'macos/policy-1.json',
          platform: 'MACOS',
          policyType: 'Settings Catalog',
          displayName: 'macOS Baseline',
        },
      ],
    })

    render(<TargetSelection />)

    await user.click(screen.getByLabelText('OpenIntuneBaseline'))
    await waitFor(() => expect(fetchOIBManifestMock).toHaveBeenCalled())

    const baselineRegion = getCategoryRegion('Select OpenIntuneBaseline Policies')

    await user.click(within(baselineRegion).getByText('Windows'))
    expect(await screen.findByLabelText('Windows Security Baseline')).toBeChecked()
    expect(screen.getByLabelText('Windows Defender Baseline')).toBeChecked()

    await user.click(screen.getByLabelText('Windows Security Baseline'))
    expect(screen.getByText('1 of 2 policies selected')).toBeInTheDocument()

    const windowsBaselineCheckbox = document.getElementById('platform-WINDOWS')

    if (!(windowsBaselineCheckbox instanceof HTMLElement)) {
      throw new Error('Expected Windows baseline checkbox to be rendered')
    }

    await user.click(windowsBaselineCheckbox)
    expect(screen.getByLabelText('Windows Security Baseline')).toBeChecked()
    expect(screen.getByLabelText('Windows Defender Baseline')).toBeChecked()

    await user.click(windowsBaselineCheckbox)
    expect(screen.getByLabelText('Windows Security Baseline')).not.toBeChecked()
    expect(screen.getByLabelText('Windows Defender Baseline')).not.toBeChecked()
    expect(screen.getByText('0 of 2 policies selected')).toBeInTheDocument()
  })

  it('toggles CIS categories between partial, full, and empty selection states', async () => {
    const user = userEvent.setup()

    fetchCISBaselineManifestMock.mockResolvedValueOnce({
      version: '2.0.0',
      generatedAt: '2026-04-27T00:00:00.000Z',
      totalFiles: 3,
      categories: [
        {
          id: 'cis-windows-11',
          folder: 'Windows 11 Benchmarks',
          name: 'Windows 11 Benchmarks',
          description: 'Windows hardening',
          count: 2,
          subcategories: [{ name: 'Windows', count: 2 }],
        },
        {
          id: 'cis-apple',
          folder: 'Apple Benchmarks',
          name: 'Apple Benchmarks',
          description: 'Apple hardening',
          count: 1,
          subcategories: [{ name: 'Apple', count: 1 }],
        },
      ],
      files: [
        {
          path: 'cis/windows/policy-1.json',
          category: 'Windows 11 Benchmarks',
          subcategory: 'Windows',
          displayName: 'Windows CIS Benchmark 1',
        },
        {
          path: 'cis/windows/policy-2.json',
          category: 'Windows 11 Benchmarks',
          subcategory: 'Windows',
          displayName: 'Windows CIS Benchmark 2',
        },
        {
          path: 'cis/apple/policy-1.json',
          category: 'Apple Benchmarks',
          subcategory: 'Apple',
          displayName: 'Apple CIS Benchmark',
        },
      ],
    })

    render(<TargetSelection />)

    await user.click(screen.getByLabelText('CIS Intune Baselines'))
    await waitFor(() => expect(fetchCISBaselineManifestMock).toHaveBeenCalled())

    const cisRegion = getCategoryRegion('Select CIS Benchmark Policies')

    await user.click(within(cisRegion).getByText('Windows 11 Benchmarks'))
    expect(await screen.findByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark 1`)).toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark 2`)).toBeChecked()

    await user.click(screen.getByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark 1`))
    expect(screen.getByText('1 of 2 policies selected')).toBeInTheDocument()

    const windowsCISCategoryCheckbox = document.getElementById('cis-cat-Windows 11 Benchmarks')

    if (!(windowsCISCategoryCheckbox instanceof HTMLElement)) {
      throw new Error('Expected Windows CIS category checkbox to be rendered')
    }

    await user.click(windowsCISCategoryCheckbox)
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark 1`)).toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark 2`)).toBeChecked()

    await user.click(windowsCISCategoryCheckbox)
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark 1`)).not.toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark 2`)).not.toBeChecked()
    expect(screen.getByText('0 of 2 policies selected')).toBeInTheDocument()
  })

  it('removes only the deselected platform filter matches while keeping remaining platform selections', async () => {
    const user = userEvent.setup()

    fetchDynamicGroupsMock.mockResolvedValueOnce([
      {
        displayName: `${IMPORT_PREFIX}Windows Devices`,
        description: 'Windows device group',
        membershipRule: '(device.deviceOSType -contains "Windows")',
      },
      {
        displayName: `${IMPORT_PREFIX}Mac Devices`,
        description: 'macOS device group',
        membershipRule: '(device.deviceOSType -contains "Mac")',
      },
      {
        displayName: `${IMPORT_PREFIX}Cross Platform Devices`,
        description: 'Windows and macOS device group',
        membershipRule: '(device.deviceOSType -contains "Windows") or (device.deviceOSType -contains "Mac")',
      },
    ])
    fetchCISBaselineManifestMock.mockResolvedValueOnce({
      version: '1.0.0',
      generatedAt: '2026-04-27T00:00:00.000Z',
      totalFiles: 2,
      categories: [
        {
          id: 'cis-windows-11',
          folder: 'Windows 11 Benchmarks',
          name: 'Windows 11 Benchmarks',
          description: 'Windows hardening',
          count: 1,
          subcategories: [{ name: 'Windows', count: 1 }],
        },
        {
          id: 'cis-apple',
          folder: 'macOS Benchmarks',
          name: 'macOS Benchmarks',
          description: 'macOS hardening',
          count: 1,
          subcategories: [{ name: 'macOS', count: 1 }],
        },
      ],
      files: [
        {
          path: 'cis/windows/policy-1.json',
          category: 'Windows 11 Benchmarks',
          subcategory: 'Windows',
          displayName: 'Windows CIS Benchmark',
        },
        {
          path: 'cis/macos/policy-1.json',
          category: 'macOS Benchmarks',
          subcategory: 'macOS',
          displayName: 'macOS CIS Benchmark',
        },
      ],
    })

    render(<TargetSelection />)

    const windowsPlatformFilter = document.getElementById('platform-filter-windows')
    const macosPlatformFilter = document.getElementById('platform-filter-macos')

    if (!(windowsPlatformFilter instanceof HTMLElement) || !(macosPlatformFilter instanceof HTMLElement)) {
      throw new Error('Expected platform filter checkboxes to be rendered')
    }

    await user.click(windowsPlatformFilter)
    await user.click(macosPlatformFilter)

    await waitFor(() => {
      expect(fetchDynamicGroupsMock).toHaveBeenCalled()
      expect(fetchOIBManifestMock).toHaveBeenCalled()
      expect(fetchCISBaselineManifestMock).toHaveBeenCalled()
    })

    await user.click(windowsPlatformFilter)

    expect(await screen.findByLabelText(`${IMPORT_PREFIX}Mac Devices`)).toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Cross Platform Devices`)).toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}Windows Devices`)).not.toBeChecked()

    await user.click(within(getCategoryRegion('Select OpenIntuneBaseline Policies')).getByText('Windows'))
    await user.click(within(getCategoryRegion('Select OpenIntuneBaseline Policies')).getByText('macOS'))
    expect(await screen.findByLabelText('Windows Baseline')).not.toBeChecked()
    expect(screen.getByLabelText('macOS Baseline')).toBeChecked()

    await user.click(within(getCategoryRegion('Select CIS Benchmark Policies')).getByText('Windows 11 Benchmarks'))
    await user.click(within(getCategoryRegion('Select CIS Benchmark Policies')).getByText('macOS Benchmarks'))
    expect(await screen.findByLabelText(`${IMPORT_PREFIX}Windows CIS Benchmark`)).not.toBeChecked()
    expect(screen.getByLabelText(`${IMPORT_PREFIX}macOS CIS Benchmark`)).toBeChecked()
  })
})
