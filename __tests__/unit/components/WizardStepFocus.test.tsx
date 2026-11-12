import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import WizardPage from '@/app/wizard/page'
import { SettingsProvider } from '@/hooks/useSettings'

const wizard = vi.hoisted(() => ({ currentStep: 1 }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ accounts: [{ username: 'operator@contoso.com' }] }),
}))

vi.mock('@/components/wizard/TenantConfig', () => ({
  TenantConfig: () => <button type="button">Continue</button>,
}))

vi.mock('@/components/wizard/OperationMode', () => ({
  OperationModeSelection: () => <div>Operation mode content</div>,
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => ({
    state: {
      currentStep: wizard.currentStep,
      tenantConfig: {
        tenantId: 'tenant-123',
        tenantName: 'Contoso',
        cloudEnvironment: 'global',
      },
      operationMode: undefined,
      isPreview: true,
      selectedTargets: [],
      selectedCISCategories: [],
      confirmed: false,
      categorySelections: undefined,
      prerequisiteResult: undefined,
    },
    setCurrentStep: vi.fn(),
  }),
}))

function renderWizard() {
  return render(
    <SettingsProvider>
      <WizardPage />
    </SettingsProvider>
  )
}

describe('WizardPage step focus', () => {
  beforeEach(() => {
    wizard.currentStep = 1
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks the current step with aria-current and keeps focus on first render', () => {
    renderWizard()

    const current = screen.getByRole('button', { name: /Tenant checkpoint/ })
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: /Execution mode/ })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('heading', { level: 2, name: 'Tenant checkpoint' })).not.toHaveFocus()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('moves focus to the new step heading and announces the step', () => {
    const { rerender } = renderWizard()

    screen.getByRole('button', { name: 'Continue' }).focus()
    wizard.currentStep = 2
    rerender(
      <SettingsProvider>
        <WizardPage />
      </SettingsProvider>
    )

    const heading = screen.getByRole('heading', { level: 2, name: 'Execution mode' })
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(heading).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 4: Execution mode')
    expect(screen.getByRole('button', { name: /Execution mode/ })).toHaveAttribute('aria-current', 'step')
  })
})
