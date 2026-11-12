import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { resetRunHistoryRecorderForTests, useRunHistoryRecorder } from '@/hooks/useRunHistoryRecorder'
import type { ExecutionOutcome } from '@/types/hydration'
import { deleteRunHistoryEntry, MAX_RUN_HISTORY_CHARS, readRunHistory } from '@/lib/history/runHistory'
import type { ExecutionRecord } from '@/lib/hydration/executionRecord'
import { RUN_HISTORY_PENDING_STORAGE_KEY, RUN_HISTORY_STORAGE_KEY } from '@/lib/storageKeys'
import { buildEntry, buildTasks, OWNER_A } from '../../helpers/runHistoryFixtures'

const toastWarning = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { warning: toastWarning } }))

const configuration = {
  ...OWNER_A,
  tenantName: 'Contoso Ltd',
  operationMode: 'create' as const,
  isPreview: false,
  selectedObjectCount: 3,
}

function completedRun(runId: string) {
  const entry = buildEntry(OWNER_A, 3, new Date('2026-11-01T11:00:00.000Z'), runId)
  return {
    configuration,
    tasks: entry.tasks,
    summary: entry.summary,
    outcome: entry.outcome,
    fatalError: null,
    startTime: entry.startTime,
    endTime: entry.endTime,
    pausedMs: 0,
    isCompleted: true,
  }
}

/** The saved execution record that the dashboard restores after a page refresh. */
function restoredRecord(run: ReturnType<typeof completedRun>): ExecutionRecord {
  return {
    tenantId: run.configuration.tenantId,
    homeAccountId: run.configuration.homeAccountId,
    tenantName: run.configuration.tenantName,
    operationMode: run.configuration.operationMode,
    isPreview: run.configuration.isPreview,
    selectedObjectCount: run.configuration.selectedObjectCount,
    tasks: run.tasks,
    activityLog: [],
    startTime: run.startTime,
    endTime: run.endTime,
    pausedMs: 0,
    outcome: run.outcome,
    summary: run.summary,
    fatalError: null,
  } as ExecutionRecord
}

/** The live execution after a page refresh: idle, with no configuration. */
const IDLE_LIVE = {
  configuration: null, tasks: [], summary: null, outcome: null, fatalError: null,
  startTime: null, endTime: null, pausedMs: 0, isCompleted: false,
}

/** Make history writes fail as full storage. Other keys still write. */
function fillHistoryStorage() {
  const original = Storage.prototype.setItem
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (key === RUN_HISTORY_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError')
    original.call(this, key, value)
  })
}

