import { beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DashboardPage from '@/app/dashboard/page'
import { SettingsProvider } from '@/hooks/useSettings'
import { EXECUTION_RECORD_STORAGE_KEY } from '@/lib/storageKeys'
import { readExecutionRecord, writeExecutionRecord } from '@/lib/hydration/executionRecord'
import type { HydrationSummary, HydrationTask, WizardState } from '@/types/hydration'
import type { useHydrationExecution } from '@/hooks/useHydrationExecution'

type ExecutionHookState = ReturnType<typeof useHydrationExecution>

const push = vi.fn()
const startExecution = vi.fn().mockResolvedValue(undefined)
const useWizardStateMock = vi.fn()
const useHydrationExecutionMock = vi.fn()
const resetWizard = vi.fn()
const resetExecution = vi.fn()
const getActiveAccount = vi.fn()

function renderPage() {
  return render(
    <SettingsProvider>
      <DashboardPage />
    </SettingsProvider>
  )
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push })
}))

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ''} />
}))

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@azure/msal-react', () => ({
  useMsal: () => {
    const account = getActiveAccount()
    return {
      accounts: account ? [account] : [],
      instance: { getActiveAccount }
    }
  }
}))

vi.mock('@/hooks/useWizardState', () => ({
  useWizardState: () => useWizardStateMock()
}))

function createWizardState(isPreview = false): {
  state: WizardState
  resetWizard: typeof resetWizard
} {
  return {
    state: {
      currentStep: 4,
      confirmed: true,
      operationMode: 'delete',
      isPreview,
      selectedTargets: ['groups'],
      selectedCISCategories: [],
      tenantConfig: {
        tenantId: 'tenant-id',
        homeAccountId: 'home-tenant-id',
        tenantName: 'Delete Test Tenant',
        cloudEnvironment: 'global'
      }
    },
    resetWizard
  }
}

vi.mock('@/hooks/useHydrationExecution', () => ({
  useHydrationExecution: () => useHydrationExecutionMock()
}))

vi.mock('@/lib/auth/authUtils', () => ({
  getActiveAccount: () => getActiveAccount()
}))

function createExecutionState(overrides: Partial<ExecutionHookState> = {}): ExecutionHookState {
  return {
    tasks: [],
    runId: null,
    configuration: null,
    phase: 'idle',
    isRunning: false,
    isPaused: false,
    isCancelling: false,
    isCompleted: false,
    isBuildingQueue: false,
    startTime: null,
    endTime: null,
    summary: null,
    outcome: null,
    fatalError: null,
    batchProgress: null,
    activityLog: [],
    startExecution,
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    reset: resetExecution,
    ...overrides
  }
}

