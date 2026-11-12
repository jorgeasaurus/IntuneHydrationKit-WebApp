import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { TargetSelectionView } from '@/components/wizard/TargetSelectionView'
import { useTargetSelectionController } from '@/components/wizard/useTargetSelectionController'
import { SCOPE_PROFILES_STORAGE_KEY } from '@/lib/storageKeys'
import { addProfile, serializeProfilesExport, writeProfiles } from '@/lib/profiles/scopeProfiles'
import type { CISBaselineManifest, OIBManifest } from '@/lib/templates/loader'
import type { WizardState } from '@/types/hydration'

const setSelectedTargets = vi.fn()
const setSelectedCISCategories = vi.fn()
const setBaselineSelection = vi.fn()
const setCategorySelections = vi.fn()
const setConfirmed = vi.fn()
const setUpdateExisting = vi.fn()
const nextStep = vi.fn()
const previousStep = vi.fn()
const useWizardStateMock = vi.fn()
const fetchOIBManifestMock = vi.fn()
const fetchDynamicGroupsMock = vi.fn()
const fetchStaticGroupsMock = vi.fn()
const fetchFiltersMock = vi.fn()
const fetchNotificationTemplatesMock = vi.fn()
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
    fetchNotificationTemplates: (...args: unknown[]) => fetchNotificationTemplatesMock(...args),
    fetchCISBaselineManifest: (...args: unknown[]) => fetchCISBaselineManifestMock(...args),
  }
})

function jsonFile(contents: string, name: string, type = 'application/json'): File {
  const file = new File([contents], name, { type })
  Object.defineProperty(file, 'text', { value: async () => contents })
  return file
}

function Harness() {
  return <TargetSelectionView model={useTargetSelectionController()} />
}

const OIB_MANIFEST = {
  totalFiles: 1,
  platforms: [{ id: 'WINDOWS', name: 'Windows', count: 1 }],
  files: [{ path: 'windows/policy-1.json', platform: 'WINDOWS', policyType: 'Settings Catalog', displayName: 'Windows Baseline' }],
} as unknown as OIBManifest

const CIS_MANIFEST = {
  totalFiles: 1,
  categories: [{ id: 'cis-windows-11', folder: 'Windows 11 Benchmarks', name: 'Windows 11 Benchmarks', description: '', count: 1 }],
  files: [{ path: 'cis/windows/policy-1.json', category: 'Windows 11 Benchmarks', subcategory: 'Windows', displayName: 'Windows CIS' }],
} as unknown as CISBaselineManifest

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function renderWithState(overrides: Partial<WizardState> = {}) {
  useWizardStateMock.mockReturnValue({
    state: {
      currentStep: 3,
      isPreview: false,
      selectedTargets: [],
      selectedCISCategories: [],
      confirmed: false,
      operationMode: 'create',
      tenantConfig: {
        tenantId: '11111111-1111-1111-1111-111111111111',
        homeAccountId: 'home-account-secret',
        tenantName: 'Contoso Secret Tenant',
        cloudEnvironment: 'global',
      },
      ...overrides,
    } satisfies WizardState,
    setSelectedTargets,
    setSelectedCISCategories,
    setBaselineSelection,
    setCategorySelections,
    setConfirmed,
    setUpdateExisting,
    nextStep,
    previousStep,
  })
  return render(<Harness />)
}

