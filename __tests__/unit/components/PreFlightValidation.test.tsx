import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/__tests__/setup/test-utils'
import { PreFlightValidation } from '@/components/wizard/PreFlightValidation'
import type { ValidationResult } from '@/lib/hydration/validator'
import type { WizardState } from '@/types/hydration'

const nextStep = vi.fn()
const previousStep = vi.fn()
const createGraphClient = vi.fn()
const validateTenant = vi.fn()
const useWizardState = vi.fn()

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => useWizardState(),
}))

vi.mock('@/lib/graph/client', () => ({
  createGraphClient: (...args: unknown[]) => createGraphClient(...args),
}))

vi.mock('@/lib/hydration/validator', () => ({
  validateTenant: (...args: unknown[]) => validateTenant(...args),
}))

function createState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    currentStep: 2,
    isPreview: true,
    selectedTargets: [],
    selectedCISCategories: [],
    confirmed: false,
    tenantConfig: {
      tenantId: 'tenant-123',
      tenantName: 'Contoso',
      cloudEnvironment: 'global',
    },
    ...overrides,
  }
}

const validResult: ValidationResult = {
  isValid: true,
  checks: {
    connectivity: { passed: true, message: 'Connected to Graph' },
    licenses: {
      passed: true,
      message: 'Intune license detected',
      details: {
        hasIntuneLicense: true,
        hasWindowsE3OrHigher: true,
        assignedLicenses: ['INTUNE_A'],
        validationTime: new Date('2026-04-26T09:00:00.000Z'),
      },
    },
    permissions: {
      passed: false,
      message: 'Missing required permissions: Group.ReadWrite.All',
      missingPermissions: ['Group.ReadWrite.All'],
    },
    role: { passed: true, message: 'Global Administrator detected' },
  },
  errors: [],
  warnings: ['Driver update profiles require Windows E3 or higher'],
}

describe('PreFlightValidation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    createGraphClient.mockReturnValue({ id: 'graph-client' })
    useWizardState.mockReturnValue({
      state: createState(),
      nextStep,
      previousStep,
    })
  })

  it('runs validation on mount and renders warnings and missing permissions', async () => {
    const user = userEvent.setup()
    validateTenant.mockResolvedValue(validResult)
    render(<PreFlightValidation />)

    await waitFor(() => {
      expect(validateTenant).toHaveBeenCalledWith({ id: 'graph-client' })
    })

    expect(createGraphClient).toHaveBeenCalledWith('global')
    expect(await screen.findByText('Connected to Graph')).toBeInTheDocument()
    expect(screen.getByText('Driver update profiles require Windows E3 or higher')).toBeInTheDocument()
    expect(screen.getByText('Group.ReadWrite.All')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(nextStep).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(previousStep).toHaveBeenCalledTimes(1)
  })

  it('shows retry controls after a validation failure and retries when requested', async () => {
    const user = userEvent.setup()
    validateTenant
      .mockRejectedValueOnce(new Error('Graph connectivity failed'))
      .mockResolvedValueOnce(validResult)

    render(<PreFlightValidation />)

    expect(await screen.findByText('Validation Failed')).toBeInTheDocument()
    expect(screen.getByText('Failed to validate tenant')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry Validation' }))

    await waitFor(() => {
      expect(validateTenant).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Connected to Graph')).toBeInTheDocument()
  })
})
