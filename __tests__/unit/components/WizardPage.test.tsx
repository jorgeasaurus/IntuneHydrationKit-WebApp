import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WizardPage from '@/app/wizard/page'
import { SettingsProvider } from '@/hooks/useSettings'

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
  TenantConfig: () => <div>Tenant checkpoint content</div>,
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => ({
    state: {
      currentStep: 1,
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

describe('WizardPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('blurs header and operator brief identities when Demo Mode is on', () => {
    localStorage.setItem(
      'app-settings:v1',
      JSON.stringify({ stopOnFirstError: false, demoMode: true })
    )

    render(
      <SettingsProvider>
        <WizardPage />
      </SettingsProvider>
    )

    expect(screen.getByText('operator@contoso.com')).toHaveClass('demo-sensitive-data')
    expect(screen.getByText('Contoso')).toHaveClass('demo-sensitive-data')
    expect(screen.getByText('tenant-123')).toHaveClass('demo-sensitive-data')
  })
})
