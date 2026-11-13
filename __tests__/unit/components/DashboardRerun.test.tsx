import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import DashboardPage from '@/app/dashboard/page'
import { SettingsProvider } from '@/hooks/useSettings'
import { EXECUTION_RECORD_STORAGE_KEY } from '@/lib/storageKeys'
import { writeExecutionRecord, type ExecutionRecord } from '@/lib/hydration/executionRecord'
import { createSummary } from '@/lib/hydration/reporter'
import type { RerunPlan } from '@/lib/hydration/rerun'
import type { HydrationSummary, HydrationTask, WizardState } from '@/types/hydration'
import type { useHydrationExecution } from '@/hooks/useHydrationExecution'
import { installFakeLocks, runLockName } from '@/__tests__/helpers/fakeLocks'

type ExecutionHookState = ReturnType<typeof useHydrationExecution>

const push = vi.fn()
const startExecution = vi.fn().mockResolvedValue(undefined)
const startRerun = vi.fn().mockResolvedValue(undefined)
const useWizardStateMock = vi.fn()
const useHydrationExecutionMock = vi.fn()
const getActiveAccount = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ''} />
}))
vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))
vi.mock('@azure/msal-react', () => ({
  useMsal: () => {
    const account = getActiveAccount()
    return { accounts: account ? [account] : [], instance: { getActiveAccount } }
  }
}))
vi.mock('@/hooks/useWizardState', () => ({ useWizardState: () => useWizardStateMock() }))
vi.mock('@/hooks/useHydrationExecution', () => ({ useHydrationExecution: () => useHydrationExecutionMock() }))
vi.mock('@/lib/auth/authUtils', () => ({ getActiveAccount: () => getActiveAccount() }))

const startTime = new Date('2026-08-17T01:00:00.000Z')
const endTime = new Date('2026-08-17T01:00:02.000Z')

