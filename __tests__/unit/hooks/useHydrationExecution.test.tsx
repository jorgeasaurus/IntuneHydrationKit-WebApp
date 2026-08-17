import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BatchProgress, HydrationSummary, HydrationTask, WizardState } from '@/types/hydration'
import type { AppSettings } from '@/types/hydration'
import type { PrerequisiteCheckResult } from '@/types/prerequisites'
import type { ActivityMessage, ExecutionContext } from '@/lib/hydration/types'

const {
  mockUseWizardState,
  mockUseSettings,
  mockCreateGraphClient,
  mockBuildTaskQueueAsync,
  mockExecuteTasks,
  mockGetEstimatedTaskCount,
  mockCreateSummary,
  mockGetBatchConfig,
  mockIsBatchableCategory
} = vi.hoisted(() => ({
  mockUseWizardState: vi.fn(),
  mockUseSettings: vi.fn(),
  mockCreateGraphClient: vi.fn(),
  mockBuildTaskQueueAsync: vi.fn(),
  mockExecuteTasks: vi.fn(),
  mockGetEstimatedTaskCount: vi.fn(),
  mockCreateSummary: vi.fn(),
  mockGetBatchConfig: vi.fn(),
  mockIsBatchableCategory: vi.fn()
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: mockUseWizardState
}))

vi.mock('@/hooks/useSettings', () => ({
  useSettings: mockUseSettings
}))

vi.mock('@/lib/graph/client', () => ({
  createGraphClient: mockCreateGraphClient
}))

vi.mock('@/lib/hydration/engine', () => ({
  buildTaskQueueAsync: mockBuildTaskQueueAsync,
  executeTasks: mockExecuteTasks,
  getEstimatedTaskCount: mockGetEstimatedTaskCount
}))

vi.mock('@/lib/hydration/reporter', () => ({
  createSummary: mockCreateSummary
}))

vi.mock('@/lib/config/batchConfig', () => ({
  getBatchConfig: mockGetBatchConfig
}))

vi.mock('@/lib/hydration/batchExecutor', () => ({
  isBatchableCategory: mockIsBatchableCategory
}))

import { useHydrationExecution, resetExecutionControlForTests } from '@/hooks/useHydrationExecution'

function createPrerequisiteResult(): PrerequisiteCheckResult {
  return {
    organization: null,
    licenses: {
      hasIntuneLicense: true,
      hasConditionalAccessLicense: false,
      hasPremiumP2License: false,
      hasWindowsDriverUpdateLicense: true,
      intuneServicePlans: [],
      conditionalAccessServicePlans: [],
      premiumP2ServicePlans: [],
      windowsDriverUpdateServicePlans: [],
      allSkus: []
    },
    permissions: null,
    isValid: true,
    warnings: [],
    errors: [],
    timestamp: new Date('2024-01-01T00:00:00.000Z')
  }
}

function createWizardState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    currentStep: 5,
    tenantConfig: {
      tenantId: 'tenant-123',
      homeAccountId: 'home-tenant-123',
      tenantName: 'Contoso',
      cloudEnvironment: 'global'
    },
    operationMode: 'create',
    isPreview: false,
    selectedTargets: ['groups', 'enrollment'],
    selectedCISCategories: [],
    confirmed: true,
    prerequisiteResult: createPrerequisiteResult(),
    ...overrides
  }
}

function createTask(id: string, category: HydrationTask['category'], itemName: string): HydrationTask {
  return {
    id,
    category,
    itemName,
    operation: 'create',
    status: 'pending'
  }
}

