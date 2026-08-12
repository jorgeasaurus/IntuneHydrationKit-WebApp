import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@testing-library/react'
import { TenantConfig } from '@/components/wizard/TenantConfig'
import { SettingsProvider } from '@/hooks/useSettings'
import { WizardProvider, useWizardState } from '@/hooks/useWizardState'
import type { PrerequisiteCheckResult } from '@/types/prerequisites'

const validatePrerequisites = vi.fn()
const createGraphClient = vi.fn()
const { MockAuthSessionExpiredError } = vi.hoisted(() => ({
  MockAuthSessionExpiredError: class extends Error {},
}))

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    accounts: [{ tenantId: 'tenant-123', username: 'operator@contoso.com' }],
    instance: { getActiveAccount: () => ({ tenantId: 'tenant-123', homeAccountId: 'home-tenant-123', username: 'operator@contoso.com' }) },
  }),
}))

vi.mock('@/lib/graph/client', () => ({
  createGraphClient: (...args: unknown[]) => createGraphClient(...args),
}))

vi.mock('@/lib/graph/prerequisites', () => ({
  validatePrerequisites: (...args: unknown[]) => validatePrerequisites(...args),
}))

vi.mock('@/lib/auth/authUtils', async () => {
  const actual = await vi.importActual('@/lib/auth/authUtils')
  return {
    ...actual,
    AuthSessionExpiredError: MockAuthSessionExpiredError,
  }
})

function WizardHarness() {
  const { state, setCurrentStep } = useWizardState()

  return (
    <>
      {state.currentStep === 1 ? (
        <>
          <TenantConfig />
          <button type="button" onClick={() => setCurrentStep(2)}>
            Jump to operation mode
          </button>
        </>
      ) : null}
      {state.currentStep === 2 ? (
        <button type="button" onClick={() => setCurrentStep(1)}>
          Back to tenant checkpoint
        </button>
      ) : null}
    </>
  )
}

function TenantConfigHarness() {
  return (
    <SettingsProvider>
      <WizardProvider>
        <WizardHarness />
      </WizardProvider>
    </SettingsProvider>
  )
}

