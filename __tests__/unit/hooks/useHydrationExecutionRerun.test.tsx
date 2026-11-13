import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HydrationSummary, HydrationTask, WizardState } from '@/types/hydration'
import type { ExecutionContext } from '@/lib/hydration/types'
import type { RerunPlan } from '@/lib/hydration/rerun'

const { mockUseWizardState, mockBuildTaskQueueAsync, mockExecuteTasks, mockCreateSummary } = vi.hoisted(() => ({
  mockUseWizardState: vi.fn(),
  mockBuildTaskQueueAsync: vi.fn(),
  mockExecuteTasks: vi.fn(),
  mockCreateSummary: vi.fn()
}))

vi.mock('@/hooks/useWizardState', () => ({ useWizardState: mockUseWizardState }))
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({ settings: { stopOnFirstError: false, demoMode: false, notifyOnCompletion: false } })
}))
vi.mock('@/lib/graph/client', () => ({ createGraphClient: () => ({}) }))
vi.mock('@/lib/hydration/engine', () => ({
  buildTaskQueueAsync: mockBuildTaskQueueAsync,
  executeTasks: async (...args: unknown[]) => (await mockExecuteTasks(...args)) ?? [],
  getEstimatedTaskCount: () => 7
}))
vi.mock('@/lib/hydration/reporter', () => ({ createSummary: mockCreateSummary }))
vi.mock('@/lib/config/batchConfig', () => ({
  getBatchConfig: () => ({ enableBatching: false, defaultBatchSize: 5, delayBetweenBatches: 0 })
}))

import { resetExecutionControlForTests, useHydrationExecution } from '@/hooks/useHydrationExecution'
import { getExecutionState } from '@/lib/hydration/executionStateStore'
import { TEMPLATE_UNAVAILABLE_MESSAGE } from '@/lib/hydration/rerun'
import { getRunLockState } from '@/lib/hydration/runLock'
import { installFakeLocks } from '@/__tests__/helpers/fakeLocks'

const licenses = { hasConditionalAccessLicense: false, hasPremiumP2License: false, hasWindowsDriverUpdateLicense: true }
const baseConfiguration = {
  tenantId: 'tenant-1',
  homeAccountId: 'home-1',
  tenantName: 'Contoso',
  cloudEnvironment: 'global' as const,
  operationMode: 'create' as const,
  isPreview: false,
  selectedObjectCount: 2,
  licenses
}

function template(itemName: string): HydrationTask {
  return { id: `template-${itemName}`, category: 'groups', operation: 'create', itemName, status: 'pending' }
}

function finishTasks(tasks: HydrationTask[]): void {
  for (const task of tasks) Object.assign(task, { status: 'success', startTime: new Date(), endTime: new Date() })
}