const runConfiguration = {
  tenantId: 'tenant-id',
  homeAccountId: 'home-tenant-id',
  tenantName: 'Delete Test Tenant',
  operationMode: 'delete' as const,
  isPreview: false,
  selectedObjectCount: 1
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    getActiveAccount.mockReturnValue({
      tenantId: 'tenant-id',
      homeAccountId: 'home-tenant-id'
    })
    useWizardStateMock.mockReturnValue(createWizardState())
    useHydrationExecutionMock.mockReturnValue(createExecutionState())
  })

  it('renders the preview notice as a high-contrast glass surface', () => {
    useWizardStateMock.mockReturnValue(createWizardState(true))

    renderPage()

    const previewTitle = screen.getByText('Preview Mode')
    const previewNotice = previewTitle.closest('[role="alert"]')

    expect(previewNotice).toHaveClass('glass-panel', 'rounded-2xl', 'text-slate-50')
    expect(previewNotice).not.toHaveClass('bg-blue-500/10')
    expect(previewTitle).toHaveClass('text-white')
    expect(screen.getByText(/No changes will be made/)).toHaveClass('text-slate-200')
  })

  it('renders live delete mode with a filled high-contrast warning banner', () => {
    renderPage()

    const warning = screen.getByRole('alert')

    expect(screen.getByText('Delete Mode Active')).toBeInTheDocument()
    expect(warning).toHaveClass('bg-slate-950/90')
    expect(warning).toHaveClass('text-slate-50')
    expect(warning).not.toHaveClass('text-destructive')
  })

  it('blurs the tenant identity in the execution header when Demo Mode is on', () => {
    localStorage.setItem('app-settings:v1', JSON.stringify({ stopOnFirstError: false, demoMode: true }))

    renderPage()

    expect(screen.getByText('Delete Test Tenant')).toHaveClass('demo-sensitive-data')
  })

  it('reconnects to an active run without relying on wizard confirmation', async () => {
    const wizard = createWizardState()
    useWizardStateMock.mockReturnValue({
      ...wizard,
      state: {
        ...wizard.state,
        confirmed: false,
        selectedTargets: []
      }
    })
    useHydrationExecutionMock.mockReturnValue(
      createExecutionState({
        configuration: { ...runConfiguration, selectedObjectCount: 37 },
        phase: 'running',
        isRunning: true,
        startTime: new Date('2026-08-17T01:00:00.000Z')
      })
    )

    renderPage()
    await act(async () => undefined)

    expect(push).not.toHaveBeenCalledWith('/wizard')
    expect(startExecution).not.toHaveBeenCalled()
    expect(screen.getByText('Planned scope').nextElementSibling).toHaveTextContent('37 objects')
  })

  it('keeps a completed run on the dashboard and preserves its result data', async () => {
    const startTime = new Date('2026-08-17T01:00:00.000Z')
    const endTime = new Date('2026-08-17T01:00:02.000Z')
    const tasks = [
      {
        id: 'group-1',
        category: 'groups',
        operation: 'delete',
        itemName: 'All Windows Devices',
        status: 'success',
        startTime,
        endTime
      }
    ] satisfies HydrationTask[]
    const summary = {
      tenantId: 'tenant-id',
      tenantName: 'Delete Test Tenant',
      operationMode: 'delete',
      startTime,
      endTime,
      duration: 2000,
      stats: { total: 1, created: 0, deleted: 1, skipped: 0, failed: 0 },
      categoryBreakdown: {
        groups: { total: 1, success: 1, skipped: 0, failed: 0 }
      },
      errors: [],
      warnings: []
    } satisfies HydrationSummary

    useHydrationExecutionMock.mockReturnValue(
      createExecutionState({
        tasks,
        configuration: runConfiguration,
        phase: 'completed',
        isCompleted: true,
        startTime,
        endTime,
        summary,
        outcome: 'succeeded',
        activityLog: [
          {
            id: 'complete-1',
            type: 'success',
            message: 'Hydration run completed',
            timestamp: endTime
          }
        ]
      })
    )

    renderPage()

    expect(startExecution).not.toHaveBeenCalled()
    expect(screen.getByText('Run complete')).toBeInTheDocument()
    expect(screen.getByText('Results by category')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Markdown' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Dynamic Groups/ }))
    expect(screen.getByText('All Windows Devices')).toBeInTheDocument()
    expect(screen.getByText('Hydration run completed')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 succeeded')
    await waitFor(() => expect(readExecutionRecord(sessionStorage)?.outcome).toBe('succeeded'))

    expect(screen.getByText('Run complete')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start New Hydration' }))

    expect(resetWizard).toHaveBeenCalledTimes(1)
    expect(resetExecution).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull()
    expect(push).toHaveBeenCalledWith('/wizard')
  })

  it('shows a stopped state when execution ends without a summary', () => {
    useHydrationExecutionMock.mockReturnValue(
      createExecutionState({
        configuration: runConfiguration,
        phase: 'completed',
        isCompleted: true,
        startTime: new Date('2026-08-17T01:00:00.000Z'),
        endTime: new Date('2026-08-17T01:00:01.000Z'),
        outcome: 'failed',
        fatalError: 'Graph session expired.'
      })
    )

    renderPage()

    const stoppedAlert = screen.getByRole('alert')

    expect(stoppedAlert).toHaveClass('border-red-300/35')
    expect(screen.getAllByText('Run failed')[1]).toHaveClass('text-red-100')
    expect(screen.getByText('Graph session expired.')).toBeInTheDocument()
  })

  it('restores the completed dashboard after a refresh', async () => {
    getActiveAccount.mockImplementation(() => ({
      tenantId: 'tenant-id',
      homeAccountId: 'home-tenant-id'
    }))
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
    const startTime = new Date('2026-08-17T01:00:00.000Z')
    const endTime = new Date('2026-08-17T01:00:02.000Z')
    const tasks = [
      {
        id: 'group-1',
        category: 'groups' as const,
        operation: 'delete' as const,
        itemName: 'Restored Group',
        status: 'success' as const,
        startTime,
        endTime
      }
    ] satisfies HydrationTask[]
    const summary = {
      tenantId: 'tenant-id',
      tenantName: 'Restored Tenant',
      operationMode: 'delete' as const,
      startTime,
      endTime,
      duration: 2000,
      stats: { total: 1, created: 0, deleted: 1, skipped: 0, failed: 0 },
      categoryBreakdown: {
        groups: { total: 1, success: 1, skipped: 0, failed: 0 }
      },
      errors: [],
      warnings: []
    } satisfies HydrationSummary
    writeExecutionRecord(sessionStorage, {
      tenantId: 'tenant-id',
      homeAccountId: 'home-tenant-id',
      tenantName: 'Restored Tenant',
      operationMode: 'delete',
      isPreview: false,
      selectedObjectCount: 17,
      tasks,
      summary,
      outcome: 'succeeded',
      fatalError: null,
      activityLog: [
        {
          id: 'restored-1',
          type: 'success',
          message: 'Restored activity',
          timestamp: endTime
        }
      ],
      startTime,
      endTime
    })
    const wizard = createWizardState()
    wizard.state.confirmed = false
    useWizardStateMock.mockReturnValue(wizard)

    renderPage()

    await waitFor(() => expect(screen.getAllByText('Restored Tenant')).toHaveLength(2))
    expect(screen.getByText('Run complete')).toBeInTheDocument()
    expect(screen.getByText('Restored activity')).toBeInTheDocument()
    expect(screen.getByText('Planned scope').nextElementSibling).toHaveTextContent('17 objects')
    expect(
      getItemSpy.mock.calls.filter(([key]) => key === EXECUTION_RECORD_STORAGE_KEY)
    ).toHaveLength(1)
    expect(startExecution).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalledWith('/wizard')
    getItemSpy.mockRestore()
  })

  it('restores planned scope for cancellation before task creation', async () => {
    const startTime = new Date('2026-08-17T01:00:00.000Z')
    const endTime = new Date('2026-08-17T01:00:01.000Z')
    writeExecutionRecord(sessionStorage, {
      tenantId: 'tenant-id',
      homeAccountId: 'home-tenant-id',
      tenantName: 'Restored Tenant',
      operationMode: 'create',
      isPreview: true,
      selectedObjectCount: 42,
      tasks: [],
      summary: {
        tenantId: 'tenant-id',
        tenantName: 'Restored Tenant',
        operationMode: 'create',
        startTime,
        endTime,
        duration: 1000,
        stats: { total: 0, created: 0, deleted: 0, skipped: 0, failed: 0 },
        categoryBreakdown: {},
        errors: [],
        warnings: []
      },
      outcome: 'cancelled',
      fatalError: null,
      activityLog: [],
      startTime,
      endTime
    })
    const wizard = createWizardState(true)
    wizard.state.confirmed = false
    useWizardStateMock.mockReturnValue(wizard)

    renderPage()

    await waitFor(() => expect(screen.getByText('Planned scope').nextElementSibling).toHaveTextContent('42 objects'))
    expect(screen.getByText('Preview cancelled')).toBeInTheDocument()
    expect(startExecution).not.toHaveBeenCalled()
  })

  it('rejects a stored run from another account', async () => {
    const endTime = new Date('2026-08-17T01:00:02.000Z')
    writeExecutionRecord(sessionStorage, {
      tenantId: 'other-tenant',
      homeAccountId: 'other-account',
      operationMode: 'create',
      isPreview: false,
      selectedObjectCount: 0,
      tasks: [],
      summary: null,
      outcome: 'failed',
      fatalError: 'Private tenant detail',
      activityLog: [],
      startTime: null,
      endTime
    })
    const wizard = createWizardState()
    wizard.state.confirmed = false
    useWizardStateMock.mockReturnValue(wizard)

    renderPage()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/wizard'))
    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull()
    expect(screen.queryByText('Private tenant detail')).not.toBeInTheDocument()
  })

  it('hides a restored run when the authenticated account changes', async () => {
    const startTime = new Date('2026-08-17T01:00:00.000Z')
    const endTime = new Date('2026-08-17T01:00:01.000Z')
    const tasks = [
      {
        id: 'group-1',
        category: 'groups',
        operation: 'delete',
        itemName: 'Private restored group',
        status: 'success',
        startTime,
        endTime
      }
    ] satisfies HydrationTask[]
    writeExecutionRecord(sessionStorage, {
      tenantId: 'tenant-id',
      homeAccountId: 'home-tenant-id',
      tenantName: 'Private restored tenant',
      operationMode: 'delete',
      isPreview: false,
      selectedObjectCount: 1,
      tasks,
      summary: {
        tenantId: 'tenant-id',
        tenantName: 'Private restored tenant',
        operationMode: 'delete',
        startTime,
        endTime,
        duration: 1000,
        stats: { total: 1, created: 0, deleted: 1, skipped: 0, failed: 0 },
        categoryBreakdown: { groups: { total: 1, success: 1, skipped: 0, failed: 0 } },
        errors: [],
        warnings: []
      },
      outcome: 'succeeded',
      fatalError: null,
      activityLog: [],
      startTime,
      endTime
    })
    const view = renderPage()
    await waitFor(() => expect(screen.getAllByText('Private restored tenant').length).toBeGreaterThan(0))

    getActiveAccount.mockReturnValue({
      tenantId: 'tenant-2',
      homeAccountId: 'account-2'
    })
    view.rerender(
      <SettingsProvider>
        <DashboardPage />
      </SettingsProvider>
    )

    expect(screen.queryByText('Private restored tenant')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull()
      expect(push).toHaveBeenCalledWith('/wizard')
    })
  })

  it('does not navigate when a running execution becomes terminal', async () => {
    vi.useFakeTimers()
    const startTime = new Date('2026-08-17T01:00:00.000Z')
    const endTime = new Date('2026-08-17T01:00:01.000Z')
    const completedTasks = [
      {
        id: 'group-1',
        category: 'groups',
        operation: 'delete',
        itemName: 'Completed group',
        status: 'success'
      }
    ] satisfies HydrationTask[]
    const completedSummary = {
      tenantId: 'tenant-id',
      tenantName: 'Delete Test Tenant',
      operationMode: 'delete',
      startTime,
      endTime,
      duration: 1000,
      stats: { total: 1, created: 0, deleted: 1, skipped: 0, failed: 0 },
      categoryBreakdown: {
        groups: { total: 1, success: 1, skipped: 0, failed: 0 }
      },
      errors: [],
      warnings: []
    } satisfies HydrationSummary
    useHydrationExecutionMock.mockReturnValue(
      createExecutionState({
        isRunning: true,
        startTime
      })
    )
    const view = renderPage()
    await act(async () => undefined)
    expect(startExecution).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Back to Wizard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Intune Hydration Kit home' })).not.toBeInTheDocument()
    push.mockClear()

    useHydrationExecutionMock.mockReturnValue(
      createExecutionState({
        tasks: completedTasks,
        configuration: runConfiguration,
        phase: 'completed',
        isCompleted: true,
        outcome: 'succeeded',
        summary: completedSummary,
        startTime,
        endTime
      })
    )
    view.rerender(
      <SettingsProvider>
        <DashboardPage />
      </SettingsProvider>
    )

    expect(screen.getByText('Run complete')).toBeInTheDocument()
    await act(async () => vi.runAllTimersAsync())
    expect(push).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