describe('TenantConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('keeps the health checklist state when navigating away and back', async () => {
    const prerequisiteResult: PrerequisiteCheckResult = {
      organization: {
        // Graph's organization id IS the tenant GUID - must match the mocked
        // account tenantId, otherwise the stale-tenant check re-validates
        id: 'tenant-123',
        displayName: 'Contoso',
      },
      licenses: {
        hasIntuneLicense: true,
        hasConditionalAccessLicense: true,
        hasPremiumP2License: true,
        hasWindowsDriverUpdateLicense: true,
        intuneServicePlans: ['INTUNE_A'],
        conditionalAccessServicePlans: ['AAD_PREMIUM'],
        premiumP2ServicePlans: ['AAD_PREMIUM_P2'],
        windowsDriverUpdateServicePlans: ['WINDOWSUPDATEFORBUSINESS_DEPLOYMENTSERVICE'],
        allSkus: [],
      },
      permissions: {
        hasRequiredPermissions: true,
        missingPermissions: [],
        grantedPermissions: [],
      },
      isValid: true,
      warnings: [],
      errors: [],
      timestamp: new Date('2026-04-25T15:00:00.000Z'),
    }

    validatePrerequisites.mockResolvedValue(prerequisiteResult)
    const user = userEvent.setup()

    render(<TenantConfigHarness />)

    expect((await screen.findAllByText('Contoso')).length).toBeGreaterThan(0)
    expect(await screen.findByText('All prerequisites met')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveClass('bg-emerald-500/18', 'text-emerald-50')
    expect(screen.getByText(/Validation passed/i)).toHaveClass('text-emerald-100')
    expect(screen.getByText(/Last checked at .* UTC/)).toBeInTheDocument()
    await waitFor(() => {
      expect(validatePrerequisites).toHaveBeenCalled()
    })

    const initialValidationCalls = validatePrerequisites.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Use Tenant Configuration' }))

    expect(await screen.findByRole('button', { name: 'Back to tenant checkpoint' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to tenant checkpoint' }))

    expect((await screen.findAllByText('Contoso')).length).toBeGreaterThan(0)
    expect(screen.getByText('All prerequisites met')).toBeInTheDocument()

    await waitFor(() => {
      expect(validatePrerequisites.mock.calls.length).toBe(initialValidationCalls)
    })
  })

  it('binds prerequisite validation to the active account and blocks continue until it passes', async () => {
    validatePrerequisites.mockReturnValue(new Promise(() => {}))

    render(<TenantConfigHarness />)

    await waitFor(() => {
      expect(createGraphClient).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        homeAccountId: 'home-tenant-123',
      })
    })
    expect(screen.getByRole('button', { name: 'Use Tenant Configuration' })).toBeDisabled()
  })

  it('formats the validation timestamp in the operator locale and labels its UTC timezone', async () => {
    const languageSpy = vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE')
    const prerequisiteResult: PrerequisiteCheckResult = {
      organization: { id: 'tenant-123', displayName: 'Contoso' },
      licenses: {
        hasIntuneLicense: true,
        hasConditionalAccessLicense: true,
        hasPremiumP2License: true,
        hasWindowsDriverUpdateLicense: true,
        intuneServicePlans: ['INTUNE_A'],
        conditionalAccessServicePlans: ['AAD_PREMIUM'],
        premiumP2ServicePlans: ['AAD_PREMIUM_P2'],
        windowsDriverUpdateServicePlans: ['WINDOWSUPDATEFORBUSINESS_DEPLOYMENTSERVICE'],
        allSkus: [],
      },
      permissions: { hasRequiredPermissions: true, missingPermissions: [], grantedPermissions: [] },
      isValid: true,
      warnings: [],
      errors: [],
      timestamp: new Date('2026-04-25T15:00:00.000Z'),
    }
    validatePrerequisites.mockResolvedValue(prerequisiteResult)

    try {
      render(<TenantConfigHarness />)

      expect(await screen.findByText('Last checked at 15:00 UTC')).toBeInTheDocument()
    } finally {
      languageSpy.mockRestore()
    }
  })

  it('restores prerequisite errors after the tenant step remounts', async () => {
    validatePrerequisites.mockRejectedValue(new Error('Graph connectivity failed'))
    const user = userEvent.setup()

    render(<TenantConfigHarness />)

    expect(await screen.findByText('Prerequisite check failed')).toBeInTheDocument()
    expect(screen.getByText('Graph connectivity failed')).toBeInTheDocument()

    await waitFor(() => {
      expect(validatePrerequisites.mock.calls.length).toBeGreaterThan(0)
    })
    const initialValidationCalls = validatePrerequisites.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Jump to operation mode' }))
    expect(await screen.findByRole('button', { name: 'Back to tenant checkpoint' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to tenant checkpoint' }))

    expect(await screen.findByText('Prerequisite check failed')).toBeInTheDocument()
    expect(screen.getByText('Graph connectivity failed')).toBeInTheDocument()

    await waitFor(() => {
      expect(validatePrerequisites.mock.calls.length).toBe(initialValidationCalls)
    })
  })

  it('preserves the active-account recovery message from prerequisite validation', async () => {
    validatePrerequisites.mockRejectedValue(
      new MockAuthSessionExpiredError(
        'The active account changed. Return to tenant configuration and confirm the active account before continuing.'
      )
    )

    render(<TenantConfigHarness />)

    expect(
      await screen.findByText(
        'The active account changed. Return to tenant configuration and confirm the active account before continuing.'
      )
    ).toBeInTheDocument()
  })

  it('keeps the operator identity constrained inside its summary card', async () => {
    validatePrerequisites.mockRejectedValue(new Error('Graph connectivity failed'))

    render(<TenantConfigHarness />)

    const operatorIdentity = await screen.findByText('operator@contoso.com')
    const operatorIdentityRow = operatorIdentity.closest('p')

    expect(operatorIdentityRow).toHaveClass('break-all')
    expect(operatorIdentityRow).toHaveClass('max-w-full')
    expect(operatorIdentityRow?.parentElement).toHaveClass('min-w-0')
  })

  it('blurs organization, tenant, and operator identities when Demo Mode is on', async () => {
    localStorage.setItem(
      'app-settings:v1',
      JSON.stringify({ stopOnFirstError: false, demoMode: true })
    )
    validatePrerequisites.mockResolvedValue({
      organization: { id: 'tenant-123', displayName: 'Contoso' },
      licenses: null,
      permissions: null,
      isValid: true,
      warnings: [],
      errors: [],
      timestamp: new Date('2026-04-25T15:00:00.000Z'),
    } satisfies PrerequisiteCheckResult)

    render(<TenantConfigHarness />)

    const sensitiveValues = [
      ...(await screen.findAllByText('Contoso')),
      ...screen.getAllByText('tenant-123'),
      ...screen.getAllByText('operator@contoso.com'),
    ]

    expect(sensitiveValues.length).toBeGreaterThanOrEqual(4)
    sensitiveValues.forEach((value) => {
      expect(value).toHaveClass('demo-sensitive-data')
      expect(value).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