describe('useHydrationExecution reruns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetExecutionControlForTests()
    mockUseWizardState.mockReturnValue({
      state: {
        currentStep: 4,
        confirmed: true,
        isPreview: true,
        operationMode: 'delete',
        selectedTargets: ['filters'],
        selectedCISCategories: [],
        tenantConfig: { tenantId: 'other', homeAccountId: 'other', cloudEnvironment: 'global' }
      } satisfies WizardState
    })
    mockCreateSummary.mockReturnValue({} as HydrationSummary)
    mockExecuteTasks.mockImplementation(async (tasks: HydrationTask[]) => finishTasks(tasks))
  })

  it('retries exactly the failed tasks of the earlier run, from templates, with the stored tenant and licenses', async () => {
    mockBuildTaskQueueAsync.mockResolvedValue([template('Group A'), template('Group B')])
    const plan: RerunPlan = {
      kind: 'retry',
      configuration: baseConfiguration,
      sourceTasks: [
        { id: 'task-4', category: 'groups', operation: 'create', itemName: 'Group B', status: 'failed', error: '403' },
        { id: 'task-9', category: 'groups', operation: 'create', itemName: 'Group Gone', status: 'failed' }
      ]
    }
    const { result } = renderHook(() => useHydrationExecution())

    await act(async () => {
      await result.current.startRerun(plan)
    })

    // Templates are loaded through the normal queue builder for the categories of the tasks, without selections.
    expect(mockBuildTaskQueueAsync).toHaveBeenCalledWith(['groups'], 'create', expect.not.objectContaining({ categorySelections: expect.anything() }))
    const [executed, context] = mockExecuteTasks.mock.calls[0] as [HydrationTask[], ExecutionContext]
    expect(executed.map((task) => task.itemName)).toEqual(['Group B'])
    expect(context).toMatchObject({ tenantId: 'tenant-1', isPreview: false, hasConditionalAccessLicense: false, hasPremiumP2License: false })

    const state = getExecutionState()
    expect(state.configuration).toEqual(baseConfiguration)
    expect(state.phase).toBe('completed')
    expect(state.tasks).toHaveLength(2)
    expect(state.tasks[1]).toMatchObject({ itemName: 'Group Gone', status: 'failed', error: TEMPLATE_UNAVAILABLE_MESSAGE })
    expect(state.outcome).toBe('completedWithIssues')
  })

  it('runs a preview for real by building the stored scope again as a live run', async () => {
    const scope = {
      selectedTargets: ['groups' as const],
      selectedCISCategories: [],
      categorySelections: { groups: { selectedItems: ['Group A'] } }
    }
    mockBuildTaskQueueAsync.mockResolvedValue([template('Group A')])
    const { result } = renderHook(() => useHydrationExecution())

    await act(async () => {
      await result.current.startRerun({
        kind: 'live',
        sourceTasks: [],
        configuration: { ...baseConfiguration, operationMode: 'create', isPreview: false, scope }
      })
    })

    expect(mockBuildTaskQueueAsync).toHaveBeenCalledWith(
      ['groups'],
      'create',
      expect.objectContaining({ categorySelections: scope.categorySelections, selectedCISCategories: [] })
    )
    const [, context] = mockExecuteTasks.mock.calls[0] as [HydrationTask[], ExecutionContext]
    expect(context.isPreview).toBe(false)
    expect(getExecutionState().configuration?.scope).toEqual(scope)
  })

  it('stores the wizard scope and licenses on a wizard run, but not the confirmation', async () => {
    mockBuildTaskQueueAsync.mockResolvedValue([template('Filter A')])
    const { result } = renderHook(() => useHydrationExecution())

    await act(async () => {
      await result.current.startExecution()
    })

    const configuration = getExecutionState().configuration
    expect(configuration?.scope).toEqual({ selectedTargets: ['filters'], selectedCISCategories: [] })
    expect(configuration?.licenses).toBeUndefined()
    expect(JSON.stringify(configuration)).not.toContain('confirmed')
  })

  it('never carries the wizard "update existing" choice into a retry, resume, or live run', async () => {
    mockUseWizardState.mockReturnValue({
      state: {
        currentStep: 4,
        confirmed: true,
        isPreview: false,
        operationMode: 'create',
        selectedTargets: ['groups'],
        selectedCISCategories: [],
        updateExisting: true,
        tenantConfig: { tenantId: 'tenant-1', homeAccountId: 'home-1', cloudEnvironment: 'global' }
      } satisfies WizardState
    })
    mockBuildTaskQueueAsync.mockResolvedValue([template('Group A')])
    const { result } = renderHook(() => useHydrationExecution())

    await act(async () => {
      await result.current.startExecution()
    })
    expect((mockExecuteTasks.mock.calls[0][1] as ExecutionContext).updateExisting).toBe(true)
    expect(JSON.stringify(getExecutionState().configuration)).not.toContain('updateExisting')

    const scope = { selectedTargets: ['groups' as const], selectedCISCategories: [] }
    const plans: RerunPlan[] = [
      { kind: 'retry', configuration: baseConfiguration, sourceTasks: [{ id: 'task-3', category: 'groups', operation: 'create', itemName: 'Group A', status: 'failed' }] },
      { kind: 'resume', configuration: baseConfiguration, sourceTasks: [template('Group A')] },
      { kind: 'live', configuration: { ...baseConfiguration, scope }, sourceTasks: [] }
    ]
    for (const [index, plan] of plans.entries()) {
      await act(async () => {
        await result.current.startRerun(plan)
      })
      expect((mockExecuteTasks.mock.calls[index + 1][1] as ExecutionContext).updateExisting).toBe(false)
    }
  })

  it('holds the tenant run lock for the life of the run, so other tabs see it', async () => {
    const locks = installFakeLocks()
    let lockDuringRun: string | null = null
    mockBuildTaskQueueAsync.mockResolvedValue([template('Group A')])
    mockExecuteTasks.mockImplementation(async (tasks: HydrationTask[]) => {
      lockDuringRun = await getRunLockState('tenant-1')
      finishTasks(tasks)
    })
    const { result } = renderHook(() => useHydrationExecution())
    await act(async () => {
      await result.current.startRerun({ kind: 'retry', configuration: baseConfiguration, sourceTasks: [{ id: 'x', category: 'groups', operation: 'create', itemName: 'Group A', status: 'failed' }] })
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(lockDuringRun).toBe('held')
    expect(await getRunLockState('tenant-1')).toBe('free')
    locks.uninstall()
  })

  it('does not start a second run while a run is active', async () => {
    let release!: () => void
    mockBuildTaskQueueAsync.mockReturnValue(new Promise((resolve) => (release = () => resolve([template('Group A')]))))
    const { result } = renderHook(() => useHydrationExecution())
    const plan: RerunPlan = { kind: 'retry', configuration: baseConfiguration, sourceTasks: [template('Group A')] }

    let first!: Promise<void>
    act(() => {
      first = result.current.startRerun(plan)
    })
    const runId = getExecutionState().runId
    await act(async () => {
      await result.current.startRerun(plan)
    })
    expect(getExecutionState().runId).toBe(runId)
    expect(mockBuildTaskQueueAsync).toHaveBeenCalledTimes(1)

    await act(async () => {
      release()
      await first
    })
  })
})
