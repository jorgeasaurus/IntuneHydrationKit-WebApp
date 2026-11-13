import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import WizardPage from '@/app/wizard/page'
import { SettingsProvider } from '@/hooks/useSettings'
import { addProfile, writeProfiles } from '@/lib/profiles/scopeProfiles'

const setCurrentStep = vi.fn()
const fetchDynamicGroupsMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ accounts: [{ username: 'operator@contoso.com' }] }),
}))

vi.mock('@/lib/templates/loader', async () => {
  const actual = await vi.importActual('@/lib/templates/loader')
  return {
    ...actual,
    fetchDynamicGroups: (...args: unknown[]) => fetchDynamicGroupsMock(...args),
    fetchStaticGroups: async () => [],
  }
})

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => ({
    state: {
      currentStep: 3,
      tenantConfig: { tenantId: 'tenant-123', homeAccountId: 'home-1', tenantName: 'Contoso', cloudEnvironment: 'global' },
      operationMode: 'create',
      isPreview: true,
      selectedTargets: [],
      selectedCISCategories: [],
      confirmed: false,
    },
    setCurrentStep,
    setSelectedTargets: vi.fn(),
    setSelectedCISCategories: vi.fn(),
    setBaselineSelection: vi.fn(),
    setCategorySelections: vi.fn(),
    nextStep: vi.fn(),
    previousStep: vi.fn(),
  }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('wizard step navigation during a profile apply', () => {
  beforeEach(() => {
    localStorage.clear()
    setCurrentStep.mockReset()
  })

  it('pauses the sidebar steps with a reason until the apply finishes', async () => {
    const user = userEvent.setup()
    const load = deferred<unknown[]>()
    fetchDynamicGroupsMock.mockReturnValue(load.promise)
    writeProfiles(localStorage, addProfile([], 'Groups', { targets: ['groups'], items: { groups: ['Windows Devices'] } }))
    render(
      <SettingsProvider>
        <WizardPage />
      </SettingsProvider>,
    )
    const tenantStep = screen.getByRole('button', { name: /Tenant checkpoint/ })
    expect(tenantStep).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Apply profile Groups' }))
    expect(tenantStep).toBeDisabled()
    expect(tenantStep).toHaveAccessibleDescription('Step navigation is paused while the app applies a scope profile.')
    await user.click(tenantStep)
    expect(setCurrentStep).not.toHaveBeenCalled()

    await act(async () => {
      load.resolve([{ displayName: 'Windows Devices', description: 'Windows', membershipRule: 'rule' }])
    })
    expect(await screen.findByText(/Applied profile "Groups"\./)).toBeInTheDocument()
    expect(tenantStep).toBeEnabled()
    expect(screen.queryByText(/Step navigation is paused/)).not.toBeInTheDocument()
    await user.click(tenantStep)
    expect(setCurrentStep).toHaveBeenCalledWith(1)
  })
})
