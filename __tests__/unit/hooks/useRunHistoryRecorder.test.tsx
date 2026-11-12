import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRunHistoryRecorder } from '@/hooks/useRunHistoryRecorder'
import type { ExecutionOutcome } from '@/types/hydration'
import { readRunHistory } from '@/lib/history/runHistory'
import { RUN_HISTORY_STORAGE_KEY } from '@/lib/storageKeys'
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

describe('useRunHistoryRecorder', () => {
  beforeEach(() => {
    sessionStorage.clear()
    toastWarning.mockReset()
  })

  it('does not write while the run is active', () => {
    renderHook(() => useRunHistoryRecorder({ ...completedRun('active'), isCompleted: false, outcome: null, endTime: null }))
    expect(sessionStorage.getItem(RUN_HISTORY_STORAGE_KEY)).toBeNull()
  })

  it('writes the run once when it reaches a terminal state', () => {
    const run = completedRun('run-terminal')
    type Props = Omit<typeof run, 'outcome' | 'endTime'> & { outcome: ExecutionOutcome | null; endTime: Date | null }
    const { rerender } = renderHook((props: Props) => useRunHistoryRecorder(props), {
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
    renderHook(() => useRunHistoryRecorder(run))
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
      }),
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
    renderHook(() => useRunHistoryRecorder(run))
    setItem.mockRestore()
    expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/Run history is not available/))
  })
})
