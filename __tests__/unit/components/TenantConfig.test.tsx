import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/__tests__/setup/test-utils'
import { TenantConfig } from '@/components/wizard/TenantConfig'
import { WizardProvider, useWizardState } from '@/hooks/useWizardState'
import type { PrerequisiteCheckResult } from '@/types/prerequisites'

const validatePrerequisites = vi.fn()
const createGraphClient = vi.fn()
const getSelectedCloudEnvironment = vi.fn(() => 'global')

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    accounts: [{ tenantId: 'tenant-123', username: 'operator@contoso.com' }],
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
    getSelectedCloudEnvironment: () => getSelectedCloudEnvironment(),
    AuthSessionExpiredError: class AuthSessionExpiredError extends Error {},
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

describe('TenantConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getSelectedCloudEnvironment.mockReturnValue('global')
  })

  it('keeps the health checklist state when navigating away and back', async () => {
    const prerequisiteResult: PrerequisiteCheckResult = {
      organization: {
        id: 'org-1',
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

    render(
      <WizardProvider>
        <WizardHarness />
      </WizardProvider>
    )

    expect((await screen.findAllByText('Contoso')).length).toBeGreaterThan(0)
    expect(await screen.findByText('All prerequisites met')).toBeInTheDocument()
    await waitFor(() => {
      expect(validatePrerequisites).toHaveBeenCalled()
    })

    const initialValidationCalls = validatePrerequisites.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('button', { name: 'Back to tenant checkpoint' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to tenant checkpoint' }))

    expect((await screen.findAllByText('Contoso')).length).toBeGreaterThan(0)
    expect(screen.getByText('All prerequisites met')).toBeInTheDocument()

    await waitFor(() => {
      expect(validatePrerequisites.mock.calls.length).toBe(initialValidationCalls)
    })
  })

  it('restores prerequisite errors after the tenant step remounts', async () => {
    validatePrerequisites.mockRejectedValue(new Error('Graph connectivity failed'))
    const user = userEvent.setup()

    render(
      <WizardProvider>
        <WizardHarness />
      </WizardProvider>
    )

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
})
