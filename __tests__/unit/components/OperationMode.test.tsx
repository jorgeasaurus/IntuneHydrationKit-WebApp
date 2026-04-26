import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/__tests__/setup/test-utils'
import { OperationModeSelection } from '@/components/wizard/OperationMode'
import type { WizardState } from '@/types/hydration'

const setOperationMode = vi.fn()
const setIsPreview = vi.fn()
const nextStep = vi.fn()
const previousStep = vi.fn()

const useWizardState = vi.fn()

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => useWizardState(),
}))

function createState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    currentStep: 2,
    isPreview: true,
    selectedTargets: [],
    selectedCISCategories: [],
    confirmed: false,
    operationMode: 'create',
    ...overrides,
  }
}

describe('OperationModeSelection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useWizardState.mockReturnValue({
      state: createState(),
      setOperationMode,
      setIsPreview,
      nextStep,
      previousStep,
    })
  })

  it('commits delete live mode and surfaces the destructive warning', async () => {
    const user = userEvent.setup()
    render(<OperationModeSelection />)

    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /live/i }))

    expect(screen.getByText('Delete mode is live')).toBeInTheDocument()
    expect(screen.getByText(/Conditional Access policies must be disabled/i)).toBeInTheDocument()
    expect(screen.getByText('Delete requires hydration markers and CA disablement.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(setOperationMode).toHaveBeenCalledWith('delete')
    expect(setIsPreview).toHaveBeenCalledWith(false)
    expect(nextStep).toHaveBeenCalledTimes(1)
  })

  it('shows the preview safety copy and allows navigating back', async () => {
    const user = userEvent.setup()
    render(<OperationModeSelection />)

    expect(screen.getByText('WhatIf preview')).toBeInTheDocument()
    expect(screen.getByText('This run is safe to review without mutating the tenant.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(previousStep).toHaveBeenCalledTimes(1)
  })
})