/** Let the async run lock checks settle. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function renderPage() {
  return render(
    <SettingsProvider>
      <DashboardPage />
    </SettingsProvider>
  )
}

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
    pausedMs: 0,
    pauseStartedAt: null,
    summary: null,
    outcome: null,
    fatalError: null,
    batchProgress: null,
    activityLog: [],
    startExecution,
    startRerun,
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    ...overrides
  }
}

function task(id: string, status: HydrationTask['status'], operation: 'create' | 'delete' = 'create'): HydrationTask {
  const base = { id, category: 'groups' as const, operation, itemName: `Group ${id}`, startTime, endTime }
  if (status === 'skipped') return { ...base, status, skipKind: 'noOp' }
  if (status === 'pending') return { id, category: 'groups', operation, itemName: `Group ${id}`, status }
  if (status === 'running') return { id, category: 'groups', operation, itemName: `Group ${id}`, status, startTime }
  return { ...base, status }
}

function summaryFor(tasks: HydrationTask[], operationMode: 'create' | 'delete' = 'create'): HydrationSummary {
  return createSummary('tenant-id', operationMode, startTime, endTime, tasks, undefined, 'Contoso')
}

const configuration = {
  tenantId: 'tenant-id',
  homeAccountId: 'home-id',
  tenantName: 'Contoso',
  cloudEnvironment: 'global' as const,
  operationMode: 'create' as const,
  isPreview: false,
  selectedObjectCount: 3
}

function checkpoint(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    ...configuration,
    tasks: [task('1', 'success'), task('2', 'running'), task('3', 'pending'), task('4', 'failed')],
    activityLog: [],
    startTime,
    endTime: null,
    pausedMs: 0,
    outcome: null,
    summary: null,
    fatalError: null,
    checkpointAt: endTime,
    ...overrides
  } as ExecutionRecord
}

describe('Dashboard: continue from an earlier run', () => {
  let locks: ReturnType<typeof installFakeLocks>

  afterEach(() => locks.uninstall())

  beforeEach(() => {
    locks = installFakeLocks()
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    getActiveAccount.mockReturnValue({ tenantId: 'tenant-id', homeAccountId: 'home-id' })
    useWizardStateMock.mockReturnValue({
      state: { currentStep: 1, confirmed: false, isPreview: true, selectedTargets: [], selectedCISCategories: [] } satisfies WizardState,
      resetWizard: vi.fn()
    })
    useHydrationExecutionMock.mockReturnValue(createExecutionState())
  })

  it('shows an interrupted run and resumes only its pending and running tasks', async () => {
    writeExecutionRecord(sessionStorage, checkpoint())
    renderPage()
    await flush()

    expect(screen.getByRole('heading', { name: 'This run was interrupted' })).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    expect(startExecution).not.toHaveBeenCalled()
    expect(screen.queryByText('Run failed')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Resume 2 unfinished tasks' }))
    const dialog = screen.getByRole('dialog', { name: 'Resume 2 unfinished tasks' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resume run' }))
    await flush()

    expect(startRerun).toHaveBeenCalledTimes(1)
    const plan = startRerun.mock.calls[0][0] as RerunPlan
    expect(plan.kind).toBe('resume')
    expect(plan.sourceTasks.map((item) => item.id)).toEqual(['2', '3'])
    expect(plan.configuration).toMatchObject({ tenantId: 'tenant-id', homeAccountId: 'home-id', isPreview: false })
    expect(screen.getByTestId('run-start-announcer')).toHaveTextContent('Resumed run started. 2 items in scope.')
  })

  it('refuses to resume while another tab (for example a duplicated tab) still runs the tenant', async () => {
    locks.held.set(runLockName('tenant-id'), 1)
    writeExecutionRecord(sessionStorage, checkpoint())
    renderPage()
    await flush()

    const resume = screen.getByRole('button', { name: 'Resume 2 unfinished tasks' })
    expect(resume).toBeDisabled()
    expect(resume).toHaveAccessibleDescription(/Another browser tab is running a hydration for this tenant/)

    // When the other tab's run ends, Resume becomes available.
    locks.held.clear()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3100))
    })
    expect(screen.getByRole('button', { name: 'Resume 2 unfinished tasks' })).toBeEnabled()
  })

  it('checks the other tabs again at confirm time', async () => {
    writeExecutionRecord(sessionStorage, checkpoint())
    renderPage()
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Resume 2 unfinished tasks' }))
    const dialog = screen.getByRole('dialog', { name: 'Resume 2 unfinished tasks' })

    locks.held.set(runLockName('tenant-id'), 1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resume run' }))
    await flush()

    expect(startRerun).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Resume 2 unfinished tasks' })).toBeDisabled()
    expect(screen.getByText(/Another browser tab is running a hydration/)).toBeInTheDocument()
  })

  it('does not resume when the browser cannot tell whether another tab runs it', async () => {
    locks.uninstall()
    writeExecutionRecord(sessionStorage, checkpoint())
    renderPage()
    await flush()

    const resume = screen.getByRole('button', { name: 'Resume 2 unfinished tasks' })
    expect(resume).toBeDisabled()
    expect(resume).toHaveAccessibleDescription(/cannot confirm that no other tab/)
    expect(screen.getByRole('button', { name: 'Discard run' })).toBeEnabled()
  })

  it('shows a checkpoint whose tasks all finished as a finished run and offers to retry its failures', async () => {
    writeExecutionRecord(
      sessionStorage,
      checkpoint({
        tasks: [task('1', 'success'), task('2', 'failed'), { ...task('3', 'skipped'), skipKind: 'cancelled' } as HydrationTask]
      })
    )
    renderPage()
    await flush()

    expect(screen.queryByRole('heading', { name: 'This run was interrupted' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Resume/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry 1 failed task' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start retry' }))
    await flush()
    const plan = startRerun.mock.calls[0][0] as RerunPlan
    expect(plan.sourceTasks.map((item) => item.id)).toEqual(['2'])
    const saved = JSON.parse(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)!)
    expect(saved.outcome).toBe('cancelled')
    expect(saved.checkpointAt).toBeUndefined()
  })

  it('does not offer to resume an interrupted run of a different tenant, and offers only to discard', async () => {
    writeExecutionRecord(sessionStorage, checkpoint({ tenantId: 'other-tenant' }))
    renderPage()
    await flush()

    expect(screen.getByRole('heading', { name: 'An interrupted run cannot be resumed' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Contoso')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Discard run' }))
    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull()
    expect(push).toHaveBeenCalledWith('/wizard')
  })

  it('keeps an interrupted run when the account changes, shows no details, and restores it for the original account', async () => {
    writeExecutionRecord(sessionStorage, checkpoint())
    const view = renderPage()
    await flush()
    expect(screen.getByRole('heading', { name: 'This run was interrupted' })).toBeInTheDocument()

    getActiveAccount.mockReturnValue({ tenantId: 'other-tenant', homeAccountId: 'home-id' })
    view.rerender(
      <SettingsProvider>
        <DashboardPage />
      </SettingsProvider>
    )
    await flush()

    expect(screen.getByRole('heading', { name: 'An interrupted run cannot be resumed' })).toBeInTheDocument()
    expect(screen.queryByText('Contoso')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument()
    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).not.toBeNull()
    expect(push).not.toHaveBeenCalledWith('/wizard')

    getActiveAccount.mockReturnValue({ tenantId: 'tenant-id', homeAccountId: 'home-id' })
    view.rerender(
      <SettingsProvider>
        <DashboardPage />
      </SettingsProvider>
    )
    await flush()
    expect(screen.getByRole('button', { name: 'Resume 2 unfinished tasks' })).toBeEnabled()
  })

  it('still clears a completed run when the account changes', async () => {
    const tasks = [task('1', 'failed')]
    writeExecutionRecord(sessionStorage, {
      ...configuration,
      tasks,
      activityLog: [],
      startTime,
      endTime,
      outcome: 'failed',
      summary: null,
      fatalError: 'Stopped'
    })
    const view = renderPage()
    await flush()
    getActiveAccount.mockReturnValue({ tenantId: 'other-tenant', homeAccountId: 'home-id' })
    view.rerender(
      <SettingsProvider>
        <DashboardPage />
      </SettingsProvider>
    )
    await flush()
    expect(sessionStorage.getItem(EXECUTION_RECORD_STORAGE_KEY)).toBeNull()
    expect(push).toHaveBeenCalledWith('/wizard')
  })

  it('retries the failed tasks of a completed run after confirmation', async () => {
    const tasks = [task('1', 'success'), task('2', 'failed'), task('3', 'skipped')]
    useHydrationExecutionMock.mockReturnValue(
      createExecutionState({
        runId: 1,
        tasks,
        configuration,
        phase: 'completed',
        isCompleted: true,
        startTime,
        endTime,
        summary: summaryFor(tasks),
        outcome: 'completedWithIssues'
      })
    )
    renderPage()
    await flush()

    expect(screen.queryByRole('button', { name: 'Run this for real' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry 1 failed task' }))
    const dialog = screen.getByRole('dialog', { name: 'Retry 1 failed task' })
    expect(within(dialog).getByText(/replaces the results on this page/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Download report (JSON)' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start retry' }))
    await flush()

    const plan = startRerun.mock.calls[0][0] as RerunPlan
    expect(plan.kind).toBe('retry')
    expect(plan.sourceTasks.map((item) => item.id)).toEqual(['2'])
  })

  it('needs a new acknowledgement to run a delete preview for real, and Enter cannot confirm it', async () => {
    const tasks = [task('1', 'success', 'delete')]
    useHydrationExecutionMock.mockReturnValue(
      createExecutionState({
        runId: 1,
        tasks,
        configuration: {
          ...configuration,
          operationMode: 'delete',
          isPreview: true,
          selectedObjectCount: 1,
          scope: { selectedTargets: ['groups'], selectedCISCategories: [], categorySelections: { groups: { selectedItems: ['Group 1'] } } }
        },
        phase: 'completed',
        isCompleted: true,
        startTime,
        endTime,
        summary: summaryFor(tasks, 'delete'),
        outcome: 'succeeded'
      })
    )
    renderPage()
    await flush()

    fireEvent.click(screen.getByRole('button', { name: 'Run this for real' }))
    let dialog = screen.getByRole('dialog', { name: 'Run this preview for real' })
    expect(within(dialog).getByText('Contoso')).toBeInTheDocument()
    expect(within(dialog).getByText('tenant-id')).toBeInTheDocument()
    expect(within(dialog).getByText('Delete live')).toBeInTheDocument()
    expect(within(dialog).getByText('Delete mode is live')).toBeInTheDocument()
    expect(within(dialog).getByText(/Imported by Intune/)).toBeInTheDocument()

    const confirm = within(dialog).getByRole('button', { name: 'Start deletion' })
    const acknowledgement = within(dialog).getByRole('checkbox', { name: 'I understand this run will modify my Intune tenant' })
    expect(confirm).toBeDisabled()
    expect(acknowledgement).not.toBeChecked()
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()
    expect(confirm).not.toHaveFocus()

    // Enter on the focused control closes the dialog. It never starts the run.
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    fireEvent.click(document.activeElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(startRerun).not.toHaveBeenCalled()

    // A new opening starts without the earlier acknowledgement.
    fireEvent.click(screen.getByRole('button', { name: 'Run this for real' }))
    dialog = screen.getByRole('dialog', { name: 'Run this preview for real' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I understand this run will modify my Intune tenant' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run this for real' }))
    dialog = screen.getByRole('dialog', { name: 'Run this preview for real' })
    expect(within(dialog).getByRole('checkbox', { name: 'I understand this run will modify my Intune tenant' })).not.toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Start deletion' })).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I understand this run will modify my Intune tenant' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start deletion' }))
    await flush()
    const plan = startRerun.mock.calls[0][0] as RerunPlan
    expect(plan.kind).toBe('live')
    expect(plan.configuration).toMatchObject({ isPreview: false, operationMode: 'delete', tenantId: 'tenant-id' })
  })

  it('offers nothing while a run is active', async () => {
    useHydrationExecutionMock.mockReturnValue(
      createExecutionState({
        runId: 2,
        tasks: [task('1', 'failed'), task('2', 'running')],
        configuration,
        phase: 'running',
        isRunning: true,
        startTime
      })
    )
    renderPage()
    await flush()

    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run this for real' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resume \d/i })).not.toBeInTheDocument()
  })

  it('disables the actions with a reason while an earlier run is still stopping', async () => {
    writeExecutionRecord(sessionStorage, {
      ...configuration,
      tasks: [task('1', 'failed')],
      activityLog: [],
      startTime,
      endTime,
      outcome: 'failed',
      summary: null,
      fatalError: 'Stopped'
    })
    useHydrationExecutionMock.mockReturnValue(createExecutionState({ phase: 'cancelling', isCancelling: true }))
    renderPage()
    await flush()

    const retry = screen.getByRole('button', { name: 'Retry 1 failed task' })
    expect(retry).toBeDisabled()
    expect(retry).toHaveAccessibleDescription(/A run is active/)
  })
})
