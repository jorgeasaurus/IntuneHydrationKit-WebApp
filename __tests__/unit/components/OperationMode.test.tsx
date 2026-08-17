import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, within } from '@testing-library/react'
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

    const create = screen.getByRole('radio', { name: /^Create$/i })
    const deleteMode = screen.getByRole('radio', { name: /^Delete$/i })
    const preview = screen.getByRole('radio', { name: /^Preview$/i })
    const live = screen.getByRole('radio', { name: /^Live$/i })

    expect(create).toHaveClass('border-emerald-300/55', 'bg-emerald-300/[0.14]')
    expect(preview).toHaveClass('border-sky-300/55', 'bg-sky-300/[0.14]')
    expect(create.querySelector('span.rounded-xl')).toHaveClass('text-emerald-100')
    expect(preview.querySelector('span.rounded-xl')).toHaveClass('text-sky-100')

    await user.click(deleteMode)
    await user.click(live)

    expect(deleteMode).toHaveAttribute('data-tone', 'delete')
    expect(live).toHaveAttribute('data-tone', 'live')
    expect(deleteMode).toHaveClass('border-red-300/60', 'bg-red-400/[0.14]')
    expect(live).toHaveClass('border-amber-300/60', 'bg-amber-300/[0.14]')
    expect(deleteMode.querySelector('span.rounded-xl')).toHaveClass('text-red-100')
    expect(live.querySelector('span.rounded-xl')).toHaveClass('text-amber-100')
    expect(within(deleteMode).getByText('Delete')).toHaveClass('text-red-50')
    expect(within(live).getByText('Live')).toHaveClass('text-amber-50')
    expect(create).not.toHaveClass('border-emerald-300/55', 'bg-emerald-300/[0.14]')
    expect(preview).not.toHaveClass('border-sky-300/55', 'bg-sky-300/[0.14]')

    const warningTitle = screen.getByText('Delete mode is live')
    const warningDescription = screen.getByText(/Conditional Access policies must be disabled/i)
    const warning = screen.getByRole('alert')
    expect(warningTitle).toHaveClass('text-red-200')
    expect(warningDescription).toHaveClass('text-slate-100/90')
    expect(warning).toHaveClass('bg-slate-950/90', 'border-red-400/70')
    expectRemovedSummaryCardsToBeAbsent()

    await user.click(screen.getByRole('button', { name: 'Choose Operation Mode' }))

    expect(setOperationMode).toHaveBeenCalledWith('delete')
    expect(setIsPreview).toHaveBeenCalledWith(false)
    expect(nextStep).toHaveBeenCalledTimes(1)
  })

  it('shows the preview safety copy and allows navigating back', async () => {
    const user = userEvent.setup()
    render(<OperationModeSelection />)

    expect(screen.getByRole('radio', { name: /^Create$/i })).toHaveAttribute('data-tone', 'create')
    expect(screen.getByRole('radio', { name: /^Preview$/i })).toHaveAttribute('data-tone', 'preview')
    expect(screen.getByText('Execution behavior')).toHaveClass('text-sky-200')
    expect(screen.getAllByText('Preview')[0]).toHaveClass('text-sky-100')
    expect(screen.getByText('Safe mode')).toHaveClass('text-sky-200')
    expect(screen.getByText('WhatIf preview')).toBeInTheDocument()
    expect(screen.getByText('This run is safe to review without mutating the tenant.')).toHaveClass('text-white/85')
    expect(screen.getByText(/Simulate the create flow first/)).toHaveClass('text-white/85')
    expect(screen.getByText('Dry run')).toBeInTheDocument()
    expect(screen.getByText('Read-only validation mode. No Graph mutations will be sent.')).toBeInTheDocument()
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
