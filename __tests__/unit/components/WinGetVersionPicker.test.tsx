import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor, within } from '@testing-library/react'
import { TargetSelectionView } from '@/components/wizard/TargetSelectionView'
import { useTargetSelectionController } from '@/components/wizard/useTargetSelectionController'
import { WinGetVersionsReview } from '@/components/wizard/WinGetVersionsReview'
import { WINGET_VERSION_CATALOG_URL } from '@/lib/winget/versionCatalog'
import { getWin32AppTemplates } from '@/templates/win32Apps'
import type { WizardState } from '@/types/hydration'

const setSelectedTargets = vi.fn()
const setSelectedCISCategories = vi.fn()
const setBaselineSelection = vi.fn()
const setCategorySelections = vi.fn()
const nextStep = vi.fn()
const previousStep = vi.fn()
const useWizardStateMock = vi.fn()

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => useWizardStateMock(),
}))

const catalogText = readFileSync(join(process.cwd(), 'public/winget-versions.json'), 'utf8')
const catalog = JSON.parse(catalogText)
const sevenZipVersions: string[] = catalog.apps
  .find((app: { templateId: string }) => app.templateId === '7-zip')
  .versions.map((version: { version: string }) => version.version)

const SEVEN_ZIP = '7-Zip - [IHD]'
const NOTEPAD = 'Notepad++ - [IHD]'
const DEFAULT_APPS = [
  SEVEN_ZIP,
  'Google Chrome - [IHD]',
  'Mozilla Firefox - [IHD]',
  'Visual Studio Code - [IHD]',
  'Autopilot Branding (Cleanup) - [IHD]',
]

function Harness() {
  return <TargetSelectionView model={useTargetSelectionController()} />
}

function mockWizard(state: Partial<WizardState>) {
  useWizardStateMock.mockReturnValue({
    state: {
      currentStep: 3,
      isPreview: true,
      selectedTargets: [],
      selectedCISCategories: [],
      confirmed: false,
      operationMode: 'create',
      ...state,
    },
    setSelectedTargets,
    setSelectedCISCategories,
    setBaselineSelection,
    setCategorySelections,
    nextStep,
    previousStep,
  })
}

async function openWin32Apps(user: ReturnType<typeof userEvent.setup>) {
  const expand = screen.queryByRole('button', { name: 'Expand Win32 Apps' })
  if (expand) await user.click(expand)
}