describe('ScopeProfilesPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    fetchDynamicGroupsMock.mockResolvedValue([
      { displayName: 'Windows Devices', description: 'Windows', membershipRule: '(device.deviceOSType -eq "Windows")' },
    ])
    fetchStaticGroupsMock.mockResolvedValue([])
    fetchFiltersMock.mockResolvedValue([{ displayName: 'Windows Filter', description: 'Windows', platform: 'Windows', rule: '' }])
    fetchOIBManifestMock.mockResolvedValue(OIB_MANIFEST)
    fetchCISBaselineManifestMock.mockResolvedValue(null)
    fetchNotificationTemplatesMock.mockResolvedValue([{ displayName: 'First Warning', localizedMessages: [] }])
  })

  it('locks the selection and the step navigation while a profile applies', async () => {
    const user = userEvent.setup()
    const load = deferred<unknown[]>()
    fetchDynamicGroupsMock.mockReturnValue(load.promise)
    writeProfiles(localStorage, addProfile([], 'Groups', { targets: ['groups'], items: { groups: ['Windows Devices'] } }))
    renderWithState({
      selectedTargets: ['filters'],
      categorySelections: { filters: { selectedItems: ['Windows Filter'] } },
    })
    const review = screen.getByRole('button', { name: 'Review Selection' })
    expect(review).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Apply profile Groups' }))
    expect(review).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByLabelText('Device Filters')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Select All' })).toBeDisabled()
    expect(screen.getByText(/applying a scope profile\. Wait until it finishes/)).toBeInTheDocument()
    await user.click(review)
    expect(nextStep).not.toHaveBeenCalled()

    await act(async () => {
      load.resolve([{ displayName: 'Windows Devices', description: 'Windows', membershipRule: 'rule' }])
    })
    expect(await screen.findByText(/Applied profile "Groups"\./)).toBeInTheDocument()
    expect(review).toBeEnabled()
    expect(screen.queryByText(/applying a scope profile/)).not.toBeInTheDocument()
    await user.click(review)
    expect(setCategorySelections).toHaveBeenCalledWith({ groups: { selectedItems: ['Windows Devices'] } })
  })

  it('writes nothing when the step unmounts before the apply finishes', async () => {
    const load = deferred<unknown[]>()
    fetchDynamicGroupsMock.mockReturnValue(load.promise)
    renderWithState()
    const { result, unmount } = renderHook(() => useTargetSelectionController())
    let applied!: Promise<unknown>
    act(() => {
      applied = result.current.profiles.applySelection({ targets: ['groups'], items: { groups: ['Windows Devices'] } })
    })
    unmount()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    load.resolve([{ displayName: 'Windows Devices', description: 'Windows', membershipRule: 'rule' }])

    await expect(applied).resolves.toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
    expect(setSelectedTargets).not.toHaveBeenCalled()
    expect(setCategorySelections).not.toHaveBeenCalled()
    expect(nextStep).not.toHaveBeenCalled()
  })

  it('never stores or applies the update-existing choice', async () => {
    const user = userEvent.setup()
    writeProfiles(localStorage, addProfile([], 'Groups', { targets: ['groups'], items: { groups: ['Windows Devices'] } }))
    renderWithState({
      updateExisting: true,
      selectedTargets: ['groups'],
      categorySelections: { groups: { selectedItems: ['Windows Devices'] } },
    })

    await user.click(screen.getByRole('button', { name: 'Save selection as profile' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save selection as profile' })
    await user.type(within(dialog).getByLabelText('Profile name'), 'With update choice')
    await user.click(within(dialog).getByRole('button', { name: 'Save profile' }))
    expect(localStorage.getItem(SCOPE_PROFILES_STORAGE_KEY)).not.toMatch(/updateExisting|"update"|"mode"|confirmedCount/)

    await user.click(screen.getByRole('button', { name: 'Apply profile Groups' }))
    expect(await screen.findByText(/Applied profile "Groups"\./)).toBeInTheDocument()
    expect(setUpdateExisting).not.toHaveBeenCalled()
    expect(setConfirmed).not.toHaveBeenCalled()

    // A file that carries the choice is not a valid profile export.
    const exported = JSON.parse(serializeProfilesExport(addProfile([], 'Shared', { targets: ['groups'], items: { groups: ['Windows Devices'] } })))
    exported.profiles[0].selection.updateExisting = true
    await user.upload(screen.getByLabelText('Import scope profile file'), jsonFile(JSON.stringify(exported), 'profiles.json'))
    expect(await screen.findByText(/unknown fields/)).toBeInTheDocument()
  })

  it('saves and applies notification templates like any other category', async () => {
    const user = userEvent.setup()
    writeProfiles(
      localStorage,
      addProfile([], 'Notices', {
        targets: ['notification'],
        items: { notification: ['First Warning', 'Retired Warning'] },
      }),
    )
    renderWithState()

    await user.click(screen.getByRole('button', { name: 'Apply profile Notices' }))
    const dropped = await screen.findByRole('list', { name: 'Profile items not applied' })
    expect(within(dropped).getByText('Notification Templates: Retired Warning')).toBeInTheDocument()
    expect(screen.getByLabelText('Notification Templates')).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Review Selection' }))
    expect(setCategorySelections).toHaveBeenCalledWith({ notification: { selectedItems: ['First Warning'] } })

    await user.click(screen.getByRole('button', { name: 'Save selection as profile' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save selection as profile' })
    await user.type(within(dialog).getByLabelText('Profile name'), 'Notices again')
    await user.click(within(dialog).getByRole('button', { name: 'Save profile' }))
    const stored = JSON.parse(localStorage.getItem(SCOPE_PROFILES_STORAGE_KEY) ?? '{}')
    expect(stored.profiles[1].selection).toEqual({ targets: ['notification'], items: { notification: ['First Warning'] } })
  })

  it('waits for a CIS catalog load that is already running', async () => {
    const user = userEvent.setup()
    const cisLoad = deferred<CISBaselineManifest | null>()
    fetchCISBaselineManifestMock.mockReturnValue(cisLoad.promise)
    writeProfiles(localStorage, addProfile([], 'CIS', { targets: ['cisBaseline'], items: { cisBaseline: ['cis/windows/policy-1.json'] } }))
    renderWithState()

    // Selecting the category starts the CIS catalog load.
    await user.click(screen.getByLabelText('CIS Intune Baselines'))
    await user.click(screen.getByRole('button', { name: 'Apply profile CIS' }))
    cisLoad.resolve(CIS_MANIFEST)

    expect(await screen.findByText(/Applied profile "CIS"\. Review the selection/)).toBeInTheDocument()
    expect(screen.queryByText(/cannot load/)).not.toBeInTheDocument()
    expect(fetchCISBaselineManifestMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the applied scope when a category load that started earlier finishes later', async () => {
    const user = userEvent.setup()
    const lateLoad = deferred<unknown[]>()
    const groups = [
      { displayName: 'Windows Devices', description: 'Windows', membershipRule: 'rule' },
      { displayName: 'Mac Devices', description: 'macOS', membershipRule: 'rule' },
    ]
    fetchDynamicGroupsMock.mockReturnValueOnce(lateLoad.promise).mockResolvedValue(groups)
    writeProfiles(localStorage, addProfile([], 'Windows only', { targets: ['groups'], items: { groups: ['Windows Devices'] } }))
    renderWithState()

    // Selecting the category starts a load that selects every group when it finishes.
    await user.click(screen.getByLabelText('Entra Groups'))
    await user.click(screen.getByRole('button', { name: 'Apply profile Windows only' }))
    expect(await screen.findByText(/Applied profile "Windows only"\./)).toBeInTheDocument()

    lateLoad.resolve(groups)
    await waitFor(() => expect(screen.getByLabelText('Mac Devices')).toBeInTheDocument())
    expect(screen.getByLabelText('Mac Devices')).not.toBeChecked()
    expect(screen.getByLabelText('Windows Devices')).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Review Selection' }))
    expect(setCategorySelections).toHaveBeenCalledWith({ groups: { selectedItems: ['Windows Devices'] } })
  })

  it('saves the current selection without tenant data', async () => {
    const user = userEvent.setup()
    renderWithState({
      selectedTargets: ['groups', 'baseline'],
      categorySelections: {
        groups: { selectedItems: ['Windows Devices'] },
        baseline: { platforms: [], selectedPolicies: ['windows/policy-1.json'], excludedPolicies: [] },
      },
    })

    expect(screen.getByText('No saved profiles yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save selection as profile' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save selection as profile' })
    await user.type(within(dialog).getByLabelText('Profile name'), 'Windows baseline')
    await user.click(within(dialog).getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByRole('status', { name: '' })).toBeDefined()
    expect(screen.getByText('Saved profile "Windows baseline".')).toBeInTheDocument()
    const raw = localStorage.getItem(SCOPE_PROFILES_STORAGE_KEY) ?? ''
    expect(raw).toContain('Windows Devices')
    expect(raw).toContain('windows/policy-1.json')
    for (const secret of ['11111111-1111-1111-1111-111111111111', 'home-account-secret', 'Contoso Secret Tenant', 'operationMode', 'confirmed']) {
      expect(raw).not.toContain(secret)
    }
    expect(setConfirmed).not.toHaveBeenCalled()
  })

  it('applies a profile, lists dropped items, and does not skip review', async () => {
    const user = userEvent.setup()
    writeProfiles(
      localStorage,
      addProfile([], 'Old scope', {
        targets: ['groups', 'baseline', 'filters'],
        items: {
          groups: ['Windows Devices', 'Retired Group'],
          baseline: ['windows/policy-1.json', 'windows/removed.json'],
          filters: [],
        },
      }),
    )
    renderWithState()

    await user.click(screen.getByRole('button', { name: 'Apply profile Old scope' }))

    const dropped = await screen.findByRole('list', { name: 'Profile items not applied' })
    expect(within(dropped).getByText('Entra Groups: Retired Group')).toBeInTheDocument()
    expect(within(dropped).getByText('OpenIntuneBaseline: windows/removed.json')).toBeInTheDocument()
    expect(within(dropped).getByText(/Device Filters: the full category/)).toBeInTheDocument()
    expect(screen.getByText(/Applied profile "Old scope" with 3 items not applied/)).toBeInTheDocument()

    expect(screen.getByLabelText('Entra Groups')).toBeChecked()
    expect(screen.getByLabelText('OpenIntuneBaseline')).toBeChecked()
    expect(screen.getByLabelText('Device Filters')).not.toBeChecked()
    expect(nextStep).not.toHaveBeenCalled()
    expect(setConfirmed).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Review Selection' }))
    expect(setCategorySelections).toHaveBeenCalledWith({
      groups: { selectedItems: ['Windows Devices'] },
      baseline: { platforms: [], selectedPolicies: ['windows/policy-1.json'], excludedPolicies: [] },
    })
    expect(nextStep).toHaveBeenCalledTimes(1)
    expect(setConfirmed).not.toHaveBeenCalled()
  })

  it('keeps the selection when a catalog cannot load', async () => {
    const user = userEvent.setup()
    fetchCISBaselineManifestMock.mockResolvedValue(null)
    writeProfiles(localStorage, addProfile([], 'CIS', { targets: ['cisBaseline'], items: { cisBaseline: ['cis/a.json'] } }))
    renderWithState({
      selectedTargets: ['groups'],
      categorySelections: { groups: { selectedItems: ['Windows Devices'] } },
    })

    await user.click(screen.getByRole('button', { name: 'Apply profile CIS' }))
    expect(await screen.findByText(/cannot load the CIS .* catalog/)).toBeInTheDocument()
    expect(screen.getByLabelText('Entra Groups')).toBeChecked()
    expect(screen.queryByRole('list', { name: 'Profile items not applied' })).not.toBeInTheDocument()
  })

  it('renames and deletes a profile after confirmation', async () => {
    const user = userEvent.setup()
    writeProfiles(localStorage, addProfile([], 'First', { targets: ['groups'], items: { groups: ['Windows Devices'] } }))
    renderWithState()

    await user.click(screen.getByRole('button', { name: 'Rename profile First' }))
    const renameDialog = await screen.findByRole('dialog', { name: 'Rename profile' })
    const input = within(renameDialog).getByLabelText('Profile name')
    await user.clear(input)
    await user.type(input, 'Second')
    await user.click(within(renameDialog).getByRole('button', { name: 'Rename' }))
    expect(await screen.findByText('Second')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete profile Second' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete profile?' })
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Second')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete profile Second' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete profile?' })).getByRole('button', { name: 'Delete profile' }))
    expect(await screen.findByText('No saved profiles yet.')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(SCOPE_PROFILES_STORAGE_KEY) ?? '{}').profiles).toEqual([])
  })

  it('imports a valid file and rejects a bad file with a message', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderWithState()
    const input = screen.getByLabelText('Import scope profile file')

    await user.upload(input, jsonFile('{"format":"other"}', 'bad.json'))
    expect(await screen.findByText(/not a scope profile export/)).toBeInTheDocument()

    await user.upload(input, jsonFile('hello', 'notes.txt', 'text/plain'))
    expect(await screen.findByText(/Select a JSON profile file/)).toBeInTheDocument()

    const exported = serializeProfilesExport(
      addProfile([], 'Shared', { targets: ['groups'], items: { groups: ['Windows Devices'] } }),
    )
    await user.upload(input, jsonFile(exported, 'profiles.json'))
    expect(await screen.findByText('Imported 1 profile.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply profile Shared' })).toBeInTheDocument())
  })
})