describe('useRunHistoryRecorder', () => {
  beforeEach(() => {
    sessionStorage.clear()
    toastWarning.mockReset()
    resetRunHistoryRecorderForTests()
  })

  it('does not write while the run is active', () => {
    renderHook(() => useRunHistoryRecorder({ ...completedRun('active'), isCompleted: false, outcome: null, endTime: null }, null))
    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toBeNull()
  })

  it('writes the run once when it reaches a terminal state', () => {
    const run = completedRun('run-terminal')
    type Props = Omit<typeof run, 'outcome' | 'endTime'> & { outcome: ExecutionOutcome | null; endTime: Date | null }
    const { rerender } = renderHook((props: Props) => useRunHistoryRecorder(props, null), {
      initialProps: { ...run, isCompleted: false, outcome: null, endTime: null } as Props,
    })
    expect(readRunHistory(sessionStorage, OWNER_A)).toHaveLength(0)

    rerender(run)
    const [entry] = readRunHistory(sessionStorage, OWNER_A)
    expect(entry.id).toBe('run-terminal')
    expect(entry.counts.total).toBe(3)
    expect(entry.tenantName).toBe('Contoso Ltd')

    // A later render or a return to the dashboard does not add the run again after a delete.
    sessionStorage.clear()
    rerender({ ...run, tasks: [...run.tasks] })
    renderHook(() => useRunHistoryRecorder(run, null))
    expect(readRunHistory(sessionStorage, OWNER_A)).toHaveLength(0)
  })

  it('writes a failed run with its fatal error', () => {
    renderHook(() =>
      useRunHistoryRecorder({
        configuration,
        tasks: buildTasks(2),
        summary: null,
        outcome: 'failed',
        fatalError: 'Your sign-in session expired.',
        startTime: new Date('2026-11-01T10:00:00.000Z'),
        endTime: new Date('2026-11-01T10:05:00.000Z'),
        pausedMs: 0,
        isCompleted: true,
      }, null),
    )
    const [entry] = readRunHistory(sessionStorage, OWNER_A)
    expect(entry.outcome).toBe('failed')
    expect(entry.summary).toBeNull()
    expect(entry.fatalError).toBe('Your sign-in session expired.')
  })

  it('tells the user when the run cannot be kept', () => {
    const run = completedRun('run-blocked')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    renderHook(() => useRunHistoryRecorder(run, null))
    setItem.mockRestore()
    expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/Run history is not available/))
  })

  it('keeps a run that storage refused for a later visit, with one warning', () => {
    const run = completedRun('run-full')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const first = renderHook((props) => useRunHistoryRecorder(props, null), { initialProps: run })
    // Renders with the same run do not write again.
    first.rerender(run)
    first.unmount()
    // A later dashboard visit while storage is still full tries again but does not warn again.
    renderHook(() => useRunHistoryRecorder(run, null)).unmount()
    expect(setItem.mock.calls.filter(([key]) => key === RUN_HISTORY_STORAGE_KEY)).toHaveLength(2)
    expect(toastWarning).toHaveBeenCalledTimes(1)
    expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/storage is full/))
    setItem.mockRestore()

    // A visit after storage has space adds the run.
    renderHook(() => useRunHistoryRecorder(run, null))
    expect(readRunHistory(sessionStorage, OWNER_A).map((entry) => entry.id)).toEqual(['run-full'])
    expect(toastWarning).toHaveBeenCalledTimes(1)
  })

  it('retries a restored run that history refused before a page refresh, with one warning', () => {
    const run = completedRun('run-restored')
    const full = fillHistoryStorage()
    renderHook(() => useRunHistoryRecorder(run, null)).unmount()
    expect(toastWarning).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(RUN_HISTORY_PENDING_STORAGE_KEY)).toBe('run-restored')

    // Refresh while storage is still full: the restored run is tried again without a second warning.
    resetRunHistoryRecorderForTests()
    renderHook(() => useRunHistoryRecorder(IDLE_LIVE, restoredRecord(run))).unmount()
    expect(full).toHaveBeenCalledWith(RUN_HISTORY_STORAGE_KEY, expect.any(String))
    expect(toastWarning).toHaveBeenCalledTimes(1)
    full.mockRestore()

    // Refresh after storage has space: the restored run is stored and the mark is removed.
    resetRunHistoryRecorderForTests()
    renderHook(() => useRunHistoryRecorder(IDLE_LIVE, restoredRecord(run)))
    expect(readRunHistory(sessionStorage, OWNER_A).map((entry) => entry.id)).toEqual(['run-restored'])
    expect(sessionStorage.getItem(RUN_HISTORY_PENDING_STORAGE_KEY)).toBeNull()
    expect(toastWarning).toHaveBeenCalledTimes(1)
  })

  it('does not add a restored run that history stored, so a deleted run stays deleted', () => {
    const run = completedRun('run-deleted')
    renderHook(() => useRunHistoryRecorder(run, null)).unmount()
    deleteRunHistoryEntry(sessionStorage, OWNER_A, 'run-deleted')

    resetRunHistoryRecorderForTests()
    renderHook(() => useRunHistoryRecorder(IDLE_LIVE, restoredRecord(run)))
    expect(readRunHistory(sessionStorage, OWNER_A)).toEqual([])
    expect(toastWarning).not.toHaveBeenCalled()
  })

  it('does not retry a run that is larger than the history cap', () => {
    const run = completedRun('run-huge')
    const tasks = run.tasks.map((task, index) => (index === 0 ? { ...task, warning: 'x'.repeat(MAX_RUN_HISTORY_CHARS) } : task))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderHook(() => useRunHistoryRecorder({ ...run, tasks }, null)).unmount()
    renderHook(() => useRunHistoryRecorder({ ...run, tasks }, null)).unmount()
    expect(toastWarning).toHaveBeenCalledTimes(1)
    expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/too large/))
    expect(readRunHistory(sessionStorage, OWNER_A)).toEqual([])
    const writesAfterFirst = setItem.mock.calls.length
    renderHook(() => useRunHistoryRecorder({ ...run, tasks }, null)).unmount()
    expect(setItem.mock.calls.length).toBe(writesAfterFirst)
    setItem.mockRestore()
  })
})