describe('WinGet version picker in the Win32 apps list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === WINGET_VERSION_CATALOG_URL ? new Response(catalogText) : new Response(null, { status: 404 }),
    ))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('selects the default apps but no opt-in WinGet catalog app when the category is turned on', async () => {
    const user = userEvent.setup()
    mockWizard({})
    render(<Harness />)

    await user.click(screen.getByLabelText('Win32 Apps'))
    expect(await screen.findByLabelText(SEVEN_ZIP)).toBeChecked()
    for (const name of DEFAULT_APPS) expect(screen.getByLabelText(name)).toBeChecked()
    expect(screen.getByLabelText(NOTEPAD)).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Review Selection' }))
    expect(setCategorySelections.mock.calls[0][0].win32Apps).toEqual({ selectedItems: DEFAULT_APPS })
  })

  it('selects every app, opt-in apps included, with the category All button', async () => {
    const user = userEvent.setup()
    mockWizard({})
    render(<Harness />)

    await user.click(screen.getByLabelText('Win32 Apps'))
    expect(await screen.findByLabelText(NOTEPAD)).not.toBeChecked()

    const region = screen.getByLabelText(NOTEPAD).closest('.rounded-b-md') as HTMLElement
    await user.click(within(region).getByRole('button', { name: 'All' }))
    expect(screen.getByLabelText(NOTEPAD)).toBeChecked()
    for (const name of DEFAULT_APPS) expect(screen.getByLabelText(name)).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Review Selection' }))
    const selected = setCategorySelections.mock.calls[0][0].win32Apps.selectedItems as string[]
    expect(selected).toHaveLength(getWin32AppTemplates().length)
    expect(selected).toContain(NOTEPAD)
  })

  it('offers Latest and the catalog versions, labels older versions Best effort, and keeps the choice', async () => {
    const user = userEvent.setup()
    mockWizard({ selectedTargets: ['win32Apps'], categorySelections: { win32Apps: { selectedItems: [SEVEN_ZIP] } } })
    render(<Harness />)
    await openWin32Apps(user)

    const picker = await screen.findByRole('combobox', { name: 'Version of 7-Zip' })
    await waitFor(() => expect(within(picker).getAllByRole('option')).toHaveLength(sevenZipVersions.length + 1))
    const labels = within(picker).getAllByRole('option').map((option) => option.textContent)
    expect(labels[0]).toBe('Latest')
    expect(labels[1]).toBe(sevenZipVersions[0])
    expect(labels.slice(2)).toEqual(sevenZipVersions.slice(1).map((version) => `${version} (Best effort)`))
    expect(picker).toHaveValue('')
    // Only a selected WinGet app has a picker; Autopilot Branding never has one.
    expect(screen.queryByRole('combobox', { name: 'Version of Google Chrome' })).not.toBeInTheDocument()

    picker.focus()
    expect(picker).toHaveFocus()
    await user.selectOptions(picker, sevenZipVersions[1])
    expect(picker).toHaveValue(sevenZipVersions[1])

    // An opt-in app selected one at a time gets a picker too.
    await user.click(screen.getByLabelText(NOTEPAD))
    expect(await screen.findByRole('combobox', { name: 'Version of Notepad++' })).toHaveValue('')

    expect(screen.getByText(/Best effort: an older version/)).toBeInTheDocument()
    expect(screen.getByText(/To change the version of an existing app, delete it and create it again/)).toBeInTheDocument()
    expect(screen.getByText(/Not offered, because the newest version in the catalog has no machine-scope x64 installer: .*Windows Terminal/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Review Selection' }))
    expect(setCategorySelections.mock.calls[0][0].win32Apps).toEqual({
      selectedItems: [SEVEN_ZIP, NOTEPAD],
      wingetVersions: { '7-zip': sevenZipVersions[1] },
    })
  })

  it('drops the version of an app that is not selected any more', async () => {
    const user = userEvent.setup()
    mockWizard({
      selectedTargets: ['win32Apps'],
      categorySelections: { win32Apps: { selectedItems: [SEVEN_ZIP, NOTEPAD], wingetVersions: { '7-zip': sevenZipVersions[0] } } },
    })
    render(<Harness />)
    await openWin32Apps(user)
    expect(await screen.findByRole('combobox', { name: 'Version of 7-Zip' })).toHaveValue(sevenZipVersions[0])

    await user.click(screen.getByLabelText(SEVEN_ZIP))
    await user.click(screen.getByRole('button', { name: 'Review Selection' }))
    expect(setCategorySelections.mock.calls[0][0].win32Apps).toEqual({ selectedItems: [NOTEPAD] })
  })

  it('shows no picker in delete mode', async () => {
    const user = userEvent.setup()
    mockWizard({ operationMode: 'delete', selectedTargets: ['win32Apps'], categorySelections: { win32Apps: { selectedItems: [SEVEN_ZIP] } } })
    render(<Harness />)
    await openWin32Apps(user)

    expect(await screen.findByLabelText(SEVEN_ZIP)).toBeChecked()
    expect(screen.queryByRole('combobox', { name: 'Version of 7-Zip' })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps a pinned version visible when it is not in the catalog', async () => {
    const user = userEvent.setup()
    mockWizard({
      selectedTargets: ['win32Apps'],
      categorySelections: { win32Apps: { selectedItems: [SEVEN_ZIP], wingetVersions: { '7-zip': '1.0' } } },
    })
    render(<Harness />)
    await openWin32Apps(user)
    const picker = await screen.findByRole('combobox', { name: 'Version of 7-Zip' })
    await waitFor(() => expect(within(picker).getByRole('option', { name: '1.0 (not in the catalog: the app will fail)' })).toBeInTheDocument())
    expect(picker).toHaveValue('1.0')
  })
})

describe('WinGetVersionsReview', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(catalogText)))
  })
  afterEach(() => vi.unstubAllGlobals())

  const state = (overrides: Partial<WizardState> = {}): WizardState => ({
    currentStep: 4,
    isPreview: false,
    confirmed: false,
    operationMode: 'create',
    selectedTargets: ['win32Apps'],
    selectedCISCategories: [],
    categorySelections: {
      win32Apps: {
        selectedItems: [SEVEN_ZIP, 'Google Chrome - [IHD]'],
        wingetVersions: { '7-zip': sevenZipVersions[1], 'google-chrome': '1.0' },
      },
    },
    ...overrides,
  })

  it('lists the pinned apps with Best effort and catalog labels', async () => {
    render(<WinGetVersionsReview state={state()} />)

    const region = screen.getByRole('region', { name: 'WinGet apps with a pinned version (2)' })
    const items = within(region).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent(`7-Zip${sevenZipVersions[1]}`)
    expect(await within(items[0]).findByText('Best effort')).toBeInTheDocument()
    expect(await within(items[1]).findByText('Not in the catalog: the app will fail')).toBeInTheDocument()
    expect(region).toHaveTextContent(/delete it and create it again/)
  })

  it('shows nothing for a delete run or a run without pinned versions', () => {
    const { container, rerender } = render(<WinGetVersionsReview state={state({ operationMode: 'delete' })} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<WinGetVersionsReview state={state({ categorySelections: { win32Apps: { selectedItems: [SEVEN_ZIP] } } })} />)
    expect(container).toBeEmptyDOMElement()
  })
})