function createSummary(): HydrationSummary {
  const startTime = new Date('2024-01-01T00:00:00.000Z')
  const endTime = new Date('2024-01-01T00:00:05.000Z')

  return {
    tenantId: 'tenant-123',
    operationMode: 'create',
    startTime,
    endTime,
    duration: endTime.getTime() - startTime.getTime(),
    stats: {
      total: 2,
      created: 2,
      deleted: 0,
      skipped: 0,
      failed: 0
    },
    categoryBreakdown: {
      groups: {
        total: 1,
        success: 1,
        skipped: 0,
        failed: 0
      }
    },
    errors: [],
    warnings: [],
    batchStats: {
      batchingEnabled: true,
      batchSize: 5,
      batchRequestCount: 1,
      batchedTaskCount: 1,
      sequentialTaskCount: 1
    }
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('useHydrationExecution', () => {
  let wizardState: WizardState
  let settings: AppSettings
  const mockClient = {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    getCollection: vi.fn(),
    patch: vi.fn(),
    batch: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // The run lock is module-scope and shared across hook instances - reset it
    // so a leaked run from one test can't block the next
    resetExecutionControlForTests()

    wizardState = createWizardState()
    settings = {
      stopOnFirstError: false,
      demoMode: false
    }

    mockUseWizardState.mockImplementation(() => ({ state: wizardState }))
    mockUseSettings.mockImplementation(() => ({ settings }))
    mockCreateGraphClient.mockReturnValue(mockClient)
    mockGetBatchConfig.mockReturnValue({
      enableBatching: true,
      defaultBatchSize: 5,
      delayBetweenBatches: 0
    })
    mockIsBatchableCategory.mockImplementation((category: string) => category === 'groups')
    mockCreateSummary.mockReturnValue(createSummary())
    mockGetEstimatedTaskCount.mockReturnValue(2)
  })

  it('rejects invalid wizard state before starting execution', async () => {
    wizardState = createWizardState({
      tenantConfig: undefined,
      operationMode: undefined,
      selectedTargets: []
    })

    const { result } = renderHook(() => useHydrationExecution())

    await expect(result.current.startExecution()).rejects.toThrow(
      'Invalid wizard state. Please complete the wizard first.'
    )

    expect(mockBuildTaskQueueAsync).not.toHaveBeenCalled()
    expect(mockExecuteTasks).not.toHaveBeenCalled()
  })

  it('builds the queue, executes tasks, and creates a summary with batch stats', async () => {
    const tasks = [
      createTask('group-1', 'groups', 'All Windows Devices'),
      createTask('enrollment-1', 'enrollment', 'Windows Autopilot')
    ]
    const progress: BatchProgress = {
      isActive: true,
      currentBatch: 1,
      totalBatches: 1,
      itemsInBatch: 1,
      apiVersion: 'v1.0',
      batchStartTime: new Date('2024-01-01T00:00:02.000Z')
    }

    mockBuildTaskQueueAsync.mockImplementation(
      async (
        _selectedTargets: WizardState['selectedTargets'],
        _operationMode: WizardState['operationMode'],
        options: {
          onProgress?: (message: string, type?: ActivityMessage['type']) => void
        }
      ) => {
        options.onProgress?.('Loaded templates')
        return tasks
      }
    )
    mockExecuteTasks.mockImplementation(async (queuedTasks: HydrationTask[], context: ExecutionContext) => {
      context.onBatchProgress?.(progress)
      context.onStatusUpdate?.({
        id: 'status-1',
        timestamp: new Date('2024-01-01T00:00:03.000Z'),
        message: 'Executing groups batch',
        type: 'info',
        category: 'groups'
      })

      Object.assign(queuedTasks[0], {
        status: 'success',
        startTime: new Date('2024-01-01T00:00:03.000Z'),
        endTime: new Date('2024-01-01T00:00:04.000Z')
      })
      context.onTaskStart?.({
        ...queuedTasks[0],
        status: 'running',
        skipKind: undefined
      })
      context.onTaskComplete?.({ ...queuedTasks[0] })
      Object.assign(queuedTasks[1], {
        status: 'success',
        startTime: new Date('2024-01-01T00:00:04.000Z'),
        endTime: new Date('2024-01-01T00:00:05.000Z')
      })
      context.onTaskComplete?.({ ...queuedTasks[1] })
    })

    const { result } = renderHook(() => useHydrationExecution())

    await act(async () => {
      await result.current.startExecution()
    })

    expect(mockCreateGraphClient).toHaveBeenCalledWith({
      tenantId: 'tenant-123',
      homeAccountId: 'home-tenant-123'
    })
    expect(mockBuildTaskQueueAsync).toHaveBeenCalledWith(
      ['groups', 'enrollment'],
      'create',
      expect.objectContaining({
        selectedCISCategories: [],
        baselineSelection: undefined,
        categorySelections: undefined,
        onProgress: expect.any(Function)
      })
    )
    expect(mockExecuteTasks).toHaveBeenCalledWith(
      tasks,
      expect.objectContaining({
        client: mockClient,
        operationMode: 'create',
        isPreview: false,
        stopOnFirstError: false,
        hasConditionalAccessLicense: false,
        hasPremiumP2License: false,
        hasWindowsDriverUpdateLicense: true,
        shouldCancel: expect.any(Function),
        shouldPause: expect.any(Function)
      })
    )
    expect(mockCreateSummary).toHaveBeenCalledWith(
      'tenant-123',
      'create',
      expect.any(Date),
      expect.any(Date),
      tasks,
      {
        batchingEnabled: true,
        batchSize: 5,
        batchRequestCount: 1,
        batchedTaskCount: 1,
        sequentialTaskCount: 1
      },
      'Contoso'
    )

    expect(result.current.tasks).toEqual([
      expect.objectContaining({ id: 'group-1', status: 'success' }),
      expect.objectContaining({ id: 'enrollment-1', status: 'success' })
    ])
    expect(result.current.isRunning).toBe(false)
    expect(result.current.isCompleted).toBe(true)
    expect(result.current.isBuildingQueue).toBe(false)
    expect(result.current.summary).toEqual(createSummary())
    expect(result.current.outcome).toBe('succeeded')
    expect(result.current.fatalError).toBeNull()
    expect(result.current.batchProgress).toEqual({
      ...progress,
      isActive: false
    })
    expect(result.current.activityLog.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        'Building task queue...',
        'Loaded templates',
        'Task queue ready: 2 tasks queued',
        'Executing groups batch'
      ])
    )
  })

  it('omits batch stats when stop on first error requires sequential execution', async () => {
    const tasks = [createTask('group-1', 'groups', 'All Windows Devices')]
    settings = { ...settings, stopOnFirstError: true }
    mockBuildTaskQueueAsync.mockResolvedValue(tasks)
    mockExecuteTasks.mockImplementation(async () => {
      tasks[0].status = 'success'
    })

    const { result } = renderHook(() => useHydrationExecution())
    await act(async () => {
      await result.current.startExecution()
    })

    expect(mockExecuteTasks).toHaveBeenCalledWith(
      tasks,
      expect.objectContaining({ stopOnFirstError: true })
    )
    expect(mockCreateSummary).toHaveBeenCalledWith(
      'tenant-123',
      'create',
      expect.any(Date),
      expect.any(Date),
      tasks,
      undefined,
      'Contoso'
    )
  })

  it('ignores duplicate start requests while execution is already locked', async () => {
    const queuedTasks = [createTask('group-1', 'groups', 'All Windows Devices')]
    const buildQueue = createDeferred<HydrationTask[]>()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockBuildTaskQueueAsync.mockReturnValue(buildQueue.promise)
    mockExecuteTasks.mockResolvedValue(undefined)

    const { result } = renderHook(() => useHydrationExecution())

    let firstRun!: Promise<void>
    let secondRun!: Promise<void>

    await act(async () => {
      firstRun = result.current.startExecution()
      secondRun = result.current.startExecution()
    })

    await waitFor(() => {
      expect(mockBuildTaskQueueAsync).toHaveBeenCalledTimes(1)
    })

    buildQueue.resolve(queuedTasks)

    await act(async () => {
      await Promise.all([firstRun, secondRun])
    })

    expect(logSpy).toHaveBeenCalledWith('[Execution Hook] Execution already in progress, ignoring duplicate call')
    expect(mockExecuteTasks).toHaveBeenCalledTimes(1)
  })

  it('cancels while the task queue is still building', async () => {
    const queuedTasks = [createTask('group-1', 'groups', 'All Windows Devices')]
    const buildQueue = createDeferred<HydrationTask[]>()
    mockBuildTaskQueueAsync.mockReturnValue(buildQueue.promise)
    const { result } = renderHook(() => useHydrationExecution())

    let executionPromise!: Promise<void>
    await act(async () => {
      executionPromise = result.current.startExecution()
    })
    expect(result.current.isBuildingQueue).toBe(true)
    expect(result.current.startTime).toBeInstanceOf(Date)

    act(() => result.current.cancel())
    expect(result.current.isCancelling).toBe(true)
    buildQueue.resolve(queuedTasks)
    await act(async () => executionPromise)

    expect(mockExecuteTasks).not.toHaveBeenCalled()
    expect(result.current.outcome).toBe('cancelled')
    expect(result.current.tasks[0]).toMatchObject({
      status: 'skipped',
      skipKind: 'cancelled'
    })
  })

  it('keeps a queue error classified as cancelled after cancellation', async () => {
    const buildQueue = createDeferred<HydrationTask[]>()
    mockBuildTaskQueueAsync.mockReturnValue(buildQueue.promise)
    const { result } = renderHook(() => useHydrationExecution())

    let executionPromise!: Promise<void>
    await act(async () => {
      executionPromise = result.current.startExecution()
    })
    act(() => result.current.cancel())
    buildQueue.reject(new Error('Template request failed'))
    await act(async () => executionPromise)

    expect(result.current.outcome).toBe('cancelled')
    expect(result.current.fatalError).toBeNull()
    expect(mockCreateSummary).toHaveBeenCalledWith(
      'tenant-123',
      'create',
      expect.any(Date),
      expect.any(Date),
      [],
      undefined,
      'Contoso'
    )
  })

  it('reconnects a remounted hook to the active execution', async () => {
    const queuedTasks = [createTask('group-1', 'groups', 'All Windows Devices')]
    const execution = createDeferred<void>()
    mockBuildTaskQueueAsync.mockResolvedValue(queuedTasks)
    mockExecuteTasks.mockReturnValue(execution.promise)

    const first = renderHook(() => useHydrationExecution())
    let executionPromise!: Promise<void>
    await act(async () => {
      executionPromise = first.result.current.startExecution()
    })
    expect(first.result.current.isRunning).toBe(true)
    first.unmount()

    const second = renderHook(() => useHydrationExecution())
    expect(second.result.current.isRunning).toBe(true)
    expect(second.result.current.tasks).toEqual(queuedTasks)

    act(() => second.result.current.pause())
    expect(second.result.current.isPaused).toBe(true)
    act(() => second.result.current.resume())

    await act(async () => {
      execution.resolve()
      await executionPromise
    })
    expect(second.result.current.isCompleted).toBe(true)
    expect(mockExecuteTasks).toHaveBeenCalledTimes(1)
  })

  it('does not report cancellation when the active request completes all work', async () => {
    const queuedTasks = [createTask('group-1', 'groups', 'All Windows Devices')]
    const execution = createDeferred<void>()
    mockBuildTaskQueueAsync.mockResolvedValue(queuedTasks)
    mockExecuteTasks.mockImplementation(async () => {
      await execution.promise
      queuedTasks[0].status = 'success'
    })

    const { result } = renderHook(() => useHydrationExecution())
    let executionPromise!: Promise<void>
    await act(async () => {
      executionPromise = result.current.startExecution()
    })
    act(() => result.current.cancel())

    await act(async () => {
      execution.resolve()
      await executionPromise
    })

    expect(result.current.outcome).toBe('succeeded')
    expect(result.current.activityLog.at(-1)?.message).toBe('Cancellation arrived after all work completed.')
  })

  it('marks unfinished batch tasks cancelled after the active request settles', async () => {
    const queuedTasks = [
      createTask('group-1', 'groups', 'Completed group'),
      createTask('group-2', 'groups', 'Remaining group')
    ]
    const execution = createDeferred<void>()
    mockBuildTaskQueueAsync.mockResolvedValue(queuedTasks)
    mockExecuteTasks.mockImplementation(async () => {
      await execution.promise
      queuedTasks[0].status = 'success'
    })

    const { result } = renderHook(() => useHydrationExecution())
    let executionPromise!: Promise<void>
    await act(async () => {
      executionPromise = result.current.startExecution()
    })
    act(() => result.current.cancel())

    await act(async () => {
      execution.resolve()
      await executionPromise
    })

    expect(result.current.outcome).toBe('cancelled')
    expect(result.current.tasks[1]).toMatchObject({
      status: 'skipped',
      skipKind: 'cancelled',
      error: 'Cancelled'
    })
    expect(result.current.activityLog.at(-1)?.message).not.toBe('Cancellation arrived after all work completed.')
  })

  it('marks execution complete and rethrows task errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('Execution exploded')

    mockBuildTaskQueueAsync.mockResolvedValue([createTask('group-1', 'groups', 'All Windows Devices')])
    mockExecuteTasks.mockRejectedValue(failure)

    const { result } = renderHook(() => useHydrationExecution())

    await act(async () => {
      await expect(result.current.startExecution()).rejects.toThrow('Execution exploded')
    })

    await waitFor(() => {
      expect(result.current.isCompleted).toBe(true)
    })

    expect(errorSpy).toHaveBeenCalledWith('Execution failed:', failure)
    expect(result.current.isRunning).toBe(false)
    expect(result.current.isCompleted).toBe(true)
    expect(result.current.endTime).toBeInstanceOf(Date)
    expect(result.current.summary).toBeNull()
    expect(result.current.outcome).toBe('failed')
    expect(result.current.fatalError).toBe('Execution exploded')
    expect(result.current.activityLog.at(-1)?.message).toBe('Execution exploded')
    expect(result.current.tasks[0]).toMatchObject({
      status: 'skipped',
      skipKind: 'blocked',
      error: 'Not run because execution failed.'
    })
  })

  it('ignores pause and resume when no execution is running', () => {
    const { result } = renderHook(() => useHydrationExecution())

    act(() => {
      result.current.pause()
    })
    expect(result.current.isPaused).toBe(false)
    expect(result.current.activityLog).toEqual([])

    act(() => {
      result.current.resume()
    })
    expect(result.current.isPaused).toBe(false)
    expect(result.current.activityLog).toEqual([])
  })

  it('supports pause, resume, cancel, and reset controls during a run', async () => {
    const tasks = [createTask('task-1', 'groups', 'Group One')]
    mockBuildTaskQueueAsync.mockResolvedValue(tasks)
    let finishExecution: (() => void) | undefined
    mockExecuteTasks.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishExecution = resolve
        })
    )

    const { result } = renderHook(() => useHydrationExecution())

    let executionPromise: Promise<void>
    await act(async () => {
      executionPromise = result.current.startExecution()
    })
    expect(result.current.isRunning).toBe(true)

    act(() => {
      result.current.pause()
    })
    expect(result.current.isPaused).toBe(true)

    act(() => {
      result.current.resume()
    })
    expect(result.current.isPaused).toBe(false)

    act(() => {
      result.current.cancel()
    })
    expect(result.current.isRunning).toBe(true)
    expect(result.current.isPaused).toBe(false)
    expect(result.current.isCancelling).toBe(true)
    expect(result.current.isCompleted).toBe(false)

    tasks[0].status = 'skipped'
    tasks[0].skipKind = 'cancelled'
    tasks[0].error = 'Cancelled by user'
    await act(async () => {
      finishExecution?.()
      await executionPromise!
    })

    expect(result.current.isRunning).toBe(false)
    expect(result.current.isCancelling).toBe(false)
    expect(result.current.isCompleted).toBe(true)
    expect(result.current.outcome).toBe('cancelled')
    expect(result.current.endTime).toBeInstanceOf(Date)
    expect(result.current.activityLog.map(({ message }) => message)).toEqual([
      'Building task queue...',
      'Task queue ready: 1 tasks queued',
      'Pause requested. Execution will stop after the current in-flight work completes.',
      'Execution resumed.',
      'Cancellation requested. Remaining work will be skipped.'
    ])

    act(() => {
      result.current.reset()
    })
    expect(result.current.tasks).toEqual([])
    expect(result.current.isCompleted).toBe(false)
    expect(result.current.startTime).toBeNull()
    expect(result.current.endTime).toBeNull()
    expect(result.current.summary).toBeNull()
    expect(result.current.outcome).toBeNull()
    expect(result.current.fatalError).toBeNull()
    expect(result.current.batchProgress).toBeNull()
    expect(result.current.activityLog).toEqual([])
  })

  it('discards an active generation without allowing late updates to restore it', async () => {
    const tasks = [createTask('task-1', 'groups', 'Group One')]
    mockBuildTaskQueueAsync.mockResolvedValue(tasks)
    let finishExecution: (() => void) | undefined
    mockExecuteTasks.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishExecution = resolve
        })
    )
    const { result } = renderHook(() => useHydrationExecution())

    let executionPromise: Promise<void>
    await act(async () => {
      executionPromise = result.current.startExecution()
    })
    act(() => result.current.reset())

    expect(result.current.phase).toBe('cancelling')
    expect(result.current.configuration).toBeNull()
    expect(result.current.tasks).toEqual([])

    await act(async () => {
      finishExecution?.()
      await executionPromise!
    })

    expect(result.current.phase).toBe('idle')
    expect(result.current.isCompleted).toBe(false)
    expect(result.current.summary).toBeNull()
    expect(result.current.activityLog).toEqual([])
  })
})
