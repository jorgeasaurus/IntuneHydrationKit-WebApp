import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { ReviewConfirm } from '@/components/wizard/ReviewConfirm'
import type { WizardState } from '@/types/hydration'
import type { PrerequisiteCheckResult } from '@/types/prerequisites'

const setConfirmed = vi.fn()
const previousStep = vi.fn()
const push = vi.fn()
const getEstimatedTaskCount = vi.fn()
const getEstimatedCategoryCount = vi.fn()
const useWizardState = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => useWizardState(),
}))

vi.mock('@/lib/hydration/engine', () => ({
  getEstimatedTaskCount: (...args: unknown[]) => getEstimatedTaskCount(...args),
  getEstimatedCategoryCount: (...args: unknown[]) => getEstimatedCategoryCount(...args),
}))

function createPrerequisites(overrides: Partial<PrerequisiteCheckResult> = {}): PrerequisiteCheckResult {
  return {
    organization: { id: 'org-1', displayName: 'Contoso' },
    licenses: null,
    permissions: null,
    isValid: true,
    warnings: [],
    errors: [],
    timestamp: new Date('2026-04-26T09:00:00.000Z'),
    ...overrides,
  }
}

function createState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    currentStep: 4,
    isPreview: true,
    selectedTargets: ['groups'],
    selectedCISCategories: [],
    confirmed: false,
    operationMode: 'create',
    tenantConfig: {
      tenantId: 'tenant-123',
      accountHomeId: 'home-tenant-123',
      tenantName: 'Contoso',
      cloudEnvironment: 'global',
    },
    prerequisiteResult: createPrerequisites(),
    ...overrides,
  }
}

describe('ReviewConfirm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getEstimatedTaskCount.mockReturnValue(12)
    getEstimatedCategoryCount.mockReturnValue(3)
    useWizardState.mockReturnValue({
      state: createState(),
      setConfirmed,
      previousStep,
    })
  })

  it('lets preview runs start immediately and routes to the dashboard', async () => {
    const user = userEvent.setup()
    render(<ReviewConfirm />)

    expect(screen.getByText('Preview mode')).toHaveClass('text-sky-50')
    expect(screen.getByText(/Preview mode will check/)).toHaveClass('text-sky-100')
    expect(screen.getByRole('button', { name: 'Preview Create' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Preview Create' }))

    expect(setConfirmed).toHaveBeenCalledWith(true)
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('requires acknowledgement for live runs and surfaces readiness notices', async () => {
    const user = userEvent.setup()
    useWizardState.mockReturnValue({
      state: createState({
        isPreview: false,
        selectedTargets: ['conditionalAccess', 'groups'],
        prerequisiteResult: createPrerequisites({
          isValid: false,
          warnings: ['Tenant has custom naming policies'],
          errors: ['Conditional access license missing'],
        }),
      }),
      setConfirmed,
      previousStep,
    })

    render(<ReviewConfirm />)

    const startButton = screen.getByRole('button', { name: 'Start Hydration' })
    expect(startButton).toBeDisabled()
    expect(screen.getByText('Conditional Access reminder')).toBeInTheDocument()
    expect(screen.getByText('Conditional access license missing')).toBeInTheDocument()
    expect(screen.getByText('Tenant has custom naming policies')).toBeInTheDocument()
    const acknowledgementLabel = screen.getByText('I understand this run will modify my Intune tenant')
    const acknowledgementDescription = screen.getByText(/^This operation will/i)
    const acknowledgement = acknowledgementLabel.closest('.live-acknowledgement')
    expect(acknowledgementLabel).toHaveClass('live-acknowledgement__title')
    expect(acknowledgementDescription).toHaveClass('live-acknowledgement__copy')
    expect(acknowledgement).toHaveClass('live-acknowledgement')
    expect(screen.getByRole('checkbox', { name: /i understand this run will modify my intune tenant/i }))
      .toHaveClass('live-acknowledgement__checkbox')

    await user.click(screen.getByRole('checkbox', { name: /i understand this run will modify my intune tenant/i }))
    expect(startButton).toBeEnabled()

    await user.click(startButton)
    expect(setConfirmed).toHaveBeenCalledWith(true)
  })
})
