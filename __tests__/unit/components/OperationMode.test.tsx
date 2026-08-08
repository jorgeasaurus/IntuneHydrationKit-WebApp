import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, within } from '@/__tests__/setup/test-utils'
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

function expectRemovedSummaryCardsToBeAbsent(): void {
  expect(screen.queryByText(/^Intent\b/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/^Safety rail\b/i)).not.toBeInTheDocument()
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

    await user.click(screen.getByRole('radio', { name: /delete/i }))
    await user.click(screen.getByRole('radio', { name: /live/i }))

    expect(screen.getByText('Delete mode is live')).toBeInTheDocument()
    expect(screen.getByText(/Conditional Access policies must be disabled/i)).toBeInTheDocument()
    expectRemovedSummaryCardsToBeAbsent()

    await user.click(screen.getByRole('button', { name: 'Choose Operation Mode' }))

    expect(setOperationMode).toHaveBeenCalledWith('delete')
    expect(setIsPreview).toHaveBeenCalledWith(false)
    expect(nextStep).toHaveBeenCalledTimes(1)
  })

  it('shows the preview safety copy and allows navigating back', async () => {
    const user = userEvent.setup()
    render(<OperationModeSelection />)

    expect(screen.getByText('WhatIf preview')).toBeInTheDocument()
    expect(screen.getByText('This run is safe to review without mutating the tenant.')).toBeInTheDocument()
    expectRemovedSummaryCardsToBeAbsent()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(previousStep).toHaveBeenCalledTimes(1)
  })

  it('supports keyboard selection and exposes the current choices as radios', async () => {
    const user = userEvent.setup()
    render(<OperationModeSelection />)

    const operationIntent = screen.getByRole('radiogroup', { name: 'Operation intent' })
    const executionBehavior = screen.getByRole('radiogroup', { name: 'Execution behavior' })
    const create = within(operationIntent).getByRole('radio', { name: /^Create\b/ })
    const deleteMode = within(operationIntent).getByRole('radio', { name: /^Delete\b/ })
    const preview = within(executionBehavior).getByRole('radio', { name: /^Preview\b/ })
    const live = within(executionBehavior).getByRole('radio', { name: /^Live\b/ })

    expect(create).toBeChecked()
    expect(preview).toBeChecked()
    expect(create).toHaveClass('focus-visible:ring-2')

    create.focus()
    await user.keyboard('[ArrowDown]')
    expect(deleteMode).toHaveFocus()
    await user.keyboard('[Space]')
    expect(deleteMode).toBeChecked()

    preview.focus()
    await user.keyboard('[ArrowDown]')
    expect(live).toHaveFocus()
    await user.keyboard('[Space]')
    expect(live).toBeChecked()
  })
})
