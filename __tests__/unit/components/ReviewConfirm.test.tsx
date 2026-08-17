import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { ReviewConfirm } from '@/components/wizard/ReviewConfirm'
import { SettingsProvider } from '@/hooks/useSettings'
import type { WizardState } from '@/types/hydration'
import type { PrerequisiteCheckResult } from '@/types/prerequisites'
import { EXECUTION_RECORD_STORAGE_KEY } from '@/lib/storageKeys'
import {
  beginExecution,
  forceResetExecutionSessionForTests,
  resetExecutionSession
} from '@/lib/hydration/executionStateStore'

const setConfirmed = vi.fn()
const previousStep = vi.fn()
const push = vi.fn()
const getEstimatedTaskCount = vi.fn()
const getEstimatedCategoryCount = vi.fn()
const useWizardState = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push })
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => useWizardState()
}))

vi.mock('@/lib/hydration/engine', () => ({
  getEstimatedTaskCount: (...args: unknown[]) => getEstimatedTaskCount(...args),
  getEstimatedCategoryCount: (...args: unknown[]) => getEstimatedCategoryCount(...args)
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
    ...overrides
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
      homeAccountId: 'home-tenant-123',
      tenantName: 'Contoso',
      cloudEnvironment: 'global'
    },
    prerequisiteResult: createPrerequisites(),
    ...overrides
  }
}

function renderReviewConfirm(): void {
  render(
    <SettingsProvider>
      <ReviewConfirm />
    </SettingsProvider>
  )
}

describe('ReviewConfirm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    forceResetExecutionSessionForTests()
    getEstimatedTaskCount.mockReturnValue(12)
    getEstimatedCategoryCount.mockReturnValue(3)
    useWizardState.mockReturnValue({
      state: createState(),
      setConfirmed,
      previousStep
    })
  })

  it('blurs the tenant identity in the execution brief when Demo Mode is on', () => {
    localStorage.setItem('app-settings:v1', JSON.stringify({ stopOnFirstError: false, demoMode: true }))

    renderReviewConfirm()

    expect(screen.getByText('Contoso')).toHaveClass('demo-sensitive-data')
    expect(screen.getByText('tenant-123')).toHaveClass('demo-sensitive-data')
  })

  it('lets preview runs start immediately and routes to the dashboard', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem(EXECUTION_RECORD_STORAGE_KEY, '{"stale":true}')
    renderReviewConfirm()

    expect(screen.getByText('Preview mode')).toHaveClass('text-white')
    expect(screen.getByText(/Preview mode will check/)).toHaveClass('text-slate-200')
    expect(screen.getByText('No approval required')).toBeInTheDocument()
    expect(screen.getAllByText('12 objects').length).toBeGreaterThan(0)
    expect(screen.getByText('Read only')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview Create' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Preview Create' }))

    expect(setConfirmed).toHaveBeenCalledWith(true)
    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull()
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
          errors: ['Conditional access license missing']
        })
      }),
      setConfirmed,
      previousStep
    })

    renderReviewConfirm()

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
    expect(screen.getByText('Human approval required')).toBeInTheDocument()
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /i understand this run will modify my intune tenant/i })).toHaveClass(
      'live-acknowledgement__checkbox'
    )

    await user.click(screen.getByRole('checkbox', { name: /i understand this run will modify my intune tenant/i }))
    expect(startButton).toBeEnabled()
    expect(screen.getByText('Approved')).toBeInTheDocument()

    await user.click(startButton)
    expect(setConfirmed).toHaveBeenCalledWith(true)
  })

  it('does not start another run while hydration is active', () => {
    beginExecution({
      tenantId: 'tenant-123',
      homeAccountId: 'home-tenant-123',
      operationMode: 'create',
      isPreview: true,
      selectedObjectCount: 1
    })

    renderReviewConfirm()

    expect(screen.getByRole('button', { name: 'Preview Create' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('A hydration run is active')
  })

  it('asks the user to wait while a hidden previous run stops', () => {
    beginExecution({
      tenantId: 'tenant-123',
      homeAccountId: 'home-tenant-123',
      operationMode: 'create',
      isPreview: true,
      selectedObjectCount: 1
    })
    resetExecutionSession()

    renderReviewConfirm()

    expect(screen.getByRole('status')).toHaveTextContent('The previous run is stopping')
    expect(screen.getByRole('status')).not.toHaveTextContent('Return to the dashboard')
    expect(screen.getByRole('button', { name: 'Preview Create' })).toBeDisabled()
  })
})
